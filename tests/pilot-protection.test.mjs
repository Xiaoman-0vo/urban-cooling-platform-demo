import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {loadProjectCatalog,newSession,executeTool,publicSession} from '../server/agent-tools.mjs';
import {runAgentTurn} from '../server/project-agent.mjs';
import {currentPilotProtection,protectionConflicts} from '../src/protected-areas.js';
import {scenarioConstraintCheck} from '../src/scenario-checks.js';
import {planningReportIsStale} from '../src/pilot-map.js';
import {createPlanningProgressArchive} from '../src/planning-workflow.js';

const catalog=await loadProjectCatalog(fileURLToPath(new URL('../',import.meta.url)));
const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id,planning_mode:'mapped_pilot'};
const keep=[412541,3389123,412544,3389127],clear=[412544,3389127,412550,3389140];
function fixture(){
  const session=newSession(context,catalog);let modelCalls=0;
  const run=planningAction=>runAgentTurn({session,context,catalog,planningAction,client:{localPlanning:true},
    historicalTemperature:{evaluatePilot:async()=>{
      modelCalls++;return {baseline_lst_c:33,scenario_lst_c:33.02,predicted_delta_lst_c:-0.02,model_version:'fixture',
        observed_lst_c:33.5,model_sha256:'c'.repeat(64),dataset_sha256:'d'.repeat(64),reference_grid_count:1,
        compiled_features:{order:['cover'],baseline_center:[80],scenario_center:[79],neighbor_mean:[50]}};
    }}});
  const update=changes=>run({type:'update_protection',expected_protection_version:currentPilotProtection(session).version,
    expected_current_scenario_id:session.pilot_temperature_scenarios?.at(-1)?.id??null,...changes});
  return {session,run,update,get modelCalls(){return modelCalls;}};
}

test('protected area intersection uses positive area only and never double-counts touching edges',()=>{
  const areas=[{id:'keep',label:'活动空间',bounds_utm:keep}];
  assert.deepEqual(protectionConflicts(clear,areas),[]);
  assert.equal(protectionConflicts(catalog.pilot.temperature_area.bounds_utm,areas)[0].overlap_m2,12);
  assert.equal(protectionConflicts([412543,3389126,412545,3389128],areas)[0].overlap_m2,1);
  assert.deepEqual(areas[0].bounds_utm,keep);
});

test('protection edits preserve history and block saves, restores and model calls until the design avoids protected land',async()=>{
  const f=fixture(),{session,run,update}=f;
  await run({type:'compare',fields:{budget_rmb:100000,unit_cost_rmb_per_m2:300}});
  await run({type:'save_temperature_scenario',bounds_utm:catalog.pilot.temperature_area.bounds_utm});
  const original=session.pilot_temperature_scenarios[0];
  await run({type:'evaluate_temperature_scenario',scenario_id:original.id});
  await run({type:'export'});const report=session.reports.at(-1),before=structuredClone(original);
  await update({operation:'add',bounds_utm:keep,label:'保留活动空间'});
  assert.deepEqual(original,before);assert.equal(f.modelCalls,1);
  const blocked=session.pilot_temperature_scenarios.at(-1),protection=currentPilotProtection(session);
  assert.equal(blocked.protection_version,1);assert.equal(blocked.result,null);assert.equal(blocked.change.type,'protection_revision');
  assert.equal(scenarioConstraintCheck(blocked).status,'failed');assert.equal(planningReportIsStale(report,session),true);
  assert.ok(publicSession(session).scenarios.every(s=>s.is_stale));
  assert.ok(publicSession(session).tasks.some(t=>t.depends_on_goal&&t.is_stale));
  await assert.rejects(run({type:'evaluate_temperature_scenario',scenario_id:blocked.id}),{code:'protected_area_conflict'});
  await assert.rejects(run({type:'save_temperature_scenario',bounds_utm:catalog.pilot.temperature_area.bounds_utm}),{code:'protected_area_conflict'});
  await assert.rejects(run({type:'restore_temperature_scenario',scenario_id:original.id,expected_current_scenario_id:blocked.id}),{code:'protected_area_conflict'});
  assert.equal(session.pilot_temperature_scenarios.length,2);assert.equal(f.modelCalls,1);
  await run({type:'compare',fields:{budget_rmb:50000}});
  assert.equal(session.pilot_temperature_scenarios.at(-1).result,null);
  assert.equal(scenarioConstraintCheck(session.pilot_temperature_scenarios.at(-1)).status,'failed');
  const candidates=publicSession(session).scenarios.filter(s=>!s.is_stale);
  assert.equal(candidates.find(s=>s.candidate_id==='A').protection_check_passed,true);
  const b=candidates.find(s=>s.candidate_id==='B');assert.equal(b.protection_check_passed,false);
  session.messages.push({role:'user',content:'请预测候选B'});
  assert.equal(executeTool('request_temperature_prediction',{scenario_id:b.id},session,catalog).status,'candidate_blocked');
  await run({type:'save_temperature_scenario',bounds_utm:clear});
  const valid=session.pilot_temperature_scenarios.at(-1);assert.equal(scenarioConstraintCheck(valid).status,'passed');
  await run({type:'evaluate_temperature_scenario',scenario_id:valid.id});assert.equal(f.modelCalls,2);
  const protectedSnapshot=structuredClone(protection),validSnapshot=structuredClone(valid);
  await update({operation:'remove',area_id:protection.areas[0].id});
  assert.deepEqual(session.pilot_protection_versions[0],protectedSnapshot);assert.deepEqual(valid,validSnapshot);
  assert.equal(currentPilotProtection(session).version,2);assert.equal(currentPilotProtection(session).areas.length,0);
  assert.equal(session.pilot_temperature_scenarios.at(-1).result,null);assert.equal(f.modelCalls,2);
  await run({type:'export'});
  assert.equal(session.reports.at(-1).protection_version,2);
  assert.match(session.reports.at(-1).markdown,/与保留区「保留活动空间」重叠 12㎡/);
  const archive=await createPlanningProgressArchive({scene:catalog.scene,session:publicSession(session)});
  const zip=await JSZip.loadAsync(archive.bytes,{checkCRC32:true});
  const history=JSON.parse(await zip.file('保留范围版本.json').async('string'));
  assert.equal(history.length,2);assert.equal(history[0].areas.length,1);
  assert.equal(JSON.parse(await zip.file('用户保留区.geojson').async('string')).features.length,0);
  assert.equal(archive.manifest.protection_version,2);
});

test('stale or invalid protection edits never replace saved constraints, including a report without temperature scenarios',async()=>{
  const {session,run,update}=fixture();
  await run({type:'compare',fields:{budget_rmb:100000,unit_cost_rmb_per_m2:300}});
  await run({type:'export'});const report=session.reports.at(-1);
  await assert.rejects(update({operation:'add',bounds_utm:keep,label:''}),{code:'invalid_protected_area'});
  await assert.rejects(update({operation:'add',bounds_utm:[0,0,10,10],label:'错误位置'}),{code:'invalid_protected_area'});
  assert.equal(currentPilotProtection(session).version,0);
  await update({operation:'add',bounds_utm:keep,label:'保留活动空间'});
  assert.equal(planningReportIsStale(report,session),true);
  const before=structuredClone(session.pilot_protection_versions);
  await assert.rejects(update({operation:'remove',area_id:before[0].areas[0].id,expected_protection_version:0}),{code:'stale_protection_version'});
  await assert.rejects(update({operation:'remove',area_id:'other-account-area'}),{code:'protected_area_not_found'});
  await assert.rejects(update({operation:'add',bounds_utm:keep,label:'活动空间',result:{}}),{code:'invalid_planning_action'});
  assert.deepEqual(session.pilot_protection_versions,before);
  await run({type:'export'});assert.equal(session.reports.at(-1).protection_version,1);
  assert.match(session.reports.at(-1).markdown,/保留活动空间/);
});

test('a changed protection source cannot be used to save or evaluate a new snapshot',async()=>{
  const {session,run,update}=fixture();
  await update({operation:'add',bounds_utm:keep,label:'保留区'});
  currentPilotProtection(session).area_sha256='wrong-source';
  await assert.rejects(run({type:'save_temperature_scenario',bounds_utm:clear}),{code:'protection_source_changed'});
  assert.equal(session.pilot_temperature_scenarios?.length??0,0);
});
