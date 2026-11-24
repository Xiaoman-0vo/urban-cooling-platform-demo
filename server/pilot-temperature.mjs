import {randomUUID} from 'node:crypto';
import {pilotBoxGeometry,pilotBoxWithin} from '../src/pilot-map.js';
import {AgentError} from './agent-tools.mjs';
import {scenarioConstraintCheck,temperatureResultSummary} from '../src/scenario-checks.js';
import {currentPilotProtection,protectionConflicts,protectionMatchesArea} from '../src/protected-areas.js';

export const SAVE_PILOT_TEMPERATURE='save_pilot_temperature_scenario';
export const EVALUATE_PILOT_TEMPERATURE='evaluate_pilot_temperature_scenario';
export const RESTORE_PILOT_TEMPERATURE='restore_pilot_temperature_scenario';
const ASSUMPTION='假设所选不透水地面可替换为树木／灌木覆盖。建筑高度资料缺失，现场及权属待核。';

function planningCosts(goal,area) {
  const {budget_rmb:budget=null,unit_cost_rmb_per_m2:unitCost=null,candidate_area_m2:limit=null}=goal;
  const amount=unitCost==null?null:Math.round(area*unitCost*100)/100;
  return {
    goal_version:goal.version, budget_rmb:budget, assumed_unit_cost_rmb_per_m2:unitCost,
    declared_candidate_area_m2:limit, estimated_construction_cost_rmb:amount,
    budget_check_passed:budget==null||amount==null?null:amount<=budget,
    capacity_check_passed:limit==null?null:area<=limit,
    assumption_evidence:structuredClone(goal.assumptions),
  };
}

export function savePilotTemperature(session,area,bounds,{change,forceNew=false,allowConflict=false}={}) {
  if(!area||!pilotBoxWithin(bounds,area.bounds_utm))
    throw new AgentError('invalid_temperature_area','请选择完全位于 B 试算范围内、面积大于零的矩形。');
  const protection=currentPilotProtection(session);
  if(!protectionMatchesArea(protection,area))throw new AgentError('protection_source_changed','保留范围引用旧资料，请重新核对。',409);
  const conflicts=protectionConflicts(bounds,protection.areas);
  if(conflicts.length&&!allowConflict)
    throw new AgentError('protected_area_conflict',`改造范围与保留区「${conflicts.map(c=>c.label).join('、')}」重叠，请重新框选。`,409);
  const scenarios=session.pilot_temperature_scenarios??=[];
  const previous=scenarios.at(-1);
  if(!forceNew&&previous?.area_sha256===area.sha256&&previous.goal_version===session.goal.version&&(previous.protection_version??0)===protection.version&&
     bounds.every((value,index)=>value===previous.bounds_utm[index]))
    return {status:'temperature_scenario_reused',scenario:structuredClone(previous)};
  const [left,bottom,right,top]=bounds;
  const areaM2=(right-left)*(top-bottom);
  const scenario={
    id:randomUUID(), version:(previous?.version??0)+1, grid_id:session.context.site_id,
    candidate_id:area.candidate_id, reference_date:area.reference_date, scene_id:area.scene_id,
    bounds_utm:[...bounds], measurement_crs:area.measurement_crs, geometry:pilotBoxGeometry(bounds),
    area_m2:areaM2, ...planningCosts(session.goal,areaM2),
    area_id:area.id, area_source:area.path, area_sha256:area.sha256,
    source_cover_class:area.source_cover_class, scenario_cover_class:area.scenario_cover_class,
    raster_sha256:structuredClone(area.raster_sha256), assumption:ASSUMPTION,
    created_at:new Date().toISOString(), result:null,
    protection_version:protection.version,protected_areas:structuredClone(protection.areas),
    change:{type:'map_edit',source_scenario_id:null,...change,previous_scenario_id:previous?.id??null},
  };
  scenarios.push(scenario);
  session.revision++;
  return {status:'temperature_scenario_saved',scenario:structuredClone(scenario)};
}

export function applyGoalToPilotTemperature(session,area) {
  const previous=session.pilot_temperature_scenarios?.at(-1);
  if(!area||previous?.area_sha256!==area.sha256||!pilotBoxWithin(previous.bounds_utm,area.bounds_utm))return null;
  return savePilotTemperature(session,area,previous.bounds_utm,{allowConflict:true,change:{type:'goal_revision',source_scenario_id:previous.id}}).scenario;
}

export function restorePilotTemperature(session,area,id,expectedCurrentId) {
  const scenarios=session.pilot_temperature_scenarios||[],current=scenarios.at(-1);
  if(!current||current.id!==expectedCurrentId)
    throw new AgentError('stale_temperature_scenario','当前版本已变化，请重新读取后再恢复旧范围。',409);
  const source=scenarios.find(s=>s.id===id);
  if(!source)throw new AgentError('temperature_scenario_not_found','当前会话没有这个温度情景。',404);
  if(source===current)throw new AgentError('temperature_scenario_already_current','这已经是当前范围。');
  if(!area||source.area_sha256!==area.sha256||source.grid_id!==session.context.site_id||
    source.reference_date!==area.reference_date||source.scene_id!==area.scene_id||
    source.source_cover_class!==area.source_cover_class||source.scenario_cover_class!==area.scenario_cover_class||
    Object.keys(source.raster_sha256||{}).length!==Object.keys(area.raster_sha256).length||
    Object.entries(area.raster_sha256).some(([key,value])=>source.raster_sha256?.[key]!==value)||
    !pilotBoxWithin(source.bounds_utm,area.bounds_utm))
    throw new AgentError('temperature_area_changed','旧范围与当前登记资料不一致，请重新框选。',409);
  if(current.change?.type==='restore'&&current.change.source_scenario_id===id&&current.goal_version===session.goal.version)
    return {status:'temperature_scenario_reused',scenario:structuredClone(current)};
  return savePilotTemperature(session,area,source.bounds_utm,{forceNew:true,change:{type:'restore',source_scenario_id:source.id}});
}

export async function evaluatePilotTemperature(session,area,id,estimator,{runId,signal}) {
  const scenario=session.pilot_temperature_scenarios?.at(-1);
  if(!scenario||scenario.id!==id)
    throw new AgentError('stale_temperature_scenario','请对当前温度情景运行试算。旧版本结果可继续查看。',409);
  if(scenario.area_sha256!==area?.sha256)
    throw new AgentError('temperature_area_changed','试算范围的资料已更新，请在地图上重新选择。',409);
  const protection=currentPilotProtection(session);
  if(!protectionMatchesArea(protection,area))throw new AgentError('protection_source_changed','保留范围引用旧资料，请重新核对。',409);
  if((scenario.protection_version??0)!==protection.version)
    throw new AgentError('stale_protection_version','保留范围已修改，请先保存当前约束下的新情景。',409);
  const conflicts=protectionConflicts(scenario.bounds_utm,protection.areas);
  if(conflicts.length)throw new AgentError('protected_area_conflict',`与保留区「${conflicts.map(c=>c.label).join('、')}」重叠，不能运行评价。`,409);
  if(scenario.result)return {status:'temperature_scenario_result_reused',scenario:structuredClone(scenario)};
  if(!estimator?.evaluatePilot)
    throw new AgentError('pilot_temperature_unavailable','请先配置本地 V3 模型数据和 Python，再运行地表温度试算。',503);
  const result=await estimator.evaluatePilot({
    grid_id:scenario.grid_id, date:scenario.reference_date, scene_id:scenario.scene_id,
    bounds_utm:scenario.bounds_utm, area_m2:scenario.area_m2, area_sha256:scenario.area_sha256,
  },{signal});
  signal?.throwIfAborted();
  scenario.result={...result,run_id:runId,completed_at:new Date().toISOString()};
  session.revision++;
  return {status:'temperature_scenario_result_saved',scenario:structuredClone(scenario)};
}

function reportCosts(scenario) {
  const {goal_version:goalVersion,budget_rmb:budget,assumed_unit_cost_rmb_per_m2:unitCost,
  declared_candidate_area_m2:limit,estimated_construction_cost_rmb:amount,assumption_evidence:evidence}=scenario;
  if(goalVersion==null)return ['- 该历史版本未记录对应的预算和单价。'];
  const money=value=>value==null?'待填写':`${value} 元`;
  const inputLabels={budget_rmb:'预算',unit_cost_rmb_per_m2:'假设建设单价',candidate_area_m2:'面积上限'};
  return [
    `- 目标 v${goalVersion}。预算 ${money(budget)}，假设建设费 ${money(amount)}，单价 ${unitCost==null?'待填写':`${unitCost} 元/㎡`}，面积上限 ${limit==null?'未设定':`${limit}㎡`}。`,
    `- ${scenarioConstraintCheck(scenario).checks.filter(c=>['budget','area'].includes(c.id)).map(c=>c.detail).join('；')}。`,
    ...Object.entries(inputLabels).filter(([key])=>evidence?.[key]).map(([key,label])=>`- ${label}依据 ${evidence[key].evidence_quote}`),
  ];
}

export function pilotTemperatureReport(scenarios) {
  if(!scenarios?.length)return [];
  return ['', '## 成都地表温度情景试算',
    '两个预测使用同一时相、同一批参考格和同一版本的模型。温差使用舍入前的模型基线减去情景预测，正值表示模型预测较凉。',
    ...scenarios.flatMap((scenario,index)=>{
      const {version,id,area_m2,bounds_utm,measurement_crs,area_source,area_sha256,reference_date,assumption,raster_sha256,result}=scenario;
      const constraintCheck=scenarioConstraintCheck(scenario);
      return [
        '', `### 温度情景 v${version}（${index===scenarios.length-1?'当前版':'旧版'}）`,
        `- 版本 ID ${id}。面积 ${area_m2}㎡，矩形 ${bounds_utm.join(', ')}（${measurement_crs}）。参考日期 ${reference_date}。`,
        ...reportCosts(scenario),
        `- 用户保留范围版本 ${scenario.protection_version??'历史未登记'}；${scenario.protected_areas?.length?scenario.protected_areas.map(a=>`${a.label}（${a.id}）`).join('、'):'本版未设置用户保留区，不表示已完成现场保护条件核查'}。`,
        `- 数值约束：${constraintCheck.label}；${constraintCheck.checks.map(c=>c.detail).join('；')}。现场及可施工性仍待核。`,
        ...(scenario.change?[`- 修改类型 ${scenario.change.type}；来源情景 ${scenario.change.source_scenario_id||'地图新建'}；前一情景 ${scenario.change.previous_scenario_id||'无'}。恢复范围使用当前目标重新核价，不沿用旧预测。`]:['- 该历史版本未记录修改来源。']),
        `- ${assumption}`,
        `- 试算范围来源 ${area_source} · SHA-256 ${area_sha256}`,
        ...Object.entries(raster_sha256).map(([path,sha])=>`- 源栅格 ${path} · SHA-256 ${sha}`),
        ...(result?[
          `- ${temperatureResultSummary(result)} 模型响应不等于实际改造效果；不确定性及实际效果仍待验证。`,
          `- Landsat 观测 ${result.observed_lst_c.toFixed(3)}℃。模型基线 ${result.baseline_lst_c.toFixed(3)}℃，情景预测 ${result.scenario_lst_c.toFixed(3)}℃，预测温差 ${result.predicted_delta_lst_c.toFixed(3)}℃。`,
          `- ${result.scene_id} · ${result.observed_utc} · 同日参考格 ${result.reference_grid_count} 个。`,
          `- ${result.model_version} · 模型 SHA-256 ${result.model_sha256} · 数据 SHA-256 ${result.dataset_sha256}。`,
          `- 运行 ID ${result.run_id} · ${result.completed_at}。`,
          `- 格网中心特征依次为 ${result.compiled_features.order.join('、')}。基线 [${result.compiled_features.baseline_center.join(', ')}]，情景 [${result.compiled_features.scenario_center.join(', ')}]。邻域均值固定为 [${result.compiled_features.neighbor_mean.join(', ')}]。`,
        ]:['- 该版本尚未运行温度试算。']),
      ];
    }),
    '', '情景值用于比较指定覆盖假设下的模型响应。实际改造效果仍待独立验证。',
  ];
}
