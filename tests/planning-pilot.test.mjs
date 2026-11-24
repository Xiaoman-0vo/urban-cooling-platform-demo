import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadProjectCatalog,newSession,executeTool,publicSession} from '../server/agent-tools.mjs';
import {runAgentTurn} from '../server/project-agent.mjs';
import {createQwenClient} from '../server/qwen-client.mjs';
import {pilotGeoJson,pilotTemperatureGeoJson,planningReportIsStale} from '../src/pilot-map.js';
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

test('map revisions bind area, costs, manual evaluation and exports to the same scenario version',async()=>{
  const session=newSession(context,catalog);
  const {temperature_area:area}=catalog.pilot;
  const evaluated=[];
  const historicalTemperature={evaluatePilot:async(query)=>{
    evaluated.push(query);
    const fullRange=query.area_m2===153;
    return {
      status:'scenario_estimated', scene_id:query.scene_id, observed_utc:'2022-09-28T03:33:44Z',
      observed_lst_c:33.567, baseline_lst_c:32.970,
      scenario_lst_c:fullRange?32.996:33.027, predicted_delta_lst_c:fullRange?-0.026:-0.057,
      reference_grid_count:1558, model_version:'V3', model_sha256:'model-hash', dataset_sha256:'data-hash',
      compiled_features:{order:['ubgg_class_1_pct','ubgg_class_2_pct'], baseline_center:[80.11,19.89],
        scenario_center:fullRange?[78.58,21.42]:[79.2,20.8], neighbor_mean:[34.489,65.5]},
    };
  }};
  const run=planningAction=>runAgentTurn({session,context,catalog,client:{localPlanning:true},planningAction,historicalTemperature});
  await assert.rejects(run({type:'save_temperature_scenario',bounds_utm:[412542,3389124,412551,3389131]}),{code:'invalid_temperature_area'});
  await run({type:'compare',fields:{budget_rmb:40000,unit_cost_rmb_per_m2:300,candidate_area_m2:100}});
  const saved=await run({type:'save_temperature_scenario',bounds_utm:area.bounds_utm});
  const first=saved.pilot_temperature_scenarios[0];
  assert.equal(first.version,1);
  assert.equal(first.goal_version,1);
  assert.equal(first.area_m2,153);
  assert.equal(first.estimated_construction_cost_rmb,45900);
  assert.equal(first.budget_check_passed,false);
  assert.equal(first.capacity_check_passed,false);
  assert.equal(first.result,null);
  assert.equal(evaluated.length,0);

  const evaluation={type:'evaluate_temperature_scenario',scenario_id:first.id};
  const evaluatedSession=await run(evaluation);
  const result=evaluatedSession.pilot_temperature_scenarios[0].result;
  assert.equal(result.predicted_delta_lst_c,-0.026);
  assert.equal(result.run_id,evaluatedSession.messages.at(-1).turn_id);
  assert.deepEqual(evaluated[0].bounds_utm,area.bounds_utm);
  assert.equal(evaluated[0].area_sha256,area.sha256);
  assert.equal(evaluatedSession.traces.find(trace=>trace.result.status==='temperature_scenario_saved').result.scenario.result,null);
  await run(evaluation);
  assert.equal(evaluated.length,1);
  const firstExport=await run({type:'export'});
  const firstReport=firstExport.reports.at(-1);
  assert.equal(planningReportIsStale(firstReport,firstExport),false);

  const bounds=[412542,3389125,412549,3389138];
  const revised=await run({type:'save_temperature_scenario',bounds_utm:bounds});
  const second=revised.pilot_temperature_scenarios.at(-1);
  assert.deepEqual(revised.pilot_temperature_scenarios.map(s=>[s.version,s.area_m2,s.result?.run_id??null]),
    [[1,153,result.run_id],[2,91,null]]);
  assert.equal(second.estimated_construction_cost_rmb,27300);
  assert.equal(second.budget_check_passed,true);
  assert.equal(second.capacity_check_passed,true);
  assert.equal(planningReportIsStale(firstReport,revised),true);
  await assert.rejects(run(evaluation),{code:'stale_temperature_scenario'});
  assert.equal(evaluated.length,1);

  const pendingExport=await run({type:'export'});
  const pendingReport=pendingExport.reports.at(-1);
  assert.equal(planningReportIsStale(pendingReport,pendingExport),false);
  const rerun=await run({type:'evaluate_temperature_scenario',scenario_id:second.id});
  const secondResult=rerun.pilot_temperature_scenarios.at(-1).result;
  assert.deepEqual(evaluated[1].bounds_utm,bounds);
  assert.equal(planningReportIsStale(pendingReport,rerun),true);

  const exported=await run({type:'export'});
  const report=exported.reports.at(-1);
  const {markdown}=report;
  assert.equal(planningReportIsStale(report,exported),false);
  assert.equal(report.temperature_scenario_id,second.id);
  assert.equal(report.temperature_run_id,secondResult.run_id);
  assert.match(markdown,/温度情景 v1（旧版）/);
  assert.ok(markdown.includes(result.run_id)&&markdown.includes(area.sha256));
  const currentReport=markdown.split('## 温度情景 v2（当前版）').at(-1);
  assert.match(currentReport,/面积 91㎡/);
  assert.match(currentReport,/预算 40000 元，假设建设费 27300 元/);
  assert.match(currentReport,/模型基线 32\.970℃，情景预测 33\.027℃，预测温差 -0\.057℃/);
  assert.ok(currentReport.includes(secondResult.run_id));
  const geojson=pilotTemperatureGeoJson(exported.pilot_temperature_scenarios);
  assert.equal(geojson.features[0].properties.is_current,false);
  assert.deepEqual(geojson.features[0].geometry,first.geometry);
  assert.deepEqual(geojson.features[1].geometry,second.geometry);
  assert.equal(geojson.features[1].properties.is_current,true);
  assert.equal(geojson.features[1].properties.estimated_construction_cost_rmb,27300);
  assert.equal(geojson.features[1].properties.result.run_id,report.temperature_run_id);

  const lowerBudget=await run({type:'compare',fields:{budget_rmb:25000}});
  const repriced=lowerBudget.pilot_temperature_scenarios.at(-1);
  assert.equal(repriced.version,3);
  assert.equal(repriced.goal_version,2);
  assert.equal(repriced.budget_rmb,25000);
  assert.equal(repriced.estimated_construction_cost_rmb,27300);
  assert.equal(repriced.budget_check_passed,false);
  assert.deepEqual(repriced.geometry,second.geometry);
  assert.equal(repriced.result,null);
  assert.equal(evaluated.length,2);
});

test('budget revisions preserve temperature scenarios saved before costs were recorded',async()=>{
  const session=newSession(context,catalog);
  const run=planningAction=>runAgentTurn({session,context,catalog,client:{localPlanning:true},planningAction});
  await run({type:'save_temperature_scenario',bounds_utm:catalog.pilot.temperature_area.bounds_utm});
  const original=session.pilot_temperature_scenarios[0];
  delete original.goal_version;
  delete original.estimated_construction_cost_rmb;
  const previous=structuredClone(original);
  const updated=await run({type:'compare',fields:{budget_rmb:50000,unit_cost_rmb_per_m2:300}});
  assert.deepEqual(updated.pilot_temperature_scenarios[0],previous);
  assert.equal(updated.pilot_temperature_scenarios[1].estimated_construction_cost_rmb,45900);
  const exported=await run({type:'export'});
  assert.match(exported.reports.at(-1).markdown,/该历史版本未记录对应的预算和单价/);
});

test('restoring an old range uses current goals, keeps old results immutable, logs ancestry and rejects stale requests',async()=>{
  const session=newSession(context,catalog),area=catalog.pilot.temperature_area;
  let modelCalls=0;
  const historicalTemperature={evaluatePilot:async()=>{
    modelCalls++;return {baseline_lst_c:33,scenario_lst_c:33.026,predicted_delta_lst_c:-0.026,model_version:'fixture',
      observed_lst_c:33.5,reference_grid_count:1,model_sha256:'c'.repeat(64),dataset_sha256:'d'.repeat(64),
      compiled_features:{order:['cover'],baseline_center:[80],scenario_center:[79],neighbor_mean:[50]}};
  }};
  const run=planningAction=>runAgentTurn({session,context,catalog,planningAction,historicalTemperature,client:{localPlanning:true}});
  await run({type:'compare',fields:{budget_rmb:50000,unit_cost_rmb_per_m2:300,candidate_area_m2:100}});
  await run({type:'save_temperature_scenario',bounds_utm:area.bounds_utm});
  const original=session.pilot_temperature_scenarios[0];
  await run({type:'evaluate_temperature_scenario',scenario_id:original.id});
  await run({type:'export'});const report=session.reports.at(-1);
  await run({type:'save_temperature_scenario',bounds_utm:[412542,3389125,412549,3389138]});
  await run({type:'compare',fields:{budget_rmb:20000,unit_cost_rmb_per_m2:200}});
  const before=structuredClone(session.pilot_temperature_scenarios),previous=before.at(-1);
  const action={type:'restore_temperature_scenario',scenario_id:original.id,expected_current_scenario_id:previous.id};
  await run(action);const restored=session.pilot_temperature_scenarios.at(-1);
  assert.deepEqual(session.pilot_temperature_scenarios.slice(0,-1),before);
  assert.equal(restored.version,4);assert.equal(restored.goal_version,2);
  assert.deepEqual(restored.geometry,original.geometry);assert.equal(restored.estimated_construction_cost_rmb,30600);
  assert.equal(restored.budget_check_passed,false);assert.equal(restored.result,null);assert.equal(modelCalls,1);
  assert.deepEqual(restored.change,{type:'restore',source_scenario_id:original.id,previous_scenario_id:previous.id});
  assert.equal(planningReportIsStale(report,session),true);
  assert.ok(session.traces.some(t=>t.tool==='restore_pilot_temperature_scenario'&&t.result.scenario.id===restored.id));
  await run({...action,expected_current_scenario_id:restored.id});assert.equal(session.pilot_temperature_scenarios.length,4);
  await assert.rejects(run(action),{code:'stale_temperature_scenario'});
  await assert.rejects(run({...action,expected_current_scenario_id:restored.id,scenario_id:'not-in-this-session'}),{code:'temperature_scenario_not_found'});
  await assert.rejects(run({...action,expected_current_scenario_id:restored.id,result:original.result}),{code:'invalid_planning_action'});
  const source=session.pilot_temperature_scenarios[0];source.raster_sha256.extra='changed';
  await assert.rejects(run({...action,expected_current_scenario_id:restored.id}),{code:'temperature_area_changed'});
  delete source.raster_sha256.extra;
  await run({type:'export'});
  assert.match(session.reports.at(-1).markdown,/模型预测升温 0.026℃，未显示降温/);
  assert.ok(session.reports.at(-1).markdown.includes(`来源情景 ${original.id}`));
  assert.match(session.reports.at(-1).markdown,/存在约束冲突/);
  assert.equal(modelCalls,1);
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
