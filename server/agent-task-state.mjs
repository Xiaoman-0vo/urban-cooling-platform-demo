import {randomUUID} from 'node:crypto';

const clone=value=>structuredClone(value);
const now=()=>new Date().toISOString();

export function ensureTaskState(session) {
  session.tasks ||= [];
  session.event_version ||= 0;
  session.active_run_id ??= null;
}

export function taskScope(session) {
  return {site_id:session.context.site_id,scenario_id:session.context.scenario_id,
    goal_version:session.goal.version,scene_sha256:session.baseline.scene_sha256,grid_sha256:session.baseline.grid_sha256,
    temperature_model_version:null};
}

export function createTask(session,{runId,parentTaskId=null,role,instruction,model,executionKind='llm'}) {
  ensureTaskState(session);
  const task={id:randomUUID(),run_id:runId,parent_task_id:parentTaskId,agent_id:role.id,agent_name:role.name,
    instruction,status:'running',depends_on_goal:role.id!=='data_audit',input_scope:taskScope(session),output_scope:null,
    execution_kind:executionKind,phase:'prepare',current_tool:null,
    language_model:executionKind==='llm'?(model||'unspecified'):null,created_at:now(),finished_at:null,trace_ids:[],result:null};
  session.tasks.push(task);
  return task;
}

export function scenarioSummary(s) {
  return {id:s.id,title:s.title,site_id:s.site_id,goal_version:s.goal_version,kind:s.kind,
    added_green_area_m2:s.added_green_area_m2,estimated_construction_cost_rmb:s.estimated_construction_cost_rmb,
    capacity_check_passed:s.capacity_check_passed,budget_check_passed:s.budget_check_passed,
    added_green_target_met:s.added_green_target_met,added_green_target_gap_m2:s.added_green_target_gap_m2,
    geometry:s.geometry,predicted_delta_lst_c:s.predicted_delta_lst_c,prediction_status:s.prediction_status,implementation_status:s.implementation_status};
}

function compactResult(result) {
  if(result.scenarios) return {...result,scenarios:result.scenarios.map(scenarioSummary)};
  if(result.report) return {status:result.status,report:{id:result.report.id,goal_version:result.report.goal_version},note:'报告已保存在会话reports中，可下载。'};
  return clone(result);
}

export function completeTask(session,task,summary,summarySource='language_model') {
  const traces=session.traces.filter(t=>t.task_id===task.id);
  const children=session.tasks.filter(t=>t.parent_task_id===task.id);
  const statuses=traces.map(t=>t.result.status);
  let status='completed';
  if(statuses.some(s=>['not_connected','stale_scenario','no_positive_allocation','candidate_blocked'].includes(s)))status='blocked';
  else if(statuses.some(s=>['needs_inputs','no_current_options'].includes(s)))status='needs_inputs';
  else if(task.execution_kind==='historical_temperature'&&statuses.includes('no_data'))status='no_data';
  else if(statuses.includes('no_data'))status='needs_inputs';
  else if(traces.length && traces.every(t=>t.result.status==='rejected'))status='blocked';
  if(children.some(t=>t.status==='needs_inputs') && status==='completed')status='needs_inputs';
  if(children.some(t=>['blocked','failed','cancelled','interrupted','completed_with_limits'].includes(t.status)) && status==='completed')status='completed_with_limits';
  task.status=status;task.finished_at=now();task.output_scope=taskScope(session);
  if(task.temperature_model)task.output_scope.temperature_model_version=task.temperature_model;
  const regular=traces.filter(t=>!t.tool.startsWith('delegate_'));
  const limitations=[];
  if(task.agent_id==='plan_exploration') limitations.push(session.pilot?'候选范围通过现有来源几何检查，现场和可施工性待核。':'当前仅投入配置模板，未执行空间布局搜索或可施工性验证。');
  if(task.agent_id==='prediction_evaluation') limitations.push('本任务检查的是规划方案的预测条件。方案降温待验证。');
  task.result={status,task_id:task.id,agent_id:task.agent_id,scope:clone(task.output_scope),summary,summary_source:summarySource,
    evidence_trace_ids:regular.map(t=>t.id),child_task_ids:children.map(t=>t.id),
    outputs:regular.map(t=>({tool:t.tool,result:compactResult(t.result)})),limitations};
  return clone(task.result);
}

export function failTask(session,task,error,{cancelled=false}={}) {
  task.status=cancelled?'cancelled':'failed';task.finished_at=now();task.output_scope=taskScope(session);
  task.result={status:task.status,task_id:task.id,agent_id:task.agent_id,
    error:{code:error.code || 'task_failed',message:error.message || '子任务未完成。'},
    evidence_trace_ids:[...task.trace_ids],summary:'任务未完成；已执行的工具和产物保留。',summary_source:'system'};
  return clone(task.result);
}

export function publicTasks(session) {
  return (session.tasks || []).map(t=>({...clone(t),is_stale:
    (t.status!=='running' && t.depends_on_goal && (t.output_scope || t.input_scope).goal_version!==session.goal.version) ||
    t.input_scope.scene_sha256!==session.baseline.scene_sha256 || t.input_scope.grid_sha256!==session.baseline.grid_sha256}));
}

export function recoverInterruptedTasks(session) {
  ensureTaskState(session);
  const unfinished=session.tasks.filter(t=>t.status==='running');
  for(const task of unfinished) {
    task.status='interrupted';task.finished_at=now();
    task.result={status:'interrupted',task_id:task.id,agent_id:task.agent_id,summary:'服务在任务结束前退出；已保存结果保留，未自动重试。',summary_source:'system',evidence_trace_ids:[...task.trace_ids]};
  }
  const changed=Boolean(unfinished.length || session.active_run_id);
  session.active_run_id=null;
  if(changed)session.event_version++;
  return changed;
}
