import {randomUUID} from 'node:crypto';
import {AgentError} from './agent-tools.mjs';
import {checkedPilotSearch} from './pilot-search.mjs';
import {pilotSearchIsCurrent} from '../src/pilot-search-state.js';
import {candidateEvaluationBasis,validCandidateResult} from '../src/candidate-evaluation-state.js';
import {evaluationReadiness} from '../src/evaluation-readiness.js';

export const EVALUATE_PILOT_CANDIDATES='evaluate_pilot_spatial_candidates';

export async function evaluatePilotCandidates(session,area,args,estimator,{runId,signal,onProgress=async()=>{},onCandidate=()=>{},beforeCandidate=()=>{}}={}){
  const batch=checkedPilotSearch(session,area,args.search_id);
  if(!estimator?.evaluatePilot)throw new AgentError('pilot_temperature_unavailable','温度模型尚未就绪，可先比较费用和面积。',503);
  const previous=batch.evaluations?.at(-1);
  const previousValid=previous?.status==='complete'&&previous.results.length===batch.candidates.length&&
    JSON.stringify(previous.scope)===JSON.stringify(batch.scope)&&previous.results.every(row=>{
      const candidate=batch.candidates.find(c=>c.id===row.candidate_id);
      return candidate&&row.status==='estimated'&&validCandidateResult(row.result,candidate,area,session.context.site_id);
    })&&new Set(previous.results.map(row=>candidateEvaluationBasis(row.result,area))).size===1;
  const previousReadiness=previousValid?evaluationReadiness({rows:previous.results.map(row=>({temperature:row.result})),
    completed:previous.results.length,comparable:true,status:'evaluated'}):null;
  if(previousReadiness?.status==='limited_comparison')
    return {status:'candidate_evaluation_reused',evaluation:structuredClone(previous)};
  const evaluation={id:randomUUID(),run_id:runId||randomUUID(),search_id:batch.id,scope:structuredClone(batch.scope),
    started_at:new Date().toISOString(),status:'running',results:[],temperature_model_calls:0};
  (batch.evaluations??=[]).push(evaluation);session.revision++;
  try{
    await onProgress();
    for(const candidate of structuredClone(batch.candidates)){
      signal?.throwIfAborted();
      if(!pilotSearchIsCurrent(batch,session,area))throw new AgentError('stale_spatial_candidates','评价期间条件发生变化，已完成结果保留为历史。',409);
      beforeCandidate();
      const row={id:randomUUID(),candidate_id:candidate.id,bounds_utm:candidate.bounds_utm,area_m2:candidate.area_m2,status:'running'};
      evaluation.results.push(row);
      await onProgress();
      try{
        signal?.throwIfAborted();evaluation.temperature_model_calls++;
        const result=await estimator.evaluatePilot({grid_id:session.context.site_id,date:area.reference_date,scene_id:area.scene_id,
          bounds_utm:candidate.bounds_utm,area_m2:candidate.area_m2,area_sha256:area.sha256},{signal});
        signal?.throwIfAborted();
        if(!validCandidateResult(result,candidate,area,session.context.site_id))throw Error('Invalid candidate model result');
        row.result={...result,run_id:evaluation.run_id,completed_at:new Date().toISOString(),
          candidate_evaluation_id:evaluation.id,evaluation_result_id:row.id};
        row.status='estimated';
      }catch(error){
        if(signal?.aborted){row.status='cancelled';throw error;}
        row.status='failed';row.error={code:'candidate_evaluation_failed',message:'该候选未完成有效评价，请核对模型和资料后重试。'};
      }
      session.revision++;onCandidate(structuredClone(row));await onProgress();
    }
    if(!pilotSearchIsCurrent(batch,session,area))evaluation.status='stale';
    else evaluation.status=evaluation.results.every(row=>row.status==='estimated')?'complete':evaluation.results.some(row=>row.status==='estimated')?'partial':'failed';
  }catch(error){
    evaluation.status=signal?.aborted?'cancelled':error.code==='stale_spatial_candidates'?'stale':'failed';
    evaluation.completed_at=new Date().toISOString();session.revision++;await onProgress();throw error;
  }
  evaluation.completed_at=new Date().toISOString();session.revision++;await onProgress();
  return {status:'candidate_evaluation_'+evaluation.status,evaluation:structuredClone(evaluation)};
}
