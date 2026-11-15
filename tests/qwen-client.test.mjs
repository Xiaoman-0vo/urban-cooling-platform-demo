import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createQwenClient} from '../server/qwen-client.mjs';
import {createAgentServer} from '../server/agent-server.mjs';

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
