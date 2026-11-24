import {randomUUID} from 'node:crypto';
import {AgentError} from './agent-tools.mjs';
import {pilotBoxGeometry,pilotBoxWithin} from '../src/pilot-map.js';
import {currentPilotPriority,priorityComparison} from '../src/priority-areas.js';

export const UPDATE_PILOT_PRIORITY='update_pilot_priority';

export function updatePilotPriority(session,area,args) {
  const current=currentPilotPriority(session);
  if(args.expected_priority_version!==current.version)
    throw new AgentError('stale_priority_version','优先区域已变化，请重新读取后再修改。',409);
  if(!area||session.pilot?.temperature_area?.sha256!==area.sha256||args.expected_area_sha256!==area.sha256||!priorityComparison(session).source_valid)
    throw new AgentError('priority_source_changed','优先区域与当前试算资料不一致，请重新核对。',409);
  let areas=structuredClone(current.areas),change;
  if(args.operation==='add'){
    const label=typeof args.label==='string'?args.label.trim():'';
    if(!label||label.length>80||/[\p{Cc}\p{Cf}]/u.test(label)||!pilotBoxWithin(args.bounds_utm,area.bounds_utm))
      throw new AgentError('invalid_priority_area','请填写优先原因，并在已登记试算范围内选择有效矩形。');
    if(areas.some(a=>a.label===label&&a.bounds_utm.every((v,i)=>v===args.bounds_utm[i])))
      return {status:'priority_reused',priority:structuredClone(current),comparison:priorityComparison(session)};
    if(areas.length>=20)throw new AgentError('too_many_priority_areas','当前试点最多保存 20 块优先区域。');
    const item={id:randomUUID(),label,bounds_utm:[...args.bounds_utm],geometry:pilotBoxGeometry(args.bounds_utm),
      measurement_crs:area.measurement_crs,area_sha256:area.sha256,source:'user_declared_priority_area'};
    areas.push(item);change={operation:'add',area_id:item.id,label};
  }else if(args.operation==='remove'){
    const item=areas.find(a=>a.id===args.area_id);
    if(!item)throw new AgentError('priority_area_not_found','当前版本没有这块优先区域。',404);
    areas=areas.filter(a=>a.id!==item.id);change={operation:'remove',area_id:item.id,label:item.label};
  }else throw new AgentError('invalid_priority_operation','请选择添加或移除优先区域。');
  const priority={version:current.version+1,areas,area_sha256:area.sha256,created_at:new Date().toISOString(),previous_version:current.version,change};
  (session.pilot_priority_versions??=[]).push(priority);session.revision++;
  return {status:'priority_updated',priority:structuredClone(priority),comparison:priorityComparison(session)};
}
