import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadProjectCatalog,newSession,executeTool,publicSession} from '../server/agent-tools.mjs';
import {runAgentTurn} from '../server/project-agent.mjs';
import {createQwenClient} from '../server/qwen-client.mjs';
import {pilotGeoJson} from '../src/pilot-map.js';
import {checkPilotBox,readPilotSources} from '../server/planning-pilot.mjs';
import {pilotPredictionRequested} from '../server/goal-evidence.mjs';
import {revisions,revisionChecks} from './fixtures/agent-revisions.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const catalog=await loadProjectCatalog(root);
const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id,planning_mode:'mapped_pilot'};
const tool=(name,args={})=>({role:'assistant',tool_calls:[{id:`call_${name}`,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const answer=content=>({role:'assistant',content});

// Only the provider response is scripted. All routing, spatial and budget
// checks, report creation and session versioning use the application entry.
function provider(primary,specialists=[]){
  const modes=[];
  const client=createQwenClient({model:'epoch_2',specialistModel:'base',fetchImpl:async(_url,options)=>{
    const {model}=JSON.parse(options.body);modes.push(model);
    const message=(model==='epoch_2'?primary:specialists).shift();
    assert.ok(message,`Unexpected request for ${model}`);
    return {ok:true,json:async()=>({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]})};
  }});
  return {client,modes};
}

test('registered ranges are checked against original geometry and stay review-only',async()=>{
  assert.deepEqual(catalog.pilot.candidates.map(c=>[c.id,c.review_id,c.area_m2]),[['A','H2',144],['B','H1',300]]);
  assert.equal(catalog.pilot.review_status,'pending_team_review');
  assert.ok(catalog.pilot.candidates.every(c=>Object.values(c.checks).every(Boolean)));
  const sources=await readPilotSources(root);
  assert.equal(checkPilotBox([412490,3389100,412510,3389120],'H1',sources).inside_grid,false);
  assert.throws(()=>newSession({...context,site_id:'different'},catalog),{code:'pilot_scope_mismatch'});
});

test('budget revisions keep geometry and history, and the program records the missing prediction check',async()=>{
  const session=newSession(context,catalog);
  const run=(text,client)=>runAgentTurn({session,context,text,catalog,client});
  const start='预算10万元，建设单价300元/平方米。请对候选A尝试预测温度并导出报告。';
  const first=provider([
    tool('set_planning_goal',{budget_rmb:100000,unit_cost_rmb_per_m2:300,evidence_quote:start}),
    tool('delegate_plan_exploration',{task:'核算两块候选'}),tool('export_planning_report'),answer('已核算两个候选，预测未执行。'),
  ],[tool('generate_scenario_options'),answer('已生成候选 A、B 的讨论草案。')]);
  const v1=await run(start,first.client);
  assert.ok(first.modes.includes('epoch_2')&&first.modes.includes('base'));
  const [mainTask,planningTask,checkTask]=v1.tasks;
  assert.equal(mainTask.language_model,'epoch_2');
  assert.equal(planningTask.language_model,'base');
  assert.equal(checkTask.execution_kind,'prediction_check');
  assert.equal(checkTask.language_model,null);
  assert.deepEqual(v1.scenarios.map(s=>[s.estimated_construction_cost_rmb,s.budget_check_passed]),[[43200,true],[90000,true]]);
  const checks=v1.traces.filter(t=>t.tool==='request_temperature_prediction');
  assert.equal(checks.length,1);assert.equal(checks[0].result.status,'not_connected');
  assert.equal(checks[0].result.scenario_id,v1.scenarios[0].id);
  assert.match(v1.reports[0].markdown,/not_connected，not_run/);
  assert.match(v1.messages.at(-1).content,/候选 A.*43200.*候选 B.*90000.*未接通/);

  const revise='把预算砍到5万元，单价和位置照旧。重新比较，先别做温度预测，导出一份对照。';
  const second=provider([
    tool('set_planning_goal',{budget_rmb:50000,evidence_quote:revise}),
    tool('delegate_plan_exploration',{task:'重新核算两块候选'}),
    tool('delegate_prediction_evaluation',{task:'比较本轮费用限制'}),tool('export_planning_report'),answer('A在预算内，B超预算，旧版已保留。'),
  ],[tool('generate_scenario_options'),answer('已保存新版讨论草案。')]);
  const v2=await run(revise,second.client);
  assert.equal(v2.goal.unit_cost_rmb_per_m2,300);
  assert.equal(v2.traces.filter(t=>t.tool==='request_temperature_prediction').length,1);
  assert.deepEqual(v2.scenarios.slice(0,2).map(s=>s.geometry),v2.scenarios.slice(2).map(s=>s.geometry));
  assert.deepEqual(v2.scenarios.map(s=>[s.goal_version,s.is_stale,s.budget_check_passed]),[[1,true,true],[1,true,true],[2,false,true],[2,false,false]]);
  const geojson=pilotGeoJson(v2.scenarios),report=v2.reports.at(-1).markdown;
  assert.equal(geojson.features.length,4);
  assert.match(report,/v1 \| B.*90000.*预算内/);assert.match(report,/v2 \| B.*90000.*超预算/);
  assert.match(v2.messages.at(-1).content,/候选 B[^。]*超预算.*旧版.*未发起预测检查/);

  const third=provider([
    tool('delegate_prediction_evaluation',{task:'检查候选B的预测接入'}),
    tool('delegate_prediction_evaluation',{task:'再次检查候选B的预测接入'}),
    answer('B超预算，预测未执行。'),
  ]);
  const blocked=await run('请对候选B运行温度预测。',third.client);
  const blockedTurn=blocked.messages.at(-1).turn_id;
  const blockedTraces=blocked.traces.filter(t=>t.turn_id===blockedTurn);
  assert.deepEqual(blockedTraces.filter(t=>t.tool==='request_temperature_prediction').map(t=>t.result.status),['candidate_blocked']);
  const delegated=blockedTraces.filter(t=>t.tool==='delegate_prediction_evaluation');
  assert.equal(delegated.length,2);
  assert.equal(delegated[0].result.task_id,delegated[1].result.task_id);
  const fourth=provider([answer('检查接入状态。'),answer('旧草案待更新。')]);
  const stale=await run('请对上一版候选A运行温度预测。',fourth.client);
  assert.equal(stale.traces.findLast(t=>t.tool==='request_temperature_prediction').result.status,'stale_scenario');
  assert.match(stale.messages.at(-1).content,/候选 A v1 是旧版草案/);
  assert.doesNotMatch(stale.messages.at(-1).content,/未接通/);
  assert.ok(stale.scenarios.every(s=>s.predicted_delta_lst_c===null));

  if(process.env.URBANCOOL_PILOT_EXPORT==='1'){
    await writeFile(new URL('../verification/成都落图试点_两版对照.md',import.meta.url),
      '> 本记录由脚本化模型响应跑通真实软件工具生成。候选现场条件待组员核实。\n\n'+report+'\n');
    await writeFile(new URL('../verification/成都落图试点_两版对照.geojson',import.meta.url),JSON.stringify(geojson,null,2));
  }
});

test('pilot prompts can omit an area cap, but missing costs and prediction questions stay bounded',async()=>{
  const session=newSession(context,catalog);
  session.messages.push({role:'user',content:'暂定预算5万元，单价还不知道。'});
  executeTool('set_planning_goal',{budget_rmb:50000,evidence_quote:'暂定预算5万元'},session,catalog);
  const result=executeTool('generate_scenario_options',{},session,catalog);
  assert.deepEqual(result.missing.map(v=>v.field),['unit_cost_rmb_per_m2']);
  for(const text of ['这个方案可以预测温度吗？','为什么不能预测？','取消温度预测','先别做温度预测'])assert.equal(pilotPredictionRequested(text),false,text);
  assert.equal(pilotPredictionRequested('请预测候选A。'),true);
  const user='先登记预算5万元，单价还没确定。';
  const {client}=provider([tool('set_planning_goal',{budget_rmb:50000,evidence_quote:user}),answer('已登记。')]);
  const reply=await runAgentTurn({session:newSession(context,catalog),context,text:user,catalog,client});
  assert.match(reply.messages.at(-1).content,/请补充假设建设单价/);
  assert.equal(reply.tasks[0].result.model_summary,'已登记。');
});

test('sequential pilot edits preserve previous values and reject quoted source values',async()=>{
  const session=newSession(context,catalog);
  for(const step of revisions){
    const before=publicSession(session);
    const attempts=[];
    if(step.name==='revise_unit_cost'){
      attempts.push(tool('set_planning_goal',{unit_cost_rmb_per_m2:275,evidence_quote:step.text}));
    }
    if(step.export){
      attempts.push(tool('set_planning_goal',{budget_rmb:105000,evidence_quote:'把预算从10.5万元'}));
    }
    const {client}=provider([...attempts,
      tool('set_planning_goal',{...step.change,evidence_quote:step.text}),
      tool('delegate_plan_exploration',{task:'按当前约束核算候选面积与费用'}),
      ...(step.export?[tool('export_planning_report')]:[]),answer('已核算。')
    ],[tool('generate_scenario_options'),answer('当前版本已生成。')]);
    const after=await runAgentTurn({session,context,text:step.text,catalog,client});
    const traces=after.traces.filter(t=>t.turn_id===after.messages.at(-1).turn_id);
    for(const [name,ok] of Object.entries(revisionChecks(step,before,after,traces))){
      assert.ok(ok,`${step.name}: ${name}`);
    }
    assert.equal(traces.filter(t=>t.result.code==='unsupported_goal_value').length,attempts.length);
  }
});
