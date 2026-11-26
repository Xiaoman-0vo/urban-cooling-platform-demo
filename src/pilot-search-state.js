import {currentPilotProtection} from './protected-areas.js';
import {currentPilotPriority} from './priority-areas.js';
import {candidateEvaluationRow} from './candidate-evaluation-state.js';

export const SEARCH_ALGORITHM='registered-rectangles-1m/1';
export const SEARCH_STRATEGIES={cost:'节约投入',area:'扩大面积',priority:'优先覆盖'};

export function pilotSearchScope(session,area,minimum) {
  return {algorithm:SEARCH_ALGORITHM,site_id:session?.context?.site_id,scenario_id:session?.context?.scenario_id,
    baseline:session?.baseline,area_sha256:area?.sha256,area_bounds:area?.bounds_utm,
    reference_date:area?.reference_date,raster_sha256:area?.raster_sha256,
    goal_version:session?.goal?.version,budget_rmb:session?.goal?.budget_rmb??null,
    unit_cost_rmb_per_m2:session?.goal?.unit_cost_rmb_per_m2??null,area_limit_m2:session?.goal?.candidate_area_m2??null,
    minimum_area_m2:minimum,protection:currentPilotProtection(session),priority:currentPilotPriority(session)};
}

export function pilotSearchIsCurrent(batch,session,area=session?.pilot?.temperature_area) {
  return Boolean(batch&&area&&JSON.stringify(batch.scope)===JSON.stringify(pilotSearchScope(session,area,batch.scope.minimum_area_m2)));
}

export function pilotSearchGeoJson(session) {
  return {type:'FeatureCollection',features:(session?.pilot_searches||[]).flatMap(batch=>batch.candidates.map(c=>({
    type:'Feature',id:c.id,geometry:c.geometry,properties:{search_id:batch.id,candidate_id:c.id,strategies:c.strategies,
      area_m2:c.area_m2,cost_rmb:c.cost_rmb,priority_overlap_m2:c.priority_overlap_m2,
      is_current:batch===session.pilot_searches.at(-1)&&pilotSearchIsCurrent(batch,session),
      goal_version:batch.scope.goal_version,protection_version:batch.scope.protection.version,priority_version:batch.scope.priority.version,
      area_sha256:batch.scope.area_sha256,
      prediction_status:candidateEvaluationRow(batch,c,session.pilot?.temperature_area)?'scenario_estimated':'not_run',
      ...(candidateEvaluationRow(batch,c,session.pilot?.temperature_area)?{
        candidate_evaluation_id:batch.evaluations.at(-1).id,
        predicted_delta_lst_c:candidateEvaluationRow(batch,c,session.pilot.temperature_area).row.result.predicted_delta_lst_c}:{}),
      }})))};
}

export function pilotSearchMarkdown(session) {
  const batches=session?.pilot_searches||[];
  if(!batches.length)return [];
  return ['', '## 按约束生成的空间候选',
    '在已登记试算区内穷举 1 米整点、轴对齐的单矩形。费用按声明单价核算；优先覆盖为几何相交面积。此搜索不评价降温、权属或可施工性，温度需另行手动评价。',
    ...batches.flatMap((batch,index)=>[
      `搜索 ${index+1}：${batch.id}；${batch===batches.at(-1)&&pilotSearchIsCurrent(batch,session)?'当前条件':'历史条件'}。目标 v${batch.scope.goal_version}、保留 v${batch.scope.protection.version}、优先 v${batch.scope.priority.version}；最低面积 ${batch.scope.minimum_area_m2}㎡。`,
      `检查 ${batch.scanned_count} 个矩形，通过 ${batch.feasible_count} 个。来源 ${batch.scope.area_sha256}；算法 ${batch.scope.algorithm}。`,
      ...batch.notes.map(note=>`- ${note}`),
      '| 候选取向 | 面积㎡ | 假设费用元 | 优先覆盖㎡ | 米制范围 |','| --- | ---: | ---: | ---: | --- |',
      ...batch.candidates.map(c=>`| ${c.strategies.map(s=>SEARCH_STRATEGIES[s]).join(' / ')} | ${c.area_m2} | ${c.cost_rmb} | ${c.priority_overlap_m2} | ${c.bounds_utm.join(', ')} |`),
    ])];
}
