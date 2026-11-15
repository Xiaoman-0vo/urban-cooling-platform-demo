import {AgentError} from './agent-tools.mjs';

const labels={
  budget_rmb:['预算','元'],
  candidate_area_m2:['候选面积上限','平方米'],
  unit_cost_rmb_per_m2:['建设单价','元/平方米'],
};
const decimal=new Intl.NumberFormat('en-US',{useGrouping:false,maximumFractionDigits:15});

export function localPlanningAction(action) {
  if(action?.type==='export')return {type:'export',text:'导出当前及旧版的规划讨论记录。'};
  const fields=action?.fields;
  if(action?.type!=='compare'||!fields||typeof fields!=='object'||Array.isArray(fields))
    throw new AgentError('invalid_planning_action','请通过落图试点的表单提交讨论条件。');
  const entries=Object.entries(fields);
  if(!entries.length||entries.some(([key,value])=>!Object.hasOwn(labels,key)||!Number.isFinite(value)||value<0||value>1e10))
    throw new AgentError('invalid_planning_action','预算、面积和单价应填写有效数值。');
  const quote=entries.map(([key,value])=>{
    const [label,unit]=labels[key];
    return `${label}${decimal.format(value)}${unit}`;
  }).join('，');
  return {type:'compare',text:`按讨论条件比较 A、B。\n${quote}。`,args:{...fields,evidence_quote:quote}};
}
