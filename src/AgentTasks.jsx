import React,{useState} from 'react';
import {CheckCircle, Clock, WarningCircle} from '@phosphor-icons/react';
import {activeStep,executionLabel} from './agent-labels.js';

const FALLBACK_ROLES=[
  {id:'coordinator',name:'主 Agent',purpose:'登记目标、委派与汇总'},
  {id:'data_audit',name:'资料核查 Agent',purpose:'检查来源、资料与缺项'},
  {id:'plan_exploration',name:'方案探索 Agent',purpose:'生成当前版本配置草案'},
  {id:'prediction_evaluation',name:'预测评估 Agent',purpose:'比较草案、检查预测接入'},
];
const STATUS={running:'执行中',completed:'已完成',completed_with_limits:'汇总完成 · 有未完成项',needs_inputs:'需要补充输入',no_data:'暂无数据',blocked:'条件未满足',failed:'执行失败',cancelled:'已停止',interrupted:'服务中断'};

function Badge({status}) {
  const Icon=status==='running'?Clock:status==='completed'?CheckCircle:WarningCircle;
  return <span className={`agent-task-status ${status}`}><Icon size={12}/>{STATUS[status] || status}</span>;
}

function elapsed(task){
  if(!task.finished_at)return null;
  const milliseconds=Date.parse(task.finished_at)-Date.parse(task.created_at);
  if(!Number.isFinite(milliseconds)||milliseconds<0)return null;
  return milliseconds<1000?'用时不到 1 秒':`用时 ${Math.round(milliseconds/1000)} 秒`;
}

export default function AgentTasks({session,agents,onEvidence}) {
  const [visibleCount,setVisibleCount]=useState(8);
  const tasks=session?.tasks || [];
  const roots=tasks.filter(task=>!task.parent_task_id).reverse();
  return <div className="agent-task-list" aria-label="多 Agent 协作任务">
    {!roots.length&&<div className="agent-empty">发出请求后，可以在这里查看执行步骤和依据。</div>}
    {roots.slice(0,visibleCount).map(root=>{
      const children=tasks.filter(task=>task.parent_task_id===root.id);
      const label=executionLabel(root);
      const duration=elapsed(root);
      return <article className="agent-run" key={root.id}>
        <header><strong>{root.execution_kind==='historical_temperature'?'历史温度查询':
          root.execution_kind==='local_planning'?'本地规划':root.execution_kind==='mcp_read'?'微博热感知':'主 Agent'}</strong><Badge status={root.status}/></header>
        <p className="agent-run-question">{root.instruction}</p>
        <div className="agent-run-meta">
          {label&&<span>{label}</span>}
          {root.depends_on_goal&&<span>目标 v{root.input_scope.goal_version} → v{root.status==='running'?session.goal.version:(root.output_scope || root.input_scope).goal_version}</span>}
          {duration&&<span>{duration}</span>}
          {root.is_stale&&<span className="agent-stale-label">旧目标版本</span>}
        </div>
        {root.status==='running'&&<p className="agent-live-step">{activeStep(children.findLast(task=>task.status==='running')||root)}</p>}
        {(root.result?.error||['interrupted','no_data','needs_inputs'].includes(root.status))&&
          <p className="agent-task-limitation">{root.result?.error?.message||root.result?.summary}</p>}
        {root.budget&&<p className="agent-budget-note">模型请求 {root.budget.used.model_requests} 次 · 工具 {root.budget.used.tool_calls} 次 · 委派 {root.budget.used.delegations} 次</p>}
        {children.length>0&&<ol className="agent-subtasks">{children.map(task=><li key={task.id}>
          <details open={task.status==='running'}>
            <summary><span>{task.agent_name}</span><Badge status={task.status}/></summary>
            <p className="agent-task-instruction">{task.instruction}</p>
            <div className="agent-run-meta"><span>工具记录 {task.trace_ids.length} 条</span>
              {executionLabel(task)&&<span>{executionLabel(task)}</span>}
              {task.depends_on_goal&&<span>目标 v{(task.output_scope || task.input_scope).goal_version}</span>}
              {task.is_stale&&<span className="agent-stale-label">旧版</span>}</div>
            {task.result?.summary&&<div className="agent-task-summary"><small>{task.result.summary_source==='language_model'?'模型摘要 · 数值请核对工具结果':'系统记录'}</small><p>{task.result.summary}</p></div>}
            {task.result?.error?.message&&<p className="agent-task-limitation">{task.result.error.message}</p>}
            {task.result?.limitations?.map(note=><p className="agent-task-limitation" key={note}>{note}</p>)}
            {task.result&&<details className="agent-task-result"><summary>结构化结果与依据</summary><pre>{JSON.stringify(task.result,null,2)}</pre></details>}
          </details>
        </li>)}</ol>}
        {(root.trace_ids.length>0||children.some(task=>task.trace_ids.length>0))&&<button type="button" className="agent-locate" onClick={()=>onEvidence(root.run_id)}>查看本轮依据</button>}
        <details className="agent-task-result"><summary>任务标识与版本</summary><pre>{JSON.stringify({任务:root.id,运行:root.run_id,输入:root.input_scope,输出:root.output_scope,开始:root.created_at,结束:root.finished_at},null,2)}</pre></details>
      </article>;
    })}
    {roots.length>visibleCount&&<button type="button" className="agent-locate" onClick={()=>setVisibleCount(value=>value+8)}>显示更早任务</button>}
    <details className="agent-team-roster">
      <summary>角色与职责</summary>
      <div className="agent-team-grid">{(agents || FALLBACK_ROLES).map(role=><div className="agent-team-member" key={role.id}>
        <strong>{role.name}</strong><p>{role.purpose}</p>
      </div>)}</div>
    </details>
  </div>;
}
