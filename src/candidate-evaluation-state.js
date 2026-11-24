const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const vector=value=>Array.isArray(value)&&value.length>0&&value.every(Number.isFinite);

export function validCandidateResult(result,candidate,area,gridId){
  const features=result?.compiled_features;
  return Boolean(result?.status==='scenario_estimated'&&result.grid_id===gridId&&result.date===area.reference_date&&
    result.scene_id===area.scene_id&&result.area_sha256===area.sha256&&result.area_m2===candidate.area_m2&&
    JSON.stringify(result.bounds_utm)===JSON.stringify(candidate.bounds_utm)&&hash(result.model_sha256)&&hash(result.dataset_sha256)&&
    ['observed_lst_c','baseline_lst_c','scenario_lst_c','predicted_delta_lst_c'].every(key=>Number.isFinite(result[key]))&&
    Math.abs(result.baseline_lst_c-result.scenario_lst_c-result.predicted_delta_lst_c)<=0.002&&
    Number.isInteger(result.reference_grid_count)&&result.reference_grid_count>0&&
    Array.isArray(features?.order)&&features.order.length>0&&features.order.every(key=>typeof key==='string')&&
    ['baseline_center','scenario_center','neighbor_mean'].every(key=>vector(features[key])&&features[key].length===features.order.length));
}

export function candidateEvaluationBasis(result,area){
  if(!result)return null;
  return JSON.stringify([area.sha256,area.reference_date,area.source_cover_class,area.scenario_cover_class,
    area.raster_sha256,result.grid_id,result.scene_id,result.observed_utc,result.reference_grid_count,
    result.model_sha256,result.dataset_sha256,result.baseline_lst_c,result.compiled_features?.order,
    result.compiled_features?.baseline_center,result.compiled_features?.neighbor_mean]);
}

export function candidateEvaluationRow(batch,candidate,area){
  const evaluation=batch?.evaluations?.at(-1);
  if(!evaluation||JSON.stringify(evaluation.scope)!==JSON.stringify(batch.scope))return null;
  const row=evaluation.results.find(item=>item.candidate_id===candidate.id);
  if(!row||row.status!=='estimated'||!validCandidateResult(row.result,candidate,area,batch.scope.site_id))return null;
  return {evaluation,row};
}

export const candidateEvaluationId=session=>session?.pilot_searches?.at(-1)?.evaluations?.at(-1)?.id??null;
