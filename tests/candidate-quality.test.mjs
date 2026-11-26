import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadProjectCatalog,newSession} from '../server/agent-tools.mjs';
import {runAgentTurn} from '../server/project-agent.mjs';
import {candidateQuality} from '../src/candidate-quality.js';
import {pilotPreviewCamera} from '../src/pilot-preview.js';
import {pilotBoxGeometry} from '../src/pilot-map.js';

const catalog=await loadProjectCatalog(fileURLToPath(new URL('../',import.meta.url))),area=catalog.pilot.temperature_area;
const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id,planning_mode:'mapped_pilot'};
async function fixture(){const session=newSession(context,catalog),run=planningAction=>runAgentTurn({session,context,catalog,planningAction,client:{localPlanning:true}});
  await run({type:'set_conditions',fields:{budget_rmb:40000,unit_cost_rmb_per_m2:300}});
  await run({type:'generate_spatial_candidates',minimum_area_m2:102,expected_area_sha256:area.sha256});
  return {session,run,batch:session.pilot_searches.at(-1)};
}
test('candidate reading shows actual budget tradeoffs without inventing cooling or a quality rank',async()=>{
  const {session,batch}=await fixture(),before=JSON.stringify(session),a=candidateQuality(batch.candidates[0],batch,session,area),b=candidateQuality(batch.candidates[1],batch,session,area);
  assert.deepEqual(batch.candidates.map(c=>[c.area_m2,c.cost_rmb]),[[102,30600],[128,38400]]);
  assert.equal(a.remainingBudget,9400);assert.equal(b.remainingBudget,1600);assert.equal(a.valid,true);assert.equal(b.valid,true);
  assert.equal(a.protectionSet,false);assert.equal(a.prioritySet,false);assert.equal(a.temperature,null);
  assert.match(a.temperatureSummary,/不能按降温效果排序/);assert.equal(a.registeredAreaShare,102/153*100);
  assert.equal(JSON.stringify(session),before);
});
test('evaluation belongs to the exact saved candidate and stale constraints cannot become current recommendations',async()=>{
  const {session,batch,run}=await fixture(),candidate=batch.candidates[0];
  await run({type:'adopt_spatial_candidate',search_id:batch.id,candidate_id:candidate.id,expected_current_scenario_id:null});
  const scenario=session.pilot_temperature_scenarios.at(-1);
  scenario.result={baseline_lst_c:32.97,scenario_lst_c:32.996,predicted_delta_lst_c:-0.026};
  const quality=candidateQuality(candidate,batch,session,area);
  assert.equal(quality.temperature.predicted_delta_lst_c,-0.026);assert.match(quality.temperatureSummary,/升温/);
  assert.equal(candidateQuality(batch.candidates[1],batch,session,area).temperature,null);
  await run({type:'set_conditions',fields:{budget_rmb:2000}});
  assert.equal(candidateQuality(candidate,batch,session,area).fresh,false);
  assert.equal(candidateQuality(candidate,batch,session,area).status,'历史条件，仅供回看');
  assert.equal(candidateQuality({...candidate,cost_rmb:1},batch,session,area).valid,false);
});
test('map framing contains both the registered area and a one-square-metre selection on desktop and narrow screens',()=>{
  const b=area.bounds_utm,selection=pilotBoxGeometry([b[0],b[1],b[0]+1,b[1]+1]);
  const collection={type:'FeatureCollection',features:[{type:'Feature',geometry:area.geometry},{type:'Feature',geometry:selection}]},before=JSON.stringify(collection);
  for(const [width,height] of [[1440,900],[600,760],[390,844]]){
    const camera=pilotPreviewCamera(collection,{width,height,reducedMotion:true});
    assert.equal(camera.options.duration,0);assert.equal(camera.options.pitch,0);assert.equal(camera.options.absolutePadding,true);
    assert.ok(camera.options.padding.left+camera.options.padding.right<width);
    assert.ok(camera.options.padding.top+camera.options.padding.bottom<height);
    for(const point of [...area.geometry.coordinates[0],...selection.coordinates[0]])for(const axis of [0,1])
      assert.ok(point[axis]>=camera.bounds[0][axis]&&point[axis]<=camera.bounds[1][axis]);
  }
  assert.equal(pilotPreviewCamera({type:'FeatureCollection',features:[]}),null);assert.equal(JSON.stringify(collection),before);
});
