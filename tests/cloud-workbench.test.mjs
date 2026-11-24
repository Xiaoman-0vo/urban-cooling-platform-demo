import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {workbenchRuntime} from '../server/workbench-runtime.mjs';
import {createAgentServer} from '../server/agent-server.mjs';
import {createAccountService,HUAWEI_MAAS_ENDPOINT} from '../server/account-service.mjs';
import {checkCollectionReadiness} from '../server/collection-readiness.mjs';
import {requestHeatCollection,queryXhsHeatPerception} from '../server/heat-perception-client.mjs';

test('cloud binding requires an explicit origin and preserves the local default',()=>{
  assert.deepEqual(workbenchRuntime({},{workbench:true}),{port:5181,host:'127.0.0.1',siteOrigin:'http://127.0.0.1:5181'});
  assert.throws(()=>workbenchRuntime({AGENT_HOST:'0.0.0.0'}),/显式配置/);
  for(const origin of ['http://example.org','https://user:secret@example.org','https://example.org/path','https://example.org/?secret=1'])
    assert.throws(()=>workbenchRuntime({AGENT_HOST:'0.0.0.0',URBANCOOL_SITE_ORIGIN:origin}));
  assert.equal(workbenchRuntime({AGENT_HOST:'0.0.0.0',URBANCOOL_SITE_ORIGIN:'https://demo.example.org/'}).siteOrigin,'https://demo.example.org');
  assert.equal(workbenchRuntime({AGENT_HOST:'0.0.0.0',URBANCOOL_SITE_ORIGIN:'http://127.0.0.1:5297'}).host,'0.0.0.0');
});

test('public container health checks core readiness, keep host validation and do not expose private errors',async()=>{
  let healthy=true;
  const server=createAgentServer({catalog:{},client:{},accounts:{health(){if(!healthy)throw Error('fixture-sensitive-db-path');return {ready:true};}},port:0});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const url=`http://127.0.0.1:${server.address().port}/healthz`;
    const reply=await fetch(url);assert.equal(reply.status,200);
    assert.deepEqual(await reply.json(),{status:'ready',service:'urbancool-workbench',accounts:true});
    assert.equal((await fetch(url,{method:'HEAD'})).status,200);
    assert.equal((await fetch(url,{headers:{Origin:'https://untrusted.example'}})).status,403);
    healthy=false;
    const failed=await fetch(url);assert.equal(failed.status,503);
    assert.equal(await failed.text(),'{"status":"unavailable"}');
  }finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
});

test('MaaS uses the official compatible endpoint, isolates encrypted account keys and preserves tool requests after restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'urbancool-cloud-'));
  const filename=join(directory,'accounts.sqlite'),calls=[];
  const options={filename,defaultProvider:'local',maas:{model:'enabled-tool-model'},fetchImpl:async(url,request)=>{
    calls.push({url,headers:request.headers,body:JSON.parse(request.body)});
    return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:'fixture response'}}]});
  }};
  let accounts=createAccountService(options),server;
  async function start(){server=createAgentServer({accounts,catalog:{},port:0});server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}/api/agent`;}
  async function stop(){server.closeAllConnections();await new Promise(done=>server.close(done));accounts.close();}
  let base=await start();
  async function request(path,{account,method='GET',body}={}){
    const response=await fetch(base+path,{method,headers:{...(account?{Cookie:account.cookie,'X-UrbanCool-Account':account.id}:{}),
      'Content-Type':'application/json','X-UrbanCool-Agent':'1'},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
  }
  async function register(username){
    const r=await request('/account/register',{method:'POST',body:{username,password:'cloud-fixture-password'}});
    assert.equal(r.status,201);return {...r.data.user,cookie:r.cookie.split(';')[0]};
  }
  try{
    const alice=await register('maas_alice'),bob=await register('maas_bob');
    assert.equal((await request('/model',{account:alice})).data.settings.provider,'local');
    assert.equal(calls.length,0);
    const key='maas-fixture-key-not-real';
    const saved=await request('/model',{account:alice,method:'PUT',body:{provider:'maas',model:'enabled-tool-model',api_key:key,endpoint:'https://untrusted.example'}});
    assert.equal(saved.status,200);assert.equal(saved.data.settings.endpoint,HUAWEI_MAAS_ENDPOINT);
    assert.equal(saved.data.settings.key_configured,true);assert.ok(!JSON.stringify(saved.data).includes(key));
    assert.equal((await request('/model',{account:bob})).data.settings.key_configured,false);
    const tools=[{type:'function',function:{name:'get_site_context',parameters:{type:'object',properties:{}}}}];
    for(const agentId of ['coordinator','data_audit'])await accounts.clientFor(alice).complete([{role:'user',content:'fixture'}],{tools,agentId});
    assert.ok(calls.every(call=>call.url===HUAWEI_MAAS_ENDPOINT+'/chat/completions'&&call.headers.Authorization==='Bearer '+key));
    assert.ok(calls.every(call=>call.body.model==='enabled-tool-model'&&call.body.chat_template_kwargs===undefined));
    assert.deepEqual(calls[0].body.tools,tools);
    assert.equal(accounts.clientFor(bob).localPlanning,true);
    await stop();accounts=createAccountService(options);base=await start();
    await accounts.clientFor(alice).complete([]);
    assert.equal(calls.at(-1).headers.Authorization,'Bearer '+key);
    assert.equal((await readFile(filename)).includes(Buffer.from(key)),false);
  }finally{
    await stop();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true});
  }
});

test('a cloud deployment cannot start a local browser collector through MCP and still reads archived sources',async()=>{
  const previous=process.env.URBANCOOL_COLLECTOR_MODE;process.env.URBANCOOL_COLLECTOR_MODE='disabled';
  const account=randomUUID(),directory=new URL(`../.runtime/xhs-collections/${account}/`,import.meta.url);
  try{
    const readiness=await checkCollectionReadiness('xhs',{env:{URBANCOOL_COLLECTOR_MODE:'disabled'},fetchImpl:()=>{throw Error('Must not contact local dependencies');}});
    assert.equal(readiness.ready,false);assert.equal(readiness.checks[0].id,'execution');
    await assert.rejects(requestHeatCollection(account,'遮阴',{source:'xiaohongshu'}),error=>error.code==='collector_disabled');
    await assert.rejects(access(directory));
    const archive=await queryXhsHeatPerception({});
    assert.equal(archive.status,'heat_perception_snapshot');assert.equal(archive.transport,'mcp_stdio');
  }finally{if(previous===undefined)delete process.env.URBANCOOL_COLLECTOR_MODE;else process.env.URBANCOOL_COLLECTOR_MODE=previous;}
});
