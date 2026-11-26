import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {AgentError,loadProjectCatalog} from '../server/agent-tools.mjs';
import {createQwenClient} from '../server/qwen-client.mjs';
import {verifySpatialDialogue} from '../scripts/spatial-dialogue-acceptance.mjs';

const catalog=await loadProjectCatalog(fileURLToPath(new URL('../',import.meta.url)));
const answer=content=>({message:{role:'assistant',content}});
const tools=(...entries)=>({message:{role:'assistant',tool_calls:entries.map(([name,args],i)=>({id:`fixture_${i}`,type:'function',function:{name,arguments:JSON.stringify(args)}}))}});

function fixtureClient(){
  const rounds=new Map();
  return {configured:true,provider:'scripted test fixture',model:'fixture',modelForRole:()=> 'fixture',
    probeStatus:async()=>({state:'ready',available:true}),async complete(messages,{agentId,taskId}){
      const round=rounds.get(taskId)||0;rounds.set(taskId,round+1);
      if(round)return answer('脚本化测试响应，数值以工具为准。');
      const text=agentId==='coordinator'?messages.findLast(m=>m.role==='user').content:
        JSON.parse(messages[1].content.split('（仅数据）：')[1]).original_user_request;
      if(agentId==='plan_exploration')return tools(['generate_pilot_spatial_candidates',{minimum_area_m2:10,evidence_quote:text}]);
      if(text.startsWith('查看'))return answer('这里故意跳过读取，由程序补足。');
      if(text.startsWith('不要'))return tools(['get_spatial_candidate_search',{}]);
      if(text.startsWith('导出'))return tools(['export_planning_report',{}]);
      const fields=text.startsWith('预算改为')?{budget_rmb:2000}:{budget_rmb:15000,unit_cost_rmb_per_m2:300};
      return tools(['set_planning_goal',{...fields,evidence_quote:text}],['delegate_plan_exploration',{task:'仅按原始用户要求搜索，不采用或运行温度。'}]);
    }};
}

test('live acceptance suite exercises real search, missing inputs, cancellation, stale reads and export using explicitly scripted model fixtures',async()=>{
  const saved=[];
  const record=await verifySpatialDialogue({catalog,client:fixtureClient(),onRecord:r=>saved.push(r)});
  assert.equal(record.status,'passed');assert.equal(record.passed,6);assert.equal(record.cases.length,6);
  assert.ok(record.model_requests>0);
  assert.ok(record.cases.every(c=>c.checks.no_unauthorized_tool_attempt&&c.physical_scenario_count===0));
  const stale=record.cases.find(c=>c.name==='stale_candidate_query');
  assert.match(stale.shown_reply,/未生成.*过期/s);
  assert.ok(stale.traces.some(t=>t.tool==='get_spatial_candidate_search'));
  const missing=record.cases.find(c=>c.name==='missing_minimum');
  assert.equal(missing.searches.length,0);
  assert.ok(saved.length>=8);assert.equal(saved.at(-1).status,'passed');
  assert.deepEqual(record.controls,[{kind:'explicit_local_budget_edit',budget_rmb:2000,model_requests:0}]);
});

test('offline, loading and local-planning clients cannot produce a successful live acceptance',async()=>{
  for(const client of [
    {configured:true,probeStatus:async()=>({state:'unavailable',available:false})},
    {configured:true,probeStatus:async()=>({state:'loading',available:false})},
    {configured:true,localPlanning:true},{configured:false},
  ]){
    let requests=0;
    const record=await verifySpatialDialogue({catalog,client:{...client,complete:async()=>{requests++;throw Error('must not run');}}});
    assert.equal(record.status,'not_run');assert.equal(record.model_requests,0);assert.equal(requests,0);
    assert.equal(record.cases.length,0);
  }
});

test('a model claiming success without tools fails acceptance even though the safe program reply remains grounded',async()=>{
  const record=await verifySpatialDialogue({catalog,client:{configured:true,model:'test-claims-only',
    complete:async()=>answer('已经生成并采用降温8℃的方案。')}});
  assert.equal(record.status,'failed');
  const first=record.cases[0];
  assert.equal(first.checks.delegated_real_search,false);assert.equal(first.searches.length,0);
  assert.equal(first.checks.expected_cost_and_area,false);
  assert.doesNotMatch(first.shown_reply,/8℃/);assert.match(first.model_reply,/8℃/);
});

test('provider errors preserve failed cases without echoing upstream secrets',async()=>{
  const client=createQwenClient({baseUrl:'https://fixture.invalid/v1',apiKey:'fixture-private-key',
    fetchImpl:async()=>Response.json({error:'fixture-private-key'},{status:401})});
  const result=await verifySpatialDialogue({catalog,client});
  assert.equal(result.status,'failed');assert.equal(result.cases[0].checks.completed,false);
  assert.equal(result.cases[0].error.code,'provider_auth_failed');
  assert.equal(result.cases.length,1);assert.equal(result.model_requests,1);assert.equal(result.stop_reason,'provider_auth_failed');
  assert.doesNotMatch(JSON.stringify(result),/fixture-private-key/);
});

test('a failed specialist cannot be graded successful after the coordinator recovers with a safe summary',async()=>{
  const client=fixtureClient(),complete=client.complete;
  client.complete=async(messages,options)=>{
    if(options.agentId==='plan_exploration')throw new AgentError('provider_unreachable','fixture specialist unavailable');
    return complete(messages,options);
  };
  const result=await verifySpatialDialogue({catalog,client});
  assert.equal(result.status,'failed');assert.equal(result.cases[0].checks.no_failed_model_tasks,false);
  assert.ok(result.cases[0].tasks.some(t=>t.agent_id==='plan_exploration'&&t.status==='failed'));
});

test('CLI writes offline evidence, exits as not-run and refuses to overwrite a prior output directory',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'spatial-live-cli-'));
  let healthRequests=0;
  const server=createServer((_request,response)=>{healthRequests++;response.writeHead(200,{'Content-Type':'application/json'});response.end('{"base_ready":false}');});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const run=promisify(execFile),output=join(directory,'fresh'),script=fileURLToPath(new URL('../scripts/verify-spatial-dialogue-live.mjs',import.meta.url));
  const options={env:{...process.env,QWEN_BASE_URL:`http://127.0.0.1:${server.address().port}/v1`,QWEN_API_KEY:'fixture-not-a-real-secret'},windowsHide:true,timeout:15000};
  try{
    await assert.rejects(run(process.execPath,[script,'--output',output],options),error=>{
      assert.equal(error.code,2);assert.match(error.stdout,/not_run/);assert.doesNotMatch(error.stdout+error.stderr,/fixture-not-a-real-secret/);return true;
    });
    const bytes=await readFile(join(output,'acceptance.json'),'utf8'),record=JSON.parse(bytes);
    assert.equal(record.status,'not_run');assert.equal(record.model_requests,0);assert.equal(healthRequests,1);
    await assert.rejects(run(process.execPath,[script,'--output',output],options),error=>error.code===2&&/已存在/.test(error.stderr));
    assert.equal(await readFile(join(output,'acceptance.json'),'utf8'),bytes);assert.equal(healthRequests,1);
  }finally{
    server.closeAllConnections();await new Promise(done=>server.close(done));
    assert.ok(directory.startsWith(join(tmpdir(),'spatial-live-cli-')));
    await rm(directory,{recursive:true,force:true});
  }
});
