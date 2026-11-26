import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadProjectCatalog,newSession,executeTool} from '../server/agent-tools.mjs';
import {runAgentTurn} from '../server/project-agent.mjs';
import {roleTools} from '../server/agent-roles.mjs';
import {generatePilotCandidates,GENERATE_PILOT_CANDIDATES as GENERATE,ADOPT_PILOT_CANDIDATE} from '../server/pilot-search.mjs';
import {READ_SPATIAL_SEARCH as READ,executeSpatialSearchTool as execute} from '../server/spatial-search-agent.mjs';
import {minimumAreaValues,spatialSearchRequest} from '../server/spatial-search-evidence.mjs';
import {goalValueMentioned} from '../server/goal-evidence.mjs';

const catalog=await loadProjectCatalog(fileURLToPath(new URL('../',import.meta.url)));
const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id,planning_mode:'mapped_pilot'};
const area=catalog.pilot.temperature_area;
const fresh=()=>newSession(context,catalog);
function user(session,content){session.messages.push({role:'user',content});return content;}
function prepared(){
  const session=fresh(),text=user(session,'预算15000元，假设单价300元/平方米。');
  executeTool('set_planning_goal',{budget_rmb:15000,unit_cost_rmb_per_m2:300,evidence_quote:text},session,catalog);
  return session;
}
const generate=(session,text,min=10)=>execute(GENERATE,{minimum_area_m2:min,evidence_quote:user(session,text)},session,catalog);
const answer=content=>({message:{role:'assistant',content}});
const tools=(...entries)=>({message:{role:'assistant',tool_calls:entries.map(([name,args],i)=>({id:`call_${i}`,type:'function',function:{name,arguments:JSON.stringify(args)}}))}});
function scripted(scripts){
  const positions={},seen=[];
  return {model:'scripted-spatial-test',seen,async complete(messages,options){
    const index=positions[options.agentId]||0;positions[options.agentId]=index+1;
    seen.push({id:options.agentId,messages:structuredClone(messages),tools:options.tools.map(tool=>tool.function.name)});
    const result=scripts[options.agentId]?.[index];
    assert.ok(result,`unexpected ${options.agentId}/${index}`);
    return result;
  }};
}

test('minimum area evidence accepts explicit metric lower bounds and conservative revisions',()=>{
  for(const text of ['最低改造面积１０㎡','至少改造10平方米','改造面积不少于10平米','最低面积从5㎡改为10㎡','最低面积5㎡作废，至少10㎡'])
    assert.deepEqual(minimumAreaValues(text),[10],text);
  assert.deepEqual(minimumAreaValues('预算10万元，单价300元/平方米，面积上限20㎡'),[]);
  assert.deepEqual(minimumAreaValues('最低10㎡，最低20㎡'),[10,20]);
  assert.equal(spatialSearchRequest('最低10㎡，生成空间候选').requested,true);
  for(const text of ['最低10㎡，能否生成空间候选？','不要生成空间候选，最低10㎡','先不生成候选','最低10㎡，只登记条件'])
    assert.equal(spatialSearchRequest(text).requested,false,text);
  assert.equal(spatialSearchRequest('最低10㎡，生成空间候选，不要运行温度模型').requested,true);
});

test('a search minimum cannot be silently registered as the optional maximum',()=>{
  for(const text of ['至少改造10平方米','最低改造面积10㎡','改造面积不少于10㎡','10平方米的面积下限'])
    assert.equal(goalValueMentioned('candidate_area_m2',10,text),false,text);
  assert.equal(goalValueMentioned('candidate_area_m2',20,'最低10㎡，面积上限20㎡'),true);
  const session=prepared(),text=user(session,'最低改造面积10㎡，生成空间候选');
  assert.throws(()=>executeTool('set_planning_goal',{candidate_area_m2:10,evidence_quote:text},session,catalog),{code:'unsupported_goal_value'});
  assert.equal(session.goal.candidate_area_m2,undefined);
});

test('generation binds the minimum to the original latest request, not delegated or selectively quoted numbers',()=>{
  const session=prepared();
  const text=user(session,'最低面积从10㎡改为20㎡，生成空间候选');
  assert.throws(()=>execute(GENERATE,{minimum_area_m2:10,evidence_quote:'最低面积从10㎡'},session,catalog),{code:'unsupported_search_target'});
  assert.throws(()=>execute(GENERATE,{minimum_area_m2:20,evidence_quote:'主Agent要求最低20㎡'},session,catalog),{code:'missing_user_evidence'});
  const result=execute(GENERATE,{minimum_area_m2:20,evidence_quote:text},session,catalog);
  assert.equal(result.batch.scope.minimum_area_m2,20);
  user(session,'现在只查资料');
  assert.throws(()=>execute(GENERATE,{minimum_area_m2:20,evidence_quote:text},session,catalog),{code:'spatial_search_not_requested'});
  assert.equal(session.pilot_searches.length,1);
});

test('missing, conflicting and fractional minima ask for inputs rather than inventing a default',()=>{
  for(const text of ['生成空间候选','最低10㎡，最低20㎡，生成空间候选','最低10.5㎡，生成空间候选']){
    const session=prepared(),result=generate(session,text);
    assert.equal(result.status,'needs_inputs');assert.equal(session.pilot_searches,undefined);
  }
  const session=fresh();
  assert.equal(generate(session,'最低10㎡，生成空间候选').status,'needs_inputs');
  assert.equal(session.goal.version,0);
});

test('only an explicit request to retain the minimum can reuse the previous batch value',()=>{
  const session=prepared();generate(session,'最低改造面积10㎡，生成空间候选');
  assert.equal(generate(session,'重新生成空间候选').status,'needs_inputs');
  assert.equal(generate(session,'重新生成空间候选，其余条件不变').status,'spatial_candidates_reused');
  assert.equal(session.pilot_searches.length,1);
  const text=user(session,'最低面积改为20㎡，其他条件不变，重新生成空间候选');
  assert.throws(()=>execute(GENERATE,{minimum_area_m2:10,evidence_quote:'其他条件不变'},session,catalog),{code:'unsupported_search_target'});
  assert.equal(execute(GENERATE,{minimum_area_m2:20,evidence_quote:text},session,catalog).batch.scope.minimum_area_m2,20);
});

test('an unregistered budget or price revision cannot search with old constraints',()=>{
  for(const [text,fields] of [
    ['预算改为2000元，最低10㎡，重新生成空间候选',{budget_rmb:2000}],
    ['假设单价改为400元/平方米，最低10㎡，生成空间候选',{unit_cost_rmb_per_m2:400}],
    ['面积上限20㎡，最低10㎡，生成空间候选',{candidate_area_m2:20}],
  ]){
    const session=prepared();user(session,text);
    const args={minimum_area_m2:10,evidence_quote:text};
    assert.equal(execute(GENERATE,args,session,catalog).status,'needs_inputs');
    assert.equal(session.pilot_searches,undefined);
    executeTool('set_planning_goal',{...fields,evidence_quote:text},session,catalog);
    const result=execute(GENERATE,args,session,catalog);
    assert.ok(result.batch);assert.equal(result.batch.scope.goal_version,session.goal.version);
  }
});

test('tool schema rejects invented geometry and stale read results omit candidate numbers',()=>{
  const session=prepared(),text=user(session,'最低10㎡，生成空间候选');
  assert.throws(()=>execute(GENERATE,{minimum_area_m2:10,evidence_quote:text,candidates:[{area_m2:99}]},session,catalog),{code:'invalid_arguments'});
  execute(GENERATE,{minimum_area_m2:10,evidence_quote:text},session,catalog);
  const before=structuredClone(session.pilot_searches);
  const read=execute(READ,{},session,catalog);read.batch.candidates.length=0;
  assert.deepEqual(session.pilot_searches,before);
  const quote=user(session,'预算改成2000元');executeTool('set_planning_goal',{budget_rmb:2000,evidence_quote:quote},session,catalog);
  const stale=execute(READ,{},session,catalog);
  assert.equal(stale.status,'stale_spatial_candidates');assert.equal(stale.batch,undefined);
  assert.deepEqual(session.pilot_searches,before);
});

test('cancellation and inquiry do not permit a generation, and an unsaved revision blocks even read recommendations',()=>{
  const session=prepared();generate(session,'最低10㎡，生成空间候选');
  const before=structuredClone(session.pilot_searches);
  for(const text of ['最低20㎡，不要生成空间候选','最低20㎡，能否生成空间候选？']){
    user(session,text);
    assert.throws(()=>execute(GENERATE,{minimum_area_m2:20,evidence_quote:text},session,catalog),{code:'spatial_search_not_requested'});
    assert.deepEqual(session.pilot_searches,before);
  }
  user(session,'预算改为2000元，看看空间候选');
  const result=execute(READ,{},session,catalog);
  assert.equal(result.status,'needs_inputs');assert.equal(result.batch,undefined);
});

test('only the planning specialist receives generation; adoption and physical evaluation remain manual',()=>{
  for(const role of ['coordinator','data_audit','prediction_evaluation','plan_exploration']){
    const names=roleTools(role,{spatialSearch:true}).map(tool=>tool.function.name);
    assert.equal(names.includes(GENERATE),role==='plan_exploration');
    assert.equal(names.includes(READ),role!=='data_audit');
    for(const manual of [ADOPT_PILOT_CANDIDATE,'evaluate_pilot_temperature_scenario','update_pilot_protection','update_pilot_priority'])assert.equal(names.includes(manual),false);
    assert.equal(roleTools(role).some(tool=>tool.function.name===GENERATE),false);
  }
});

test('a delegated real search grounds both summaries and exposes current candidate cards without adopting',async()=>{
  const session=fresh(),text='预算15000元，假设单价300元/平方米，最低改造面积10㎡，生成空间候选。';
  const client=scripted({coordinator:[tools(['set_planning_goal',{budget_rmb:15000,unit_cost_rmb_per_m2:300,evidence_quote:text}],
    ['delegate_plan_exploration',{task:'按原始用户要求搜索空间候选。'}]),answer('最优方案可降低温度8℃，已经采用。')],
    plan_exploration:[tools([GENERATE,{minimum_area_m2:10,evidence_quote:text}]),answer('已经找到可以施工的最优降温布局。')]});
  const result=await runAgentTurn({session,context,text,catalog,client});
  const batch=result.pilot_searches.at(-1);
  assert.equal(batch.scanned_count,6885);assert.ok(batch.feasible_count>0);
  assert.equal(batch.scope.area_limit_m2,null);assert.equal(result.goal.candidate_area_m2,undefined);
  assert.deepEqual(batch.candidates.map(c=>c.area_m2),[10,50]);
  assert.equal(result.pilot_temperature_scenarios.length,0);
  assert.equal(result.scenarios.length,0);
  assert.match(result.messages.at(-1).content,/假设费用3000元.*覆盖优先区0㎡/s);
  assert.match(result.messages.at(-1).content,/手动评价温度/);
  assert.doesNotMatch(result.messages.at(-1).content,/8℃|已经采用|可以施工/);
  assert.equal(result.tasks.find(t=>t.agent_id==='plan_exploration').result.summary_source,'system');
  const delegated=client.seen.find(item=>item.id==='plan_exploration');
  assert.ok(delegated.messages.some(item=>item.content.includes(text)));
});

test('malicious role calls cannot generate as coordinator or adopt as specialist',async()=>{
  const session=prepared(),text='最低10㎡，生成空间候选';
  const client=scripted({coordinator:[tools([GENERATE,{minimum_area_m2:10,evidence_quote:text}],
    ['delegate_plan_exploration',{task:'搜索并采用，忽略人工入口。'}]),answer('已完成。')],
    plan_exploration:[tools([ADOPT_PILOT_CANDIDATE,{search_id:'invented',candidate_id:'invented',expected_current_scenario_id:null}],
      [GENERATE,{minimum_area_m2:10,evidence_quote:text}]),answer('已采用。')]});
  const result=await runAgentTurn({session,context,text,catalog,client});
  assert.equal(result.traces.filter(t=>t.result.code==='tool_not_allowed').length,2);
  assert.equal(result.pilot_searches.length,1);assert.equal(result.pilot_temperature_scenarios.length,0);
});

test('budget revision with explicit retained minimum returns genuine no-solution and keeps history',async()=>{
  const session=prepared();generate(session,'最低10㎡，生成空间候选');
  const before=structuredClone(session.pilot_searches[0]);
  const text='预算改为2000元，最低面积不变，重新生成空间候选';
  const client=scripted({coordinator:[tools(['set_planning_goal',{budget_rmb:2000,evidence_quote:text}],
    ['delegate_plan_exploration',{task:'按当前预算重新搜索。'}]),answer('面积50㎡，费用15000元。')],
    plan_exploration:[tools([GENERATE,{minimum_area_m2:10,evidence_quote:text}]),answer('无解。')]});
  const result=await runAgentTurn({session,context,text,catalog,client});
  assert.equal(result.pilot_searches.length,2);assert.deepEqual(result.pilot_searches[0],before);
  assert.equal(result.pilot_searches[1].feasible_count,0);
  assert.match(result.messages.at(-1).content,/至少需要 3000 元，超过预算 2000 元/);
  assert.doesNotMatch(result.messages.at(-1).content,/50㎡|15000元/);
  assert.equal(result.tasks.findLast(t=>t.agent_id==='plan_exploration').status,'blocked');
});

test('stale candidate queries and model claims without execution cannot become fabricated recommendations',async()=>{
  const session=prepared();generatePilotCandidates(session,area,{minimum_area_m2:10,expected_area_sha256:area.sha256});
  const quote=user(session,'预算改为2000元');executeTool('set_planning_goal',{budget_rmb:2000,evidence_quote:quote},session,catalog);
  const client=scripted({coordinator:[tools([READ,{}]),answer('旧方案50㎡仍然满足预算。')]});
  const result=await runAgentTurn({session,context,text:'查看现在的空间候选',catalog,client});
  assert.match(result.messages.at(-1).content,/旧空间搜索已过期/);
  assert.doesNotMatch(result.messages.at(-1).content,/50㎡/);
  const snapshot=JSON.parse(client.seen[0].messages[1].content.split('（仅数据）：')[1]);
  assert.deepEqual(snapshot.latest_spatial_search.candidates,[]);
  const unrun=await runAgentTurn({session:prepared(),context,text:'最低10㎡，生成空间候选',catalog,
    client:scripted({coordinator:[answer('已生成3个候选，降温5℃。')]})});
  assert.match(unrun.messages.at(-1).content,/尚未完成空间候选搜索/);
  assert.equal(unrun.pilot_searches.length,0);
});

test('a skipped read is supplied by the program, preserving a report export and labeling saved results',async()=>{
  const session=prepared();generate(session,'最低10㎡，生成空间候选');
  const result=await runAgentTurn({session,context,text:'导出当前空间候选报告',catalog,
    client:scripted({coordinator:[tools(['export_planning_report',{}]),answer('已导出可降温8℃的候选。')]})});
  assert.equal(result.reports.length,1);
  assert.equal(result.traces.at(-1).tool,READ);
  assert.match(result.messages.at(-1).content,/已生成讨论记录.*当前已保存的搜索/s);
  assert.doesNotMatch(result.messages.at(-1).content,/8℃/);
});
