import JSZip from 'jszip';

export const PREPARATION_SCHEMA = '0.1.read-only-pilot-preparation-registration';
export const PREPARATION_MANIFEST_MEMBER = '准备清单.json';
export const PREPARATION_INPUT_PATHS = Object.freeze({
  macroCsv:'共享接口/共同试点输入对照/宏观九格现有输入.csv',
  macro:'共享接口/共同试点输入对照/宏观九格输入核查.json',
  macroReadme:'共享接口/共同试点输入对照/README.md',
  residenceCsv:'共享接口/公平性输入准备/共同试点住宅候选.csv',
  population:'共享接口/公平性输入准备/共同试点对象与人口支持核查.json',
  residences:'共享接口/公平性输入准备/共同试点住宅源对象_展示准备.geojson',
  residenceReview:'共享接口/公平性输入准备/共同试点住宅几何展示核查.json',
  residenceBoundary:'共享接口/公平性输入准备/共同试点接纳边界.md',
  micro:'共享接口/微观试验准备/实际输入与缺项.json',
  microDraft:'共享接口/微观试验准备/同投入与指标匹配试验准备_草案.md',
  weather:'共享接口/微观试验准备/持有气象与地形候选核查.json',
  weatherReadme:'共享接口/微观试验准备/持有输入能补哪些缺项.md',
  service:'共享接口/服务链准备/双路径受益与获取接口_草案.json',
  serviceReadme:'共享接口/服务链准备/README.md',
});
export const READ_ONLY_PREPARATION_ACTION_GATES = Object.freeze({prediction:false,physical_simulation:false,service_evaluation:false,fairness_evaluation:false,candidate_generation:false,ranking:false});
export const PREPARATION_VERIFICATION_SCOPE = 'original_preparation_zip_manifest_and_explicit_14_metadata_source_bytes_only';
export const PREPARATION_AXIS_STATES = Object.freeze({file_acceptance:'verified_preparation_archive_and_14_source_bytes',science_validation:'preparation_only_not_application_validated',integration:'local_read_only_preparation_registration',execution:'metadata_verified_no_research_execution'});
const SITE = 'E4125_N33891';
const MAX_ARCHIVE_BYTES = 5_000_000, MAX_EXPANDED_BYTES = 20_000_000, MAX_MEMBER_BYTES = 2_000_000;
const paths = Object.values(PREPARATION_INPUT_PATHS);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const utf8 = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const fail = message => {throw new Error(message);};
const requireValue = (actual,expected,label) => {if (actual !== expected) fail(label+'不符合原准备身份或只读边界。');};

export function readOnlyPreparationActionGates() {return {...READ_ONLY_PREPARATION_ACTION_GATES};}

function finiteTree(value,depth=0) {
  if (depth > 100 || typeof value === 'number' && !Number.isFinite(value)) fail('准备资料包含非有限数值或过深结构。');
  if (Array.isArray(value)) value.forEach(item=>finiteTree(item,depth+1));
  else if (isRecord(value)) Object.values(value).forEach(item=>finiteTree(item,depth+1));
}

/** Parse JSON without losing duplicate keys or accepting overflowing numbers. */
export function parseStrictPreparationJson(text) {
  let offset=0;
  const space=()=>{while (/\s/.test(text[offset] || '') && [' ','\t','\r','\n'].includes(text[offset])) offset++;};
  function string() {
    const start=offset++;
    while (offset<text.length) {
      if (text[offset]==='\\') {offset+=2;continue;}
      if (text[offset++]==='"') return JSON.parse(text.slice(start,offset));
    }
    fail('准备JSON字符串未闭合。');
  }
  function value(depth=0) {
    if (depth>100) fail('准备JSON嵌套过深。');
    space(); const first=text[offset];
    if (first==='"') return string();
    if (first==='{' || first==='[') {
      const object=first==='{', result=object?{}:[], seen=new Set(), end=object?'}':']';
      offset++;space();if (text[offset]===end) {offset++;return result;}
      while (offset<text.length) {
        let key;
        if (object) {
          space();if(text[offset]!=='"') fail('准备JSON对象键无效。');key=string();
          if(seen.has(key)) fail('准备JSON存在重复键：'+key+'。');seen.add(key);
          space();if(text[offset++]!==':') fail('准备JSON缺少冒号。');
        }
        const item=value(depth+1);
        if(object) Object.defineProperty(result,key,{value:item,enumerable:true,writable:true,configurable:true});else result.push(item);
        space();const separator=text[offset++];if(separator===end) return result;if(separator!==',') fail('准备JSON分隔符无效。');
      }
      fail('准备JSON结构未闭合。');
    }
    for (const [literal,item] of [['true',true],['false',false],['null',null]]) if(text.startsWith(literal,offset)){offset+=literal.length;return item;}
    const token=text.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if(!token) fail('准备JSON包含非法值。');offset+=token[0].length;const number=Number(token[0]);
    if(!Number.isFinite(number)) fail('准备JSON包含非有限数值。');return number;
  }
  const result=value();space();if(offset!==text.length) fail('准备JSON包含多余内容。');return result;
}

function canonical(value,pythonSpaces=false) {
  const comma=pythonSpaces?', ':',', colon=pythonSpaces?': ':':';
  if(Array.isArray(value)) return '['+value.map(item=>canonical(item,pythonSpaces)).join(comma)+']';
  if(isRecord(value)) return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+colon+canonical(value[key],pythonSpaces)).join(comma)+'}';
  return JSON.stringify(value);
}

function validateGates(gates) {
  if(!isRecord(gates)) fail('准备登记缺少六项只读门控。');
  for(const key of Object.keys(READ_ONLY_PREPARATION_ACTION_GATES)) requireValue(gates[key],false,'准备门控'+key);
  for(const value of Object.values(gates)) requireValue(value,false,'准备门控');
}

function validateManifest(manifest) {
  if(!isRecord(manifest)) fail('准备登记缺少原清单。');
  requireValue(manifest.schema_version,'pilot-preparation-package-v0.1','准备清单版本');
  requireValue(manifest.package_kind,'research_input_preparation_not_platform_project','准备ZIP类型');
  requireValue(manifest.site_id,SITE,'共同试点');
  if(!isHash(manifest.source_fingerprint_sha256) || !isHash(manifest.builder_sha256)) fail('准备清单指纹或构建来源哈希无效。');
  requireValue(manifest.package_id,'pilot-preparation:'+manifest.source_fingerprint_sha256,'准备包身份');
  requireValue(manifest.copy_scope,'explicit_preparation_files_only_no_source_raster_models_or_labels','复制范围');
  for(const [key,status] of Object.entries({artifact:'checked',science:'not_assessed',integration:'not_adapted',execution:'not_run'})) requireValue(manifest.status_axes?.[key],status,'原准备状态轴'+key);
  validateGates(manifest.scientific_action_gates);
  requireValue(manifest.prepared_research_file_bytes_unchanged_during_pack,true,'原准备文件字节');
  requireValue(manifest.research_labels_or_model_weights_read,false,'原标签或权重读取');
  requireValue(manifest.new_scientific_results_generated,false,'原科学结果生成');
  if(!Array.isArray(manifest.entries) || manifest.entries.length!==14) fail('准备清单必须精确登记14个显式源件。');
  const seen=new Set();let total=0;
  for(const entry of manifest.entries) {
    if(!isRecord(entry) || !paths.includes(entry.path) || seen.has(entry.path) || entry.archive_path!=='inputs/'+entry.path || !isHash(entry.sha256) || !positiveInteger(entry.bytes) || entry.bytes>MAX_MEMBER_BYTES) fail('准备源件路径、唯一身份、SHA256或字节数无效。');
    seen.add(entry.path);total+=entry.bytes;
  }
  if(total>MAX_EXPANDED_BYTES) fail('准备源件超过读取范围。');
  const summary=manifest.summary;
  const expected={macro_grid_count:9,macro_proxy_input_accepted_count:8,macro_core_partition:'not_proxy_supervised',macro_core_proxy_supervision_accepted:false,macro_complete_nine_grid_input_support:false,residence_source_candidates:6,residence_native_population_cell_ids:6,residence_candidates_intersecting_300m:0,fairness_unit_adopted:false,building_population_allocated_or_summed:false,shared_receptor_candidates:6,uncomputed_service_branch_records:12,accepted_weather_drivers:0,terrain_source_admitted_to_solver:false,physical_simulations:0,candidate_layouts:0};
  for(const [key,v] of Object.entries(expected)) requireValue(summary?.[key],v,'原准备摘要'+key);
  if(canonical(summary.macro_missing_input_grid_ids)!==canonical(['E4126_N33890'])) fail('原九格缺项身份必须保留。');
  if(!Array.isArray(manifest.scope_registry) || manifest.scope_registry.length!==4) fail('准备范围登记必须分列100/300/500和未定义求解域。');
  for(const [id,width] of [['core_100',100],['macro_neighborhood_300',300],['micro_preparation_500',500],['physical_solver_domain',null]]) {
    const matches=manifest.scope_registry.filter(s=>s.support_id===id);if(matches.length!==1) fail('准备范围身份重复或缺失。');requireValue(matches[0].width_m,width,'准备范围'+id);
    if(width===null) requireValue(matches[0].bounds_m,null,'未定义求解域');
  }
  const comparison=manifest.copied_source_snapshot_comparisons?.find(s=>s.source_id_in_micro_snapshot==='service_preparation');
  if(!comparison || !isHash(comparison.micro_snapshot_declared_sha256) || !isHash(comparison.copied_current_sha256)) fail('准备包缺少旧微观快照与新service版本对照。');
  requireValue(comparison.copied_current_sha256,manifest.entries.find(e=>e.path===PREPARATION_INPUT_PATHS.service).sha256,'当前service源件');
  requireValue(comparison.same_bytes,false,'旧新service字节差异');requireValue(comparison.old_micro_snapshot_rebased,false,'旧微观快照不重基');
  requireValue(manifest.snapshot_currency_notice?.source_snapshot_rebased_after_notice,false,'原读取时段快照不重基');
  requireValue(manifest.snapshot_currency_notice?.current_source_hash_equality_reasserted,false,'原历史快照不重声明当前一致');
}

export function validatePreparationRegistration(registration) {
  if(!isRecord(registration) || registration.schema_version!==PREPARATION_SCHEMA) fail('不是受支持的只读试点准备登记。');
  finiteTree(registration);validateManifest(registration.manifest);
  requireValue(registration.registration_id,registration.manifest.package_id,'准备登记身份');requireValue(registration.site_id,registration.manifest.site_id,'准备登记场地');
  const directory='共享接口/共同试点输入对照/交接准备包/'+registration.manifest.source_fingerprint_sha256.slice(0,16)+'/';
  for(const [record,path,max] of [[registration.archive,directory+SITE+'_研究输入准备.zip',MAX_ARCHIVE_BYTES],[registration.manifest_source,directory+PREPARATION_MANIFEST_MEMBER,MAX_MEMBER_BYTES]]) {
    if(!isRecord(record) || record.path!==path || !isHash(record.sha256) || !positiveInteger(record.bytes) || record.bytes>max) fail('准备原ZIP或清单的路径、SHA256、字节身份无效。');
  }
  const encoded=registration.archive_base64;
  if(typeof encoded!=='string' || encoded.length!==Math.ceil(registration.archive.bytes/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail('准备ZIP完整原字节base64无效。');
  const receipt=registration.adapter_receipt;
  if(!isRecord(receipt) || receipt.adapter_version!=='0.1' || !hasText(receipt.registered_at) || !Number.isFinite(Date.parse(receipt.registered_at))) fail('准备登记缺少独立适配回执。');
  for(const [key,state] of Object.entries(PREPARATION_AXIS_STATES)) requireValue(receipt[key]?.state,state,'准备适配四轴'+key);
  const verification=receipt.source_verification;
  requireValue(verification?.verified_source_count,14,'准备源件核对数量');requireValue(verification?.archive_member_count,15,'准备ZIP成员数量');requireValue(verification?.scope,PREPARATION_VERIFICATION_SCOPE,'准备核验范围');
  for(const key of ['archive_hash_matches','archive_crc_verified','manifest_hash_matches','all_member_hashes_match','current_source_hashes_match','source_hashes_unchanged','archive_hash_unchanged','manifest_hash_unchanged']) requireValue(verification?.[key],true,'准备核验'+key);
  validateGates(receipt.operation_gates);return registration;
}

function archiveDirectory(bytes,registration) {
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(data.getUint32(i,true)===0x06054b50 && i+22+data.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0) fail('准备ZIP尾目录无效。');
  const count=data.getUint16(end+10,true), start=data.getUint32(end+16,true), length=data.getUint32(end+12,true);
  if(data.getUint16(end+4,true)!==0 || data.getUint16(end+6,true)!==0 || data.getUint16(end+8,true)!==count || count!==15 || start+length!==end) fail('准备ZIP必须为精确15成员的单卷原包。');
  const expected=new Map([[PREPARATION_MANIFEST_MEMBER,registration.manifest_source.bytes],...registration.manifest.entries.map(e=>[e.archive_path,e.bytes])]);
  const seen=new Set();let pos=start;
  for(let i=0;i<count;i++) {
    if(pos+46>end || data.getUint32(pos,true)!==0x02014b50) fail('准备ZIP中央目录损坏。');
    const flags=data.getUint16(pos+8,true), method=data.getUint16(pos+10,true), size=data.getUint32(pos+24,true), nameLength=data.getUint16(pos+28,true), extra=data.getUint16(pos+30,true), comment=data.getUint16(pos+32,true), local=data.getUint32(pos+42,true);
    const entryEnd=pos+46+nameLength+extra+comment;if(entryEnd>end) fail('准备ZIP成员目录越界。');
    const name=utf8.decode(bytes.subarray(pos+46,pos+46+nameLength));
    if(flags&1 || ![0,8].includes(method) || seen.has(name) || !expected.has(name) || expected.get(name)!==size || ((data.getUint32(pos+38,true)>>>16)&0xf000)===0xa000) fail('准备ZIP包含重复、额外、加密、链接或大小错误的成员。');
    if(local+30>start || data.getUint32(local,true)!==0x04034b50) fail('准备ZIP本地成员头无效。');
    const localNameLength=data.getUint16(local+26,true), localExtra=data.getUint16(local+28,true), compressed=data.getUint32(pos+20,true);
    if(local+30+localNameLength+localExtra+compressed>start || utf8.decode(bytes.subarray(local+30,local+30+localNameLength))!==name) fail('准备ZIP本地与中央成员身份不一致。');
    seen.add(name);pos=entryEnd;
  }
  if(pos!==end || seen.size!==expected.size) fail('准备ZIP成员范围不一致。');
}

async function sha256(bytes) {
  const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}

export async function verifyPreparationRegistration(registration) {
  validatePreparationRegistration(registration);
  const bytes=Uint8Array.from(atob(registration.archive_base64),c=>c.charCodeAt(0));
  if(bytes.length!==registration.archive.bytes || await sha256(bytes)!==registration.archive.sha256) fail('准备原ZIP的真实SHA256或字节数不匹配。');
  archiveDirectory(bytes,registration);
  let zip;try {zip=await JSZip.loadAsync(bytes,{checkCRC32:true});}catch(error){fail('准备ZIP的CRC或读取核验失败：'+error.message);}
  const manifestBytes=await zip.file(PREPARATION_MANIFEST_MEMBER).async('uint8array');
  if(manifestBytes.length!==registration.manifest_source.bytes || await sha256(manifestBytes)!==registration.manifest_source.sha256) fail('准备原清单字节或SHA256不匹配。');
  const manifest=parseStrictPreparationJson(utf8.decode(manifestBytes));
  if(canonical(manifest)!==canonical(registration.manifest)) fail('准备ZIP原清单与登记完整对象不一致。');
  const fingerprintBytes=new TextEncoder().encode(canonical({builder_sha256:manifest.builder_sha256,entries:manifest.entries},true));
  if(await sha256(fingerprintBytes)!==manifest.source_fingerprint_sha256) fail('准备源件指纹与原清单身份不匹配。');
  const inputs={};
  for(const entry of manifest.entries) {
    const source=await zip.file(entry.archive_path).async('uint8array');
    if(source.length!==entry.bytes || await sha256(source)!==entry.sha256) fail('准备源件真实SHA256或字节数不匹配：'+entry.path);
    const text=utf8.decode(source);inputs[entry.path]=/\.(?:json|geojson)$/.test(entry.path)?parseStrictPreparationJson(text):text;
  }
  validateInputBoundaries(manifest,inputs);
  return {manifest:registration.manifest,inputs};
}

function parseCsv(text) {
  const rows=[];let row=[],cell='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];if(c==='"'){if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===',' && !quoted){row.push(cell);cell='';}
    else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted) fail('准备CSV引号未闭合。');if(cell!==''||row.length){row.push(cell);rows.push(row);}
  const header=rows.shift();if(!header || new Set(header).size!==header.length || header.some(key=>!hasText(key))) fail('准备CSV表头重复或无效。');
  return rows.map(values=>{if(values.length!==header.length) fail('准备CSV行字段数量不一致。');return Object.fromEntries(header.map((key,i)=>[key,values[i]]));});
}

function requireNulls(record,keys,label) {for(const key of keys) requireValue(record?.[key],null,label+key);}
function unique(items,key,label,count) {
  if(!Array.isArray(items) || items.length!==count || items.some(item=>!hasText(item?.[key])) || new Set(items.map(item=>item[key])).size!==count) fail(label+'唯一身份或数量无效。');
}

function validateInputBoundaries(manifest,inputs) {
  const p=PREPARATION_INPUT_PATHS, macro=inputs[p.macro], rows=parseCsv(inputs[p.macroCsv]);
  requireValue(macro.focal_grid_id,SITE,'九格核心');requireValue(macro.crs,'EPSG:32648','九格坐标系');requireValue(macro.input_version,'proxy_v1','九格输入版本');
  unique(rows,'grid_id','九格',9);requireValue(rows.filter(r=>r.proxy_input_accepted==='True').length,8,'九格输入接受数量');
  if(!Array.isArray(macro.field_mapping) || macro.field_mapping.filter(f=>f.kind==='numeric').length!==21 || macro.field_mapping.length!==30) fail('宏观21数值与9适用字段映射缺失。');
  for(const row of rows) {
    requireValue(row.focal_grid_id,SITE,'九格关联');requireValue(row.crs,'EPSG:32648','九格CSV坐标系');
    for(const field of macro.field_mapping.filter(f=>f.kind==='numeric')) if(row[field.field]!=='' && !Number.isFinite(Number(row[field.field]))) fail('九格数值非有限：'+field.field);
  }
  const missing=rows.find(row=>row.grid_id==='E4126_N33890');if(!missing) fail('九格原缺项对象缺失。');
  requireValue(missing.proxy_input_accepted,'False','缺建筑格输入状态');
  for(const key of ['B01','B02','B03','B04','B05','B07','R04','R01','R02','R03']) requireValue(missing[key],'','缺建筑/R值不可填零');
  for(const key of ['R01__state','R02__state','R03__state']) requireValue(missing[key],'source_unknown_no_observed_roof','缺建筑/R适用状态');
  const core=rows.find(row=>row.grid_id===SITE);requireValue(core?.proxy_supervision_accepted,'False','核心温度监督');requireValue(core?.partition,'not_proxy_supervised','核心样本分区');
  requireValue(macro.core_input_status?.all_nine_X_accepted,false,'九格未完整接受');requireValue(macro.core_input_status?.frozen_model_inference_ready,false,'九格不构成推理资格');
  if(!Array.isArray(macro.missing_numeric_details) || macro.missing_numeric_details.length!==24) fail('九格原24个空数值槽位必须保留。');
  for(const detail of macro.missing_numeric_details) {
    if(!rows.some(row=>row.grid_id===detail.grid_id && row[detail.field]==='')) fail('宏观空值详情与原CSV不一致。');
    requireValue(detail.value,null,'宏观缺项值');requireValue(detail.filled_or_imputed,false,'宏观缺项不得填补');
  }
  for(const key of Object.keys(macro.forbidden_data_access || {})) requireValue(macro.forbidden_data_access[key],false,'宏观禁止读取/执行');
  for(const value of Object.values(macro.scientific_outputs || {})) requireValue(value,null,'宏观热/面积/D结果');
  const residence=inputs[p.residences], population=inputs[p.population], candidates=parseCsv(inputs[p.residenceCsv]), review=inputs[p.residenceReview];
  requireValue(residence.type,'FeatureCollection','住宅几何类型');unique(residence.features,'id','住宅源对象',6);unique(candidates,'candidate_object_id','住宅CSV',6);
  requireValue(residence.metadata?.site_id,SITE,'住宅场地');requireValue(residence.metadata?.integration,'not_adapted','原住宅适配');requireValue(residence.metadata?.native_population_values_included,false,'住宅面不带人口数');requireValue(residence.metadata?.population_allocated_or_summed,false,'住宅人口未分配');
  requireValue(residence.metadata?.source_geometry_preserved,true,'住宅完整源几何');requireValue(residence.metadata?.geometry_clipped,false,'住宅不可裁剪');requireValue(residence.metadata?.geometry_simplified,false,'住宅不可简化');
  requireValue(population.site_id,SITE,'人口支持试点');requireValue(population.population_source?.unit,'persons_per_native_pixel','原生人口单位');requireValue(population.population_association?.allocated_to_buildings,false,'人口不分楼');requireValue(population.population_association?.totals_computed,false,'人口不按楼求和');
  requireValue(population.range_counts?.one_ring_300m?.residence_candidates,0,'住宅不交300米范围');
  for(const feature of residence.features) {
    const props=feature.properties, candidate=candidates.find(row=>row.candidate_object_id===feature.id);if(!candidate) fail('住宅几何与CSV源身份不一致。');
    requireValue(props.source_id,feature.id,'住宅源ID');requireValue(props.site_id,SITE,'住宅来源场地');requireValue(props.published_function_label,'Residence','住宅发布标签');requireValue(props.native_population_cell_id,candidate.native_cell_id,'原生人口格关联');requireValue(props.native_population_value_included,false,'住宅面人口省略');
    requireValue(String(props.source_fid),candidate.local_fid,'住宅原FID');requireValue(String(props.source_merged_id),candidate.merged_id_raw,'住宅原合并ID');requireValue(props.source_hash,candidate.source_gpkg_sha256,'住宅来源哈希');
    requireNulls(props,['building_population','public_access','actual_occupancy','service_role','T_P_U','fairness_unit','service_area','source_observation_date'],'住宅未知字段');
    requireValue(candidate.population_unit,'persons_per_native_pixel','CSV人口原生格单位');requireValue(candidate.may_sum_population_by_buildings,'False','CSV人口不得按楼求和');requireValue(candidate.one_ring_300m_positive_area_intersection,'False','住宅300米关系');
    requireValue(candidate.source_function_raw,'Residence','住宅CSV发布标签');requireValue(candidate.unit_status,'candidate_unit_not_adopted','住宅单元未接纳');requireValue(candidate.prep_500m_fully_contained,'True','住宅完整源面500米准备范围');
    if(!Number.isFinite(Number(candidate.native_cell_population_estimate_persons)) || Number(candidate.native_cell_population_estimate_persons)<0) fail('原生人口估计无效。');
    validateResidenceGeometry(feature.geometry);
  }
  requireValue(review.feature_count,6,'住宅几何核查计数');requireValue(review.scientific_status,'unvalidated_candidate_source_geometry','住宅未认证');
  const micro=inputs[p.micro], weather=inputs[p.weather], service=inputs[p.service];
  for(const data of [micro,weather,service]) requireValue(data.site_id,SITE,'微观/候选/服务场地');
  if(!isRecord(micro.unknown_values) || Object.keys(micro.unknown_values).length!==33) fail('微观原33项未知值缺失。');for(const value of Object.values(micro.unknown_values)) requireValue(value,null,'微观接受值保持null');
  requireValue(micro.run_entry?.ready,false,'物理运行入口');requireValue(micro.new_physical_simulations,0,'物理运行次数');requireValue(micro.current_physical_results_from_source?.temperature_improvement_C,null,'微观温差');
  if(!Array.isArray(weather.original_33_field_admission_mapping) || weather.original_33_field_admission_mapping.length!==33) fail('气象地形33字段映射缺失。');
  for(const row of weather.original_33_field_admission_mapping){requireNulls(row,['previous_accepted_value','accepted_value_after_review'],'气象地形候选映射');requireValue(row.filled_as_accepted_physical_input,false,'候选不补物理接受值');}
  requireValue(weather.accepted_physical_fields_filled_count,0,'候选接受数量');requireValue(weather.physical_run_entry_ready_after_candidate_review,false,'候选不构成物理资格');
  if(weather.weather_candidates?.length!==2 || weather.terrain_candidates?.length!==1) fail('气象/地形候选数量不一致。');
  for(const candidate of [...weather.weather_candidates,...weather.terrain_candidates]) requireValue(candidate.project_admission?.accepted,false,'持有输入只是候选');
  const tmy=weather.weather_candidates.find(c=>c.source_id==='tmy_zip'), monthly=weather.weather_candidates.find(c=>c.source_id==='ERA5_202007_zip');
  if(canonical(tmy?.July19_entry?.literal_source_years)!==canonical([2021])) fail('典型年7月源年不是研究日2020天气。');requireValue(tmy.July19_entry.is_2020_07_19_synchronous_observation,false,'非同期天气');requireValue(monthly?.physical_pixels_read,false,'月背景无像元物理求解');
  requireValue(monthly?.time_type,'monthly_aggregated_reanalysis_not_hourly_or_daily','月背景不作为逐小时驱动');
  for(const terrain of weather.terrain_candidates) for(const member of terrain.actual_member_metadata || []) requireValue(member.pixel_values_read,false,'地形未读像元');
  unique(service.source_objects,'object_key','服务受体',6);unique(micro.shared_receptor_objects,'object_key','微观共同受体',6);unique(service.results,'result_id','双分支占位',12);
  for(const object of service.source_objects) {
    const shared=micro.shared_receptor_objects.find(row=>row.object_key===object.object_key);if(!shared || shared.object_id!==object.object_id || shared.coordinates.x_m!==object.coordinates.x_m || shared.coordinates.y_m!==object.coordinates.y_m) fail('服务与微观共同受体身份/坐标不一致。');
    requireValue(object.object_key,object.object_namespace+'/'+object.object_id,'受体资产命名空间身份');requireValue(object.coordinates.crs,'EPSG:32648','受体源坐标系');requireValue(shared.object_namespace,object.object_namespace,'受体共同命名空间');
    requireValue(object.site_id,SITE,'受体来源场地');requireValue(object.source_status?.position_and_height_confirmed,false,'受体尚未确认');requireValue(object.height?.verified_height_m,null,'受体高度未知');
    requireNulls(object.semantic_roles,['resident_original_position','public_destination','internal_or_external_destination'],'受体角色');requireNulls(object.service_evidence,['entrance_id','entrance_required','public_access','path_id','stay_eligible','opening_window','ground_surface_confirmed'],'服务未知字段');
    const results=service.results.filter(row=>row.source_object_key===object.object_key);if(results.length!==2 || new Set(results.map(row=>row.benefit_pathway)).size!==2) fail('受体必须保留两个独立分支。');
  }
  for(const result of service.results) {
    if(!service.source_objects.some(object=>object.object_key===result.source_object_key && object.object_id===result.object_id)) fail('服务结果来源身份无效。');
    requireValue(result.site_id,SITE,'服务结果场地');requireValue(result.value_state,'not_calculated','服务结果仍未计算');
    requireNulls(result,['value','delta','absolute_heat_value','origin_heat_value','destination_heat_value','thermal_comfort_value','travel_time_min','route_length_m','population_count','qualified_stay_min','continuous_stay_requirement_min','total_time_budget_min','origin_object_ref','destination_object_ref','run_id','receptor_height_m'],'服务12项占位');
    requireValue(result.status_axes?.science,'not_assessed','服务原科学状态');requireValue(result.status_axes?.integration,'not_adapted','服务原适配状态');requireValue(result.status_axes?.execution,'not_run','服务原执行状态');
  }
  requireNulls(service,['weights','overall_score','population_summary'],'服务汇总');
}

function validateResidenceGeometry(geometry) {
  if(!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) fail('住宅完整源面几何无效。');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  if(!Array.isArray(polygons) || !polygons.length) fail('住宅完整源面为空。');
  for(const polygon of polygons) {
    if(!Array.isArray(polygon) || !polygon.length) fail('住宅源面环缺失。');
    for(const ring of polygon) {
      if(!Array.isArray(ring) || ring.length<4 || ring.some(c=>!Array.isArray(c)||c.length<2||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90) || canonical(ring[0])!==canonical(ring.at(-1))) fail('住宅源面必须保留闭合WGS84经纬度几何。');
    }
  }
}
