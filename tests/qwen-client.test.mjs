import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createQwenClient} from '../server/qwen-client.mjs';
import {createAgentServer} from '../server/agent-server.mjs';
import {qwenConfig,QWEN_DEFAULTS} from '../server/qwen-config.mjs';
import {startQwenAgentServer} from '../server/qwen-agent-server.mjs';
import {createServer} from 'node:net';

test('Qwen defaults match the V4 runtime while explicit legacy endpoints and models remain usable',async()=>{
  const requests=[];
  const client=createQwenClient({...qwenConfig({}),fetchImpl:async(url,options)=>{
    requests.push({url,options});return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:'fixture'}}]});
  }});
  await client.complete([]);await client.complete([],{agentId:'plan_exploration'});
  assert.equal(requests[0].url,'http://127.0.0.1:18084/v1/chat/completions');
  assert.equal(JSON.parse(requests[0].options.body).model,'epoch_2');
  assert.equal(JSON.parse(requests[1].options.body).model,'base');
  const legacy=qwenConfig({QWEN_BASE_URL:'http://127.0.0.1:18083/v1',QWEN_MODEL:'active',QWEN_SPECIALIST_MODEL:'base'});
  assert.equal(legacy.baseUrl,'http://127.0.0.1:18083/v1');assert.equal(legacy.model,'active');
  assert.equal(QWEN_DEFAULTS.baseUrl,qwenConfig({QWEN_BASE_URL:''}).baseUrl);
});

test('standalone Qwen startup uses current environment configuration and explicit options take precedence',async()=>{
  const keys=['QWEN_BASE_URL','QWEN_MODEL','QWEN_SPECIALIST_MODEL'],previous=keys.map(key=>process.env[key]);
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(done=>reservation.close(done));
  const probes=[];
  let server;
  try{
    process.env.QWEN_BASE_URL='http://127.0.0.1:18084/v1';process.env.QWEN_MODEL='env-main';process.env.QWEN_SPECIALIST_MODEL='env-base';
    server=await startQwenAgentServer({port,model:'explicit-main',fetchImpl:async url=>{probes.push(url);return Response.json({base_ready:true});}});
    if(!server.listening)await once(server,'listening');
    const health=await (await fetch(`http://127.0.0.1:${port}/api/agent/health`)).json();
    assert.equal(health.model,'explicit-main');assert.equal(health.model_available,true);
    assert.deepEqual(probes,['http://127.0.0.1:18084/health']);
  }finally{
    if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}
    keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
  }
});

test('Qwen client preserves native tool messages and routes specialist models',async()=>{
  const seen=[];
  const incoming={role:'assistant',content:null,tool_calls:[{id:'call_1',type:'function',function:{name:'get_input_gaps',arguments:'{}'}}]};
  const client=createQwenClient({baseUrl:'http://127.0.0.1:18083/v1/',model:'epoch_2',specialistModel:'base',fetchImpl:async(url,options)=>{seen.push({url,...options});return {ok:true,json:async()=>({choices:[{finish_reason:'tool_calls',message:incoming}],usage:{prompt_tokens:10}})};}});
  const messages=[{role:'tool',tool_call_id:'previous',content:'{"status":"not_connected"}'}],tools=[{type:'function',function:{name:'get_input_gaps'}}];
  const result=await client.complete(messages,{tools,agentId:'coordinator'});await client.complete(messages,{tools,agentId:'data_audit'});
  assert.deepEqual(result.message,incoming);assert.equal(seen[0].url,'http://127.0.0.1:18083/v1/chat/completions');
  assert.deepEqual(JSON.parse(seen[0].body).messages,messages);assert.deepEqual(JSON.parse(seen[0].body).tools,tools);
  assert.equal(JSON.parse(seen[0].body).model,'epoch_2');assert.equal(JSON.parse(seen[1].body).model,'base');
  assert.equal(JSON.parse(seen[0].body).chat_template_kwargs.enable_thinking,false);assert.equal(seen[0].redirect,'error');
});
test('Qwen provider errors never echo the upstream body or credential',async()=>{
  const client=createQwenClient({apiKey:'test-secret-not-a-real-key',fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:'test-secret-not-a-real-key'})})});
  await assert.rejects(client.complete([]),error=>error.code==='provider_auth_failed'&&!error.message.includes('test-secret'));
});
test('Qwen incomplete or malformed responses are rejected',async()=>{
  for(const choice of [{finish_reason:'length',message:{role:'assistant',content:'unfinished'}},{finish_reason:'stop',message:{role:'assistant',tool_calls:{bad:true}}}]){
    const client=createQwenClient({fetchImpl:async()=>({ok:true,json:async()=>({choices:[choice]})})});
    await assert.rejects(client.complete([]));
  }
});
test('Qwen cancellation and invalid endpoints are handled before tool execution',async()=>{
  assert.throws(()=>createQwenClient({baseUrl:'file:///tmp/model'}));
  assert.throws(()=>createQwenClient({baseUrl:'http://user:secret@localhost/v1'}));
  const controller=new AbortController();controller.abort();
  const client=createQwenClient({fetchImpl:async()=>{throw new Error('network');}});
  await assert.rejects(client.complete([],{signal:controller.signal}),error=>error.code==='turn_cancelled');
});
test('health identifies Qwen while preserving DeepSeek fallback for older clients',async()=>{
  for(const [client,expected] of [[{provider:'Qwen',model:'test-qwen',configured:true},'Qwen'],[{model:'old-client',configured:true},'DeepSeek']]){
    const server=createAgentServer({catalog:{},client,store:{},port:0});server.listen(0,'127.0.0.1');await once(server,'listening');
    try{
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/agent/health`);const body=await response.json();
      assert.equal(body.provider,expected);assert.equal(body.capabilities.temperature_prediction,false);
    }finally{server.close();await once(server,'close');}
  }
});

test('the local Qwen health probe distinguishes offline from unsupported health endpoints',async()=>{
  const failing=createQwenClient({fetchImpl:async()=>{throw new Error('offline');}});
  assert.equal(await failing.probe(),false);
  const online=createQwenClient({baseUrl:'http://127.0.0.1:18084/v1',fetchImpl:async(url,request)=>{
    assert.equal(url,'http://127.0.0.1:18084/health');
    assert.equal(request.method,'GET');
    return {ok:true,json:async()=>({base_ready:true})};
  }});
  assert.equal(await online.probe(),true);
  const unknown=createQwenClient({fetchImpl:async()=>new Response(null,{status:404})});
  assert.equal(await unknown.probe(),null);
  assert.equal(createQwenClient({baseUrl:'https://example.com/v1',qwenTemplate:false}).probe,undefined);
});

test('Qwen readiness distinguishes loading, authentication errors and unrecognized success responses without leaking upstream data',async()=>{
  const cases=[
    [Response.json({base_ready:true}),'ready',true,'model_ready'],
    [Response.json({base_ready:false}),'loading',false,'model_loading'],
    [Response.json({error:'fixture-sensitive-upstream-value'},{status:401}),'unavailable',false,'model_auth_failed'],
    [Response.json({error:'fixture-sensitive-upstream-value'},{status:503}),'unavailable',false,'model_service_error'],
    [new Response('<html>wrong service</html>'),'unavailable',false,'invalid_health_response'],
    [Response.json({ok:true}),'unknown',null,'health_unrecognized'],
    [Response.json({base_ready:'true'}),'unknown',null,'health_unrecognized'],
    [new Response(null,{status:405}),'unknown',null,'health_unsupported'],
  ];
  for(const [response,state,available,code] of cases){
    let calls=0;
    const client=createQwenClient({apiKey:'fixture-sensitive-key',fetchImpl:async(_url,options)=>{
      calls++;assert.equal(options.method,'GET');assert.equal(options.body,undefined);return response;
    }});
    const status=await client.probeStatus();
    assert.equal(calls,1);assert.equal(status.state,state);assert.equal(status.available,available);assert.equal(status.code,code);
    assert.ok(Number.isFinite(Date.parse(status.checked_at)));
    assert.doesNotMatch(JSON.stringify(status),/fixture-sensitive|<html>/);
  }
  const offline=createQwenClient({fetchImpl:async()=>{throw new Error('fixture-sensitive-key');}});
  assert.equal((await offline.probeStatus()).code,'model_unreachable');
});

test('Agent health exposes Qwen recovery from loading to ready without a restart or generation request',async()=>{
  let loaded=false,calls=0;
  const client=createQwenClient({fetchImpl:async()=>{calls++;return Response.json({base_ready:loaded});}});
  const server=createAgentServer({catalog:{},client,store:{},port:0});server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const endpoint=`http://127.0.0.1:${server.address().port}/api/agent/health`;
    const loading=await (await fetch(endpoint)).json();
    assert.equal(loading.model_available,false);assert.equal(loading.model_connection.state,'loading');
    loaded=true;
    const ready=await (await fetch(endpoint)).json();
    assert.equal(ready.model_available,true);assert.equal(ready.model_connection.state,'ready');
    assert.equal(calls,2);
  }finally{server.close();await once(server,'close');}
});
