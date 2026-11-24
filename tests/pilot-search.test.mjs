import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {once} from 'node:events';
import JSZip from 'jszip';
import {loadProjectCatalog,newSession,publicSession} from '../server/agent-tools.mjs';
import {generatePilotCandidates,adoptPilotCandidate} from '../server/pilot-search.mjs';
import {runAgentTurn} from '../server/project-agent.mjs';
import {pilotSearchIsCurrent} from '../src/pilot-search-state.js';
import {planningReportIsStale} from '../src/pilot-map.js';
import {createPlanningProgressArchive} from '../src/planning-workflow.js';
import {createAccountService} from '../server/account-service.mjs';
import {createAgentServer} from '../server/agent-server.mjs';

const catalog=await loadProjectCatalog(fileURLToPath(new URL('../',import.meta.url)));
const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id,planning_mode:'mapped_pilot'};
function fixture(){
  const session=newSession(context,catalog);
  const run=planningAction=>runAgentTurn({session,context,catalog,planningAction,client:{localPlanning:true}});
  const search=minimum=>run({type:'generate_spatial_candidates',minimum_area_m2:minimum,expected_area_sha256:catalog.pilot.temperature_area.sha256});
  return {session,run,search};
}

test('finite search selects distinct cost, area and priority optima verified by unit-cell occupancy',()=>{
  const {session}=fixture();
  const area={...session.pilot.temperature_area,bounds_utm:[0,0,4,3]};session.pilot.temperature_area=area;
  session.goal={version:1,budget_rmb:900,unit_cost_rmb_per_m2:100,assumptions:{}};
  session.pilot_protection_versions=[{version:1,area_sha256:area.sha256,areas:[{id:'keep',label:'保留',bounds_utm:[1,0,2,3],area_sha256:area.sha256}]}];
  session.pilot_priority_versions=[{version:1,area_sha256:area.sha256,areas:[{id:'priority',label:'优先',bounds_utm:[2,0,4,2],area_sha256:area.sha256}]}];
  const {batch}=generatePilotCandidates(session,area,{minimum_area_m2:2,expected_area_sha256:area.sha256});
  const oracle=[];
  for(let x=0;x<4;x++)for(let X=x+1;X<=4;X++)for(let y=0;y<3;y++)for(let Y=y+1;Y<=3;Y++){
    const cells=[];for(let i=x;i<X;i++)for(let j=y;j<Y;j++)cells.push([i,j]);
    if(cells.length<2||cells.length*100>900||cells.some(([i])=>i===1))continue;
    oracle.push({area:cells.length,coverage:cells.filter(([i,j])=>i>=2&&j<2).length});
  }
  assert.equal(batch.scanned_count,60);assert.equal(batch.feasible_count,oracle.length);
  assert.equal(Object.values(batch.rejected).reduce((a,b)=>a+b,0)+batch.feasible_count,60);
  const chosen=s=>batch.candidates.find(c=>c.strategies.includes(s));
  assert.equal(chosen('cost').cost_rmb,Math.min(...oracle.map(r=>r.area*100)));
  assert.equal(chosen('area').area_m2,Math.max(...oracle.map(r=>r.area)));
  assert.equal(chosen('priority').priority_overlap_m2,Math.max(...oracle.map(r=>r.coverage)));
  assert.equal(chosen('priority').area_m2,4);assert.equal(batch.candidates.length,3);
  assert.equal(new Set(batch.candidates.map(c=>JSON.stringify(c.bounds_utm))).size,3);
});

test('registered search respects budget, area, minimum and protected land and merges identical strategy outcomes',async()=>{
  const {session,run,search}=fixture();
  await run({type:'set_conditions',fields:{budget_rmb:6000,unit_cost_rmb_per_m2:300,candidate_area_m2:20}});
  assert.equal(session.scenarios.length,0); // Saving conditions does not create fixed A/B options.
  await run({type:'update_protection',operation:'add',bounds_utm:[412543,3389123,412545,3389140],label:'保留带',expected_protection_version:0,expected_current_scenario_id:null});
  await search(20);const batch=session.pilot_searches.at(-1);
  assert.equal(batch.scanned_count,6885);assert.ok(batch.feasible_count>0);
  assert.equal(batch.candidates.length,1);assert.deepEqual(batch.candidates[0].strategies,['cost','area']);
  assert.equal(batch.candidates[0].area_m2,20);assert.equal(batch.candidates[0].cost_rmb,6000);
  const [x,,X]=batch.candidates[0].bounds_utm;assert.ok(X<=412543||x>=412545);
  const before=structuredClone(batch);
  await search(20);assert.equal(session.pilot_searches.length,1);assert.deepEqual(session.pilot_searches[0],before);
  assert.equal(session.pilot_temperature_scenarios?.length??0,0);
});

test('unsatisfiable conditions return an explicit empty result instead of silently reducing the requested area',async()=>{
  const {session,run,search}=fixture();
  await assert.rejects(search(10),{code:'search_needs_inputs'});
  await run({type:'compare',fields:{budget_rmb:200,unit_cost_rmb_per_m2:300}});
  await search(10);const batch=session.pilot_searches.at(-1);
  assert.equal(batch.feasible_count,0);assert.equal(batch.candidates.length,0);assert.match(batch.notes.join(' '),/最低 10㎡/);
  assert.equal(session.tasks.at(-1).status,'blocked');
  await run({type:'compare',fields:{budget_rmb:0}});await search(1);
  assert.equal(session.pilot_searches.at(-1).feasible_count,0);
  await run({type:'compare',fields:{budget_rmb:100000,candidate_area_m2:0}});await search(1);
  assert.equal(session.pilot_searches.at(-1).feasible_count,0);
});

test('adoption rechecks live scope, rejects other-session IDs and creates one traceable uncomputed scenario',async()=>{
  const {session,run,search}=fixture();
  await run({type:'compare',fields:{budget_rmb:30000,unit_cost_rmb_per_m2:300}});
  await search(20);const batch=session.pilot_searches.at(-1),candidate=batch.candidates[0];
  const action={type:'adopt_spatial_candidate',search_id:batch.id,candidate_id:candidate.id,expected_current_scenario_id:null};
  await run(action);const current=session.pilot_temperature_scenarios.at(-1),before=structuredClone(current);
  assert.equal(current.result,null);assert.equal(current.change.search_id,batch.id);assert.deepEqual(current.bounds_utm,candidate.bounds_utm);
  await assert.rejects(run(action),{code:'stale_temperature_scenario'});
  await run({...action,expected_current_scenario_id:current.id});assert.equal(session.pilot_temperature_scenarios.length,1);
  assert.deepEqual(current,before);
  await run({type:'export'});const report=session.reports.at(-1);
  assert.equal(planningReportIsStale(report,session),false);assert.match(report.markdown,/按约束生成的空间候选/);
  await search(25);assert.equal(planningReportIsStale(report,session),true);
  await assert.rejects(run({...action,expected_current_scenario_id:current.id}),{code:'stale_spatial_candidates'});
  const other=fixture().session;
  assert.throws(()=>adoptPilotCandidate(other,catalog.pilot.temperature_area,action),{code:'search_needs_inputs'});
  other.goal=structuredClone(session.goal);
  assert.throws(()=>adoptPilotCandidate(other,catalog.pilot.temperature_area,action),{code:'stale_spatial_candidates'});
});

test('budget, protection, priority and source changes expire candidates without rewriting their snapshots',async()=>{
  for(const change of ['budget','protection','priority','source']){
    const {session,run,search}=fixture();
    await run({type:'compare',fields:{budget_rmb:30000,unit_cost_rmb_per_m2:300}});await search(20);
    const batch=session.pilot_searches.at(-1),before=structuredClone(batch);
    if(change==='budget')await run({type:'compare',fields:{budget_rmb:15000}});
    if(change==='protection')await run({type:'update_protection',operation:'add',bounds_utm:[412541,3389123,412542,3389124],label:'保留',expected_protection_version:0,expected_current_scenario_id:null});
    if(change==='priority')await run({type:'update_priority',operation:'add',bounds_utm:[412541,3389123,412542,3389124],label:'优先',expected_priority_version:0,expected_area_sha256:catalog.pilot.temperature_area.sha256});
    if(change==='source')session.pilot.temperature_area.sha256='0'.repeat(64);
    assert.equal(pilotSearchIsCurrent(batch,session),false,change);assert.deepEqual(batch,before);
    await assert.rejects(run({type:'adopt_spatial_candidate',search_id:batch.id,candidate_id:batch.candidates[0].id,expected_current_scenario_id:null}),
      {code:change==='source'?'search_source_changed':'stale_spatial_candidates'});
  }
});

test('candidate generation refuses invented client outputs and exports all search scopes with verified hashes',async()=>{
  const {session,run,search}=fixture();
  await assert.rejects(run({type:'generate_spatial_candidates',minimum_area_m2:1.5,expected_area_sha256:catalog.pilot.temperature_area.sha256}),{code:'invalid_planning_action'});
  await run({type:'compare',fields:{budget_rmb:30000,unit_cost_rmb_per_m2:300}});
  await assert.rejects(run({type:'generate_spatial_candidates',minimum_area_m2:20,expected_area_sha256:catalog.pilot.temperature_area.sha256,candidates:[]}),{code:'invalid_planning_action'});
  await search(20);await run({type:'export'});
  const saved=publicSession(session),archive=await createPlanningProgressArchive({scene:catalog.scene,session:saved});
  const zip=await JSZip.loadAsync(archive.bytes,{checkCRC32:true});
  assert.deepEqual(JSON.parse(await zip.file('空间候选搜索.json').async('string')),session.pilot_searches);
  const features=JSON.parse(await zip.file('搜索候选.geojson').async('string')).features;
  assert.ok(features.every(f=>f.properties.is_current&&f.properties.prediction_status==='not_run'));
  assert.equal(archive.manifest.spatial_search_id,session.pilot_searches.at(-1).id);
  for(const member of archive.manifest.members){const bytes=await zip.file(member.name).async('nodebuffer');assert.equal(createHash('sha256').update(bytes).digest('hex'),member.sha256);}
  assert.deepEqual(JSON.parse(JSON.stringify(saved)).pilot_searches,session.pilot_searches);
});

test('account API persists search and adoption across restart and rejects another account before executing tools',async()=>{
  const prefix=resolve(tmpdir()),directory=await mkdtemp(join(prefix,'urbancool-search-'));
  const filename=join(directory,'test.sqlite');let accounts,server,base;
  async function start(){
    accounts=createAccountService({filename,defaultProvider:'local'});server=createAgentServer({accounts,catalog,port:0});
    server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}/api/agent`;
  }
  async function stop(){server.closeAllConnections();await new Promise(done=>server.close(done));accounts.close();}
  async function request(path,account,body){
    const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-UrbanCool-Agent':'1',
      ...(account?{Cookie:account.cookie,'X-UrbanCool-Account':account.id}:{})},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
  }
  await start();
  try{
    async function register(username){const r=await request('/account/register',null,{username,password:'search-fixture-password'});assert.equal(r.status,201);return {...r.data.user,cookie:r.cookie.split(';')[0]};}
    const alice=await register('search_alice'),bob=await register('search_bob');
    const id=(await request('/sessions',alice,{context})).data.session.id;
    async function action(planning_action,account=alice){return request('/chat',account,{context,session_id:id,planning_action});}
    assert.equal((await action({type:'set_conditions',fields:{budget_rmb:6000,unit_cost_rmb_per_m2:300,candidate_area_m2:20}})).status,200);
    const result=await action({type:'generate_spatial_candidates',minimum_area_m2:20,expected_area_sha256:catalog.pilot.temperature_area.sha256});
    assert.equal(result.status,200);const batch=result.data.session.pilot_searches.at(-1);
    const adopt={type:'adopt_spatial_candidate',search_id:batch.id,candidate_id:batch.candidates[0].id,expected_current_scenario_id:null};
    assert.equal((await action(adopt,bob)).status,404);
    const adopted=await action(adopt);assert.equal(adopted.status,200);
    assert.equal(adopted.data.session.pilot_temperature_scenarios.at(-1).result,null);
    await stop();await start();
    const restored=(await request(`/sessions/${id}`,alice)).data.session;
    assert.deepEqual(restored.pilot_searches,result.data.session.pilot_searches);
    assert.deepEqual(restored.pilot_temperature_scenarios,adopted.data.session.pilot_temperature_scenarios);
    assert.equal(pilotSearchIsCurrent(restored.pilot_searches.at(-1),restored),true);
    assert.equal((await request(`/sessions/${id}`,bob)).status,404);
  }finally{await stop();assert.ok(resolve(directory).startsWith(prefix+sep));await rm(directory,{recursive:true,force:true});}
});
