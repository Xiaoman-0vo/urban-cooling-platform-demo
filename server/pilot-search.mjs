import {randomUUID} from 'node:crypto';
import {AgentError} from './agent-tools.mjs';
import {pilotBoxWithin,pilotBoxGeometry} from '../src/pilot-map.js';
import {currentPilotProtection,protectionConflicts,protectionMatchesArea} from '../src/protected-areas.js';
import {currentPilotPriority,priorityCoverage,priorityComparison} from '../src/priority-areas.js';
import {pilotSearchScope,pilotSearchIsCurrent} from '../src/pilot-search-state.js';
import {savePilotTemperature} from './pilot-temperature.mjs';
import {candidateEvaluationRow} from '../src/candidate-evaluation-state.js';

export const GENERATE_PILOT_CANDIDATES='generate_pilot_spatial_candidates';
export const ADOPT_PILOT_CANDIDATE='adopt_pilot_spatial_candidate';
const money=(area,unit)=>Math.round(area*unit*100)/100;

function validateSource(session,area) {
  if(!area||session.pilot?.temperature_area?.sha256!==area.sha256||
    !pilotBoxWithin(area.bounds_utm,area.bounds_utm)||area.measurement_crs!=='EPSG:32648')
    throw new AgentError('search_source_changed','试算范围与当前资料不一致，请重新载入场地。',409);
  if(!protectionMatchesArea(currentPilotProtection(session),area)||!priorityComparison(session).source_valid)
    throw new AgentError('search_source_changed','保留或优先区域引用旧资料，请先核对。',409);
}

function validateGoals(goal) {
  if(!Number.isFinite(goal.budget_rmb)||goal.budget_rmb<0||!Number.isFinite(goal.unit_cost_rmb_per_m2)||goal.unit_cost_rmb_per_m2<=0||
    (goal.candidate_area_m2!=null&&(!Number.isFinite(goal.candidate_area_m2)||goal.candidate_area_m2<0)))
    throw new AgentError('search_needs_inputs','请先登记有效预算和大于零的假设建设单价。');
}

// Compare explicit objectives, then prefer compact rectangles and a stable coordinate order.
function better(a,b,strategy) {
  if(!b)return true;
  const score=c=>strategy==='cost'?[c.cost_rmb,-c.priority_overlap_m2,c.perimeter_m]:
    strategy==='priority'?[-c.priority_overlap_m2,c.cost_rmb,c.perimeter_m]:[-c.area_m2,-c.priority_overlap_m2,c.perimeter_m];
  const aa=[...score(a),...a.bounds_utm],bb=[...score(b),...b.bounds_utm];
  for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])return aa[i]<bb[i];
  return false;
}

export function generatePilotCandidates(session,area,{minimum_area_m2:minimum,expected_area_sha256:expected}) {
  validateSource(session,area);validateGoals(session.goal);
  if(expected!==area.sha256)throw new AgentError('search_source_changed','试算资料已变化，请重新读取。',409);
  if(!Number.isSafeInteger(minimum)||minimum<1||minimum>1e6)
    throw new AgentError('invalid_search_target','最低改造面积应为大于零的整数平方米。');
  const [left,bottom,right,top]=area.bounds_utm,w=right-left,h=top-bottom;
  const count=w*(w+1)*h*(h+1)/4;
  if(count>20000)throw new AgentError('search_scope_too_large','当前范围超出本次有限搜索支持，请使用地图编辑。');
  const scope=structuredClone(pilotSearchScope(session,area,minimum));
  const previous=session.pilot_searches?.at(-1);
  if(previous&&JSON.stringify(previous.scope)===JSON.stringify(scope))return {status:previous.feasible_count?'spatial_candidates_reused':'no_feasible_candidates',batch:structuredClone(previous)};
  const protection=currentPilotProtection(session),priority=currentPilotPriority(session);
  const strategies=priority.areas.length?['cost','area','priority']:['cost','area'];
  const best={},rejected={minimum_area:0,area_limit:0,budget:0,protection:0};let feasible=0;
  for(let x=left;x<right;x++)for(let X=x+1;X<=right;X++)for(let y=bottom;y<top;y++)for(let Y=y+1;Y<=top;Y++){
    const areaM2=(X-x)*(Y-y),cost=money(areaM2,session.goal.unit_cost_rmb_per_m2),bounds=[x,y,X,Y];
    if(areaM2<minimum){rejected.minimum_area++;continue;}
    if(session.goal.candidate_area_m2!=null&&areaM2>session.goal.candidate_area_m2){rejected.area_limit++;continue;}
    if(cost>session.goal.budget_rmb){rejected.budget++;continue;}
    if(protectionConflicts(bounds,protection.areas).length){rejected.protection++;continue;}
    feasible++;
    const c={bounds_utm:bounds,area_m2:areaM2,cost_rmb:cost,priority_overlap_m2:priorityCoverage(bounds,priority.areas),perimeter_m:2*(X-x+Y-y)};
    for(const strategy of strategies)if(better(c,best[strategy],strategy))best[strategy]=c;
  }
  const candidates=[];
  for(const strategy of strategies){
    const c=best[strategy];if(!c)continue;
    const existing=candidates.find(item=>item.bounds_utm.every((v,i)=>v===c.bounds_utm[i]));
    if(existing)existing.strategies.push(strategy);
    else candidates.push({...c,id:randomUUID(),strategies:[strategy],geometry:pilotBoxGeometry(c.bounds_utm)});
  }
  const notes=[];
  if(!priority.areas.length)notes.push('未指定优先区域，本次只比较节约投入和扩大面积。');
  if(feasible&&candidates.length<strategies.length)notes.push('部分取向选中了同一范围，已合并为一个候选。');
  if(!feasible){
    notes.push(`没有同时满足最低 ${minimum}㎡、预算、面积上限和保留区的单矩形；请核对条件或调整目标。`);
    if(money(minimum,session.goal.unit_cost_rmb_per_m2)>session.goal.budget_rmb)
      notes.push(`最低面积按当前单价至少需要 ${money(minimum,session.goal.unit_cost_rmb_per_m2)} 元，超过预算 ${session.goal.budget_rmb} 元。`);
    if(session.goal.candidate_area_m2!=null&&minimum>session.goal.candidate_area_m2)
      notes.push(`最低面积 ${minimum}㎡超过声明面积上限 ${session.goal.candidate_area_m2}㎡。`);
    if(minimum>w*h)notes.push(`最低面积超过登记试算范围 ${w*h}㎡。`);
    else if(rejected.protection>0)notes.push('保留区也限制了达到最低面积的单矩形；本次不会自行解除保留约束。');
  }
  const batch={id:randomUUID(),created_at:new Date().toISOString(),scope,scanned_count:count,feasible_count:feasible,rejected,notes,candidates};
  (session.pilot_searches??=[]).push(batch);session.revision++;
  return {status:feasible?'spatial_candidates_ready':'no_feasible_candidates',batch:structuredClone(batch)};
}

export function adoptPilotCandidate(session,area,args) {
  validateSource(session,area);validateGoals(session.goal);
  const batch=session.pilot_searches?.find(b=>b.id===args.search_id);
  if(!batch||batch!==session.pilot_searches.at(-1)||!pilotSearchIsCurrent(batch,session,area))
    throw new AgentError('stale_spatial_candidates','预算、保留区、优先区域或搜索条件已变化，请重新生成候选。',409);
  const current=session.pilot_temperature_scenarios?.at(-1);
  if(args.expected_current_scenario_id!==(current?.id??null))
    throw new AgentError('stale_temperature_scenario','当前情景已变化，请重新读取后再采用。',409);
  const candidate=batch.candidates.find(c=>c.id===args.candidate_id);
  if(!candidate)throw new AgentError('spatial_candidate_not_found','当前账户的这次搜索中没有该候选。',404);
  const b=candidate.bounds_utm,areaM2=(b[2]-b[0])*(b[3]-b[1]);
  if(!pilotBoxWithin(b,area.bounds_utm)||areaM2<batch.scope.minimum_area_m2||
    money(areaM2,session.goal.unit_cost_rmb_per_m2)>session.goal.budget_rmb||
    (session.goal.candidate_area_m2!=null&&areaM2>session.goal.candidate_area_m2)||protectionConflicts(b,currentPilotProtection(session).areas).length)
    throw new AgentError('spatial_candidate_invalid','候选不再满足当前约束，请重新生成。',409);
  if(current?.change?.search_id===batch.id&&current.change.candidate_id===candidate.id)
    return {status:'temperature_scenario_reused',scenario:structuredClone(current)};
  const saved=savePilotTemperature(session,area,b,{forceNew:true,change:{type:'candidate_adoption',search_id:batch.id,candidate_id:candidate.id,strategies:[...candidate.strategies]}});
  const evaluated=candidateEvaluationRow(batch,candidate,area);
  if(evaluated?.evaluation.status==='complete'){
    const scenario=session.pilot_temperature_scenarios.at(-1);
    scenario.result=structuredClone(evaluated.row.result);
    scenario.change.candidate_evaluation_id=evaluated.evaluation.id;
    saved.scenario=structuredClone(scenario);
  }
  return saved;
}

export function checkedPilotSearch(session,area,searchId){
  validateSource(session,area);validateGoals(session.goal);
  const batch=session.pilot_searches?.at(-1);
  if(!batch||batch.id!==searchId||!pilotSearchIsCurrent(batch,session,area))
    throw new AgentError('stale_spatial_candidates','条件或范围已变化，请先重新生成候选。',409);
  if(batch.candidates.length<1||batch.candidates.length>3)
    throw new AgentError('candidate_evaluation_unavailable','当前没有可评价的候选。');
  for(const c of batch.candidates){
    const b=c.bounds_utm,size=(b[2]-b[0])*(b[3]-b[1]);
    if(!pilotBoxWithin(b,area.bounds_utm)||size!==c.area_m2||size<batch.scope.minimum_area_m2||
      money(size,session.goal.unit_cost_rmb_per_m2)!==c.cost_rmb||c.cost_rmb>session.goal.budget_rmb||
      session.goal.candidate_area_m2!=null&&size>session.goal.candidate_area_m2||protectionConflicts(b,currentPilotProtection(session).areas).length)
      throw new AgentError('spatial_candidate_invalid','候选范围或费用不再满足当前条件，请重新生成。',409);
  }
  return batch;
}
