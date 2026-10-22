import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import {verifyConditionalSources,validateConditionalSources,conditionalArchiveBytes} from '../src/conditional-source-state.js';
import {createConditionalDraft,editConditionalDraft,validateConditionalDrafts,eventReviewStatus,draftSourceChoices} from '../src/conditional-drafts.js';
import {createProject,parseProjectJson,makeArchive,parseArchive,validateProject} from '../src/project.js';
const sources=JSON.parse(await fs.readFile(new URL('../public/data/conditional-source-state.json',import.meta.url),'utf8'));
const views=await verifyConditionalSources(sources);
const preparation=[JSON.parse(await fs.readFile(new URL('../public/data/preparation-state.json',import.meta.url),'utf8'))];
const fresh=mode=>createConditionalDraft(mode,'E4125_N33891',views.conditional_walk_scenario_definition);
const modes=['uniform_open_walkable_surface','documented_access_conditions'];
test('26 originals authenticate with 119 literal CSV strings, 39 blanks, 7 historical files, 8 web identities and 11 preview rows',async()=>{
  const all=Object.values(views).flatMap(v=>Object.values(v.files));assert.equal(all.length,26);assert.equal(all.reduce((n,f)=>n+f.bytes.length,0),469234);
  assert.equal(all.filter(f=>f.spec.role==='retained_superseded_history').length,7);
  const park=views.park_access_evidence;assert.equal(park.park.sources.length,8);assert.equal(park.park.claims.length,7);
  assert.equal(park.table.rows.flat().length,119);assert.equal(park.table.rows.flat().filter(s=>s==='').length,39);
  const sourceRoot=new URL('../../',import.meta.url);
  for(const f of all)assert.deepEqual(f.bytes,new Uint8Array(await fs.readFile(new URL(f.spec.path,sourceRoot))));
  assert.equal(views.temperature_catalogue_preview.preview.rows.length,11);assert.equal(views.temperature_catalogue_preview.temperatureAcquisition.raster_acquired,false);
  const wj05=park.park.claims.find(c=>c.evidence_id==='WJ05');assert.equal(wj05.source_record.publication_date,'2022-09-18');assert.equal(wj05.event_start_local,'2022-09-19');assert.equal(wj05.event_end_local,null);
  const wj07=park.park.claims.find(c=>c.evidence_id==='WJ07');assert.equal(wj07.source_record.publication_date_citation.source_id,'O08');assert.equal(wj07.event_start_local,null);
  assert.equal(views.conditional_walk_scenario_definition.definition.draft_storage.actual_software_implementation_verified,false);
});
test('source identity, original bytes, BOM, false adoption and exact metadata cannot be forged',async()=>{
  for(const mutate of [r=>r[0].research_adoption=true,r=>r[0].source_group.files[0].sha256='f'.repeat(64),r=>r[0].source_group.software_intake_completed=true,r=>r[0].archive_base64='A'+r[0].archive_base64.slice(1)]){
    const changed=structuredClone(sources);mutate(changed);await assert.rejects(()=>verifyConditionalSources(changed));
  }assert.throws(()=>validateConditionalSources(null));assert.throws(()=>validateConditionalSources([sources[0],sources[0]]));
});
test('two independent draft identities and edits preserve the other mode and every unknown scientific slot',()=>{
  const a=fresh(modes[0]),b=fresh(modes[1]),before=structuredClone(b);
  const edited=editConditionalDraft(a,{evaluation_time:'2020-07-25T14:00',origin_definition:'核心街区人口起点待核',destination_temperature_rule:'按同期观测LST协议核对；尚未设阈值'});
  assert.notEqual(a.draft_id,b.draft_id);assert.equal(edited.version,2);assert.equal(edited.created_at,a.created_at);assert.deepEqual(b,before);
  validateConditionalDrafts([edited,b],sources,views);assert.ok(Object.values(edited.scientific_outputs).every(v=>v===null));assert.ok(Object.values(edited.adopted).every(v=>v===null));
  assert.equal(a.width_assumption_m,null);assert.equal(a.mode_definition.real_permission_evidence_is_uniform_prerequisite,false);
  assert.throws(()=>editConditionalDraft(a,{adopted:{temperature_raster:'fake.tif'}}));
});
test('full source references record purpose only; wrong object/gate bindings and science adoption are rejected',()=>{
  const a=fresh(modes[0]);const choice=draftSourceChoices(sources).find(c=>c.path.endsWith('/官方分区与开放事件证据.json'));
  a.source_references=[{...choice,purpose:'分区及北大门出处待核',object_key:views.park_access_evidence.park.existing_OSM_candidate.source_object_key}];
  validateConditionalDrafts([a],sources,views);
  for(const mutate of [d=>d.source_references[0].object_key='way/116486191',d=>d.source_references[0].object_key='gate/H1',d=>d.source_references[0].registration_id='alias',d=>d.adopted.gate_bindings=['H1'],d=>d.mode_definition.road_centerlines_are_carriageway_polygons=true,d=>d.scientific_outputs.thermal_comfort=0,d=>d.source_references[0].purpose='']){
    const changed=structuredClone(a);mutate(changed);assert.throws(()=>validateConditionalDrafts([changed],sources,views));
  }
  const width=editConditionalDraft(a,{width_assumption_m:4});assert.throws(()=>validateConditionalDrafts([width],sources,views));
  validateConditionalDrafts([editConditionalDraft(width,{width_assumption_explanation:'情景宽度假设，车道面尚未核验'})],sources,views);
  const preparationChoices=draftSourceChoices(preparation);
  assert.equal(preparationChoices.length,14);
  const preparationDraft=fresh(modes[0]);
  preparationDraft.source_references=[{...preparationChoices[0],purpose:'冻结准备原件的完整引用，输入尚未采用',object_key:null}];
  validateConditionalDrafts([preparationDraft],sources,views,preparation);
  preparationDraft.source_references[0].sha256='f'.repeat(64);
  assert.throws(()=>validateConditionalDrafts([preparationDraft],sources,views,preparation));
});
test('evaluation mismatch, day precision and unknown ends never apply events or create indefinite validity',()=>{
  const claims=views.park_access_evidence.park.claims,b=fresh(modes[1]),sourceBefore=JSON.stringify(claims);
  assert.match(eventReviewStatus(b,claims[4]),/未填写/);
  const early=editConditionalDraft(b,{evaluation_time:'2020-07-25T14:00'});assert.match(eventReviewStatus(early,claims[4]),/早于/);
  const late=editConditionalDraft(b,{evaluation_time:'2026-10-06T14:00'});assert.match(eventReviewStatus(late,claims[4]),/结束时点未知/);assert.match(eventReviewStatus(late,claims[6]),/公告日期不等于/);
  assert.equal(JSON.stringify(claims),sourceBefore);assert.ok(claims.every(c=>c.accepted_for_2020_research_date===false&&c.accepted_service_value===null));
});
const sourcePackage=JSON.parse(await fs.readFile(new URL('../public/data/manifest.json',import.meta.url),'utf8'));
const scene=JSON.parse(await fs.readFile(new URL('../public/data/scene.json',import.meta.url),'utf8'));
const ui={stage:'site',region:'成都',drawer:'',preview:true,offline:true,center:scene.center_lon_lat,visible:{bounds:true,buildings:true,vegetation:true,roads:true,receptors:false,regional:false}};
test('legacy absence and explicit empty fields remain distinct; drafts roundtrip JSON and closed ZIP with all26 originals',async()=>{
  const base=createProject(sourcePackage,scene,ui,scene.layers);assert.equal(Object.hasOwn(parseProjectJson(JSON.stringify(base)),'conditionalSourceRegistrations'),false);
  const empty=createProject(sourcePackage,scene,ui,scene.layers,[],[],[],undefined,undefined,undefined,[],[]);assert.deepEqual((await parseArchive(await makeArchive(empty))).conditionalScenarioDrafts,[]);
  const project=createProject(sourcePackage,scene,ui,scene.layers,[],[],[],undefined,undefined,undefined,sources,modes.map(fresh));
  validateProject(project);assert.deepEqual(parseProjectJson(JSON.stringify(project)),project);
  const bytes=await makeArchive(project),restored=await parseArchive(bytes);assert.deepEqual(restored,project);
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});assert.deepEqual(await zip.file('conditional-sources/original-source.zip').async('uint8array'),conditionalArchiveBytes(sources[0]));
  for(const view of Object.values(views))for(const f of Object.values(view.files))assert.deepEqual(await zip.file('conditional-sources/inputs/'+f.spec.path).async('uint8array'),f.bytes);
  const changed=await JSZip.loadAsync(bytes);changed.file('conditional-scenarios/drafts.json','[]');await assert.rejects(async()=>parseArchive(await changed.generateAsync({type:'uint8array'})),/草稿旁表/);
  assert.throws(()=>validateProject({...base,conditionalScenarioDrafts:null}));assert.throws(()=>validateProject({...base,conditionalSourceRegistrations:null}));
});
