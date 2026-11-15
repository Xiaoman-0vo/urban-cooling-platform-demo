import React,{useEffect,useState} from 'react';
import {MapPin} from '@phosphor-icons/react';
import {TOOL_NAMES} from './agent-labels.js';

const statuses={
  estimated:'已计算',no_data:'暂无数据',rejected:'请求被拒绝',needs_inputs:'待补充条件',
  not_connected:'预测服务待接入',candidate_blocked:'候选超出条件',stale_scenario:'旧版方案',
  completed:'已完成',completed_with_limits:'有未完成项',failed:'失败',cancelled:'已停止',
  source_metadata:'已读取',research_preparation_evidence:'已读取',
  goal_draft_saved:'已保存',draft_options_created:'已生成',draft_options_reused:'已复用',
  comparison_ready:'可比较',report_created:'已生成报告',
  heat_perception_snapshot:'已读取归档',
  mcp_read:'已读取',
};

export default function AgentEvidence({traces,tasks,runId,isRunning,loadEvidence,onShowAll,onLocate}) {
  const [loaded,setLoaded]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!runId||isRunning)return;
    const controller=new AbortController();
    loadEvidence(runId,controller.signal).then(result=>{
      if(!controller.signal.aborted)setLoaded(result);
    }).catch(err=>{
      if(!controller.signal.aborted)setError(err.message);
    });
    return ()=>controller.abort();
  },[runId,isRunning,loadEvidence,attempt]);
  const visible=(runId?(loaded||traces.filter(trace=>trace.turn_id===runId)):traces.slice(-12)).slice().reverse();
  const loading=Boolean(runId&&!isRunning&&!loaded&&!error);
  return <section className="agent-evidence" aria-label="执行依据">
    <div className="agent-evidence-heading">
      <h3>{runId?'本轮执行依据':'最近执行依据'}</h3>
      {runId&&<button type="button" className="agent-locate" onClick={onShowAll}>查看最近记录</button>}
    </div>
    {loading&&<p className="agent-caption" role="status">正在读取本轮完整依据…</p>}
    {error&&<div className="agent-inline-notice" role="alert">
      <span>{error}</span>
      <button type="button" className="agent-text-button" onClick={()=>{setError('');setAttempt(value=>value+1);}}>重新读取</button>
    </div>}
    {!visible.length&&!loading&&!error&&<div className="agent-empty">{runId&&!isRunning?'本轮没有工具记录。':'执行工具后，这里会显示依据。'}</div>}
    {visible.map(trace=>{
      const result=trace.result;
      const location=result.location||result.current_site?.location;
      const task=tasks.find(item=>item.id===trace.task_id);
      const temperature=trace.tool==='estimate_historical_surface_temperature'&&result.status==='estimated';
      return <details key={trace.id}>
        <summary>
          <span className={result.status==='rejected'?'agent-trace-dot rejected':'agent-trace-dot'}/>
          {TOOL_NAMES[trace.tool]||trace.tool}
          {statuses[result.status]&&<small>{statuses[result.status]}</small>}
        </summary>
        {task&&<p className="agent-caption">{task.execution_kind==='historical_temperature'?'历史温度工具':task.agent_name}</p>}
        {temperature&&<dl className="agent-temperature-result">
          <div><dt>模型估计</dt><dd>{result.estimated_lst_c.toFixed(2)}℃</dd></div>
          <div><dt>Landsat 观测</dt><dd>{result.observed_lst_c.toFixed(2)}℃</dd></div>
          <div><dt>观测日期</dt><dd>{result.date}</dd></div>
        </dl>}
        {result.transport==='mcp_stdio'&&result.source&&<p className="agent-caption">
          MCP · {result.source.channel} · {result.city}城市级抽样 · {result.source.generated_at?.slice(0,10)}归档
        </p>}
        {trace.tool==='get_chengdu_xhs_heat_perception'&&result.examples?.length>0&&
          <ul>{result.examples.map(({url,excerpt})=><li key={url}><a href={url} target="_blank" rel="noreferrer">{excerpt||'查看原笔记'}</a></li>)}</ul>}
        {result.transport==='mcp_streamable_http'&&<p className="agent-caption">MCP · {result.source.server_label} · {result.source.tool}{result.truncated?' · 结果已截断':''}</p>}
        {result.message&&<p className="agent-caption">{result.message}</p>}
        {Array.isArray(result.blockers)&&<ul className="agent-evidence-blockers">{result.blockers.map(reason=><li key={reason}>{reason}</li>)}</ul>}
        {location&&<button type="button" className="agent-locate" onClick={()=>onLocate(location)}><MapPin size={14}/>地图定位</button>}
        <details className="agent-trace-data">
          <summary>查看输入与原始结果</summary>
          <pre>{JSON.stringify({输入:trace.arguments,返回:result},null,2)}</pre>
        </details>
      </details>;
    })}
  </section>;
}
