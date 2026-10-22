import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import JSZip from 'jszip';
import {parseStrictPreparationJson} from '../src/preparation-state.js';
import {parseSupplementCsv,inspectZipMembers} from '../src/supplement-state.js';
import {verifyGeometrySourceRegistrations} from '../src/source-geometry-state.js';
import {GEOMETRY_SOURCE_MANIFEST,GEOMETRY_SOURCE_ALIASES,GEOMETRY_SOURCE_INTAKE_REVIEW} from '../src/source-geometry-catalog.js';
import {PROJECT_ZIP_LIMITS} from '../src/project.js';

// Reads actual disk artifacts and the explicit 72-source whitelist only.
// Usage: JSON ZIP [BEFORE CURRENT_AFTER PERSISTENT_AFTER], or named options.
// Never executes PY, follows external PBF/ancestor/weather/model references,
// controls a browser or manufactures a per-error persistent export claim.
const APP_ROOT=fileURLToPath(new URL('../',import.meta.url));
const PROJECT_ROOT=resolve(APP_ROOT,'..');
const REPORT_PATH=resolve(APP_ROOT,'evidence/几何对象72真实磁盘独立回读_20261006.json');
const PROTECTION_PATH='evidence/几何对象接入前保护记录_20261006.json';
const DEFAULT_LEGACY='/Users/wangyanbo/Downloads/街区交接_E4125_N33891_2026-10-05T22-39-34-670Z.json';
const DEFAULT_BROWSER=resolve(APP_ROOT,'evidence/几何对象浏览器完整审阅_20261006.json');
const GROUP_IDS=['building_geometry_svf','window_source_connectivity','OSM_source_marks'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const pointer=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const info=(path,bytes)=>({path,bytes:bytes.length,sha256:sha(bytes)});
const readJson=path=>parseStrictPreparationJson(utf8.decode(readFileSync(path)));
function argumentsOf(values) {
 const result={},keys={'--json':'json','--zip':'zip','--before-json':'before','--current-after-json':'current','--after-json':'after','--legacy-json':'legacy','--browser-evidence':'browser'};
 if(values[0]?.startsWith('--'))for(let i=0;i<values.length;i+=2){const key=keys[values[i]];assert.ok(key&&!Object.hasOwn(result,key)&&values[i+1]&&!values[i+1].startsWith('--'),'参数须唯一且有实际路径');result[key]=resolve(values[i+1]);}
 else {assert.ok([2,4,5].includes(values.length),'实际JSON ZIP或附before/persistentafter，推荐附before/currentafter/persistentafter');['json','zip',...(values.length===5?['before','current','after']:values.length===4?['before','after']:[])].forEach((k,i)=>result[k]=resolve(values[i]));}
 assert.ok(result.json&&result.zip);assert.equal(Boolean(result.before),Boolean(result.after));assert.ok(!result.current||result.before);
 result.legacy??=DEFAULT_LEGACY;result.browser??=DEFAULT_BROWSER;return result;
}
function safePath(root,path) {
  assert.ok(typeof path==='string'&&path&&!isAbsolute(path)&&!path.includes('\\')&&!path.split('/').includes('..'),'仅允许明确根相对来源路径');
  const absolute=resolve(root,path),rel=relative(root,absolute);
  assert.ok(rel&&!rel.startsWith('..'+sep)&&!isAbsolute(rel),'来源路径必须留在相应项目根内');
  return absolute;
}
function metadata(bytes,expected,label) {
  assert.ok(Number.isSafeInteger(expected.bytes)&&expected.bytes>0&&hash(expected.sha256),label+'原元数据');
  assert.equal(bytes.length,expected.bytes,label+'原bytes');assert.equal(sha(bytes),expected.sha256,label+'原SHA');
}
async function memberBytes(zip,path) {
  const entry=zip.file(path);assert.ok(entry,'ZIP必须包含 '+path);return Buffer.from(await entry.async('uint8array'));
}
function snapshot(value,predicate,path='',result={}) {
  if(record(value)||Array.isArray(value)) {
    for(const [key,child] of Object.entries(value))snapshot(child,predicate,path+'/'+pointer(key),result);
  }else if(predicate(path,value))result[path]=value;
  return result;
}
const scientificPath=(path,value)=>/(?:gates|operation_gates|application_gates|scientific_gates|evidence_readiness_and_operation_gates|scientific_action_gates)(?:\/|$)/.test(path)
  || /\/(?:prediction_enabled|physics_enabled|optimal_recommendation_enabled|scientific_adoption|scientific_capabilities_opened|area_D_physical_access_fairness_ranking_outputs_available|primary_unit_adopted|main_object_adopted|research_action_adopted|graph_attachment_accepted|engine_input_adopted|simulation_run|route_OD_service|walk_network|science)$/.test(path)
  || (typeof value==='boolean'||value===null)&&/_(?:adopted|accepted|ready|enabled|available|computed|verified|certified|run)$/.test(path);
function differences(a,b,path='') {
  if(JSON.stringify(a)===JSON.stringify(b))return [];
  if(record(a)&&record(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(key=>differences(a[key],b[key],path+'/'+pointer(key)));
  if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length)return a.flatMap((value,index)=>differences(value,b[index],path+'/'+index));
  return [{path,before:a===undefined?{field_absent:true}:a,after:b===undefined?{field_absent:true}:b}];
}
function withoutTimestamp(project) {const result=structuredClone(project);delete result.exported_at;return result;}
function decodedSource(bytes,source) {
  if(source.format==='csv')return parseSupplementCsv(utf8.decode(bytes));
  if(source.format==='json'||source.format==='geojson')return parseStrictPreparationJson(utf8.decode(bytes));
  if(['md','py','txt','svg'].includes(source.format))return utf8.decode(bytes);
  return null;
}
function csvEvidence(source,spec,live,outer,nested) {
  assert.deepEqual(outer,live,source.path+'外层全部CSV原字符串');assert.deepEqual(nested,live,source.path+'本组全部CSV原字符串');
  assert.ok(live.rows.every(row=>row.length===live.fields.length&&row.every(v=>typeof v==='string')));
  const result={fields:live.fields,row_count:live.rows.length,column_count:live.fields.length,original_cell_count:live.rows.length*live.fields.length,
    original_empty_cells:live.rows.flat().filter(v=>v==='').length,all_original_rows_cells_and_column_order_equal:true,
    all_cells_original_strings:true,historical_unaccepted:source.role==='retained_unaccepted_schema_history'};
  if(spec) {
    assert.deepEqual(live.fields,spec.columns);assert.equal(live.fields.length,spec.column_count);assert.equal(live.rows.length,spec.rows);
    const indices=spec.primary_key_columns.map(k=>{const i=live.fields.indexOf(k);assert.ok(i>=0);return i;});
    const keys=live.rows.map(row=>indices.map(i=>row[i]));assert.ok(keys.every(key=>key.every(v=>v!=='')));assert.equal(new Set(keys.map(k=>JSON.stringify(k))).size,keys.length);
    const outerKeys=outer.rows.map(row=>indices.map(i=>row[i])),nestedKeys=nested.rows.map(row=>indices.map(i=>row[i]));
    assert.deepEqual(outerKeys,keys);assert.deepEqual(nestedKeys,keys);
    Object.assign(result,{primary_key_columns:spec.primary_key_columns,complete_primary_key_sets_equal:true,unique_primary_key_count:keys.length,
      complete_key_set_sha256:sha(Buffer.from(JSON.stringify(keys.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))))),
      primary_key_values:keys.length<=1000?keys:undefined,large_key_set_first_and_last:keys.length>1000?[keys[0],keys.at(-1)]:undefined});
  }
  return result;
}
function geoEvidence(source,live,outer,nested) {
  assert.deepEqual(outer,live,source.path+'外层全GeoJSON坐标属性null');assert.deepEqual(nested,live,source.path+'原组全GeoJSON坐标属性null');
  assert.equal(live.type,'FeatureCollection');assert.ok(Array.isArray(live.features));let positions=0;
  const coordinate=c=>{if(Array.isArray(c)&&typeof c[0]==='number'){assert.ok(c.every(Number.isFinite));positions++;}else if(Array.isArray(c))c.forEach(coordinate);};
  const geometry=g=>g.type==='GeometryCollection'?g.geometries.forEach(geometry):coordinate(g.coordinates);
  live.features.forEach(f=>{assert.ok(record(f)&&record(f.properties)&&record(f.geometry));geometry(f.geometry);});
  return {features:live.features.length,coordinate_positions:positions,all_coordinates_all_properties_original_nulls_equal:true,
    original_null_paths:snapshot(live,(_p,v)=>v===null),feature_id_and_geometry_types:live.features.map(f=>({id:f.id??null,type:f.geometry.type}))};
}
function expectedMembers(project) {
  const paths=['project.json','交接说明.md',...Object.keys(project.layers).map(name=>'layers/'+name.replace(/[^a-zA-Z0-9_-]/g,'_')+'.geojson')];
  for(const [field,prefix,sourceList]of [['researchRegistrations','research',null],['preparationRegistrations','preparation',null],['supplementRegistrations','supplements',null],['sourcePreparationRegistrations','source-preparation','files'],['geometrySourceRegistrations','geometry-source','source_files']]) {
    if(!Object.hasOwn(project,field))continue;paths.push(prefix+'/registrations.json');
    if(sourceList&&project[field].length)paths.push(prefix+'/source-manifest.json');
    if(field==='supplementRegistrations'||sourceList)for(const r of project[field]){paths.push(prefix+'/'+r.group_id+'.zip');if(sourceList)paths.push(...r.source_group[sourceList].map(s=>prefix+'/inputs/'+s.path));}
  }
  assert.equal(new Set(paths).size,paths.length);return paths;
}
function browserTables(browser,manifest,sourceReads) {
  const captured=browser.tables??[],checks=[],missing=[];let cells=0,rows=0;
  assert.ok(Array.isArray(captured));
  for(const spec of manifest.groups.flatMap(g=>g.primary_tables)) {
    const candidates=captured.filter(t=>t.source_path===spec.path||(!t.source_path&&t.filename===spec.path.split('/').at(-1)));assert.ok(candidates.length<=1,'UI表来源不能重复/歧义');
    const c=candidates[0];if(!c){missing.push(spec.path);continue;}
    const live=parseSupplementCsv(utf8.decode(sourceReads.get(spec.path)));assert.deepEqual(c.fields,live.fields,spec.path+'UI完整字段');
    if(Array.isArray(c.rows)){assert.deepEqual(c.rows,live.rows,spec.path+'UI全部原字符串行');rows+=c.rows.length;cells+=c.rows.length*c.fields.length;checks.push({path:spec.path,all_fields_rows_original_strings_equal:true,rows:c.rows.length,columns:c.fields.length,captured_pages:c.pages?.length??null});}
    else if(Array.isArray(c.sample_rows)) {for(const sampled of c.sample_rows){assert.ok(Number.isSafeInteger(sampled.index)&&sampled.index>=0&&sampled.index<live.rows.length);assert.deepEqual(sampled.cells,live.rows[sampled.index]);}checks.push({path:spec.path,fields_equal:true,actual_UI_sampled_rows:c.sample_rows.length,all_rows_UI_claimed:false});}
    else throw new Error('UI表记录缺实际rows或明示sample_rows：'+spec.path);
  }
  return {tables:checks,total_complete_UI_table_rows:rows,total_complete_UI_original_cell_comparisons:cells,missing_UI_tables:missing,
    complete_16_tables_and_32834_rows_UI_readback:checks.length===16&&rows===32834,
    policy:'Only actual captured rows are compared. Counts, virtual pages or source-byte audit do not establish whole-table browser review.'};
}
function sourceNullCSV(view) {
  const result={};for(const [path,table]of Object.entries(view.tables)){const fields=table.fields.filter(f=>/accepted|adopted|legal|permission|thermal|service|entrance|route|public|height_used/.test(f));result[path]={fields,original_boundary_strings_sha256:sha(Buffer.from(JSON.stringify(table.rows.map(row=>fields.map(f=>row[table.fields.indexOf(f)]))))),blank_count:table.rows.reduce((n,row)=>n+fields.filter(f=>row[table.fields.indexOf(f)]==='').length,0)};}return result;
}

const inputs=argumentsOf(process.argv.slice(2));
const report={schema_version:'0.1.independent-disk-source-geometry-readback',status:'running',started_at_utc:new Date().toISOString(),
  stages:{actual_disk_project:'not_run',explicit_72_source_bytes:'not_run',historical_project:'not_run',protected_files:'not_run',before_after:inputs.before?'not_run':'not_provided_not_claimed',browser_source_evidence:'not_run'},
  scope:{explicit_source_file_count:72,original_external_PBF_weather_ancestor_assets_loaded:false,producer_or_source_scripts_executed:false,model_labels_weights_or_inference_read:false,research_or_routing_executed:false,
    original_strict_failed_checks_upgraded:false,scientific_gates_opened:false,browser_actions_by_this_auditor:false,per_case_intermediate_persistent_export_claimed:false},
  disk_files:{},source_files:[],groups:[],protected_existing_files:[]};
const sourceReads=new Map(),protectedReads=new Map();let manifestBytes,browserBytes,reviewBytes,protectionBytes;
try {
  const jsonBytes=readFileSync(inputs.json),zipBytes=readFileSync(inputs.zip),project=parseStrictPreparationJson(utf8.decode(jsonBytes));
  report.disk_files.json=info(inputs.json,jsonBytes);report.disk_files.zip=info(inputs.zip,zipBytes);assert.equal(project.export_schema_version,'0.1.local-view-handoff');
  const registrations=project.geometrySourceRegistrations;assert.ok(Array.isArray(registrations));assert.deepEqual(registrations.map(r=>r.group_id),GROUP_IDS);assert.deepEqual(registrations,readJson(resolve(APP_ROOT,'public/data/source-geometry-state.json')),'公开冻结登记实物');
  manifestBytes=readFileSync(safePath(PROJECT_ROOT,GEOMETRY_SOURCE_MANIFEST.path));metadata(manifestBytes,GEOMETRY_SOURCE_MANIFEST,'原72清单');const manifest=parseStrictPreparationJson(utf8.decode(manifestBytes));
  assert.equal(manifest.source_file_count,72);assert.equal(manifest.primary_table_count,16);assert.equal(manifest.primary_table_rows,32834);assert.equal(manifest.retained_unaccepted_schema_file_count,4);
  inspectZipMembers(zipBytes,null,PROJECT_ZIP_LIMITS);const zip=await JSZip.loadAsync(zipBytes,{checkCRC32:true});assert.deepEqual(await memberBytes(zip,'project.json'),jsonBytes,'ZIPproject逐byte等actualJSON');
  const members=expectedMembers(project);inspectZipMembers(zipBytes,new Map([...members,'archive-receipt.json'].map(path=>[path,null])),PROJECT_ZIP_LIMITS);
  const receipt=parseStrictPreparationJson(utf8.decode(await memberBytes(zip,'archive-receipt.json')));assert.equal(receipt.schema_version,'0.1.project-member-hashes');assert.deepEqual(Object.keys(receipt).sort(),['members','schema_version']);assert.deepEqual(receipt.members.map(m=>m.path).sort(),members.slice().sort());assert.equal(new Set(receipt.members.map(m=>m.path)).size,members.length);
  for(const m of receipt.members){assert.deepEqual(Object.keys(m).sort(),['bytes','path','sha256']);metadata(await memberBytes(zip,m.path),m,'闭集成员 '+m.path);}
  report.archive_members={count:members.length,complete_closed_set:true,CRC_verified:true,all_SHA_and_bytes_verified:true,members:receipt.members};
  for(const [name,layer]of Object.entries(project.layers))assert.deepEqual(parseStrictPreparationJson(utf8.decode(await memberBytes(zip,'layers/'+name.replace(/[^a-zA-Z0-9_-]/g,'_')+'.geojson'))),layer);
  for(const [field,prefix]of [['researchRegistrations','research'],['preparationRegistrations','preparation'],['supplementRegistrations','supplements'],['sourcePreparationRegistrations','source-preparation'],['geometrySourceRegistrations','geometry-source']])if(Object.hasOwn(project,field))assert.deepEqual(parseStrictPreparationJson(utf8.decode(await memberBytes(zip,prefix+'/registrations.json'))),project[field]);
  assert.deepEqual(await memberBytes(zip,'geometry-source/source-manifest.json'),manifestBytes);
  report.original_manifest={...info(GEOMETRY_SOURCE_MANIFEST.path,manifestBytes),outer_and_all_nested_raw_bytes_equal:true};report.stages.actual_disk_project='pass_project_bytes_JSON_ZIP_layers_sidecars_closed_receipt';

  const legacyBytes=readFileSync(inputs.legacy),legacy=parseStrictPreparationJson(utf8.decode(legacyBytes));report.disk_files.legacy=info(inputs.legacy,legacyBytes);
  if(inputs.legacy===DEFAULT_LEGACY)metadata(legacyBytes,{bytes:10410899,sha256:'10b91f07544d013f3badb8e1dab7ca60c4db2908db1e27368d738ee5e8f06fec'},'前轮已验证实际31源工程');
  const oldKeys=['sourcePackage','scene','layers','researchRegistrations','preparationRegistrations','supplementRegistrations','sourcePreparationRegistrations','imports','software_receipt'];for(const k of oldKeys)assert.deepEqual(project[k],legacy[k],'旧工程全对象 '+k);
  assert.equal(Object.hasOwn(legacy,'geometrySourceRegistrations'),false,'旧工程缺新字段不得回填');assert.equal(project.sourcePackage.artifacts.length,24);assert.equal(Object.keys(project.layers).length,15);assert.equal(project.researchRegistrations.length,2);assert.equal(project.preparationRegistrations.length,1);assert.equal(project.supplementRegistrations.length,5);assert.equal(project.sourcePreparationRegistrations.length,3);
  assert.deepEqual(project.uiState.selectedReference,legacy.uiState.selectedReference,'旧场景选中来源不变');
  const uiChanges=differences(legacy.uiState,project.uiState,'/uiState');report.historical_preservation={fields_deep_equal:oldKeys,counts:{source_refs:24,display_layers:15,research:2,frozen_preparation:1,old_supplement:5,old_source_preparation_groups:3},new_field_absent_in_actual_old_project:true,selectedReference_unchanged:true,ui_changes_recorded:uiChanges,old_null_paths:snapshot(legacy,(_p,v)=>v===null),old_scientific_gate_paths:snapshot(legacy,scientificPath)};
  for(const r of project.supplementRegistrations){const bytes=await memberBytes(zip,'supplements/'+r.group_id+'.zip');assert.deepEqual(bytes,Buffer.from(r.archive_base64,'base64'));metadata(bytes,r.archive,'旧五组原包');}
  let old31Count=0;for(const r of project.sourcePreparationRegistrations){const bytes=await memberBytes(zip,'source-preparation/'+r.group_id+'.zip'),oldManifest=Buffer.from(r.manifest_base64,'base64');assert.deepEqual(bytes,Buffer.from(r.archive_base64,'base64'));metadata(bytes,r.archive,'旧31组包');assert.deepEqual(await memberBytes(zip,'source-preparation/source-manifest.json'),oldManifest);const nested=await JSZip.loadAsync(bytes,{checkCRC32:true});assert.deepEqual(await memberBytes(nested,'source-manifest.json'),oldManifest);for(const s of r.source_group.files){const direct=await memberBytes(zip,'source-preparation/inputs/'+s.path),inner=await memberBytes(nested,s.path);metadata(direct,s,'旧31原件');assert.deepEqual(direct,inner);old31Count++;}}
  assert.equal(old31Count,31);const frozen=project.preparationRegistrations[0],frozenBytes=Buffer.from(frozen.archive_base64,'base64');metadata(frozenBytes,frozen.archive,'原93456準備ZIP');assert.equal(frozenBytes.length,93456);const frozenZIP=await JSZip.loadAsync(frozenBytes,{checkCRC32:true});let old14=0;for(const s of frozen.manifest.entries){const bytes=await memberBytes(frozenZIP,s.archive_path);metadata(bytes,s,'原14準備成员');old14++;}assert.equal(old14,14);
  report.historical_preservation.old_31_direct_files_equal_nested_and_frozen_registry=true;report.historical_preservation.old_preparation_93456_bytes_and_all14_entries_verified=true;report.stages.historical_project='pass_24_15_2_1_5_3_original_project_deep_equal_and_31_14_source_archives';

  const views=await verifyGeometrySourceRegistrations(registrations);let totalCells=0,totalRows=0,primaryCount=0,historyCount=0;
  for(const r of registrations) {
    const group=manifest.groups.find(g=>g.group_id===r.group_id);assert.deepEqual(r.source_group,group);assert.equal(group.scientific_adoption_opened,false);assert.ok(Object.values(r.adapter_receipt.application_gates).every(v=>v===false));assert.deepEqual(r.adapter_receipt.receiver_key_aliases,GEOMETRY_SOURCE_ALIASES);
    const archive=await memberBytes(zip,'geometry-source/'+r.group_id+'.zip');assert.deepEqual(archive,Buffer.from(r.archive_base64,'base64'));metadata(archive,r.archive,'新原组包');const sidecar=Buffer.from(r.manifest_base64,'base64');assert.deepEqual(sidecar,manifestBytes);metadata(sidecar,r.manifest_source,'原manifest');
    inspectZipMembers(archive,new Map([['source-manifest.json',manifestBytes.length],...group.source_files.map(s=>[s.path,s.bytes])]));const nested=await JSZip.loadAsync(archive,{checkCRC32:true});assert.deepEqual(await memberBytes(nested,'source-manifest.json'),manifestBytes);
    for(const s of group.source_files) {
      assert.ok(!sourceReads.has(s.path));const liveBytes=readFileSync(safePath(PROJECT_ROOT,s.path));sourceReads.set(s.path,liveBytes);metadata(liveBytes,s,'当前明确原件 '+s.path);
      const outerBytes=await memberBytes(zip,'geometry-source/inputs/'+s.path),innerBytes=await memberBytes(nested,s.path);assert.deepEqual(outerBytes,liveBytes,'72direct原件');assert.deepEqual(innerBytes,liveBytes,'72nested原件');assert.deepEqual(Buffer.from(views[r.group_id].raw[s.path]),liveBytes,'软件解码原字节独立对应');
      const live=decodedSource(liveBytes,s),outer=decodedSource(outerBytes,s),inner=decodedSource(innerBytes,s),spec=group.primary_tables.find(t=>t.path===s.path),item={group_id:r.group_id,...info(s.path,liveBytes),format:s.format,role:s.role,nested_outer_current_original_bytes_equal:true};
      if(s.role==='retained_unaccepted_schema_history')historyCount++;
      if(s.format==='csv'){item.raw_UTF8_BOM_preserved=liveBytes.subarray(0,3).equals(Buffer.from([239,187,191]));item.csv=csvEvidence(s,spec,live,outer,inner);if(spec){totalCells+=item.csv.original_cell_count;totalRows+=live.rows.length;primaryCount++;}}
      else if(s.format==='geojson')item.geojson=geoEvidence(s,live,outer,inner);
      else if(s.format==='json'){assert.deepEqual(outer,live);assert.deepEqual(inner,live);item.all_original_JSON_fields_and_values_equal=true;item.original_null_paths=snapshot(live,(_p,v)=>v===null);item.original_scientific_boundaries=snapshot(live,scientificPath);}
      else if(typeof live==='string'){assert.equal(outer,live);assert.equal(inner,live);item.original_text_preserved_not_executed=true;}else item.binary_original_bytes_retained=true;
      report.source_files.push(item);
    }
    const view=views[r.group_id];const semanticGates=view.summary.operation_gates??view.summary.application_gates;assert.ok(semanticGates&&Object.values(semanticGates).every(v=>v===false));report.groups.push({group_id:r.group_id,registration_id:r.registration_id,source_file_count:group.source_files.length,archive:r.archive,manifest_source:r.manifest_source,
      independent_adapter_receipt:r.adapter_receipt,all_original_source_group_fields_equal:true,semantic_counts:view.summary.counts,semantic_summary_scientific_gates:semanticGates,
      scientific_CSV_boundary_strings:sourceNullCSV(view),display_collection_counts:Object.fromEntries(Object.entries(view.displayCollections).map(([k,v])=>[k,v.features.length]))});
  }
  assert.equal(sourceReads.size,72);assert.equal(primaryCount,16);assert.equal(totalRows,32834);assert.equal(totalCells,656295);assert.equal(historyCount,4);report.primary_table_totals={table_count:16,rows:32834,original_string_cells:656295,retained_unaccepted_files:4};report.stages.explicit_72_source_bytes='pass_72_raw_bytes_16_primary_tables_32834_rows_656295_original_cells';
  const windowView=views.window_source_connectivity,marksView=views.OSM_source_marks;assert.equal(windowView.summary.strict_audit.all_passed,false);assert.equal(windowView.summary.strict_checks.strict_failed_parent_segments,11);report.retained_failures={window_strict_checks:windowView.summary.strict_checks,window_strict_audit:windowView.summary.strict_audit,window_first_failure:windowView.summary.first_failure,building_known_failures:views.building_geometry_svf.summary.known_failures,building_work_conditions:views.building_geometry_svf.summary.work_conditions};
  reviewBytes=readFileSync(safePath(PROJECT_ROOT,GEOMETRY_SOURCE_INTAKE_REVIEW.path));metadata(reviewBytes,GEOMETRY_SOURCE_INTAKE_REVIEW,'冻结后只读审阅');const review=parseStrictPreparationJson(utf8.decode(reviewBytes));assert.deepEqual(review.cross_group_receiver_key_alias_evidence,GEOMETRY_SOURCE_ALIASES);assert.deepEqual(marksView.summary.receiver_key_aliases,GEOMETRY_SOURCE_ALIASES);report.independent_alias_proof={...info(GEOMETRY_SOURCE_INTAKE_REVIEW.path,reviewBytes),all6_full_SHA_layer_ID_aliases_equal:true,not_one_of72_or_embedded_source_member:true};

  protectionBytes=readFileSync(resolve(APP_ROOT,PROTECTION_PATH));const protection=parseStrictPreparationJson(utf8.decode(protectionBytes));report.protection_record=info(PROTECTION_PATH,protectionBytes);assert.equal(protection.protected_existing_files.length,17);
  for(const p of protection.protected_existing_files){const bytes=readFileSync(safePath(APP_ROOT,p.path));protectedReads.set(p.path,bytes);metadata(bytes,p,'17保护来源 '+p.path);report.protected_existing_files.push({...p,current_bytes:bytes.length,current_sha256:sha(bytes),expected_hash_matches:true});}report.stages.protected_files='pass_17_actual_protected_paths_and_source_hashes';
  report.all_project_null_paths=snapshot(project,(_p,v)=>v===null);report.all_project_scientific_boundaries=snapshot(project,scientificPath);
  if(inputs.before) {
    const b=readFileSync(inputs.before),a=readFileSync(inputs.after),before=parseStrictPreparationJson(utf8.decode(b)),after=parseStrictPreparationJson(utf8.decode(a));report.disk_files.before=info(inputs.before,b);report.disk_files.after_persistent=info(inputs.after,a);
    const changes=differences(withoutTimestamp(before),withoutTimestamp(after));assert.deepEqual(changes.filter(d=>!/^\/uiState\/camera(?:\/|$)/.test(d.path)),[],'整批错误后仅export时间/明示camera可不同');assert.deepEqual(snapshot(after,scientificPath),snapshot(before,scientificPath));assert.deepEqual(snapshot(after,(_p,v)=>v===null),snapshot(before,(_p,v)=>v===null));assert.deepEqual(before.geometrySourceRegistrations,registrations);assert.deepEqual(after.geometrySourceRegistrations,registrations);
    report.whole_batch_before_after={whole_project_except_exported_at_and_explicit_camera_equal:true,camera_changes:changes,before_exported_at:before.exported_at,after_exported_at:after.exported_at,all_null_and_gate_paths_equal:true,gate_paths:snapshot(before,scientificPath),null_paths:snapshot(before,(_p,v)=>v===null),per_case_intermediate_persistent_export_claimed:false};
    if(inputs.current){const c=readFileSync(inputs.current);assert.deepEqual(c,b,'整批错误后当前工程逐byte等before');report.disk_files.after_current=info(inputs.current,c);report.whole_batch_before_after.current_after_bytes_equal_before=true;}
    report.stages.before_after='pass_actual_whole_batch_before_current_and_persistent_disk_state';
  }
  if(existsSync(inputs.browser)) {browserBytes=readFileSync(inputs.browser);const browser=parseStrictPreparationJson(utf8.decode(browserBytes));report.browser_capture_record=info(inputs.browser,browserBytes);report.browser_source_evidence=browserTables(browser,manifest,sourceReads);report.browser_reported_cases=browser.negative_cases??null;report.stages.browser_source_evidence=report.browser_source_evidence.complete_16_tables_and_32834_rows_UI_readback?'pass_actual_captured_all16_tables_32834_rows':'pass_actual_provided_UI_coverage_only_full_72_byte_audit_separate';}
  else report.stages.browser_source_evidence='not_provided_not_claimed';
  report.status='pass_actual_disk_and_source_bytes_software_review_only';
}catch(error){report.status='fail';report.error={name:error.name,message:error.message};process.exitCode=1;}
finally {
  try {
    for(const [path,bytes]of sourceReads){const after=readFileSync(safePath(PROJECT_ROOT,path));assert.deepEqual(after,bytes,'前后源不变 '+path);const item=report.source_files.find(s=>s.path===path);if(item){item.sha256_after=sha(after);item.source_bytes_unchanged=true;}}
    for(const [path,bytes]of protectedReads){const after=readFileSync(safePath(APP_ROOT,path));assert.deepEqual(after,bytes,'前后保护不变 '+path);const item=report.protected_existing_files.find(s=>s.path===path);if(item)item.unchanged_during_audit=true;}
    for(const [path,bytes]of [[manifestBytes&&safePath(PROJECT_ROOT,GEOMETRY_SOURCE_MANIFEST.path),manifestBytes],[reviewBytes&&safePath(PROJECT_ROOT,GEOMETRY_SOURCE_INTAKE_REVIEW.path),reviewBytes],[protectionBytes&&resolve(APP_ROOT,PROTECTION_PATH),protectionBytes],[browserBytes&&inputs.browser,browserBytes]])if(bytes)assert.deepEqual(readFileSync(path),bytes,'读取前后证据/清单不变');
    report.source_hashes_unchanged=sourceReads.size===72&&report.source_files.every(s=>s.source_bytes_unchanged);report.protected_hashes_unchanged=protectedReads.size===17&&report.protected_existing_files.every(s=>s.unchanged_during_audit);report.original_manifest_hash_unchanged=Boolean(manifestBytes);
  }catch(error){report.status='fail';report.final_hash_error={name:error.name,message:error.message};process.exitCode=1;}
  report.completed_at_utc=new Date().toISOString();const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');writeFileSync(REPORT_PATH,bytes);console.log(JSON.stringify({status:report.status,stages:report.stages,receipt:info(REPORT_PATH,bytes),sources_read:sourceReads.size,protected_read:protectedReads.size,table_totals:report.primary_table_totals,error:report.error??report.final_hash_error??null},null,2));
}
