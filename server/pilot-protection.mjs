import {randomUUID} from 'node:crypto';
import {AgentError} from './agent-tools.mjs';
import {pilotBoxWithin,pilotBoxGeometry} from '../src/pilot-map.js';
import {currentPilotProtection,protectionMatchesArea} from '../src/protected-areas.js';
import {savePilotTemperature} from './pilot-temperature.mjs';

export const UPDATE_PILOT_PROTECTION='update_pilot_protection';

export function updatePilotProtection(session,area,args) {
  const current=currentPilotProtection(session),scenario=session.pilot_temperature_scenarios?.at(-1);
  if(args.expected_protection_version!==current.version||args.expected_current_scenario_id!==(scenario?.id??null))
    throw new AgentError('stale_protection_version','情景或保留范围已变化，请重新读取后再修改。',409);
  if(!area||scenario&&(scenario.area_sha256!==area.sha256||!pilotBoxWithin(scenario.bounds_utm,area.bounds_utm)))
    throw new AgentError('temperature_area_changed','当前情景与登记范围不一致，请先重新框选。',409);
  if(!protectionMatchesArea(current,area))throw new AgentError('protection_source_changed','保留范围引用旧资料，请重新核对。',409);
  let areas=structuredClone(current.areas),change;
  if(args.operation==='add'){
    const label=typeof args.label==='string'?args.label.trim():'';
    if(!label||label.length>80||/\p{Cc}/u.test(label)||!pilotBoxWithin(args.bounds_utm,area.bounds_utm))
      throw new AgentError('invalid_protected_area','请填写保留用途，并在已登记试算范围内选择有效矩形。');
    if(areas.length>=20)throw new AgentError('too_many_protected_areas','当前试点最多保存 20 块保留范围。');
    const duplicate=areas.find(a=>a.label===label&&a.bounds_utm.every((value,i)=>value===args.bounds_utm[i]));
    if(duplicate)return {status:'protection_reused',protection:structuredClone(current),scenario:structuredClone(scenario??null)};
    const item={id:randomUUID(),label,bounds_utm:[...args.bounds_utm],geometry:pilotBoxGeometry(args.bounds_utm),
      measurement_crs:area.measurement_crs,area_sha256:area.sha256,source:'user_declared_keep_area'};
    areas.push(item);change={operation:'add',area_id:item.id,label};
  }else if(args.operation==='remove'){
    const item=areas.find(a=>a.id===args.area_id);
    if(!item)throw new AgentError('protected_area_not_found','当前版本没有这块保留范围。',404);
    areas=areas.filter(a=>a.id!==item.id);change={operation:'remove',area_id:item.id,label:item.label};
  }else throw new AgentError('invalid_protection_operation','请选择添加或解除保留约束。');
  const protection={version:current.version+1,areas,area_sha256:area.sha256,created_at:new Date().toISOString(),
    previous_version:current.version,change};
  (session.pilot_protection_versions??=[]).push(protection);
  let revised=null;
  if(scenario)revised=savePilotTemperature(session,area,scenario.bounds_utm,{forceNew:true,allowConflict:true,
    change:{type:'protection_revision',source_scenario_id:scenario.id}}).scenario;
  else session.revision++;
  return {status:'protection_updated',protection:structuredClone(protection),scenario:revised};
}
