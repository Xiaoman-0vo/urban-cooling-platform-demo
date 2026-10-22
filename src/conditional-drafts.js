import {canonicalSupplement} from './supplement-state.js';
const copy = value => structuredClone(value);
const fail = text => {throw new Error('情景草稿：'+text);};
export const DRAFT_MODES=['uniform_open_walkable_surface','documented_access_conditions'];
export const ADOPTED_UNKNOWN=Object.freeze({walkable_geometry:null,connectivity:null,zone_geometry:null,gate_bindings:null,opening_schedule:null,temperature_raster:null,service_area:null});
const textFields=['evaluation_time','origin_definition','analysis_unit','destination_temperature_rule','destination_support','temperature_variable','area_eligibility_rule','crossing_policy_description','width_assumption_explanation'];
export function createConditionalDraft(mode,site,definitionView,now=new Date().toISOString(),id=crypto.randomUUID()) {
  const definition=definitionView?.definition;
  if(!DRAFT_MODES.includes(mode)||!definition)fail('先接纳产品情景定义来源。');
  return {schema_version:'0.1.conditional-draft',draft_id:id,mode_id:mode,version:1,created_at:now,updated_at:now,site_id:site,
    definition_registration_id:definitionView.registration.registration_id,evaluation_timezone:'Asia/Shanghai',
    ...Object.fromEntries(textFields.map(k=>[k,null])),width_assumption_m:null,source_references:[],
    mode_definition:copy(definition.modes.find(m=>m.mode_id===mode)),scientific_outputs:copy(definition.scientific_outputs),adopted:copy(ADOPTED_UNKNOWN)};
}
export function editConditionalDraft(draft,changes,now=new Date().toISOString()) {
  if(Object.keys(changes).some(k=>![...textFields,'width_assumption_m','source_references'].includes(k)))fail('不能通过编辑草稿采用研究输入或改写身份。');
  return {...draft,...changes,version:draft.version+1,updated_at:now};
}
/** Complete registration/file identities; labels and short OSM IDs never bind sources. */
export function draftSourceChoices(registrations) {
  return registrations.flatMap(r=>(r.source_group?.files||r.source_group?.source_files||r.manifest?.files||r.manifest?.entries||[]).filter(f=>!String(f.role).includes('history')).map(f=>({registration_id:r.registration_id,group_id:r.group_id||'preparation',path:f.path,sha256:f.sha256})));
}
export function validateConditionalDrafts(drafts=[],sources=[],views=null,otherRegistrations=[]) {
  if(!Array.isArray(drafts)||drafts.length>2)fail('两个独立草稿必须为列表。');
  const modes=new Set(),ids=new Set(),choices=draftSourceChoices([...sources,...otherRegistrations]);
  const definitionId=sources.find(r=>r.group_id==='conditional_walk_scenario_definition')?.registration_id;
  const definition=views?.conditional_walk_scenario_definition?.definition;
  for(const d of drafts){
    if(!DRAFT_MODES.includes(d?.mode_id)||modes.has(d.mode_id)||typeof d.draft_id!=='string'||!d.draft_id||ids.has(d.draft_id))fail('草稿身份重复或缺失。');modes.add(d.mode_id);ids.add(d.draft_id);
    if(d.schema_version!=='0.1.conditional-draft'||d.definition_registration_id!==definitionId||!Number.isInteger(d.version)||d.version<1||typeof d.site_id!=='string'||!d.site_id||d.evaluation_timezone!=='Asia/Shanghai')fail('草稿版本、场地或来源身份无效。');
    if(![d.created_at,d.updated_at].every(t=>typeof t==='string'&&Number.isFinite(Date.parse(t)))||Date.parse(d.updated_at)<Date.parse(d.created_at))fail('创建和修改时点无效。');
    const allowed=['schema_version','draft_id','mode_id','version','created_at','updated_at','site_id','definition_registration_id','evaluation_timezone',...textFields,'width_assumption_m','source_references','mode_definition','scientific_outputs','adopted'];
    if(canonicalSupplement(Object.keys(d).sort())!==canonicalSupplement(allowed.sort()))fail('未知草稿字段不能作为已采用值保存。');
    for(const k of textFields)if(d[k]!==null&&(typeof d[k]!=='string'||d[k].length>10000))fail('草稿说明须为文本或未知空值。');
    if(d.evaluation_time&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.evaluation_time)||!Number.isFinite(Date.parse(d.evaluation_time+'+08:00'))))fail('评价时间格式无效。');
    if(d.width_assumption_m!==null&&(!Number.isFinite(d.width_assumption_m)||d.width_assumption_m<=0||!d.width_assumption_explanation?.trim()||d.mode_id!==DRAFT_MODES[0]))fail('宽度假设须有说明且仅属于统一开放草稿。');
    if(canonicalSupplement(d.adopted)!==canonicalSupplement(ADOPTED_UNKNOWN)||!d.scientific_outputs||Object.values(d.scientific_outputs).some(v=>v!==null))fail('草稿不能产生路线、温度、面积、门绑定或科学结果。');
    if(definition&&(canonicalSupplement(d.mode_definition)!==canonicalSupplement(definition.modes.find(m=>m.mode_id===d.mode_id))||canonicalSupplement(d.scientific_outputs)!==canonicalSupplement(definition.scientific_outputs)))fail('情景原定义或结果空槽已改变。');
    if(!Array.isArray(d.source_references)||d.source_references.length>100)fail('来源引用列表无效。');
    const keys=new Set();for(const ref of d.source_references){
      const allowedRef=['registration_id','group_id','path','sha256','purpose','object_key'];
      if(canonicalSupplement(Object.keys(ref).sort())!==canonicalSupplement(allowedRef.sort())||typeof ref.purpose!=='string'||!ref.purpose.trim())fail('来源引用必须有完整身份及用途。');
      if(!choices.some(c=>['registration_id','group_id','path','sha256'].every(k=>ref[k]===c[k])))fail('来源引用没有对应的完整登记原件。');
      if(ref.object_key!==null){const park=views?.park_access_evidence?.park;const expected=park?.existing_OSM_candidate.source_object_key||'OSM2021@sha256:d83436cd414db196d164fc35990910d6369347c6c47192ed6d79ffcfb2335f78/way/116486191';if(ref.object_key!==expected||ref.group_id!=='park_access_evidence')fail('公园候选仅支持原完整对象键，不能绑定门、受体或别的对象。');}
      const key=canonicalSupplement(ref);if(keys.has(key))fail('重复来源引用。');keys.add(key);
    }
  }return drafts;
}
export function eventReviewStatus(draft,claim) {
  if(!draft?.evaluation_time)return '未填写评价时间；事件未采用';
  if(!claim.event_start_local)return '生效时点未知；公告日期不等于生效日期';
  const date=draft.evaluation_time.slice(0,10),start=claim.event_start_local;
  if(date<start.slice(0,10)||start.includes('T')&&Date.parse(draft.evaluation_time+'+08:00')<Date.parse(start))return '评价早于该事件；不可套用';
  if(!claim.event_end_local)return '结束时点未知；不能认作无限期有效';
  return '分区与通行链待核；事件未自动采用';
}
