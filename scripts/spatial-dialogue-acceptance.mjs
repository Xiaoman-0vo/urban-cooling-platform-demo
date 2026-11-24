import {isDeepStrictEqual} from 'node:util';
import {AgentError,newSession} from '../server/agent-tools.mjs';
import {runAgentTurn} from '../server/project-agent.mjs';
import {READ_SPATIAL_SEARCH} from '../server/spatial-search-agent.mjs';
import {GENERATE_PILOT_CANDIDATES} from '../server/pilot-search.mjs';

const unchanged=(before,after)=>isDeepStrictEqual(before.pilot_searches||[],after.pilot_searches||[]);
const hasSearch=traces=>traces.some(t=>t.tool===GENERATE_PILOT_CANDIDATES&&t.result.batch);
const noPhysicalRun=session=>!(session.pilot_temperature_scenarios||[]).length;

// Runs real orchestration/tools. The supplied client determines whether inference is live or a test fixture.
export async function verifySpatialDialogue({catalog,client,onRecord=async()=>{},turnTimeoutMs=180000}) {
  const context={site_id:catalog.pilot.site_id,scenario_id:catalog.pilot.scenario_id,planning_mode:'mapped_pilot'};
  const result={schema_version:'spatial-dialogue-acceptance/1',started_at:new Date().toISOString(),
    provider:client.provider,model:client.model,specialist_model:client.modelForRole?.('plan_exploration'),
    context,status:'running',model_requests:0,cases:[],controls:[],
    scope:'Tool-grounded software acceptance with developer-authored prompts. Model weights, independent user language, cooling and construction feasibility are not validated.'};
  const finish=async status=>{result.status=status;result.passed=result.cases.filter(c=>c.passed).length;
    result.finished_at=new Date().toISOString();await onRecord(structuredClone(result));return result;};
  if(client.localPlanning||!client.configured){result.reason='需要已配置的对话模型，不能以本地规划工具替代真实对话验收。';return finish('not_run');}
  try{
    result.connection=await client.probeStatus?.()||{state:'unknown',available:null,code:'no_health_probe'};
  }catch{result.connection={state:'unavailable',available:false,code:'health_probe_failed'};}
  if(result.connection.available===false){result.reason='模型服务未就绪，本次未发送推理请求。';return finish('not_run');}
  await onRecord(structuredClone(result));
  const fresh=()=>newSession(context,catalog);
  async function turn(name,text,session,check) {
    const before=structuredClone(session),start=session.traces.length;
    let error;
    try{await runAgentTurn({session,context,text,catalog,client,signal:AbortSignal.timeout(turnTimeoutMs)});}
    catch(cause){error={code:cause instanceof AgentError?cause.code:'acceptance_failed',message:cause instanceof AgentError?cause.message:'本轮验收未完成。'};}
    const last=session.messages.at(-1),root=session.tasks.findLast(t=>t.agent_id==='coordinator'),traces=session.traces.slice(start);
    const requests=root?.budget?.used.model_requests||0;
    result.model_requests+=requests;
    const checks={completed:!error&&last?.role==='assistant',model_requested:requests>0,
      no_unauthorized_tool_attempt:!traces.some(t=>t.result.status==='rejected'),
      no_failed_model_tasks:!session.tasks.some(t=>t.run_id===root?.run_id&&['failed','cancelled','interrupted'].includes(t.status)),
      physical_scenarios_unchanged:isDeepStrictEqual(before.pilot_temperature_scenarios||[],session.pilot_temperature_scenarios||[]),
      ...check(session,traces,before)};
    for(const key of Object.keys(checks))checks[key]=Boolean(checks[key]);
    result.cases.push({name,text,passed:Object.values(checks).every(Boolean),checks,error,model_requests:requests,
      shown_reply:last?.content||null,model_reply:root?.result?.model_summary||last?.content||null,
      traces:structuredClone(traces),goal:structuredClone(session.goal),searches:structuredClone(session.pilot_searches||[]),
      tasks:structuredClone(session.tasks.filter(t=>t.run_id===root?.run_id)),
      reports:structuredClone(session.reports),physical_scenario_count:session.pilot_temperature_scenarios?.length||0});
    await onRecord(structuredClone(result));
    if(error&&['provider_auth_failed','provider_rate_limited','provider_unreachable','provider_error'].includes(error.code))
      result.stop_reason=error.code;
    return session;
  }
  const initial=await turn('generate_spatial_candidates',
    '预算15000元，假设单价300元/平方米，最低改造面积10平方米，生成空间候选。这轮不采用，不运行温度模型。',fresh(),(after,traces)=>{
      const batch=after.pilot_searches?.at(-1);
      return {goals_registered:after.goal.budget_rmb===15000&&after.goal.unit_cost_rmb_per_m2===300,
        minimum_is_not_cap:after.goal.candidate_area_m2===undefined,
        current_search_generated:Boolean(batch&&batch.scope.goal_version===after.goal.version&&batch.scope.minimum_area_m2===10&&batch.feasible_count>0),
        expected_cost_and_area:batch?.candidates.some(c=>c.strategies.includes('cost')&&c.area_m2===10&&c.cost_rmb===3000)&&
          batch.candidates.some(c=>c.strategies.includes('area')&&c.area_m2===50&&c.cost_rmb===15000),
        delegated_real_search:traces.some(t=>t.tool===GENERATE_PILOT_CANDIDATES&&t.agent_id==='plan_exploration'&&t.result.batch),
        no_fixed_templates:after.scenarios.length===0,no_physical_run:noPhysicalRun(after)};
    });
  if(result.stop_reason)return finish('failed');
  // Preserve the original batch for the stale-read case without resetting a live user's state.
  const stale=structuredClone(initial);
  await turn('budget_revision_no_solution','预算改为2000元，最低面积不变，重新生成空间候选。',initial,(after,traces,before)=>({
    budget_saved:after.goal.budget_rmb===2000&&after.goal.unit_cost_rmb_per_m2===300,
    only_budget_written:traces.some(t=>t.tool==='set_planning_goal'&&t.result.status==='goal_draft_saved'&&
      isDeepStrictEqual(Object.keys(t.arguments).sort(),['budget_rmb','evidence_quote'])),
    empty_result:Boolean(after.pilot_searches?.at(-1)?.feasible_count===0&&after.pilot_searches.at(-1).scope.minimum_area_m2===10),
    new_search:hasSearch(traces),old_search_preserved:Boolean(before.pilot_searches?.length&&isDeepStrictEqual(before.pilot_searches,after.pilot_searches?.slice(0,before.pilot_searches.length))),
  }));
  if(result.stop_reason)return finish('failed');
  await turn('missing_minimum','预算15000元，假设单价300元/平方米，请生成空间候选，最低改造面积还没确定。',fresh(),(after,traces)=>({
    stated_costs_registered:after.goal.budget_rmb===15000&&after.goal.unit_cost_rmb_per_m2===300,
    no_invented_search:!(after.pilot_searches||[]).length&&!hasSearch(traces),
    minimum_clarified:/最低|下限/.test(after.messages.at(-1)?.content||''),
  }));
  if(result.stop_reason)return finish('failed');
  await turn('cancel_search','不要生成或采用空间候选，这轮只看已有记录。',initial,(after,traces,before)=>({
    no_new_search:unchanged(before,after)&&!hasSearch(traces),no_goal_change:isDeepStrictEqual(before.goal,after.goal),
  }));
  if(result.stop_reason)return finish('failed');
  // Explicit local edit is a control action, never counted as language-model acceptance.
  await runAgentTurn({session:stale,context,catalog,client:{localPlanning:true},planningAction:{type:'set_conditions',fields:{budget_rmb:2000}}});
  result.controls.push({kind:'explicit_local_budget_edit',budget_rmb:2000,model_requests:0});
  await turn('stale_candidate_query','查看现在的空间候选，先不要重新生成。',stale,(after,traces,before)=>({
    stale_read_recorded:traces.some(t=>t.tool===READ_SPATIAL_SEARCH&&t.result.status==='stale_spatial_candidates'),
    no_new_search:unchanged(before,after)&&!hasSearch(traces),
    stale_explained:/过期/.test(after.messages.at(-1)?.content||''),
  }));
  if(result.stop_reason)return finish('failed');
  await turn('export_current_discussion','导出当前空间候选讨论报告，这轮不要生成或采用新候选。',initial,(after,traces,before)=>({
    report_generated:after.reports.length===before.reports.length+1&&traces.some(t=>t.tool==='export_planning_report'&&t.result.report),
    no_new_search:unchanged(before,after)&&!hasSearch(traces),
  }));
  result.passed=result.cases.filter(c=>c.passed).length;
  return finish(result.passed===result.cases.length?'passed':'failed');
}
