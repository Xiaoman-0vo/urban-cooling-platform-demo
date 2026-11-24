import {AgentError} from './agent-tools.mjs';
import {GENERATE_PILOT_CANDIDATES,generatePilotCandidates} from './pilot-search.mjs';
import {pilotSearchIsCurrent,SEARCH_STRATEGIES} from '../src/pilot-search-state.js';
import {minimumAreaValues,spatialSearchRequest} from './spatial-search-evidence.mjs';
import {goalValueMentioned} from './goal-evidence.mjs';

export const READ_SPATIAL_SEARCH='get_spatial_candidate_search';
const definition=(name,description,properties={},required=[])=>({type:'function',function:{name,description,
  parameters:{type:'object',properties,required,additionalProperties:false}}});
export const SPATIAL_SEARCH_TOOLS=[
  definition(READ_SPATIAL_SEARCH,'读取当前会话最近的空间搜索，检查是否过期；过期结果不能当作当前候选。'),
  definition(GENERATE_PILOT_CANDIDATES,'按已登记预算、单价、保留区与优先区搜索1米整点单矩形。仅在本轮用户明确要求生成时调用；最低面积须有原话依据。采用和温度评价由用户手动操作。',{
    minimum_area_m2:{type:'integer',minimum:1,maximum:1000000,description:'用户明确指定的最低改造面积，整数平方米；不得当作面积上限。'},
    evidence_quote:{type:'string',description:'逐字引用本轮原话中搜索请求和最低面积，或明确沿用最低面积的要求。'},
  },['minimum_area_m2','evidence_quote']),
];

function hasPendingGoalRevision(original,goal) {
  const numericValues=[...original.normalize('NFKC').replace(/(?<=\d)[,，](?=\d)/g,'')
    .matchAll(/(?<![A-Za-z\d.])-?\d+(?:\.\d+)?\s*(万|千|百)?/g)]
    .map(match=>Number(match[0].replace(/\s*(万|千|百)$/,''))*({万:10000,千:1000,百:100}[match[1]]||1));
  return ['budget_rmb','unit_cost_rmb_per_m2','candidate_area_m2'].some(field=>
    numericValues.some(value=>goalValueMentioned(field,value,original)&&value!==goal[field]));
}

export function executeSpatialSearchTool(name,args,session,catalog) {
  if(!session.pilot?.temperature_area)throw new AgentError('spatial_search_unavailable','请先打开已登记的落图试点。');
  const allowed=name===READ_SPATIAL_SEARCH?[]:['minimum_area_m2','evidence_quote'];
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!allowed.includes(key)))
    throw new AgentError('invalid_arguments','空间搜索参数不符合接口。');
  const original=session.messages.findLast(message=>message.role==='user')?.content||'';
  if(name===READ_SPATIAL_SEARCH){
    if(hasPendingGoalRevision(original,session.goal))return {status:'needs_inputs',
      message:'本轮明确给出的条件尚未一致登记，旧搜索不能作为当前推荐；请先保存这些条件。'};
    const batch=session.pilot_searches?.at(-1);
    if(!batch)return {status:'needs_inputs',message:'尚未生成空间候选。请登记预算、单价并明确最低改造面积。'};
    if(!pilotSearchIsCurrent(batch,session,catalog.pilot.temperature_area))return {status:'stale_spatial_candidates',
      message:'旧搜索已过期，不能作为当前推荐；请明确最低面积后按当前条件重新生成。',search_id:batch.id};
    return {status:batch.feasible_count?'spatial_candidates_current':'no_feasible_candidates',batch:structuredClone(batch)};
  }
  if(name!==GENERATE_PILOT_CANDIDATES)throw new AgentError('unknown_tool','未登记的空间搜索工具。');
  const request=spatialSearchRequest(original);
  if(!request.requested)throw new AgentError('spatial_search_not_requested','本轮没有明确的空间候选生成请求，未执行。');
  const quote=args.evidence_quote;
  if(typeof quote!=='string'||quote.length<2||!original.includes(quote))
    throw new AgentError('missing_user_evidence','请逐字引用本轮用户的搜索要求，不能借用旧消息或委派文字。');
  const quoted=spatialSearchRequest(quote),previous=session.pilot_searches?.at(-1);
  const values=request.values.length?request.values:request.reuse&&previous?[previous.scope.minimum_area_m2]:[];
  const quoteValues=minimumAreaValues(quote);
  const quoteMatches=quoteValues.includes(args.minimum_area_m2)||
    (!request.values.length&&request.reuse&&quoted.reuse&&previous?.scope.minimum_area_m2===args.minimum_area_m2);
  if(values.length!==1||!Number.isSafeInteger(values[0])||values[0]<1||values[0]>1e6)
    return {status:'needs_inputs',message:'请明确一个大于零的整数平方米最低改造面积，例如“最低改造面积10平方米，生成空间候选”。'};
  if(args.minimum_area_m2!==values[0]||!quoteMatches)
    throw new AgentError('unsupported_search_target','最低面积与本轮用户原话不符，未执行搜索。');
  if(hasPendingGoalRevision(original,session.goal))return {status:'needs_inputs',
    message:'本轮明确给出的预算、单价或面积上限尚未一致登记；请先保存这些条件，再生成空间候选。'};
  if(!Number.isFinite(session.goal.budget_rmb)||!Number.isFinite(session.goal.unit_cost_rmb_per_m2))
    return {status:'needs_inputs',message:'请先登记预算和大于零的假设建设单价，最低面积不会代替这些条件。'};
  return generatePilotCandidates(session,catalog.pilot.temperature_area,{minimum_area_m2:values[0],expected_area_sha256:catalog.pilot.temperature_area.sha256});
}

export function spatialSearchTurnReply(session,runId,text) {
  if(!session.pilot)return null;
  const traces=session.traces.filter(trace=>trace.turn_id===runId&&[READ_SPATIAL_SEARCH,GENERATE_PILOT_CANDIDATES].includes(trace.tool));
  const request=spatialSearchRequest(text);
  if(!traces.length&&!request.requested&&!request.related)return null;
  const result=traces.at(-1)?.result;
  const batch=result?.batch;
  const goalTrace=session.traces.findLast(trace=>trace.turn_id===runId&&trace.tool==='set_planning_goal'&&trace.result.status==='goal_draft_saved');
  const exported=session.traces.some(trace=>trace.turn_id===runId&&trace.tool==='export_planning_report'&&trace.result.report);
  const prefix=(goalTrace?'已保存本轮明确给出的条件。':'')+(exported?'已生成讨论记录，可在报告中查看。':'')+
    (request.cancelled?'本轮未生成或采用空间候选，已有搜索记录保留。':'');
  if(batch&&pilotSearchIsCurrent(batch,session)){
    if(!batch.feasible_count)return prefix+batch.notes.join(' ');
    const rows=batch.candidates.map(c=>`${c.strategies.map(s=>SEARCH_STRATEGIES[s]).join('／')}：${c.area_m2}㎡，假设费用${c.cost_rmb}元，覆盖优先区${c.priority_overlap_m2}㎡`);
    const source=traces.at(-1).tool===READ_SPATIAL_SEARCH?'当前已保存的搜索':result.status==='spatial_candidates_reused'?'复用条件相同的搜索':'本轮搜索';
    return `${prefix}${source}检查${batch.scanned_count}个整点矩形，${batch.feasible_count}个满足约束；最低改造面积${batch.scope.minimum_area_m2}㎡。\n\n${rows.join('；')}。\n\n请在候选卡片查看和采用，再手动评价温度。这里只比较几何和假设费用，未计算降温或核实可施工性。`;
  }
  if(batch||result?.status==='stale_spatial_candidates')return prefix+'旧空间搜索已过期，不能作为当前推荐。请明确最低改造面积并重新生成。';
  if(request.cancelled)return prefix;
  if(result?.message)return prefix+result.message;
  return prefix+'本轮尚未完成空间候选搜索。请确认预算、假设单价及最低改造面积，并明确要求生成空间候选；可在「目标与草案」手动生成。';
}
