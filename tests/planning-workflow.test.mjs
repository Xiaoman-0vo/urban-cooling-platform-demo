import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {planningWorkflowState,temperatureVersionRows,compareTemperatureVersions,createPlanningProgressArchive} from '../src/planning-workflow.js';
import {scenarioConstraintCheck,temperatureResultSummary} from '../src/scenario-checks.js';

const sha=letter=>letter.repeat(64);
const scene={site_id:'E4125_N33891',scenario_id:'baseline-a'};
function scenario(version,result=true){
  return {id:`scenario-${version}`,version,goal_version:1,grid_id:scene.site_id,reference_date:'2022-09-28',
    area_sha256:sha('a'),raster_sha256:{source:sha('b')},source_cover_class:1,scenario_cover_class:2,
    area_m2:100,estimated_construction_cost_rmb:30000,budget_check_passed:true,capacity_check_passed:true,
    assumed_unit_cost_rmb_per_m2:300,budget_rmb:100000,declared_candidate_area_m2:150,
    geometry:{type:'Polygon',coordinates:[[[104,30],[104.01,30],[104.01,30.01],[104,30]]]},
    result:result?{run_id:`run-${version}`,model_sha256:sha('c'),dataset_sha256:sha('d'),baseline_lst_c:33,
      scenario_lst_c:33,predicted_delta_lst_c:0,compiled_features:{baseline_center:[0.1,0.2],neighbor_mean:[0.3,0.4]}}:null};
}
function session(versions=[scenario(1)]){
  const latest=versions.at(-1);
  return {id:'session-a',context:{site_id:scene.site_id,scenario_id:scene.scenario_id},baseline:{scene_sha256:sha('e')},
    goal:{version:1,budget_rmb:100000,unit_cost_rmb_per_m2:300},scenarios:[],pilot_temperature_scenarios:versions,
    reports:[{id:'report-a',goal_version:1,temperature_scenario_id:latest?.id||null,temperature_run_id:latest?.result?.run_id||null,
      markdown:'# Saved report\nSource and version retained.'}],active_run_id:null};
}

test('workflow uses saved state and keeps geometry previews, missing evaluations and outdated reports explicit',()=>{
  const initial=planningWorkflowState({scene:{...scene,scenario_type:'geometry_candidate'},siteReady:true});
  assert.equal(initial.steps.length,7);
  assert.equal(initial.steps[0].state,'位置已预览');
  assert.equal(initial.steps[1].state,'待补地物资料');
  assert.equal(initial.reportState,'missing');
  const saved=session();
  assert.equal(planningWorkflowState({scene,siteReady:true,session:saved}).steps[4].state,'当前版已运行');
  saved.pilot_temperature_scenarios.push(scenario(2,false));
  const changed=planningWorkflowState({scene,siteReady:true,session:saved});
  assert.equal(changed.steps[4].state,'当前版待运行');
  assert.equal(changed.reportState,'stale');
  saved.goal.version=2;
  assert.notEqual(planningWorkflowState({scene,siteReady:true,session:saved}).steps[4].state,'当前版已运行');
});

test('version comparison preserves zero, leaves unrun results empty and separates changed baselines',()=>{
  const first=scenario(1),second=scenario(2),pending=scenario(3,false);
  let rows=temperatureVersionRows([first,second,pending]);
  assert.equal(rows[0].delta_lst_c,0);
  assert.equal(rows[2].delta_lst_c,null);
  assert.equal(rows[2].comparison,'等待运行');
  assert.equal(rows[0].comparison,'同基准');
  for(const mutate of [s=>s.reference_date='2020-01-01',s=>s.result.model_sha256=sha('f'),
    s=>s.result.dataset_sha256=sha('f'),s=>s.result.baseline_lst_c=34,s=>s.raster_sha256.source=sha('f'),
    s=>s.result.compiled_features.neighbor_mean=[0.3,0.5]]){
    const different=structuredClone(second);mutate(different);
    rows=temperatureVersionRows([first,different]);
    assert.equal(rows[0].comparison,'基准不同');assert.equal(rows[1].comparison,'同基准');
  }
  const incomplete=scenario(4);delete incomplete.result.model_sha256;
  assert.equal(temperatureVersionRows([incomplete])[0].comparison,'基准资料不完整');
  assert.equal(temperatureVersionRows([incomplete])[0].delta_lst_c,0);
});

test('next action follows saved planning state and never skips missing constraints or a pending evaluation',()=>{
  assert.equal(planningWorkflowState({scene}).nextStep.id,'project');
  assert.equal(planningWorkflowState({scene,siteReady:true}).nextStep.id,'goals');
  assert.equal(planningWorkflowState({scene:{...scene,scenario_type:'geometry_candidate'},siteReady:true}).nextStep.id,'diagnose');
  const saved=session();saved.reports=[];
  assert.equal(planningWorkflowState({scene,siteReady:true,session:saved}).nextStep.id,'results');
  saved.pilot_temperature_scenarios.push(scenario(2,false));
  assert.equal(planningWorkflowState({scene,siteReady:true,session:saved}).nextStep.id,'evaluate');
  saved.pilot_temperature_scenarios.at(-1).budget_rmb=2000;
  const conflict=planningWorkflowState({scene,siteReady:true,session:saved});
  assert.equal(conflict.nextStep.id,'edit');assert.equal(conflict.steps.find(s=>s.id==='edit').status,'attention');
  saved.goal.version=2;
  assert.equal(planningWorkflowState({scene,siteReady:true,session:saved}).nextStep.id,'edit');
});

test('selected versions compare only identical registered baselines and preserve zero or warming signs',()=>{
  const first=scenario(1),second=scenario(2),third=scenario(3);
  first.result.predicted_delta_lst_c=-0.026;
  let comparison=compareTemperatureVersions([first,second],first.id,second.id);
  assert.equal(comparison.comparable,true);assert.equal(comparison.deltaDifference,0.026);
  comparison=compareTemperatureVersions([second,third],second.id,third.id);
  assert.equal(comparison.deltaDifference,0);
  for(const change of [s=>{s.result=null;},s=>{s.result.model_sha256=sha('f');},s=>{delete s.result.dataset_sha256;},s=>{s.reference_date='2020-01-01';}]){
    const changed=structuredClone(second);change(changed);
    comparison=compareTemperatureVersions([first,changed],first.id,changed.id);
    assert.equal(comparison.comparable,false);assert.equal(comparison.deltaDifference,null);
  }
  assert.equal(compareTemperatureVersions([],first.id,second.id).comparable,false);
});

test('progress archive roundtrips saved versions and hashes each member, including only inspections associated with this site',async()=>{
  const saved=session(),before=structuredClone(saved);
  const linked={id:'linked',status:'pending',site:{site_id:scene.site_id},source:{sha256:sha('a')}};
  const elsewhere={id:'other',site:{site_id:'other-site'}};
  const {bytes,manifest}=await createPlanningProgressArchive({scene,session:saved,inspections:[linked,elsewhere,{id:'unlinked'}],health:{model_available:false}});
  assert.deepEqual(saved,before);
  assert.equal(manifest.report_status,'current');assert.equal(manifest.model_available,false);
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  assert.deepEqual(JSON.parse(await zip.file('场地核查记录.json').async('string')),[linked]);
  assert.deepEqual(JSON.parse(await zip.file('规划会话.json').async('string')),saved);
  assert.equal(JSON.parse(await zip.file('温度情景.geojson').async('string')).features[0].properties.result.predicted_delta_lst_c,0);
  assert.ok(zip.file('当前讨论报告.md'));
  const checks=JSON.parse(await zip.file('情景约束检查.json').async('string'));
  assert.equal(checks.current.status,'passed');
  assert.equal(JSON.parse(await zip.file('情景修改记录.json').async('string'))[0].change,null);
  for(const member of manifest.members){
    const data=await zip.file(member.name).async('nodebuffer');
    assert.equal(data.length,member.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'),member.sha256);
  }
  assert.deepEqual(JSON.parse(await zip.file('manifest.json').async('string')),manifest);
});

test('numeric checks recompute version costs, expose conflicts despite successful evaluation, and never infer missing limits',()=>{
  const saved=scenario(1);saved.result.predicted_delta_lst_c=-0.026;
  saved.budget_rmb=20000;saved.declared_candidate_area_m2=90;
  const check=scenarioConstraintCheck(saved);
  assert.equal(check.status,'failed');
  assert.match(check.checks.find(c=>c.id==='budget').detail,/10,000/);
  assert.match(check.checks.find(c=>c.id==='area').detail,/10㎡/);
  assert.equal(saved.budget_check_passed,true); // Old flags cannot bypass recomputed checks.
  const incomplete={...saved,budget_rmb:null,declared_candidate_area_m2:null};
  assert.equal(scenarioConstraintCheck(incomplete).status,'incomplete');
  assert.equal(scenarioConstraintCheck(incomplete).checks.find(c=>c.id==='area').state,'not_set');
  assert.equal(scenarioConstraintCheck({...saved,budget_rmb:0}).checks.find(c=>c.id==='budget').state,'failed');
  assert.equal(scenarioConstraintCheck(scenario(1),2).status,'failed');
  assert.equal(scenarioConstraintCheck({...scenario(1),estimated_construction_cost_rmb:1}).status,'failed');
  assert.match(temperatureResultSummary(saved.result),/升温 0.026℃，未显示降温/);
  assert.match(temperatureResultSummary({predicted_delta_lst_c:0}),/温差为 0℃/);
  assert.match(temperatureResultSummary({predicted_delta_lst_c:0.0001}),/不足以选择/);
  assert.match(temperatureResultSummary({predicted_delta_lst_c:0.2}),/较凉 0.2℃/);
  assert.match(temperatureResultSummary({predicted_delta_lst_c:null}),/尚无有效/);
});

test('exports label old reports and reject mixed sites, mixed baselines and active tasks',async()=>{
  const saved=session();saved.pilot_temperature_scenarios.push(scenario(2,false));
  const {bytes,manifest}=await createPlanningProgressArchive({scene,session:saved});
  const zip=await JSZip.loadAsync(bytes);
  assert.equal(manifest.report_status,'stale');assert.ok(zip.file('旧版讨论报告.md'));assert.equal(zip.file('当前讨论报告.md'),null);
  await assert.rejects(createPlanningProgressArchive({scene:{...scene,site_id:'other'},session:saved}),/不一致/);
  await assert.rejects(createPlanningProgressArchive({scene:{...scene,scenario_id:'other'},session:saved}),/不一致/);
  await assert.rejects(createPlanningProgressArchive({scene,session:{...saved,active_run_id:'running'}}),/仍在运行/);
  const empty=await createPlanningProgressArchive({scene});
  assert.equal(empty.manifest.report_status,'missing');assert.equal(empty.manifest.current_temperature_scenario_id,null);
});
