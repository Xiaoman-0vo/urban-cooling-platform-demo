import {candidateQuality} from './candidate-quality.js';
import {candidateEvaluationBasis,validCandidateResult} from './candidate-evaluation-state.js';
import {pilotSearchIsCurrent,SEARCH_STRATEGIES} from './pilot-search-state.js';
import {evaluationReadinessMarkdown} from './evaluation-readiness-report.js';
import {evaluationReadiness} from './evaluation-readiness.js';

export function candidateDecision(session,area=session?.pilot?.temperature_area){
  const batch=session?.pilot_searches?.at(-1);
  if(!batch||!area)return {status:'missing',title:'从你的目标开始',detail:'保存预算和单价，再生成可比较的空间候选。',rows:[],comparable:false};
  const fresh=pilotSearchIsCurrent(batch,session,area),evaluation=batch.evaluations?.at(-1);
  const rows=batch.candidates.map((candidate,index)=>({id:candidate.id,label:`候选 ${index+1}`,
    strategies:candidate.strategies.map(s=>SEARCH_STRATEGIES[s]),area_m2:candidate.area_m2,cost_rmb:candidate.cost_rmb,
    bounds_utm:candidate.bounds_utm,priority_overlap_m2:candidate.priority_overlap_m2,...candidateQuality(candidate,batch,session,area)}));
  const completed=rows.filter(row=>row.valid&&validCandidateResult(row.temperature,row,area,batch.scope.site_id));
  const basis=new Set(completed.map(row=>candidateEvaluationBasis(row.temperature,area)));
  const sameBasis=fresh&&rows.length>0&&completed.length===rows.length&&basis.size===1;
  const readiness=sameBasis?evaluationReadiness({rows,completed:completed.length,comparable:true,status:'evaluated'}):null;
  const inconsistent=readiness?.status==='incomparable';
  const comparable=sameBasis&&readiness?.status==='limited_comparison';
  const baseline=comparable?{label:'现状参考',added_cost_rmb:0,baseline_lst_c:completed[0].temperature.baseline_lst_c,delta_lst_c:0}:null;
  let status,title,detail;
  if(!fresh){status='stale';title='条件变了，需要重新比较';detail='历史候选和结果继续保留。请按当前预算与空间约束重新生成候选。';}
  else if(!rows.length){status='empty';title='本轮条件下没有可行候选';detail=batch.notes.join(' ');}
  else if(evaluation?.status==='running'){status='running';title=`正在评价 ${completed.length}/${rows.length} 个候选`;detail='按固定输入逐个运行。你可停止本轮，已完成的结果会保留。';}
  else if(inconsistent){status='incomparable';title=readiness.title;detail=readiness.detail;}
  else if(!comparable&&completed.length===rows.length){status='incomparable';title='评价基准不一致，不能直接选优';detail='模型、参考数据或基线不同。请在同一输入口径下重新评价。';}
  else if(!comparable){status=completed.length?'partial':'unevaluated';title=completed.length?'评价尚未完整完成':'先比较效果，再决定采用';
    detail=completed.length?`已完成 ${completed.length}/${rows.length} 个候选，保留有效结果；未完成的部分可手动重试。`:'一次手动评价本轮候选，查看新增投入是否有模型改善依据；评价后再选择保存的方案。';}
  else if(completed.every(row=>row.temperature.predicted_delta_lst_c<=0)){
    status='no_improvement';title='本轮未得到降温改善证据';
    detail='这些候选满足登记条件，但本次模型没有显示比现状更凉。若以降温为目标，当前结果不足以支持新增投入；先核查场地和覆盖假设，再调整方案。';
  }else{status='model_improvement';title='模型显示改善，仍需核查方案';
    detail='结合新增费用、覆盖偏好和现场条件选择待复核方案。当前模型尚无温差不确定性区间，不能仅凭微小差异确定实际优劣。';}
  const cheapest=rows.filter(row=>row.valid).toSorted((a,b)=>a.cost_rmb-b.cost_rmb)[0];
  const largest=rows.filter(row=>row.valid).toSorted((a,b)=>b.area_m2-a.area_m2)[0];
  const tradeoff=cheapest&&largest&&cheapest.id!==largest.id?{from:cheapest.label,to:largest.label,
    extra_area_m2:largest.area_m2-cheapest.area_m2,extra_cost_rmb:largest.cost_rmb-cheapest.cost_rmb,
    delta_difference_c:comparable?largest.temperature.predicted_delta_lst_c-cheapest.temperature.predicted_delta_lst_c:null}:null;
  return {status,title,detail,rows,comparable,baseline,tradeoff,completed:completed.length,total:rows.length,
    evaluation_id:evaluation?.id??null,evaluation_run_id:evaluation?.run_id??null,evaluation_status:evaluation?.status??null,search_id:batch.id,
    scientific_scope:'registered_historical_cover_scenario_only',implementation_recommended:false};
}

export function candidateDecisionMarkdown(session){
  const state=candidateDecision(session);
  if(state.status==='missing')return [];
  const amount=value=>Number.isFinite(value)?String(value):'未评价';
  return ['', '## 候选比较与本轮判断','',`**${state.title}**`,state.detail,'',
    '| 比较对象 | 面积㎡ | 新增建设费元 | 模型温差℃ | 评价状态 |','| --- | ---: | ---: | ---: | --- |',
    ...(state.baseline?[`| 现状参考 | — | 0 | 0（相对自身） | 模型基线 ${state.baseline.baseline_lst_c}℃ |`]:[]),
    ...state.rows.map(row=>`| ${row.label} | ${row.area_m2} | ${row.cost_rmb} | ${row.temperature?row.temperature.predicted_delta_lst_c.toFixed(3):'未评价'} | ${row.temperatureSummary} |`),
    ...(state.tradeoff?[`新增 ${state.tradeoff.extra_area_m2}㎡需要多投入 ${state.tradeoff.extra_cost_rmb} 元；模型温差变化 ${amount(state.tradeoff.delta_difference_c)}℃。`]:[]),
    '',`候选批次 ${state.search_id}；评价批次 ${state.evaluation_id||'沿用已保存情景的实际结果或待评价'}。`,
    '温差按模型基线减情景预测；负数表示模型预测升温。费用不含养护。现状参照不表示现场无需改善。',
    '结果仅适用于登记的历史覆盖假设；现场实施、人体热舒适和公平性尚待验证。',
    ...evaluationReadinessMarkdown(state)];
}
