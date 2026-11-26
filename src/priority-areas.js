import {currentPilotProtection,protectionConflicts} from './protected-areas.js';

export const currentPilotPriority=session=>session?.pilot_priority_versions?.at(-1)||{version:0,areas:[]};
const validBox=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]<b[2]&&b[1]<b[3];

// Exact area of axis-aligned rectangles in the registered metre CRS. Overlaps count once.
export function priorityCoverage(bounds,areas=[]) {
  if(!validBox(bounds)||areas.some(a=>!validBox(a.bounds_utm)))return null;
  const boxes=areas.map(({bounds_utm:b})=>[Math.max(bounds[0],b[0]),Math.max(bounds[1],b[1]),Math.min(bounds[2],b[2]),Math.min(bounds[3],b[3])]).filter(validBox);
  const xs=[...new Set(boxes.flatMap(b=>[b[0],b[2]]))].sort((a,b)=>a-b);
  let total=0;
  for(let i=1;i<xs.length;i++){
    const ys=boxes.filter(b=>b[0]<xs[i]&&b[2]>xs[i-1]).map(b=>[b[1],b[3]]).sort((a,b)=>a[0]-b[0]);
    let end=-Infinity,height=0;
    for(const [bottom,top] of ys){height+=Math.max(0,top-Math.max(bottom,end));end=Math.max(end,top);}
    total+=(xs[i]-xs[i-1])*height;
  }
  return total;
}

export function priorityComparison(session) {
  const priority=currentPilotPriority(session),protection=currentPilotProtection(session);
  const area=session?.pilot?.temperature_area;
  const sourceValid=priority.version===0?priority.areas.length===0:Boolean(area&&priority.area_sha256===area.sha256&&priority.areas.every(a=>
    a.area_sha256===area.sha256&&validBox(a.bounds_utm)&&a.bounds_utm[0]>=area.bounds_utm[0]&&a.bounds_utm[1]>=area.bounds_utm[1]&&
    a.bounds_utm[2]<=area.bounds_utm[2]&&a.bounds_utm[3]<=area.bounds_utm[3]));
  const total=sourceValid&&area?priorityCoverage(area.bounds_utm,priority.areas):null;
  const current=session?.pilot_temperature_scenarios?.at(-1);
  const candidates=(session?.pilot?.candidates||[]).map(c=>({id:c.id,label:`候选 ${c.id}`,bounds:c.bounds_utm}));
  if(current)candidates.push({id:current.id,label:`当前情景 v${current.version}`,bounds:current.bounds_utm});
  return {priority_version:priority.version,protection_version:protection.version,area_sha256:area?.sha256??null,
    source_valid:sourceValid,total_priority_area_m2:total,
    scope:'current_user_priority_geometric_overlap_not_cooling_or_service_benefit',
    rows:candidates.map(c=>({id:c.id,label:c.label,priority_overlap_m2:sourceValid?priorityCoverage(c.bounds,priority.areas):null,
      protected_conflicts:protectionConflicts(c.bounds,protection.areas)}))};
}

const md=value=>String(value).replaceAll('|','\\|').replace(/[\r\n]/g,' ');
export function priorityMarkdown(session) {
  const priority=currentPilotPriority(session),comparison=priorityComparison(session);
  return ['',`## 用户优先区域 v${priority.version}`,
    '覆盖指当前优先区域与讨论范围的几何相交面积，重叠优先区域只计一次；不代表降温、受益人口或现场可施工性。保留区冲突仍按硬约束处理。',
    ...priority.areas.map(a=>`- ${md(a.label)}：${a.bounds_utm.join(', ')}，EPSG:32648；用户声明，来源 SHA-256 ${a.area_sha256}。`),
    ...(priority.areas.length?[]:['尚未指定优先区域。']),
    ...(!comparison.source_valid?['优先区域来源已变化，覆盖比较不可用。']:[]),
    '| 讨论范围 | 覆盖当前优先区域㎡ | 当前保留区检查 |','| --- | ---: | --- |',
    ...comparison.rows.map(r=>`| ${md(r.label)} | ${r.priority_overlap_m2??'不可用'} | ${r.protected_conflicts.length?'与保留区冲突':'无重叠'} |`)];
}
