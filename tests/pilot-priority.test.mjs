import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {once} from 'node:events';
import JSZip from 'jszip';
import {loadProjectCatalog,newSession,executeTool,publicSession} from '../server/agent-tools.mjs';
import {runAgentTurn} from '../server/project-agent.mjs';
import {createAgentServer} from '../server/agent-server.mjs';
import {createAccountService} from '../server/account-service.mjs';
import {currentPilotPriority,priorityCoverage,priorityComparison} from '../src/priority-areas.js';
import {planningReportIsStale} from '../src/pilot-map.js';
import {createPlanningProgressArchive} from '../src/planning-workflow.js';

const catalog=await loadProjectCatalog(fileURLToPath(new URL('../',import.meta.url)));
const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id,planning_mode:'mapped_pilot'};
const first=[412541,3389123,412545,3389127],second=[412543,3389125,412547,3389129];
function fixture(){
  const session=newSession(context,catalog);let calls=0;
  const run=planningAction=>runAgentTurn({session,context,catalog,planningAction,client:{localPlanning:true},historicalTemperature:{evaluatePilot:async()=>{
    calls++;return {baseline_lst_c:33,scenario_lst_c:33.02,predicted_delta_lst_c:-0.02,model_version:'fixture',
      observed_lst_c:33.5,reference_grid_count:1,model_sha256:'c'.repeat(64),dataset_sha256:'d'.repeat(64),compiled_features:{order:['cover'],baseline_center:[80],scenario_center:[79],neighbor_mean:[50]}};}}});
  const update=changes=>run({type:'update_priority',expected_priority_version:currentPilotPriority(session).version,
    expected_area_sha256:catalog.pilot.temperature_area.sha256,...changes});
  return {session,run,update,get calls(){return calls;}};
}

test('priority coverage counts overlapping rectangles once, clips to the design and preserves shared edges',()=>{
  const areas=[{bounds_utm:first},{bounds_utm:second}];
  assert.equal(priorityCoverage(catalog.pilot.temperature_area.bounds_utm,areas),28);
  assert.equal(priorityCoverage(first,areas),16);
  assert.equal(priorityCoverage([412547,3389123,412550,3389140],areas),0);
  assert.equal(priorityCoverage(first,[...areas,...areas]),16);
  assert.equal(priorityCoverage(null,areas),null);
  // Independent unit-cell enumeration checks union and clipping for small rectangles.
  for(let right=412542;right<=412550;right++){
    const box=[412541,3389123,right,3389140];let expected=0;
    for(let x=box[0];x<box[2];x++)for(let y=box[1];y<box[3];y++)
      if(areas.some(({bounds_utm:b})=>x>=b[0]&&x<b[2]&&y>=b[1]&&y<b[3]))expected++;
    assert.equal(priorityCoverage(box,areas),expected);
  }
});

test('priority changes retain evaluated snapshots, refresh comparisons and expire only the report',async()=>{
  const f=fixture(),{session,run,update}=f;
  await run({type:'compare',fields:{budget_rmb:100000,unit_cost_rmb_per_m2:300}});
  await run({type:'save_temperature_scenario',bounds_utm:catalog.pilot.temperature_area.bounds_utm});
  await run({type:'evaluate_temperature_scenario',scenario_id:session.pilot_temperature_scenarios[0].id});
  await run({type:'export'});const report=session.reports.at(-1);
  const before=structuredClone({goal:session.goal,scenarios:session.scenarios,temperature:session.pilot_temperature_scenarios});
  await update({operation:'add',bounds_utm:first,label:'优先等候空间'});
  const v1=structuredClone(currentPilotPriority(session));
  await update({operation:'add',bounds_utm:second,label:'连接步行空间'});
  assert.deepEqual(session.goal,before.goal);assert.deepEqual(session.scenarios,before.scenarios);
  assert.deepEqual(session.pilot_temperature_scenarios,before.temperature);assert.equal(f.calls,1);
  assert.equal(planningReportIsStale(report,session),true);
  const comparison=executeTool('compare_scenario_options',{},session,catalog).priority_comparison;
  assert.equal(comparison.total_priority_area_m2,28);
  assert.equal(comparison.rows.find(r=>r.id==='A').priority_overlap_m2,0);
  assert.equal(comparison.rows.find(r=>r.id==='B').priority_overlap_m2,28);
  assert.deepEqual(session.pilot_priority_versions[0],v1);
  await run({type:'export'});assert.equal(planningReportIsStale(session.reports.at(-1),session),false);
  assert.match(session.reports.at(-1).markdown,/用户优先区域 v2/);
  await update({operation:'remove',area_id:v1.areas[0].id});
  assert.equal(priorityComparison(session).total_priority_area_m2,16);
  assert.equal(planningReportIsStale(session.reports.at(-1),session),true);
  assert.equal(f.calls,1);
});

test('stale edits, wrong sources, injected outputs and out-of-range priorities are rejected without replacing preferences',async()=>{
  const {session,update}=fixture();
  await update({operation:'add',bounds_utm:first,label:'等候空间'});
  const before=structuredClone(session.pilot_priority_versions);
  await update({operation:'add',bounds_utm:first,label:'等候空间'});
  assert.deepEqual(session.pilot_priority_versions,before);
  await assert.rejects(update({operation:'remove',area_id:before[0].areas[0].id,expected_priority_version:0}),{code:'stale_priority_version'});
  await assert.rejects(update({operation:'remove',area_id:'other-account'}),{code:'priority_area_not_found'});
  await assert.rejects(update({operation:'add',bounds_utm:[0,0,10,10],label:'范围外'}),{code:'invalid_priority_area'});
  await assert.rejects(update({operation:'add',bounds_utm:first,label:''}),{code:'invalid_priority_area'});
  await assert.rejects(update({operation:'add',bounds_utm:first,label:'伪造',result:{priority_overlap_m2:100}}),{code:'invalid_planning_action'});
  await assert.rejects(update({operation:'add',bounds_utm:first,label:'来源错误',expected_area_sha256:'0'.repeat(64)}),{code:'priority_source_changed'});
  assert.deepEqual(session.pilot_priority_versions,before);
  currentPilotPriority(session).area_sha256='0'.repeat(64);
  assert.equal(priorityComparison(session).source_valid,false);
  assert.equal(priorityComparison(session).rows[0].priority_overlap_m2,null);
  await assert.rejects(update({operation:'remove',area_id:before[0].areas[0].id}),{code:'priority_source_changed'});
});

test('priority coverage never overrides a protected area or authorizes a model call',async()=>{
  const f=fixture(),{session,run,update}=f;
  await update({operation:'add',bounds_utm:first,label:'优先但必须保留'});
  await run({type:'update_protection',operation:'add',bounds_utm:first,label:'保留活动空间',expected_protection_version:0,expected_current_scenario_id:null});
  const comparison=priorityComparison(session);
  assert.equal(comparison.rows.find(r=>r.id==='B').priority_overlap_m2,16);
  assert.equal(comparison.rows.find(r=>r.id==='B').protected_conflicts.length,1);
  await assert.rejects(run({type:'save_temperature_scenario',bounds_utm:first}),{code:'protected_area_conflict'});
  assert.equal(f.calls,0);
});

test('priority histories, geographic features and comparisons roundtrip with independent member hashes',async()=>{
  const {session,run,update}=fixture();
  await update({operation:'add',bounds_utm:first,label:'优先 | 等候空间'});
  await run({type:'export'});
  const saved=publicSession(session);
  assert.deepEqual(currentPilotPriority(JSON.parse(JSON.stringify(saved))),currentPilotPriority(session));
  const archive=await createPlanningProgressArchive({scene:catalog.scene,session:saved});
  const zip=await JSZip.loadAsync(archive.bytes,{checkCRC32:true});
  assert.equal(archive.manifest.priority_version,1);
  assert.deepEqual(JSON.parse(await zip.file('优先区域版本.json').async('string')),session.pilot_priority_versions);
  assert.deepEqual(JSON.parse(await zip.file('优先覆盖比较.json').async('string')),priorityComparison(session));
  assert.equal(JSON.parse(await zip.file('用户优先区.geojson').async('string')).features[0].properties.priority_version,1);
  assert.match(await zip.file('当前讨论报告.md').async('string'),/优先 \\\| 等候空间/);
  for(const member of archive.manifest.members){
    const bytes=await zip.file(member.name).async('nodebuffer');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),member.sha256);
  }
});

test('account API persists priority versions after restart and isolates them from another account',async()=>{
  const prefix=resolve(tmpdir()),directory=await mkdtemp(join(prefix,'urbancool-priority-'));
  const filename=join(directory,'test.sqlite');let accounts,server,base;
  async function start(){
    accounts=createAccountService({filename,defaultProvider:'local'});
    server=createAgentServer({accounts,catalog,port:0});server.listen(0,'127.0.0.1');await once(server,'listening');
    base=`http://127.0.0.1:${server.address().port}/api/agent`;
  }
  async function stop(){server.closeAllConnections();await new Promise(done=>server.close(done));accounts.close();}
  async function request(path,account,body){
    const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-UrbanCool-Agent':'1',
      ...(account?{Cookie:account.cookie,'X-UrbanCool-Account':account.id}:{})},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
  }
  await start();
  try{
    async function register(username){const r=await request('/account/register',null,{username,password:'priority-fixture-password'});assert.equal(r.status,201);return {...r.data.user,cookie:r.cookie.split(';')[0]};}
    const alice=await register('priority_alice'),bob=await register('priority_bob');
    const created=await request('/sessions',alice,{context});const id=created.data.session.id;
    const changed=await request('/chat',alice,{context,session_id:id,planning_action:{type:'update_priority',operation:'add',bounds_utm:first,
      label:'账户内优先区域',expected_priority_version:0,expected_area_sha256:catalog.pilot.temperature_area.sha256}});
    assert.equal(changed.status,200);assert.equal(changed.data.session.pilot_priority_versions.length,1);
    assert.equal((await request(`/sessions/${id}`,bob)).status,404);
    await stop();await start();
    assert.deepEqual((await request(`/sessions/${id}`,alice)).data.session.pilot_priority_versions,changed.data.session.pilot_priority_versions);
    assert.equal((await request('/sessions?'+new URLSearchParams(context),bob)).data.session,null);
  }finally{
    await stop();
    assert.ok(resolve(directory).startsWith(prefix+sep));await rm(directory,{recursive:true,force:true});
  }
});
