import {protectionConflicts} from './protected-areas.js';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const amount=value=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3}).format(value);

// Numeric checks use the version's own inputs, never the last version's flags.
export function scenarioConstraintCheck(scenario,goalVersion=scenario?.goal_version) {
  if(!scenario)return {status:'incomplete',label:'尚未保存情景',checks:[]};
  const area=scenario.area_m2,unit=scenario.assumed_unit_cost_rmb_per_m2,budget=scenario.budget_rmb;
  const limit=scenario.declared_candidate_area_m2,areaKnown=finite(area)&&area>0,limitKnown=finite(limit)&&limit>=0;
  const cost=finite(area)&&area>0&&finite(unit)&&unit>0?Math.round(area*unit*100)/100:null;
  const checks=[{id:'goal',state:scenario.goal_version==null?'missing':scenario.goal_version===goalVersion?'passed':'failed',
    detail:scenario.goal_version==null?'该历史版本未记录目标版本':scenario.goal_version===goalVersion?`对应目标 v${goalVersion}`:'目标已修改，请保存当前目标下的新情景'},
  {id:'budget',state:cost==null||!finite(budget)||budget<0?'missing':cost<=budget?'passed':'failed',
    detail:cost==null||!finite(budget)||budget<0?'预算或假设单价未填写':cost<=budget?`假设建设费 ${amount(cost)} 元，预算内`:`超预算 ${amount(cost-budget)} 元`},
  {id:'cost',state:cost==null?'missing':scenario.estimated_construction_cost_rmb===cost?'passed':'failed',
    detail:cost==null?'费用待核算':scenario.estimated_construction_cost_rmb===cost?'费用与本版面积、单价一致':'保存费用与本版面积、单价不一致，请重新保存情景'},
  {id:'area',state:limit==null?'not_set':!limitKnown||!areaKnown?'missing':area<=limit?'passed':'failed',
    detail:limit==null?'未设置面积上限':!limitKnown||!areaKnown?'面积条件不完整':area<=limit?'声明面积上限内':`超声明面积 ${amount(area-limit)}㎡`}];
  const conflicts=protectionConflicts(scenario.bounds_utm,scenario.protected_areas);
  checks.push({id:'protection',state:conflicts.length?'failed':scenario.protection_version>0?'passed':'not_set',
    detail:conflicts.length?conflicts.map(c=>`与保留区「${c.label}」重叠 ${c.overlap_m2}㎡`).join('；'):
      scenario.protection_version>0?`用户保留范围 v${scenario.protection_version} 无重叠`:'本版未设置用户保留范围，现场保护条件仍待核查'});
  const status=checks.some(c=>c.state==='failed')?'failed':checks.some(c=>c.state==='missing')?'incomplete':'passed';
  return {status,label:{failed:'存在约束冲突',incomplete:'约束待补齐',passed:scenario.protection_version>0?'已登记约束检查通过':'已知数值约束通过'}[status],checks};
}

export function temperatureResultSummary(result) {
  const delta=result?.predicted_delta_lst_c;
  if(!finite(delta))return '尚无有效温差结果。';
  if(delta===0)return '本次模型预测温差为 0℃，未显示降温。';
  if(Math.abs(delta)<0.001)return '本次模型预测温差小于 0.001℃，仅凭此差异不足以选择方案。';
  return delta<0?`本次覆盖假设下，模型预测升温 ${amount(-delta)}℃，未显示降温。`
    :`本次覆盖假设下，模型预测较凉 ${amount(delta)}℃。`;
}
