import React,{useEffect,useRef,useState} from 'react';
import {X,CheckCircle,Circle,DownloadSimple,ArrowClockwise,MapTrifold,WarningCircle} from '@phosphor-icons/react';
import PlanningComparison from './PlanningComparison.jsx';
import {accountRequest} from './account-api.js';
import {planningWorkflowState,createPlanningProgressArchive} from './planning-workflow.js';
import './planning-workflow.css';

const format=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3});
const amount=value=>value==null?'待填写':format.format(value);

export default function PlanningWorkflow({open,view='path',onViewChange,accountId,scene,siteReady,onClose,onAction}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [revision,setRevision]=useState(0),[exporting,setExporting]=useState(false),[notice,setNotice]=useState('');
  const generation=useRef(0);
  const bodyRef=useRef(null);
  const scope=`${accountId||''}:${scene?.site_id||''}:${scene?.scenario_id||''}`;
  useEffect(()=>{setData(null);setError('');setNotice('');generation.current++;},[scope]);
  useEffect(()=>{if(open&&bodyRef.current)bodyRef.current.scrollTop=0;},[open,view]);
  useEffect(()=>{if(!open)return;const close=event=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[open,onClose]);
  useEffect(()=>{
    if(!open||!scene)return;
    const controller=new AbortController();
    setLoading(true);setError('');
    async function load(){
      if(!accountId){setData({session:null,inspections:[],health:null});setLoading(false);return;}
      try{
        const options={accountId,signal:controller.signal};
        const [health,{items:inspections}]=await Promise.all([accountRequest('/health',options),accountRequest('/inspection-items',options)]);
        const pilot=health.pilot?.site_id===scene.site_id&&health.pilot?.scenario_id===scene.scenario_id;
        const query=new URLSearchParams({site_id:scene.site_id,scenario_id:scene.scenario_id,planning_mode:pilot?'mapped_pilot':''});
        const {session}=await accountRequest(`/sessions?${query}`,options);
        if(!controller.signal.aborted)setData({health,session,inspections});
      }catch(err){if(!controller.signal.aborted){setData(null);setError(err.message);}}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    load();return()=>controller.abort();
  },[open,scope,revision]);
  if(!open)return null;
  const state=planningWorkflowState({scene,siteReady,...data});
  const blocked=!siteReady||loading||state.active;
  const pilot=data?.health?.pilot?.site_id===scene?.site_id&&data?.health?.pilot?.scenario_id===scene?.scenario_id;
  const disabled=step=>loading||state.active||(step.id!=='project'&&!siteReady)||(['goals','edit','evaluate','revise'].includes(step.id)&&(!accountId||!pilot));
  const activate=step=>step.id==='results'?onViewChange?.('results'):onAction(step.id);
  async function exportProgress(){
    const current=generation.current;setExporting(true);setError('');setNotice('');
    try{
      const result=await createPlanningProgressArchive({scene,siteReady,...data});
      if(current!==generation.current)return;
      const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/zip'}));
      const link=document.createElement('a');link.href=url;link.download=`UrbanCool_规划进度_${scene.site_id.replace(/[^\w-]/g,'_')}.zip`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      setNotice(`已生成进度包：${result.manifest.members.length} 个记录文件，附逐件 SHA-256 清单。`);
    }catch(err){if(current===generation.current)setError(err.message);}
    finally{setExporting(false);}
  }
  return <aside className={`planning-workflow ${view==='results'?'results-view':'path-view'}`} aria-label="项目规划流程" aria-busy={loading}>
    <header><div><small>URBANCOOL / PLANNING</small><h2>{view==='results'?'方案比较与成果':'项目规划'}</h2></div><button type="button" aria-label="关闭规划流程" onClick={onClose}><X size={20}/></button></header>
    <p className="workflow-scope"><MapTrifold size={16}/>{siteReady?`成都示范区 · ${scene.site_id}`:'先选择研究场地'}</p>
    <nav aria-label="规划流程视图"><button aria-pressed={view==='path'} onClick={()=>onViewChange?.('path')}>规划路径</button><button aria-pressed={view==='results'} onClick={()=>onViewChange?.('results')}>版本与成果</button>
      <button disabled={loading||exporting} onClick={()=>setRevision(value=>value+1)} aria-label="重新读取规划进度"><ArrowClockwise size={15}/></button></nav>
    {loading&&<p role="status">正在读取已保存的目标、版本和核查记录…</p>}
    {error&&<p className="workflow-error" role="alert">{error}</p>}
    {state.active&&<p className="workflow-note">本轮协作任务正在运行，结束后重新读取进度。</p>}
    {!accountId&&<p className="workflow-note">地图资料可直接浏览。目标、版本和成果记录在本地账户工作台中保存。</p>}
    {siteReady&&data?.health&&!pilot&&<p className="workflow-note">当前场地可整理资料与现场核查记录。地图情景编辑和本地试算目前支持已登记的成都示范区。</p>}
    <div className="workflow-body" ref={bodyRef}>
      {view==='path'?<>
        <section className="workflow-next" aria-label="建议下一步"><span>建议下一步</span><h3>{state.nextStep.title}</h3><p>{state.nextStep.detail}</p><button className="workflow-primary" disabled={disabled(state.nextStep)} onClick={()=>activate(state.nextStep)}>{state.nextStep.action}</button></section>
        <dl className="workflow-metrics"><div><dt>建设预算</dt><dd>{amount(data?.session?.goal?.budget_rmb)}<small>{data?.session?.goal?.budget_rmb!=null?'元':''}</small></dd></div><div><dt>当前情景</dt><dd>{state.currentVersion?`v${state.currentVersion}`:'待建立'}</dd></div><div><dt>空间候选</dt><dd>{{missing:'待生成',stale:'需重新生成',empty:'当前无解',current:`${state.search.count} 个候选`}[state.search.state]}</dd></div><div><dt>讨论报告</dt><dd>{{missing:'待生成',stale:'需更新',current:'当前版本'}[state.reportState]}</dd></div></dl>
        <h3 className="workflow-section-title">规划路径 <small>7 个环节</small></h3>
        <ol className="workflow-path">{state.steps.map(step=><li key={step.id}><button className="workflow-step" data-state={step.status} aria-label={`${step.title}：${step.action}`} disabled={disabled(step)} onClick={()=>activate(step)}>
          {step.status==='saved'?<CheckCircle size={21} weight="fill"/>:step.status==='attention'?<WarningCircle size={21}/>:<Circle size={21}/>}<span><strong>{step.title}</strong><small>{step.state}</small></span><span className="workflow-step-action">{step.action}</span></button></li>)}</ol>
        {siteReady&&<button type="button" className="workflow-secondary" disabled={state.active} onClick={()=>onAction('inspection')}>整理现场核查清单</button>}
        {!siteReady&&<button type="button" className="workflow-secondary" onClick={onClose}>返回地图选址或导入资料</button>}
        <p className="workflow-caption">范围与费用可先检查；温度评价由你手动启动，结果随情景版本保存。</p>
      </>:<section className="workflow-results">
        <PlanningComparison scenarios={data?.session?.pilot_temperature_scenarios||[]} rows={state.rows}/>
        <h3>全部情景版本</h3>
        {state.rows.length?<div className="workflow-table"><table><thead><tr><th>情景 / 目标</th><th>面积㎡</th><th>假设建设费元</th><th>温差℃</th><th>对照状态</th><th>数值约束</th></tr></thead><tbody>{state.rows.map(row=><tr key={row.id}>
          <td>v{row.version}{row.is_current?' · 当前':''}<small>目标 v{row.goal_version??'待填写'}</small></td><td>{amount(row.area_m2)}</td><td>{amount(row.cost_rmb)}{row.budget_check_passed===false&&<small>超预算</small>}</td>
          <td>{row.delta_lst_c==null?'未计算':amount(row.delta_lst_c)}</td><td>{row.comparison}{row.reference_version!=null&&<small>参照 v{row.reference_version}</small>}</td>
          <td>{row.constraints.label}{row.constraints.checks.filter(check=>['failed','missing'].includes(check.state)).map(check=><small key={check.id}>{check.detail}</small>)}</td>
        </tr>)}</tbody></table></div>:<p className="workflow-note">保存地图试算情景后，在这里查看各版面积、费用和已执行的模型结果。</p>}
        <div className="workflow-result-actions"><button disabled={blocked||!pilot||!accountId} onClick={()=>onAction('evaluate')}>查看情景并手动评价</button><button disabled={blocked||!pilot||!accountId} onClick={()=>onAction('report')}>前往生成带版本报告</button></div>
        <h3>当前成果与待办</h3><dl><div><dt>报告</dt><dd>{{current:'已有当前版本报告',stale:'现有报告对应旧版，请重新生成',missing:'尚未生成'}[state.reportState]}</dd></div>
          <div><dt>当前约束检查</dt><dd>{state.currentConstraints.label}</dd></div>
          <div><dt>用户保留范围</dt><dd>v{state.protection.version} · {state.protection.areas.length} 块</dd></div>
          <div><dt>用户优先区域</dt><dd>v{state.priority.version} · {state.priority.areas.length} 块</dd></div>
          <div><dt>场地核查</dt><dd>已人工关联 {state.linkedInspections.length} 条，{state.linkedInspections.filter(item=>item.status==='pending').length} 条待核查</dd></div></dl>
        <p>进度包包含七步状态、已保存会话、版本地图、当前场地核查记录和已有报告。未运行或过期结果会明确标注。</p>
        <button className="workflow-primary" disabled={blocked||exporting||!!error||!data} onClick={exportProgress}><DownloadSimple size={16}/>{exporting?'正在整理…':'下载规划进度包'}</button>
        {notice&&<p role="status">{notice}</p>}
        <p className="workflow-note">这些结果用于方案讨论。费用来自本轮单价假设，现场条件与实际改造效果需另行核实。</p>
      </section>}
    </div>
  </aside>;
}
