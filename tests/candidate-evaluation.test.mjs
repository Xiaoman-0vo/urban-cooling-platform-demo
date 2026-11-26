import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {loadProjectCatalog,newSession,publicSession} from '../server/agent-tools.mjs';
import {runAgentTurn} from '../server/project-agent.mjs';
import {evaluatePilotCandidates} from '../server/candidate-evaluation.mjs';
import {candidateDecision} from '../src/candidate-decision.js';
import {planningReportIsStale} from '../src/pilot-map.js';
import {createPlanningProgressArchive,planningWorkflowState} from '../src/planning-workflow.js';

const catalog=await loadProjectCatalog(fileURLToPath(new URL('../',import.meta.url)));
const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id,planning_mode:'mapped_pilot'};
function result(query,delta=-0.058){return {...query,status:'scenario_estimated',model_sha256:'a'.repeat(64),dataset_sha256:'b'.repeat(64),
  model_version:'test-fixture',observed_utc:'2022-09-28T03:00:00Z',reference_grid_count:1558,
  observed_lst_c:33,baseline_lst_c:32.970,scenario_lst_c:Number((32.970-delta).toFixed(3)),predicted_delta_lst_c:delta,
  compiled_features:{order:['cover','height'],baseline_center:[.1,0],scenario_center:[.2,0],neighbor_mean:[.1,0]}};}
async function fixture(){
  const session=newSession(context,catalog),calls=[];
  const estimator={evaluatePilot:async query=>{calls.push(structuredClone(query));return result(query);}};
  const run=planningAction=>runAgentTurn({session,context,catalog,planningAction,historicalTemperature:estimator,
    client:{localPlanning:true,chat:()=>{throw Error('manual actions must not invoke an LLM');}}});
  await run({type:'set_conditions',fields:{budget_rmb:40000,unit_cost_rmb_per_m2:300}});
  await run({type:'generate_spatial_candidates',minimum_area_m2:102,expected_area_sha256:catalog.pilot.temperature_area.sha256});
  return {session,calls,run,estimator,batch:session.pilot_searches.at(-1),area:catalog.pilot.temperature_area};
}

test('manual batch evaluates before adoption, freezes inputs, records each real call and reuses the completed batch',async()=>{
  const {session,calls,run,batch}=await fixture();
  assert.equal(calls.length,0);
  await run({type:'evaluate_spatial_candidates',search_id:batch.id});
  const evaluated=batch.evaluations.at(-1);
  assert.equal(evaluated.status,'complete');assert.equal(evaluated.temperature_model_calls,2);assert.equal(calls.length,2);
  assert.equal(session.pilot_temperature_scenarios?.length??0,0);
  assert.deepEqual(evaluated.scope,batch.scope);
  for(const [i,candidate] of batch.candidates.entries()){
    assert.deepEqual(calls[i].bounds_utm,candidate.bounds_utm);assert.equal(calls[i].area_sha256,batch.scope.area_sha256);
    assert.equal(evaluated.results[i].result.candidate_evaluation_id,evaluated.id);
  }
  assert.equal(session.traces.filter(t=>t.tool==='evaluate_pilot_candidate').length,2);
  await run({type:'evaluate_spatial_candidates',search_id:batch.id});
  assert.equal(calls.length,2);assert.equal(batch.evaluations.length,1);
  const decision=candidateDecision(session);
  assert.equal(decision.status,'no_improvement');assert.equal(decision.implementation_recommended,false);
  assert.equal(decision.baseline.added_cost_rmb,0);assert.equal(decision.tradeoff.extra_area_m2,26);
  assert.equal(decision.tradeoff.extra_cost_rmb,7800);assert.equal(decision.tradeoff.delta_difference_c,0);
  const workflow=planningWorkflowState({scene:catalog.scene,siteReady:true,session});
  assert.equal(workflow.steps[4].state,'候选已评价');assert.equal(workflow.nextStep.id,'results');
});

test('adoption carries the checked result and original provenance without another model invocation',async()=>{
  const {session,calls,run,batch}=await fixture();await run({type:'evaluate_spatial_candidates',search_id:batch.id});
  await run({type:'adopt_spatial_candidate',search_id:batch.id,candidate_id:batch.candidates[0].id,expected_current_scenario_id:null});
  const scenario=session.pilot_temperature_scenarios.at(-1),evaluation=batch.evaluations.at(-1);
  assert.deepEqual(scenario.result,evaluation.results[0].result);
  assert.equal(scenario.change.candidate_evaluation_id,evaluation.id);assert.equal(calls.length,2);
});

test('changed scope and client-supplied output are rejected before any inference',async()=>{
  const {session,calls,run,batch}=await fixture();
  await assert.rejects(run({type:'evaluate_spatial_candidates',search_id:batch.id,results:[]}),{code:'invalid_planning_action'});
  await run({type:'set_conditions',fields:{budget_rmb:30000}});
  await assert.rejects(run({type:'evaluate_spatial_candidates',search_id:batch.id}),{code:'stale_spatial_candidates'});
  assert.equal(calls.length,0);assert.equal(batch.evaluations,undefined);assert.equal(candidateDecision(session).status,'stale');
});

test('cancelling after one candidate preserves the completed result and makes no second call',async()=>{
  const {session,batch,area,estimator,calls}=await fixture(),controller=new AbortController();let persisted=0;
  await assert.rejects(evaluatePilotCandidates(session,area,{search_id:batch.id},estimator,{
    signal:controller.signal,onProgress:async()=>{persisted++;},onCandidate:()=>controller.abort()}),{name:'AbortError'});
  const evaluation=batch.evaluations.at(-1);
  assert.equal(evaluation.status,'cancelled');assert.equal(evaluation.results[0].status,'estimated');
  assert.equal(calls.length,1);assert.ok(persisted>=3);assert.equal(candidateDecision(session).status,'partial');
});

test('invalid model output stays missing; a manual retry retains failure history and never exposes upstream secrets',async()=>{
  const {session,batch,area,estimator}=await fixture();let count=0;
  await evaluatePilotCandidates(session,area,{search_id:batch.id},{evaluatePilot:async q=>{
    if(count++===0)return result(q);throw Error('private upstream token must never be exposed');
  }});
  const first=batch.evaluations.at(-1);
  assert.equal(first.status,'partial');assert.equal(candidateDecision(session).completed,1);
  assert.doesNotMatch(JSON.stringify(first),/private upstream/);
  // A newer failed result cannot silently fall back to an earlier successful result.
  await evaluatePilotCandidates(session,area,{search_id:batch.id},{evaluatePilot:async q=>({...result(q),area_sha256:'f'.repeat(64)})});
  assert.equal(candidateDecision(session).completed,0);assert.equal(candidateDecision(session).baseline,null);
  await evaluatePilotCandidates(session,area,{search_id:batch.id},estimator);
  assert.equal(batch.evaluations.length,3);assert.equal(first.status,'partial');assert.equal(candidateDecision(session).comparable,true);
});

test('different model baselines cannot produce a ranking or a pooled current-state reference',async()=>{
  const {session,batch,area,estimator}=await fixture();let count=0;
  await evaluatePilotCandidates(session,area,{search_id:batch.id},{evaluatePilot:async q=>{
    const r=result(q);if(count++===1)r.dataset_sha256='c'.repeat(64);return r;
  }});
  assert.equal(candidateDecision(session).status,'incomparable');assert.equal(candidateDecision(session).baseline,null);
  await evaluatePilotCandidates(session,area,{search_id:batch.id},estimator);
  assert.equal(batch.evaluations.length,2);assert.equal(candidateDecision(session).comparable,true);
});

test('identical model inputs with conflicting outputs stop comparison in decisions, reports and archives',async()=>{
  const {session,batch,area,run,estimator,calls}=await fixture();let count=0;
  await evaluatePilotCandidates(session,area,{search_id:batch.id},{evaluatePilot:async q=>result(q,count++===0?-0.058:-0.020)});
  const decision=candidateDecision(session);
  assert.equal(decision.status,'incomparable');assert.equal(decision.comparable,false);
  assert.equal(decision.baseline,null);assert.equal(decision.tradeoff.delta_difference_c,null);
  assert.match(decision.title,/同.*输入.*不一致/);
  assert.deepEqual(decision.rows.map(row=>row.temperature.predicted_delta_lst_c),[-0.058,-0.020]);
  await run({type:'export'});
  assert.match(session.reports.at(-1).markdown,/同.*输入.*不一致/);
  assert.match(session.reports.at(-1).markdown,/-0\.058/);assert.match(session.reports.at(-1).markdown,/-0\.020/);
  assert.doesNotMatch(session.reports.at(-1).markdown,/本轮未得到降温改善证据|模型显示改善，仍需核查方案/);
  const archive=await createPlanningProgressArchive({scene:catalog.scene,session:publicSession(session)});
  const zip=await JSZip.loadAsync(archive.bytes,{checkCRC32:true});
  const readiness=JSON.parse(await zip.file('评价适用性.json').async('string'));
  assert.equal(readiness.status,'incomparable');assert.equal(readiness.model_delta_distinguishable,null);
  assert.equal(readiness.response,'not_comparable');assert.match(readiness.detail,/不一致/);
  assert.deepEqual(readiness.delta_millicelsius,[-58,-20]);
  const oldEvaluation=structuredClone(batch.evaluations[0]);
  await evaluatePilotCandidates(session,area,{search_id:batch.id},estimator);
  assert.equal(calls.length,2);assert.equal(batch.evaluations.length,2);
  assert.deepEqual(batch.evaluations[0],oldEvaluation);
  assert.equal(candidateDecision(session).comparable,true);
});

test('reports expire after evaluation and the evidence archive matches the comparison shown to the user',async()=>{
  const {session,run,batch}=await fixture();await run({type:'export'});const old=session.reports.at(-1);
  assert.equal(planningReportIsStale(old,session),false);
  await run({type:'evaluate_spatial_candidates',search_id:batch.id});
  assert.equal(planningReportIsStale(old,session),true);await run({type:'export'});
  const report=session.reports.at(-1);assert.equal(planningReportIsStale(report,session),false);
  assert.match(report.markdown,/本轮未得到降温改善证据/);assert.match(report.markdown,/现状参考/);
  assert.match(report.markdown,/7800/);assert.equal(report.candidate_evaluation_id,batch.evaluations[0].id);
  assert.match(report.markdown,/评价适用性与待核事项/);
  const archive=await createPlanningProgressArchive({scene:catalog.scene,session:publicSession(session)});
  const zip=await JSZip.loadAsync(archive.bytes,{checkCRC32:true});
  assert.deepEqual(JSON.parse(await zip.file('候选比较与判断.json').async('string')),candidateDecision(session));
  const readiness=JSON.parse(await zip.file('评价适用性.json').async('string'));
  assert.equal(readiness.supports_thermal_ranking,false);assert.equal(readiness.implementation_recommended,false);
  const geo=JSON.parse(await zip.file('搜索候选.geojson').async('string'));
  assert.ok(geo.features.every(f=>f.properties.prediction_status==='scenario_estimated'&&f.properties.predicted_delta_lst_c===-0.058));
  for(const member of archive.manifest.members)assert.equal(createHash('sha256').update(await zip.file(member.name).async('nodebuffer')).digest('hex'),member.sha256);
});
