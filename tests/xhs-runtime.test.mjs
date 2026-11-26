import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadRuntimeEnvironment,classifierOrigin} from '../xiaohongshu_demand_agent/scripts/runtime-config.mjs';
import {stageWorkflow} from '../xiaohongshu_demand_agent/scripts/deploy-workflow.mjs';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

test('standalone chat and worker inherit the configured classifier without importing model secrets',async t=>{
  const root=await mkdtemp(join(tmpdir(),'urbancool-xhs-runtime-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const app=join(root,'assistant');await mkdir(app);
  await writeFile(join(root,'.env.local'),'URBANCOOL_CLASSIFIER_ORIGIN=http://127.0.0.1:15678\nDEEPSEEK_API_KEY=must-not-import\nQWEN_BASE_URL=http://127.0.0.1:18084/v1\n');
  await writeFile(join(app,'.env.local'),'OPENCLI_WINDOW=background\n');
  const env={};
  assert.equal((await loadRuntimeEnvironment({env,root:app})).classifierOrigin,'http://127.0.0.1:15678');
  assert.equal(env.OPENCLI_WINDOW,'background');
  assert.equal(env.DEEPSEEK_API_KEY,undefined);assert.equal(env.QWEN_BASE_URL,undefined);
  const explicit={URBANCOOL_CLASSIFIER_ORIGIN:'http://127.0.0.1:25678'};
  assert.equal((await loadRuntimeEnvironment({env:explicit,root:app})).classifierOrigin,'http://127.0.0.1:25678');
});

test('standalone classifier keeps the legacy default and rejects an external deployment target',()=>{
  assert.equal(classifierOrigin({}),'http://127.0.0.1:5678');
  assert.equal(classifierOrigin({N8N_URL:'http://localhost:15678/'}),'http://localhost:15678');
  for(const value of ['https://example.org','http://user:secret@localhost:5678','http://localhost:5678/webhook'])
    assert.throws(()=>classifierOrigin({URBANCOOL_CLASSIFIER_ORIGIN:value}));
});

test('deployment updates only the matching workflow and drops unrelated imported identities',()=>{
  const source={id:'foreign-id',name:'04-demand-chat',nodes:[],active:true};
  const existing=[{id:'api-id',name:'03-demand-agent-api'},
    {id:'chat-old',name:source.name,updatedAt:'2026-01-01'},
    {id:'chat-current',name:source.name,updatedAt:'2026-11-26'}];
  assert.equal(stageWorkflow(source,existing).id,'chat-current');
  assert.equal(stageWorkflow(source,existing).active,false);
  assert.equal(stageWorkflow(source,[]).id,undefined);
  assert.equal(source.id,'foreign-id');
});

test('HTTP smoke fails when an upstream returns the same status for every request',{skip:process.platform!=='win32'},async t=>{
  const run=promisify(execFile);
  for(const status of [200,400]){
    const server=createServer((req,res)=>{
      req.resume();
      res.writeHead(status,{'Content-Type':'application/json'});
      res.end(JSON.stringify({status:'error',errors:[{},{},{}]}));
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    const script=fileURLToPath(new URL('../xiaohongshu_demand_agent/scripts/smoke-test.ps1',import.meta.url));
    await assert.rejects(run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,
      '-BaseUrl',`http://127.0.0.1:${server.address().port}/classify`],{windowsHide:true,timeout:20000}),
      error=>error.code===1&&error.stdout.includes('FAIL health'));
  }
});

test('Windows duplicate workers cannot consume the same queue',{skip:process.platform!=='win32',timeout:15000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'urbancool-xhs-worker-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const program=fileURLToPath(new URL('../xiaohongshu_demand_agent/scripts/job-worker.mjs',import.meta.url));
  const env={...process.env,URBANCOOL_XHS_JOB_DATA_DIR:directory};
  const first=spawn(process.execPath,[program],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(first.exitCode===null){const stopped=once(first,'exit');first.kill();await stopped;}});
  await new Promise((resolve,reject)=>{
    let text='';
    const timer=setTimeout(()=>reject(new Error('Worker startup timed out')),5000);
    first.stdout.on('data',chunk=>{text+=chunk;if(text.includes('后台任务工人已启动')){clearTimeout(timer);resolve();}});
    first.once('error',error=>{clearTimeout(timer);reject(error);});
    first.once('exit',()=>{clearTimeout(timer);reject(new Error('Worker exited before readiness'));});
  });
  const duplicate=await promisify(execFile)(process.execPath,[program,'--once'],{env,windowsHide:true,timeout:5000});
  assert.match(duplicate.stdout,/已有工人在处理这个队列/);
});

test('chat startup reuses a matching running page and rejects a stale proxy',async t=>{
  let stale=false;
  const server=createServer((req,res)=>{
    req.resume();res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify(req.url==='/healthz'
      ?{service:'urbancool-xhs-chat',classifier_origin:stale?'http://127.0.0.1:5678':origin}
      :{status:'ok',result:{alive:true,route:'health'}}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const program=fileURLToPath(new URL('../xiaohongshu_demand_agent/scripts/start-chat.mjs',import.meta.url));
  const args=[program,'--no-open','--port',String(server.address().port)];
  const options={env:{...process.env,URBANCOOL_CLASSIFIER_ORIGIN:origin},windowsHide:true,timeout:10000};
  const result=await promisify(execFile)(process.execPath,args,options);
  assert.match(result.stdout,/聊天页已在运行/);
  assert.doesNotMatch(result.stderr,/Assertion failed/);
  stale=true;
  await assert.rejects(promisify(execFile)(process.execPath,args,options),
    error=>error.code===1&&error.stderr.includes('旧判定地址'));
});
