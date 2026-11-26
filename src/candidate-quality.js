import {pilotSearchIsCurrent} from './pilot-search-state.js';
import {protectionConflicts} from './protected-areas.js';
import {temperatureResultSummary} from './scenario-checks.js';
import {candidateEvaluationRow} from './candidate-evaluation-state.js';

const finite=Number.isFinite;
const percent=(part,total)=>finite(part)&&finite(total)&&total>0?part/total*100:null;
export function candidateQuality(candidate,batch,session,area){
  const scope=batch.scope,b=candidate.bounds_utm;
  const areaM2=(b[2]-b[0])*(b[3]-b[1]);
  const cost=Math.round(areaM2*scope.unit_cost_rmb_per_m2*100)/100;
  const registeredArea=(area.bounds_utm[2]-area.bounds_utm[0])*(area.bounds_utm[3]-area.bounds_utm[1]);
  const fresh=pilotSearchIsCurrent(batch,session,area);
  const conflicts=protectionConflicts(b,scope.protection.areas);
  const within=b[0]>=area.bounds_utm[0]&&b[1]>=area.bounds_utm[1]&&b[2]<=area.bounds_utm[2]&&b[3]<=area.bounds_utm[3];
  const valid=finite(areaM2)&&areaM2>0&&within&&areaM2===candidate.area_m2&&areaM2>=scope.minimum_area_m2&&
    (scope.area_limit_m2==null||areaM2<=scope.area_limit_m2)&&cost===candidate.cost_rmb&&cost<=scope.budget_rmb&&conflicts.length===0;
  const scenario=(session.pilot_temperature_scenarios||[]).findLast(s=>s.change?.search_id===batch.id&&s.change.candidate_id===candidate.id&&
    s.goal_version===scope.goal_version&&s.area_sha256===area.sha256&&s.bounds_utm.every((n,i)=>n===b[i])&&s.result);
  const evaluated=candidateEvaluationRow(batch,candidate,area),assessment=batch.evaluations?.at(-1);
  const r=assessment?evaluated?.row.result:scenario?.result;
  const temperature=r&&['baseline_lst_c','scenario_lst_c','predicted_delta_lst_c'].every(k=>finite(r[k]))?r:null;
  return {fresh,valid,remainingBudget:scope.budget_rmb-cost,budgetShare:percent(cost,scope.budget_rmb),
    registeredAreaShare:percent(areaM2,registeredArea),protectionSet:scope.protection.areas.length>0,
    prioritySet:scope.priority.areas.length>0,temperature,temperatureVersion:temperature&&!assessment?scenario.version:null,
    evaluationId:evaluated?.evaluation.id??null,evaluationStatus:assessment?.results.find(row=>row.candidate_id===candidate.id)?.status??null,
    temperatureSummary:temperature?temperatureResultSummary(temperature):'尚未评价，不能按降温效果排序。',
    status:!fresh?'历史条件，仅供回看':valid?'满足本轮登记条件':'候选数值或范围需核对'};
}
