import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadProjectCatalog,newSession,executeTool,publicSession} from '../server/agent-tools.mjs';
import {createDeepSeekClient,runAgentTurn} from '../server/project-agent.mjs';
import {SessionStore,createAgentServer} from '../server/agent-server.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=await loadProjectCatalog(root),context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id};
const fresh=()=>newSession(context,catalog);
function goal(session,text='预算10万元，候选面积800平方米，单价100元/平方米。',extra={}) {
  session.messages.push({role:'user',content:text});
  return executeTool('set_planning_goal',{budget_rmb:100000,candidate_area_m2:800,unit_cost_rmb_per_m2:100,evidence_quote:text,...extra},session,catalog);
}
const fixtureRoot=resolve(root,'.test-fixtures');await mkdir(fixtureRoot,{recursive:true});
const fixture=await mkdtemp(resolve(fixtureRoot,'agent-'));
test.after(async()=>{assert.ok(resolve(fixture).startsWith(fixtureRoot+sep));await rm(fixture,{recursive:true,force:true});});

test('agent source query preserves scope, green identity, null temperature and unknown capacity',()=>{
  const result=executeTool('get_grid_context',{grid_id:context.site_id},fresh(),catalog);
  assert.equal(result.classified_green_projection_area_m2,1989);assert.equal(result.classified_green_projection_percent,19.89);
  assert.equal(result.green_fragments,3);assert.equal(result.green_source_groups,1);
  assert.equal(result.temperature_prediction,null);assert.equal(result.remaining_buildable_area_m2,null);
  assert.match(result.sample_status,/not_user_confirmed/);
});
test('agent other locations never borrow example measurements',()=>{
  const session=fresh(),other=[...catalog.nodes.keys()].find(id=>id!==context.site_id);
  const result=executeTool('get_grid_context',{grid_id:other},session,catalog);
  assert.equal(result.classified_green_projection_area_m2,undefined);assert.equal(result.area_m2,10000);
  assert.equal(executeTool('get_grid_context',{grid_id:'NO_SUCH_GRID'},session,catalog).status,'no_data');
});
test('agent does not invent candidate space or prices',()=>{
  const session=fresh(),result=executeTool('generate_scenario_options',{},session,catalog);
  assert.equal(result.status,'needs_inputs');assert.equal(session.scenarios.length,0);
  assert.deepEqual(result.missing.map(item=>item.field),['budget_rmb','candidate_area_m2','unit_cost_rmb_per_m2']);
});
test('agent rejects invented numbers, unsupported quotes, unknown fields and invalid scope',()=>{
  const session=fresh();session.messages.push({role:'user',content:'预算10万元。'});
  assert.throws(()=>executeTool('set_planning_goal',{budget_rmb:200000,evidence_quote:'预算10万元。'},session,catalog),/原话/);
  assert.throws(()=>executeTool('set_planning_goal',{budget_rmb:100000,evidence_quote:'预算20万元。'},session,catalog),/原话/);
  assert.throws(()=>executeTool('set_planning_goal',{budget_rmb:100000,relax_protection:true,evidence_quote:'预算10万元。'},session,catalog),/接口/);
  session.messages.push({role:'user',content:'候选面积20000平方米。'});
  assert.throws(()=>executeTool('set_planning_goal',{candidate_area_m2:20000,evidence_quote:'候选面积20000平方米。'},session,catalog),/总面积/);
  assert.equal(session.goal.version,0);
});
test('agent drafts obey budget and capacity while geometry and temperature remain empty',()=>{
  const session=fresh();goal(session);const result=executeTool('generate_scenario_options',{},session,catalog);
  assert.deepEqual(result.scenarios.map(s=>s.added_green_area_m2),[400,600,800]);
  assert.deepEqual(result.scenarios.map(s=>s.estimated_construction_cost_rmb),[40000,60000,80000]);
  for(const s of result.scenarios){assert.equal(s.geometry,null);assert.equal(s.predicted_delta_lst_c,null);assert.equal(s.prediction_status,'not_run');assert.equal(s.preserve_buildings,true);}
});
test('agent retains an unmet target as a gap instead of declaring success',()=>{
  const session=fresh();goal(session,'预算10万元，候选面积800平方米，单价100元/平方米，新增目标1200平方米。',{added_green_target_m2:1200});
  const result=executeTool('generate_scenario_options',{},session,catalog);
  assert.equal(result.scenarios.at(-1).added_green_target_met,false);assert.equal(result.scenarios.at(-1).added_green_target_gap_m2,400);
  assert.match(executeTool('export_planning_report',{},session,catalog).report.markdown,/未达到，缺口400㎡/);
});
test('agent budget revisions preserve old versions and isolate current comparisons',()=>{
  const session=fresh();goal(session);executeTool('generate_scenario_options',{},session,catalog);const old=structuredClone(session.scenarios);
  const text='把预算改成5万元。';session.messages.push({role:'user',content:text});
  executeTool('set_planning_goal',{budget_rmb:50000,evidence_quote:text},session,catalog);
  const result=executeTool('generate_scenario_options',{},session,catalog);
  assert.deepEqual(result.scenarios.map(s=>s.added_green_area_m2),[250,375,500]);assert.deepEqual(session.scenarios.slice(0,3),old);
  assert.equal(publicSession(session).scenarios.filter(s=>s.is_stale).length,3);
  assert.equal(executeTool('compare_scenario_options',{},session,catalog).scenarios.length,3);
});
test('agent prediction requires a user request and returns not-run without fabricated values',()=>{
  const session=fresh();goal(session);const scenario=executeTool('generate_scenario_options',{},session,catalog).scenarios[0];
  assert.throws(()=>executeTool('request_temperature_prediction',{scenario_id:scenario.id},session,catalog),/未明确/);
  session.messages.push({role:'user',content:'请运行这个方案的温度预测。'});
  const result=executeTool('request_temperature_prediction',{scenario_id:scenario.id},session,catalog);
  assert.equal(result.status,'not_connected');assert.equal(result.execution_status,'not_run');assert.equal(result.predicted_delta_lst_c,null);
});
test('agent report binds current version, assumptions and uncalculated temperatures',()=>{
  const session=fresh();goal(session);executeTool('generate_scenario_options',{},session,catalog);
  const report=executeTool('export_planning_report',{},session,catalog).report;
  assert.equal(report.goal_version,1);assert.match(report.markdown,/1989/);assert.match(report.markdown,/未计算/);assert.match(report.markdown,/用户声明/);
});
test('agent executes tools and records their real source evidence',async()=>{
  const session=fresh();let calls=0;
  const client={complete:async()=>++calls===1?{message:{role:'assistant',tool_calls:[{id:'call_1',type:'function',function:{name:'get_project_overview',arguments:'{}'}}]},usage:{prompt_tokens:10,completion_tokens:2}}:{message:{role:'assistant',content:'根据工具资料，绿色投影1989㎡，温度尚未计算。'},usage:{prompt_tokens:20,completion_tokens:5}}};
  const result=await runAgentTurn({session,context,text:'查看当前场地',catalog,client});
  assert.equal(calls,2);assert.equal(result.traces.length,1);assert.equal(result.traces[0].result.current_site.classified_green_projection_area_m2,1989);assert.equal(result.messages.at(-1).usage.input_tokens,30);
});
test('agent rejects arbitrary tools and refuses to reuse a different site session',async()=>{
  const session=fresh();let calls=0;
  const client={complete:async messages=>{
    if(++calls===1)return{message:{role:'assistant',tool_calls:[{id:'bad',function:{name:'run_shell',arguments:'{"cmd":"anything"}'}}]}};
    assert.equal(JSON.parse(messages.at(-1).content).status,'rejected');return{message:{role:'assistant',content:'未执行未登记工具。'}};
  }};
  const result=await runAgentTurn({session,context,text:'帮我检查',catalog,client});assert.equal(result.traces[0].result.code,'tool_not_allowed');
  await assert.rejects(runAgentTurn({session,context:{site_id:'OTHER'},text:'继续',catalog,client}),/新会话/);
});
test('agent provider adapter cannot expose echoed credentials',async()=>{
  const secret='TEST_CREDENTIAL_ONLY_NOT_REAL';
  const client=createDeepSeekClient({apiKey:secret,fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:`bad ${secret}`}})})});
  await assert.rejects(client.complete([]),error=>error.code==='provider_auth_failed'&&!error.message.includes(secret));
  const good=createDeepSeekClient({apiKey:secret,fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');const body=JSON.parse(options.body);assert.equal(body.thinking.type,'disabled');assert.equal(body.tools.length,8);
    return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:'ok'}}]})};
  }});assert.equal((await good.complete([{role:'user',content:'hello'}])).message.content,'ok');
});
test('agent local HTTP service persists sessions and blocks untrusted origins',async t=>{
  const store=new SessionStore(fixture),client={model:'test-model',configured:true,complete:async()=>({message:{role:'assistant',content:'会话已连接。'}})};
  const saveErrors=[],save=store.save.bind(store);
  store.save=async session=>{try{return await save(session);}catch(error){saveErrors.push({code:error.code,operation:error.syscall});throw error;}};
  const server=createAgentServer({catalog,client,store,port:0});
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  t.after(()=>new Promise(done=>{server.close(done);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}/api/agent`,headers={'Content-Type':'application/json','X-UrbanCool-Agent':'1'};
  const health=await(await fetch(`${base}/health`)).json();assert.equal(health.configured,true);assert.equal(health.apiKey,undefined);assert.equal(health.capabilities.temperature_prediction,false);
  assert.equal((await fetch(`${base}/sessions`,{method:'POST',headers:{...headers,Origin:'https://untrusted.example'},body:'{}'})).status,403);
  const created=await(await fetch(`${base}/sessions`,{method:'POST',headers,body:JSON.stringify({context})})).json();
  const turnResponse=await fetch(`${base}/chat`,{method:'POST',headers,body:JSON.stringify({session_id:created.session.id,context,message:'你好'})});
  const turn=await turnResponse.json();assert.equal(turnResponse.status,200,JSON.stringify({error:turn.error,saveErrors}));assert.equal(turn.session.messages.length,2);
  const restored=await new SessionStore(fixture).get(created.session.id);assert.equal(restored.messages.length,2);await assert.rejects(store.get('../anything'),/无效/);
  const saved=JSON.parse(await readFile(resolve(fixture,`${created.session.id}.json`),'utf8'));assert.equal(saved.messages.at(-1).content,'会话已连接。');
});
