import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import JSZip from 'jszip';
import {parseStrictPreparationJson} from '../src/preparation-state.js';
import {parseSupplementCsv,inspectZipMembers} from '../src/supplement-state.js';
import {verifySourcePreparationRegistrations,sourcePreparationArchiveBytes,sourcePreparationManifestBytes} from '../src/source-preparation-state.js';

// Usage: node scripts/audit-source-preparation-downloads.mjs JSON ZIP [BEFORE_JSON AFTER_JSON]
// The named --json/--zip/--before-json/--after-json form is also accepted.
// This auditor reads saved artifacts only; it never executes the preserved PY
// text or follows references to PBFs, original weather archives or model inputs.
const APP_ROOT=fileURLToPath(new URL('../',import.meta.url));
const PROJECT_ROOT=resolve(APP_ROOT,'..');
const REPORT_PATH=resolve(APP_ROOT,'evidence/三组真实磁盘独立回读_20261006.json');
const MANIFEST_PATH='平台产品设计/来源准备三组接入清单_20261006.json';
const PROTECTION_PATH='evidence/三组接入前保护记录_20261006.json';
const LEGACY_PATH='/Users/wangyanbo/Downloads/街区交接_E4125_N33891_2026-10-05T21-38-32-234Z.json';
const BROWSER_PATH=resolve(APP_ROOT,'evidence/三组浏览器完整审阅_20261006.json');
const CURRENT_AFTER_PATH='/Users/wangyanbo/Downloads/街区交接_E4125_N33891_2026-10-05T22-46-22-263Z.json';
const GROUP_IDS=['micro-source-overlay','weather-cross-format','road-source-connectivity'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const pointer=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const info=(path,bytes)=>({path,bytes:bytes.length,sha256:sha(bytes)});
const readJson=path=>parseStrictPreparationJson(utf8.decode(readFileSync(path)));

function argumentsOf(values) {
  const keys={'--json':'json','--zip':'zip','--before-json':'before','--after-json':'after'};
  let result={};
  if(values[0]?.startsWith('--')) {
    for(let i=0;i<values.length;i+=2){const key=keys[values[i]];assert.ok(key&&!Object.hasOwn(result,key)&&values[i+1]&&!values[i+1].startsWith('--'),'参数必须唯一且包含实际路径');result[key]=resolve(values[i+1]);}
  }else {
    assert.ok(values.length===2||values.length===4,'请提供 JSON ZIP 或 JSON ZIP BEFORE_JSON AFTER_JSON 四路径');
    result={json:resolve(values[0]),zip:resolve(values[1]),...(values.length===4?{before:resolve(values[2]),after:resolve(values[3])}:{})};
  }
  assert.ok(result.json&&result.zip,'实际磁盘 JSON 和 ZIP 路径必需');
  assert.equal(Boolean(result.before),Boolean(result.after),'负例前后 JSON 必须成对提供');
  return result;
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
  if(source.file_kind==='csv')return parseSupplementCsv(utf8.decode(bytes));
  if(source.file_kind==='json'||source.file_kind==='geojson')return parseStrictPreparationJson(utf8.decode(bytes));
  if(source.file_kind==='md'||source.file_kind==='py'||source.file_kind==='svg')return utf8.decode(bytes);
  return null;
}
function csvEvidence(source,live,outer,nested) {
  assert.deepEqual(outer,live,source.path+'外层 CSV 全字段/全单元');assert.deepEqual(nested,live,source.path+'原组 CSV 全字段/全单元');
  assert.deepEqual(live.fields,source.columns,source.path+'完整原列顺序');assert.equal(live.fields.length,source.column_count);assert.equal(live.rows.length,source.row_count);
  const positions=source.primary_key_columns.map(key=>{const position=live.fields.indexOf(key);assert.ok(position>=0,'原主键列存在');return position;});
  const keys=live.rows.map(row=>{
    assert.equal(row.length,live.fields.length,'全部行宽保持');assert.ok(row.every(value=>typeof value==='string'),'全部单元原字符串');
    const values=positions.map(i=>row[i]);assert.ok(values.every(value=>value!==''),'原主键非空');return values;
  });
  assert.equal(new Set(keys.map(key=>JSON.stringify(key))).size,keys.length,'完整原主键集合唯一');
  const boundaryFields=live.fields.filter(field=>/accepted|adopted|permission|bridge_raw|tunnel_raw|layer_raw|legal_walk|travel_time|route_cost|route_distance|service_value|role_|entrance|opening|stay/.test(field));
  const boundaryCells=live.rows.map((row,i)=>({primary_key:keys[i],values:Object.fromEntries(boundaryFields.map(field=>[field,row[live.fields.indexOf(field)]]))}));
  return {fields:live.fields,row_count:live.rows.length,column_count:live.fields.length,primary_key_columns:source.primary_key_columns,
    primary_key_values:keys,all_original_cells_deep_equal:true,all_cells_original_strings:true,
    original_empty_cell_count:live.rows.flat().filter(value=>value==='').length,scientific_boundary_cells:boundaryCells};
}
function geoJsonEvidence(source,live,outer,nested) {
  assert.deepEqual(outer,live,source.path+'外层原 GeoJSON 全对象');assert.deepEqual(nested,live,source.path+'原组 GeoJSON 全对象');
  assert.equal(live.type,'FeatureCollection');assert.ok(Array.isArray(live.features));
  if(source.feature_count!==undefined)assert.equal(live.features.length,source.feature_count);
  let positions=0;
  const walk=coordinate=>{if(Array.isArray(coordinate)&&typeof coordinate[0]==='number'){assert.ok(coordinate.every(Number.isFinite));positions++;}else if(Array.isArray(coordinate))coordinate.forEach(walk);};
  const geometry=g=>{if(g.type==='GeometryCollection')g.geometries.forEach(geometry);else walk(g.coordinates);};
  live.features.forEach(feature=>{assert.ok(record(feature));geometry(feature.geometry);});
  return {feature_count:live.features.length,coordinate_position_count:positions,top_level_keys:Object.keys(live),
    all_coordinates_properties_and_original_nulls_deep_equal:true,source_null_paths:snapshot(live,(_path,value)=>value===null),
    feature_property_keys:live.features.map(feature=>({id:feature.id??null,keys:Object.keys(feature.properties??{})}))};
}

// Parse complete JSON objects/arrays emitted inside captured UI text, honoring
// quoted strings and escapes. This reads evidence; it does not control the UI.
function renderedJson(text) {
  const trimmed=text.trimStart();assert.ok(trimmed[0]==='{'||trimmed[0]==='[');
  let depth=0,quoted=false,escaped=false;
  for(let i=0;i<trimmed.length;i++) {
    const char=trimmed[i];
    if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
    if(char==='"')quoted=true;
    else if(char==='{'||char==='[')depth++;
    else if(char==='}'||char===']'){depth--;if(depth===0)return parseStrictPreparationJson(trimmed.slice(0,i+1));}
  }
  throw new Error('浏览器记录中的原对象JSON未完整闭合');
}
function renderedFields(text,expected,label) {
  assert.ok(typeof text==='string'&&record(expected),label+'字段视图');
  for(const [field,value]of Object.entries(expected)) {
    const marker='\n'+field+'\n',position=text.indexOf(marker);assert.ok(position>=0,label+'完整字段 '+field);
    const tail=text.slice(position+marker.length);
    if(record(value)||Array.isArray(value))assert.deepEqual(renderedJson(tail),value,label+'完整原对象 '+field);
    else {
      const shown=tail.split('\n')[0],expectedText=value===null?'null（未知／未采用）':value===''?'空项（原字符串）':String(value);
      assert.equal(shown,expectedText,label+'原值/空项 '+field);
    }
  }
  return Object.keys(expected);
}
function selectionKey(text) {
  const match=/^所选来源的完整关系\s+([^\n]+)/.exec(text);assert.ok(match,'来源选择必须有完整标题身份');return match[1];
}
function browserEvidence(browser,views,sourceReads,project,report) {
  const csvSources=report.source_files.filter(s=>s.file_kind==='csv');
  assert.ok(Array.isArray(browser.tables)&&browser.tables.length===10);
  assert.equal(new Set(browser.tables.map(t=>t.filename)).size,10);
  const tableChecks=[];let cells=0,rows=0;
  for(const source of csvSources) {
    const filename=source.path.split('/').at(-1),table=browser.tables.find(t=>t.filename===filename);assert.ok(table,'浏览器必须审阅 '+filename);
    const original=parseSupplementCsv(utf8.decode(sourceReads.get(source.path)));
    assert.deepEqual(table.fields,original.fields,filename+'浏览器全部原字段');
    assert.deepEqual(table.rows,original.rows,filename+'浏览器全部原字符串行（空项归一原空串）');
    const pages=Math.ceil(original.rows.length/12);assert.equal(table.pages.length,pages,filename+'全部分页');
    table.pages.forEach((text,i)=>assert.ok(text.includes((i+1)+' / '+pages),filename+'完整分页顺序'));
    rows+=table.rows.length;cells+=table.rows.length*table.fields.length;
    tableChecks.push({source_path:source.path,filename,rows:table.rows.length,columns:table.fields.length,pages,all_fields_all_rows_all_cells_equal:true});
  }
  assert.equal(rows,633);
  const overlay=views['micro-source-overlay'].summary.selectionLookup;
  assert.ok(Array.isArray(browser.cells)&&browser.cells.length===4);
  const clickedCells=browser.cells.map(text=>{const key=selectionKey(text);assert.ok(overlay.cells[key]);return {key,full_lookup_fields:renderedFields(text,overlay.cells[key],'来源面 '+key)};});
  assert.deepEqual([...new Set(clickedCells.map(c=>c.key))].sort(),['S002','S004','S014']);
  const roads=views['road-source-connectivity'].summary.selection_lookup;
  assert.ok(Array.isArray(browser.source_selections)&&browser.source_selections.length===7);
  const sourceSelections=browser.source_selections.map(captured=>{
    const key=selectionKey(captured.text);if(captured.key!==undefined)assert.equal(captured.key,key,'选择记录完整源键');
    const kind={partition_road:'roads',node:'nodes',node_map_click:'nodes',segment:'segments',segment_map_click:'segments',receptor:'receptors',receptor_map_click:'receptors'}[captured.kind];
    assert.ok(kind,'明确来源选择类型');
    const expected=captured.kind==='partition_road'?overlay.roads[key]:roads[kind][key];assert.ok(expected,'选中原源键真实存在');
    return {record_kind:captured.kind,source_key:key,full_lookup_fields:renderedFields(captured.text,expected,'来源选择 '+key),complete_rows_and_original_strings_equal:true};
  });
  const hourly=views['weather-cross-format'].summary.hourly_rows;
  assert.equal(browser.weather.hours.length,24);assert.equal(browser.weather.labels.length,24);
  const weatherDetails=hourly.map((row,i)=>{
    const label=row.display.time_label+' · '+row.display.air_temperature+' · '+row.display.wind_speed;
    assert.equal(browser.weather.labels[i],label,'24小时原来源标签');assert.ok(browser.weather.hours[i].startsWith(label));
    renderedFields(browser.weather.hours[i],row.raw,'小时全部35原字段 '+row.key);
    renderedFields(browser.weather.hours[i],row.source_bindings,'四格式原成员身份/行号 '+row.key);
    renderedFields(browser.weather.hours[i],row.source_zip_reference,'外部年度包仅引用 '+row.key);
    return {key:row.key,source_clock_label:row.raw.wea_source_clock_label,all_35_original_fields_equal:true,four_format_source_bindings_equal:true,annual_archive_reference_only:true};
  });
  assert.equal(browser.negative_cases.length,10);assert.equal(new Set(browser.negative_cases.map(c=>c.name)).size,10);
  for(const c of browser.negative_cases){assert.ok(typeof c.alert==='string'&&c.alert.startsWith('无法重开：'));assert.equal(c.three_groups_still_visible,true);assert.ok(hash(c.sha256));}
  for(const [type,key]of [['json','json_reopen'],['zip','zip_reopen']])assert.ok(browser[key].includes(report.disk_files[type].sha256),'浏览器实际重开回执所指磁盘 '+type);
  return {tables:tableChecks,table_count:10,total_rows:rows,total_original_cell_comparisons:cells,
    comparison_policy:'captured_UI_table_empty_marker_normalized_to_original_empty_string_only; numeric_zero_and_False_unchanged',
    source_file_bytes_verified_independently:true,clicked_cells:clickedCells,unique_clicked_cells:['S014','S002','S004'],
    selected_source_records:sourceSelections,weather_hours:weatherDetails,weather_hour_count:24,
    browser_reported_negative_count:10,browser_reported_negative_alerts:browser.negative_cases,
    browser_rejection_actions_performed_by_root_not_this_script:true,
    intermediate_persistent_export_per_case_claimed:false,source_registration_count:project.sourcePreparationRegistrations.length};
}

const inputs=argumentsOf(process.argv.slice(2));
const report={
  schema_version:'0.1.independent-disk-source-preparation-readback',status:'running',started_at_utc:new Date().toISOString(),
  stages:{actual_disk_json_zip:'not_run',current_31_source_readback:'not_run',protected_files:'not_run',negative_before_after:inputs.before?'not_run':'not_provided_not_claimed',browser_captured_source_tables:'not_run'},
  scope:{actual_disk_files_read:true,explicit_current_source_files_only:31,raw_external_references_followed:false,
    original_PBF_or_full_weather_archive_loaded:false,upstream_original_scene_assets_loaded:false,
    producer_executed:false,model_labels_or_weights_read:false,new_training_inference_or_research:false,
    routes_OD_or_physical_service_computed:false,scientific_adoption_upgraded:false,
    browser_reopen_performed_by_this_auditor:false,browser_evidence_owned_by_root:true},
  disk_files:{},groups:[],source_files:[],protected_existing_files:[],
};
const sourceReads=new Map(),protectedReads=new Map();
let originalManifestBytes,browserRecordBytes;
try {
  const jsonBytes=readFileSync(inputs.json),zipBytes=readFileSync(inputs.zip),project=parseStrictPreparationJson(utf8.decode(jsonBytes));
  report.disk_files.json=info(inputs.json,jsonBytes);report.disk_files.zip=info(inputs.zip,zipBytes);
  assert.equal(project.export_schema_version,'0.1.local-view-handoff');assert.ok(record(project.uiState)&&record(project.scene));
  const registrations=project.sourcePreparationRegistrations;
  assert.ok(Array.isArray(registrations));assert.deepEqual(registrations.map(r=>r.group_id),GROUP_IDS);
  assert.deepEqual(registrations,readJson(resolve(APP_ROOT,'public/data/source-preparation-state.json')),'下载新登记全字段必须等公开冻结实件');
  const catalogManifestPath=safePath(PROJECT_ROOT,MANIFEST_PATH);originalManifestBytes=readFileSync(catalogManifestPath);
  const manifest=parseStrictPreparationJson(utf8.decode(originalManifestBytes));
  assert.equal(manifest.group_count,3);assert.equal(manifest.explicit_file_count,31);assert.equal(manifest.scientific_capabilities_opened,false);
  assert.deepEqual(manifest.groups.map(g=>g.group_id),GROUP_IDS);assert.equal(manifest.groups.flatMap(g=>g.files).length,31);
  inspectZipMembers(zipBytes);const zip=await JSZip.loadAsync(zipBytes,{checkCRC32:true});
  assert.deepEqual(await memberBytes(zip,'project.json'),jsonBytes,'ZIP project.json 必须逐字节等实际JSON下载');
  assert.deepEqual(parseStrictPreparationJson(utf8.decode(await memberBytes(zip,'source-preparation/registrations.json'))),registrations,'新旁表原对象相等');
  assert.deepEqual(await memberBytes(zip,'source-preparation/source-manifest.json'),originalManifestBytes,'外层完整原manifest字节相等');
  report.original_manifest={...info(MANIFEST_PATH,originalManifestBytes),embedded_outer_and_each_nested_bytes_equal:true};

  const expectedMembers=['project.json','交接说明.md','source-preparation/registrations.json','source-preparation/source-manifest.json',
    ...Object.keys(project.layers).map(name=>'layers/'+name.replace(/[^a-zA-Z0-9_-]/g,'_')+'.geojson')];
  if(Object.hasOwn(project,'researchRegistrations'))expectedMembers.push('research/registrations.json');
  if(Object.hasOwn(project,'preparationRegistrations'))expectedMembers.push('preparation/registrations.json');
  if(Object.hasOwn(project,'supplementRegistrations'))expectedMembers.push('supplements/registrations.json',...project.supplementRegistrations.map(r=>'supplements/'+r.group_id+'.zip'));
  for(const r of registrations)expectedMembers.push('source-preparation/'+r.group_id+'.zip',...r.source_group.files.map(s=>'source-preparation/inputs/'+s.path));
  assert.equal(new Set(expectedMembers).size,expectedMembers.length,'外层显式成员唯一');
  inspectZipMembers(zipBytes,new Map([...expectedMembers,'archive-receipt.json'].map(path=>[path,null])));
  const receipt=parseStrictPreparationJson(utf8.decode(await memberBytes(zip,'archive-receipt.json')));
  assert.deepEqual(Object.keys(receipt).sort(),['members','schema_version']);assert.equal(receipt.schema_version,'0.1.project-member-hashes');
  assert.deepEqual(receipt.members.map(m=>m.path).sort(),expectedMembers.slice().sort());
  assert.equal(new Set(receipt.members.map(m=>m.path)).size,expectedMembers.length);
  for(const member of receipt.members){assert.deepEqual(Object.keys(member).sort(),['bytes','path','sha256']);metadata(await memberBytes(zip,member.path),member,'外层成员 '+member.path);}
  report.archive_members={count:receipt.members.length,complete_closed_set:true,CRC_checked:true,all_member_SHA_and_bytes_verified:true,members:receipt.members};
  for(const [name,layer]of Object.entries(project.layers))assert.deepEqual(parseStrictPreparationJson(utf8.decode(await memberBytes(zip,'layers/'+name.replace(/[^a-zA-Z0-9_-]/g,'_')+'.geojson'))),layer,'原显示图层 '+name);

  const legacyBytes=readFileSync(LEGACY_PATH),legacy=parseStrictPreparationJson(utf8.decode(legacyBytes));
  metadata(legacyBytes,{bytes:8574808,sha256:'05f7500ac479a0375087d751a47ccc05b10add25d080931dbefb122d429304e7'},'已知历史五组JSON');
  report.disk_files.legacy=info(LEGACY_PATH,legacyBytes);
  const unchangedKeys=['sourcePackage','scene','layers','researchRegistrations','preparationRegistrations','supplementRegistrations','imports','software_receipt'];
  for(const key of unchangedKeys)assert.deepEqual(project[key],legacy[key],'新工程不得覆盖历史 '+key);
  assert.equal(project.sourcePackage.artifact_count,24);assert.equal(project.sourcePackage.artifacts.length,24);assert.equal(Object.keys(project.layers).length,15);
  assert.equal(project.researchRegistrations.length,2);assert.equal(project.preparationRegistrations.length,1);assert.equal(project.supplementRegistrations.length,5);
  assert.equal(Object.hasOwn(legacy,'sourcePreparationRegistrations'),false);
  assert.deepEqual(project.uiState.selectedReference,legacy.uiState.selectedReference,'旧选中对象身份不得被来源审阅改变');
  const uiChanges=differences(legacy.uiState,project.uiState,'/uiState');
  const unexpectedUi=uiChanges.filter(change=>!/^\/uiState\/(?:camera(?:\/|$)|drawer$)/.test(change.path));
  assert.deepEqual(unexpectedUi,[],'历史视图仅允许单列相机或抽屉变化');
  for(const key of ['researchRegistrations','preparationRegistrations','supplementRegistrations']) {
    const path={researchRegistrations:'research',preparationRegistrations:'preparation',supplementRegistrations:'supplements'}[key]+'/registrations.json';
    assert.deepEqual(parseStrictPreparationJson(utf8.decode(await memberBytes(zip,path))),project[key],path+'旁表保持');
  }
  for(const r of project.supplementRegistrations){const bytes=await memberBytes(zip,'supplements/'+r.group_id+'.zip');assert.deepEqual(bytes,Buffer.from(r.archive_base64,'base64'));metadata(bytes,r.archive,'历史五组原包');}
  report.historical_preservation={fields_deep_equal:unchangedKeys,source_artifact_count:24,display_layer_count:15,research_registrations:2,frozen_preparation_registrations:1,old_supplement_groups:5,
    old_selected_reference_unchanged:true,ui_camera_or_drawer_changes:uiChanges,old_project_new_field_absent:true,
    original_null_paths:snapshot(legacy,(_path,value)=>value===null),original_gate_paths:snapshot(legacy,scientificPath)};
  report.project_scientific_gate_paths=snapshot(project,scientificPath);
  assert.equal(project.scene.results.temperature_improvement_C,null);assert.equal(project.scene.results.value_state,'not_calculated');
  report.stages.actual_disk_json_zip='pass_actual_bytes_and_original_project_fields';

  const views=await verifySourcePreparationRegistrations(registrations);
  for(const r of registrations) {
    const sourceGroup=manifest.groups.find(g=>g.group_id===r.group_id);assert.deepEqual(r.source_group,sourceGroup);
    assert.equal(r.source_group.scientific_adoption,'not_adopted');assert.equal(r.source_group.software_intake,'not_yet_executed');assert.equal(r.source_group.area_D_physical_access_fairness_ranking_outputs_available,false);
    assert.equal(Object.keys(r.adapter_receipt.application_gates).length,9);assert.ok(Object.values(r.adapter_receipt.application_gates).every(value=>value===false));
    const nestedBytes=await memberBytes(zip,'source-preparation/'+r.group_id+'.zip');
    assert.deepEqual(nestedBytes,Buffer.from(r.archive_base64,'base64'));assert.deepEqual(nestedBytes,Buffer.from(sourcePreparationArchiveBytes(r)));metadata(nestedBytes,r.archive,'新原组包');
    const originalManifest=Buffer.from(sourcePreparationManifestBytes(r));assert.deepEqual(originalManifest,originalManifestBytes);metadata(originalManifest,r.manifest_source,'新原清单');
    inspectZipMembers(nestedBytes,new Map([['source-manifest.json',r.manifest_source.bytes],...r.source_group.files.map(s=>[s.path,s.bytes])]));
    const nested=await JSZip.loadAsync(nestedBytes,{checkCRC32:true});assert.deepEqual(await memberBytes(nested,'source-manifest.json'),originalManifestBytes);
    const sourceNulls={},sourceGates={};
    for(const s of r.source_group.files) {
      assert.ok(!sourceReads.has(s.path),'31显式来源路径独立唯一');
      const path=safePath(PROJECT_ROOT,s.path),liveBytes=readFileSync(path);sourceReads.set(s.path,liveBytes);metadata(liveBytes,s,'当前来源 '+s.path);
      const outerBytes=await memberBytes(zip,'source-preparation/inputs/'+s.path),innerBytes=await memberBytes(nested,s.path);
      assert.deepEqual(outerBytes,liveBytes,'外层源件必须逐字节等当前来源 '+s.path);assert.deepEqual(innerBytes,liveBytes,'原组源件必须逐字节等当前来源 '+s.path);
      const live=decodedSource(liveBytes,s),outer=decodedSource(outerBytes,s),inner=decodedSource(innerBytes,s);
      const evidence={group_id:r.group_id,...info(s.path,liveBytes),file_kind:s.file_kind,nested_direct_current_bytes_equal:true};
      if(s.file_kind==='csv')evidence.csv=csvEvidence(s,live,outer,inner);
      else if(s.file_kind==='geojson')evidence.geojson=geoJsonEvidence(s,live,outer,inner);
      else if(s.file_kind==='json') {assert.deepEqual(outer,live);assert.deepEqual(inner,live);evidence.all_JSON_keys_and_values_deep_equal=true;}
      else if(typeof live==='string'){assert.equal(outer,live);assert.equal(inner,live);evidence.original_text_retained_not_executed=true;}
      else evidence.binary_original_bytes_retained=true;
      if(record(live)) {sourceNulls[s.path]=snapshot(live,(_path,value)=>value===null);sourceGates[s.path]=snapshot(live,scientificPath);}
      report.source_files.push(evidence);
    }
    report.groups.push({group_id:r.group_id,registration_id:r.registration_id,archive:{...r.archive,complete_original_bytes_equal:true},manifest_source:r.manifest_source,
      source_file_count:r.source_group.files.length,source_group_all_fields_equal:true,
      source_declarations:{scientific_adoption:r.source_group.scientific_adoption,software_intake:r.source_group.software_intake,area_D_physical_access_fairness_ranking_outputs_available:false},
      independent_software_receipt:r.adapter_receipt,source_JSON_null_paths:sourceNulls,source_JSON_scientific_gate_paths:sourceGates,
      semantic_verification_performed:true,semantic_scientific_gates:views[r.group_id].summary.operation_gates??null});
  }
  assert.equal(sourceReads.size,31);report.stages.current_31_source_readback='pass_31_actual_files_all_bytes_all_CSV_cells_and_keys_all_JSON_and_GeoJSON';

  const protectionBytes=readFileSync(resolve(APP_ROOT,PROTECTION_PATH)),protection=parseStrictPreparationJson(utf8.decode(protectionBytes));
  report.protection_record=info(PROTECTION_PATH,protectionBytes);
  assert.ok(Array.isArray(protection.protected_existing_files)&&protection.protected_existing_files.length===10);
  assert.equal(new Set(protection.protected_existing_files.map(s=>s.path)).size,10);
  for(const p of protection.protected_existing_files){const bytes=readFileSync(safePath(APP_ROOT,p.path));protectedReads.set(p.path,bytes);metadata(bytes,p,'保护文件 '+p.path);report.protected_existing_files.push({...p,current_sha256:sha(bytes),current_bytes:bytes.length,original_expected_hash_match:true});}
  report.stages.protected_files='pass_10_protected_paths_current_bytes_and_hashes';

  if(inputs.before) {
    const beforeBytes=readFileSync(inputs.before),afterBytes=readFileSync(inputs.after),before=parseStrictPreparationJson(utf8.decode(beforeBytes)),after=parseStrictPreparationJson(utf8.decode(afterBytes));
    report.disk_files.before=info(inputs.before,beforeBytes);report.disk_files.after=info(inputs.after,afterBytes);
    const beforeGates=snapshot(before,scientificPath),afterGates=snapshot(after,scientificPath),beforeNulls=snapshot(before,(_path,value)=>value===null),afterNulls=snapshot(after,(_path,value)=>value===null);
    assert.deepEqual(withoutTimestamp(after),withoutTimestamp(before),'实际负例前后工程全对象除 exported_at 必须一致');
    assert.deepEqual(afterGates,beforeGates,'实际负例前后全部科学门控路径一致');assert.deepEqual(afterNulls,beforeNulls,'实际负例前后所有原null路径一致');
    assert.deepEqual(before.sourcePreparationRegistrations,registrations,'负例前工程仍为原新登记');assert.deepEqual(after.sourcePreparationRegistrations,registrations,'负例后工程仍为原新登记');
    report.negative_before_after={whole_project_equal_except_exported_at:true,before_exported_at:before.exported_at,after_exported_at:after.exported_at,
      original_null_paths:beforeNulls,original_gate_paths:beforeGates,after_gate_paths:afterGates,
      browser_negative_actions_not_executed_by_this_script:true,only_actual_before_after_disk_state_audited:true};
    report.stages.negative_before_after='pass_actual_two_disk_files_whole_project_except_exported_at';
  }
  if(existsSync(BROWSER_PATH)) {
    browserRecordBytes=readFileSync(BROWSER_PATH);const browser=parseStrictPreparationJson(utf8.decode(browserRecordBytes));
    report.browser_capture_record=info(BROWSER_PATH,browserRecordBytes);
    report.browser_source_readback=browserEvidence(browser,views,sourceReads,project,report);
    report.stages.browser_captured_source_tables='pass_10_tables_633_rows_24_weather_details_and_complete_source_selection_records';
    if(inputs.before) {
      assert.equal(resolve(browser.before_file),inputs.before);assert.equal(resolve(browser.after_persistent_file),inputs.after);
      assert.equal(browser.after_current_file,CURRENT_AFTER_PATH);assert.equal(browser.negative_after_persistent_restore,true);
      const beforeBytes=readFileSync(inputs.before),currentAfterBytes=readFileSync(CURRENT_AFTER_PATH);
      assert.deepEqual(currentAfterBytes,beforeBytes,'错误批次后当前工程与before逐byte一致');
      const currentProject=parseStrictPreparationJson(utf8.decode(currentAfterBytes));
      assert.deepEqual(currentProject.sourcePreparationRegistrations,project.sourcePreparationRegistrations);
      report.disk_files.after_current=info(CURRENT_AFTER_PATH,currentAfterBytes);
      report.negative_before_after.current_after_bytes_equal_before=true;
      report.negative_before_after.persistent_after_refresh_and_restore_reported_by_root=true;
      report.negative_before_after.whole_batch_pass=true;
      report.negative_before_after.ten_browser_rejections_reference=report.browser_capture_record;
      report.negative_before_after.intermediate_persistent_export_per_case_claimed=false;
      report.stages.negative_before_after='pass_whole_batch_current_bytes_equal_and_persistent_restored_project_except_exported_at';
    }
  }else report.stages.browser_captured_source_tables='not_present_not_claimed';
  report.status='pass_software_and_saved_source_bytes_only';
}catch(error) {
  report.status='fail';report.error={name:error.name,message:error.message};process.exitCode=1;
}finally {
  try {
    for(const [path,bytes]of sourceReads){const after=readFileSync(safePath(PROJECT_ROOT,path));assert.deepEqual(after,bytes,'审计前后来源不变 '+path);const item=report.source_files.find(s=>s.path===path);if(item){item.sha256_after=sha(after);item.bytes_after=after.length;item.source_bytes_unchanged=true;}}
    for(const [path,bytes]of protectedReads){const after=readFileSync(safePath(APP_ROOT,path));assert.deepEqual(after,bytes,'审计前后保护文件不变 '+path);const item=report.protected_existing_files.find(s=>s.path===path);if(item){item.sha256_after=sha(after);item.bytes_after=after.length;item.unchanged_during_audit=true;}}
    if(originalManifestBytes)assert.deepEqual(readFileSync(safePath(PROJECT_ROOT,MANIFEST_PATH)),originalManifestBytes,'审计前后原清单不变');
    if(browserRecordBytes){assert.deepEqual(readFileSync(BROWSER_PATH),browserRecordBytes,'审计前后浏览器证据记录不变');report.browser_capture_hash_unchanged=true;}
    report.source_hashes_unchanged=sourceReads.size===31&&report.source_files.every(s=>s.source_bytes_unchanged);
    report.protected_hashes_unchanged=protectedReads.size===10&&report.protected_existing_files.every(s=>s.unchanged_during_audit);
    report.manifest_hash_unchanged=Boolean(originalManifestBytes);
  }catch(error){report.status='fail';report.final_hash_error={name:error.name,message:error.message};process.exitCode=1;}
  report.completed_at_utc=new Date().toISOString();
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n','utf8');writeFileSync(REPORT_PATH,bytes);
  console.log(JSON.stringify({status:report.status,stages:report.stages,receipt:info(REPORT_PATH,bytes),source_files_read:sourceReads.size,protected_files_read:protectedReads.size,error:report.error??report.final_hash_error??null},null,2));
}
