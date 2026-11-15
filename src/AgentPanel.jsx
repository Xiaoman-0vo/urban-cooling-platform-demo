import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUp, ArrowClockwise, CheckCircle, DownloadSimple, MapPin, Sparkle, WarningCircle, X} from '@phosphor-icons/react';
import './agent.css';
import AgentTasks from './AgentTasks.jsx';
import AgentEvidence from './AgentEvidence.jsx';
import {activeStep} from './agent-labels.js';
import {pilotGeoJson} from './pilot-map.js';
import {AGENT_API,accountRequest} from './account-api.js';
import HeatCollection from './HeatCollection.jsx';

const STORAGE='urbancool-project-agent-v1';
const format=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2});
const TEAM_DEMO_PROMPT='请让资料核查、方案探索和预测评估三个Agent协作：查询当前场地；按我给定的讨论假设，预算10万元，候选面积800平方米，建设单价100元/平方米，保留建筑，生成并比较三档配置草案，然后尝试温度预测；未接通则列出阻塞条件。';
const PILOT_DEMO_PROMPT='按讨论假设，预算10万元、候选面积上限300平方米、建设单价300元/平方米。比较落图候选A和B的面积与费用。';
const PILOT_DEMO_FIELDS={budget_rmb:100000,candidate_area_m2:300,unit_cost_rmb_per_m2:300};
const scopeOf=context=>`${context.site_id}|${context.scenario_id || ''}${context.planning_mode?'|'+context.planning_mode:''}`;
const GOAL_LABELS={budget_rmb:['预算','元'],candidate_area_m2:['声明候选面积','㎡'],unit_cost_rmb_per_m2:['假设建设单价','元/㎡'],added_green_target_m2:['新增绿量目标','㎡'],target_delta_lst_c:['期望地表降温','℃']};

async function agentRequest(path,body,signal,accountId) {
  let response;
  try {
    if(accountId)return await accountRequest(path,{accountId,method:body?'POST':'GET',body,signal});
    response=await fetch(`${AGENT_API}${path}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-UrbanCool-Agent':'1'}:{},body:body?JSON.stringify(body):undefined,signal});
  }catch(error){
    if(!(error instanceof TypeError))throw error;
    throw new Error('暂时无法连接 Agent 服务，请确认工作台后端正在运行。');
  }
  let data;
  try{data=await response.json();}catch{throw new Error('Agent 服务未接通。静态演示不提供模型调用；本地请运行 npm run dev:agent。');}
  if(!response.ok){const error=new Error(data.error?.message || 'Agent 请求未完成。');error.session=data.session;error.code=data.error?.code;throw error;}
  return data;
}
function download(name,text,type='text/markdown;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function RichText({text}) {
  return <div className="agent-rich-text">{text.split(/(\*\*[^*]+\*\*)/g).map((part,index)=>part.startsWith('**')?<strong key={index}>{part.slice(2,-2)}</strong>:<React.Fragment key={index}>{part}</React.Fragment>)}</div>;
}

export default function AgentPanel({open,onOpenChange,context,onLocate,onPreview,accountId,modelRevision,onModelSettings}) {
  const [health,setHealth]=useState(null),[session,setSession]=useState(null),[input,setInput]=useState('');
  const [error,setError]=useState(null),[sending,setSending]=useState(false),[tab,setTab]=useState('chat');
  const [stoppingRun,setStoppingRun]=useState(null);
  const [pilotMode,setPilotMode]=useState(false);
  const [evidenceRun,setEvidenceRun]=useState(null);
  const [draftFields,setDraftFields]=useState({budget_rmb:'',candidate_area_m2:'',unit_cost_rmb_per_m2:''});
  const scrollRef=useRef(null),abortRef=useRef(null),inputRef=useRef(null),sessionRef=useRef(null),contextRef=useRef(context),generationRef=useRef(0);
  const newSessionRef=useRef(false);
  const request=(path,body,signal)=>agentRequest(path,body,signal,accountId);
  const pilotAvailable=health?.pilot?.site_id===context.site_id&&health?.pilot?.scenario_id===context.scenario_id&&Boolean(health?.pilot);
  const historicalPrompt=health?.historical_temperature?.sample_prompt;
  const localPlanning=Boolean(health?.local_planning);
  const modelOffline=health?.model_available===false;
  const snapshotAvailable=Boolean(health?.heat_perception);
  const pilotActive=pilotMode&&pilotAvailable;
  contextRef.current=pilotActive?{...context,planning_mode:'mapped_pilot'}:context;
  const scopeKey=scopeOf(contextRef.current),storageKey=pilotActive?`${STORAGE}-pilot`:STORAGE;
  const activeRun=session?.active_run_id;
  const busy=sending||Boolean(activeRun);
  const stopping=Boolean(activeRun&&stoppingRun===activeRun);
  const updateSession=value=>{if(value&&sessionRef.current?.id===value.id&&(value.event_version || 0)<(sessionRef.current.event_version || 0))return;sessionRef.current=value;setSession(value);};
  useEffect(()=>()=>abortRef.current?.abort(),[]);
  useEffect(()=>{
    newSessionRef.current=false;
    generationRef.current++;abortRef.current?.abort();abortRef.current=null;
    updateSession(null);setError(null);setSending(false);setEvidenceRun(null);setStoppingRun(null);onPreview?.(null);
  },[scopeKey]);
  useEffect(()=>{
    if(!open)return;
    let active=true;const generation=generationRef.current;
    request('/health').then(data=>{
      if(active){setHealth(data);setError(previous=>previous?.source==='health'?null:previous);}
    }).catch(err=>{if(active){setHealth(null);setError({message:err.message,source:'health'});}});
    if(!sessionRef.current&&!newSessionRef.current){
      let path;
      if(accountId){
        const {site_id,scenario_id,planning_mode}=contextRef.current;
        path=`/sessions?${new URLSearchParams({site_id:site_id||'',scenario_id:scenario_id||'',planning_mode:planning_mode||''})}`;
      }else{
        let saved;try{saved=JSON.parse(localStorage.getItem(storageKey) || 'null');}catch{}
        if(saved?.scope===scopeKey)path=`/sessions/${encodeURIComponent(saved.id)}`;
      }
      if(path)request(path).then(data=>{
        if(active&&generation===generationRef.current)updateSession(data.session);
      }).catch(err=>{
        if(active&&generation===generationRef.current&&err.code!=='session_not_found')
          setError({message:err.message});
      });
    }
    return()=>{active=false;};
  },[open,scopeKey,accountId,modelRevision]);
  useEffect(()=>{
    if(!accountId&&session&&(!context.site_id||scopeOf(session.context)===scopeKey))try{localStorage.setItem(storageKey,JSON.stringify({scope:scopeKey,id:session.id}));}catch{}
  },[session?.id,scopeKey,storageKey,accountId]);
  useEffect(()=>{if(tab==='chat'&&scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[session?.messages?.length,busy,tab]);
  useEffect(()=>{
    if(!busy||!session?.id)return;
    let active=true,pending=false;const controller=new AbortController(),id=session.id;
    const tick=async()=>{if(pending)return;pending=true;try{const data=await request(`/sessions/${id}`,undefined,controller.signal);if(active&&sessionRef.current?.id===id)updateSession(data.session);}catch{}finally{pending=false;}};
    const timer=setInterval(tick,1200);tick();
    return()=>{active=false;clearInterval(timer);controller.abort();};
  },[busy,session?.id,scopeKey,accountId]);

  async function send(text=input,planningAction) {
    if(abortRef.current||sessionRef.current?.active_run_id||!text.trim())return;
    generationRef.current++;
    const controller=new AbortController();abortRef.current=controller;
    const startingContext=contextRef.current;
    setSending(true);setError(null);setInput('');setTab('chat');
    try {
      let current=sessionRef.current;
      if(!current){
        const created=await request('/sessions',{context:startingContext},controller.signal);
        if(abortRef.current!==controller)return;
        current=created.session;
        updateSession(current);
      }
      setSession({...current,messages:[...current.messages,{id:'pending-user',role:'user',content:text.trim()}]});
      const result=await request('/chat',{session_id:current.id,message:text,context:startingContext,
        ...(planningAction?{planning_action:planningAction}:{})},controller.signal);
      if(abortRef.current===controller){updateSession(result.session);return true;}
    } catch(err) {
      if(abortRef.current!==controller||controller.signal.aborted)return;
      if(err.session)updateSession(err.session);
      else setSession(sessionRef.current);
      const last=err.session?.messages.at(-1);
      if(last?.role!=='error'||last.content!==err.message){
        setError({message:err.message});
        if(!planningAction)setInput(text);
      }
    } finally {
      if(abortRef.current===controller){setSending(false);abortRef.current=null;}
    }
  }
  function newConversation(){if(busy)return;newSessionRef.current=true;generationRef.current++;updateSession(null);onPreview?.(null);setInput('');setError(null);setEvidenceRun(null);setDraftFields({budget_rmb:'',candidate_area_m2:'',unit_cost_rmb_per_m2:''});if(!accountId)try{localStorage.removeItem(storageKey);}catch{}}
  async function refresh(){
    const id=sessionRef.current?.id,generation=generationRef.current;
    if(!id||busy)return;
    try{
      const data=await request(`/sessions/${id}`);
      if(generation===generationRef.current){updateSession(data.session);setError(null);}
    }catch(err){if(generation===generationRef.current)setError({message:err.message});}
  }
  async function stopTurn(){
    const id=sessionRef.current?.id,runId=sessionRef.current?.active_run_id;
    if(!id||!runId||stopping)return;
    setStoppingRun(runId);
    try{
      await request(`/sessions/${id}/cancel`,{run_id:runId});
    }catch(err){
      if(sessionRef.current?.id!==id||sessionRef.current.active_run_id!==runId)return;
      if(err.code==='run_not_active'){
        try{
          const data=await request(`/sessions/${id}`);
          if(sessionRef.current?.id===id)updateSession(data.session);
        }catch{}
      }else setError({message:err.message});
      setStoppingRun(previous=>previous===runId?null:previous);
    }
  }
  async function submitAssumptions(event){
    event.preventDefault();
    const entries=Object.entries(draftFields).filter(([,value])=>value!=='');
    if(!entries.length)return;
    const clauses=entries.map(([field,value])=>`${GOAL_LABELS[field][0]}${value}${GOAL_LABELS[field][1]}`);
    const action=pilotActive?{type:'compare',fields:Object.fromEntries(entries.map(([key,value])=>[key,Number(value)]))}:undefined;
    const saved=await send(`请登记以下由我提供的讨论假设，保留建筑：${clauses.join('，')}。${pilotActive?'用这些条件核算候选A、B的面积和费用':'条件齐全后生成三档配置目标草案并比较面积与费用'}，不计算温度。`,action);
    if(saved)setDraftFields({budget_rmb:'',candidate_area_m2:'',unit_cost_rmb_per_m2:''});
  }
  const scenarios=session?.scenarios || [],currentScenarios=scenarios.filter(s=>!s.is_stale),oldScenarios=scenarios.filter(s=>s.is_stale);
  const tasks=session?.tasks||[];
  const currentTask=tasks.findLast(task=>task.run_id===session?.active_run_id&&task.status==='running');
  const rootByRun=new Map(tasks.filter(task=>!task.parent_task_id).map(task=>[task.run_id,task]));
  const runsWithEvidence=new Set(tasks.filter(task=>task.trace_ids.length>0).map(task=>task.run_id));
  const openEvidence=runId=>{setEvidenceRun(runId);setTab('evidence');};
  const sessionId=session?.id;
  const loadEvidence=useCallback(async(runId,signal)=>{
    const data=await agentRequest(`/sessions/${sessionId}/evidence?${new URLSearchParams({run_id:runId})}`,undefined,signal,accountId);
    return data.traces;
  },[sessionId,accountId]);
  const lastReport=session?.reports?.at(-1);
  const selectedId=context.selection?.id;
  const pilot=pilotActive?(session?.pilot||health.pilot):null;
  function showMap(items){
    const collection=pilotGeoJson(items);
    const points=collection.features.flatMap(f=>f.geometry.coordinates[0]);
    if(!points.length)return;
    const center=[0,1].map(axis=>(Math.min(...points.map(p=>p[axis]))+Math.max(...points.map(p=>p[axis])))/2);
    onPreview?.(collection,center);
  }
  return <>
    {!open&&<button className="agent-launcher" onClick={()=>onOpenChange(true)} aria-label="打开 AI 规划助手"><Sparkle size={23} weight="fill"/><span>AI 规划助手<small>查询资料 · 整理方案</small></span><i/></button>}
    {open&&<aside className="agent-panel" aria-label="AI 规划助手">
      <header className="agent-heading"><div className="agent-mark"><Sparkle size={24} weight="fill"/></div><div><span>URBANCOOL AI</span><h2>规划协作助手</h2></div><button aria-label="关闭 AI 规划助手" onClick={()=>onOpenChange(false)}><X size={20}/></button></header>
      <div className="agent-context"><span className={health&&!modelOffline?'agent-dot ready':'agent-dot'} aria-hidden="true"/><span>{localPlanning?'本地规划工具':health?.configured?`${health.provider} · ${modelOffline?'未连接':health.model}`:health?'语言模型待配置':error?.source==='health'?'Agent 服务连接失败':'正在读取服务状态'}</span>{onModelSettings&&<button type="button" className="agent-text-button" onClick={onModelSettings}>模型设置</button>}</div>
      <div className="agent-scope"><MapPin size={14} aria-hidden="true"/><span>{selectedId?`地图选中 ${selectedId}`:context.site_id?`场地 ${context.site_id}`:'全域视图'}</span></div>
      {(pilotAvailable||historicalPrompt||snapshotAvailable)&&<div className="agent-quick-actions">
        {pilotAvailable&&<button type="button" disabled={busy} aria-pressed={pilotActive} onClick={()=>{setPilotMode(!pilotActive);setTab(pilotActive?'chat':'plans');}}>{pilotActive?'返回常规草案':'打开落图试点'}</button>}
        {historicalPrompt&&<button type="button" disabled={busy} onClick={()=>send(historicalPrompt)}>运行历史温度样例</button>}
        {snapshotAvailable&&<button type="button" disabled={busy} onClick={()=>send('查询成都微博热感知快照',{type:'heat_perception'})}>查微博历史归档</button>}
        {health?.heat_perception?.xiaohongshu&&<button type="button" disabled={busy} onClick={()=>send('查询成都小红书热感知快照',{type:'xhs_heat_perception'})}>查小红书归档</button>}
        {health?.heat_perception?.collection&&<button type="button" aria-pressed={tab==='weibo'} onClick={()=>setTab(tab==='weibo'?'chat':'weibo')}>采集最新微博</button>}
        {health?.heat_perception?.collection&&health.heat_perception.xiaohongshu&&<button type="button" aria-pressed={tab==='xhs'} onClick={()=>setTab(tab==='xhs'?'chat':'xhs')}>采集小红书</button>}
      </div>}
      <nav className="agent-tabs" aria-label="规划助手视图">
        <button className={tab==='chat'?'active':''} aria-pressed={tab==='chat'} onClick={()=>setTab('chat')}>协作对话</button>
        <button className={tab==='tasks'?'active':''} aria-pressed={tab==='tasks'} onClick={()=>setTab('tasks')}>协作任务{busy&&<b>进行中</b>}</button>
        <button className={tab==='plans'?'active':''} aria-pressed={tab==='plans'} onClick={()=>setTab('plans')}>目标与草案{currentScenarios.length>0&&<b>{currentScenarios.length}</b>}</button>
        <button className={tab==='evidence'?'active':''} aria-pressed={tab==='evidence'} onClick={()=>{setEvidenceRun(null);setTab('evidence');}}>执行依据</button>
      </nav>
      {modelOffline&&<p className="agent-offline-note">模型对话暂不可用。仍可查询{historicalPrompt?'快照和历史温度':'快照'}，也可用落图试点表单比较方案。</p>}
      {error&&<div className="agent-error" role="alert"><WarningCircle size={17}/><span>{error.message}</span></div>}
      {(tab==='weibo'||tab==='xhs')&&<HeatCollection key={tab} accountId={accountId} channel={tab}/>}
      {tab==='chat'&&<div className="agent-chat" ref={scrollRef} aria-live="polite">
        {!session?.messages?.length&&<div className="agent-welcome"><div className="agent-welcome-icon"><Sparkle size={29}/></div><h3>从一个规划问题开始</h3><p>{localPlanning?'可以查询历史地表温度。比较面积、费用和旧版本，请先打开落图试点。':'一起查看已有资料，明确目标，再比较可追溯的配置草案。'}</p>{!localPlanning&&<div className="agent-suggestions">{[['先看看场地','请梳理当前已载入场地的真实资料，说明现有绿量和数据限制。'],['检查计算条件','当前场地还缺哪些输入，为什么还不能运行温度预测？'],['准备方案比较','我想比较几套增绿方案，先告诉我需要提供哪些条件。'],['体验多 Agent 协作',TEAM_DEMO_PROMPT]].map(([label,prompt])=><button key={label} onClick={()=>send(prompt)} disabled={busy}>{label}<span>↗</span></button>)}</div>}<div className="agent-boundary"><CheckCircle size={15}/><span>{historicalPrompt?'已登记网格可估计历史地表温度，方案降温待验证。':'方案降温计算待接入。'}</span></div></div>}
        {(session?.messages || []).map(message=>{
          const task=rootByRun.get(message.turn_id);
          const hasEvidence=runsWithEvidence.has(message.turn_id);
          const modelProblem=['missing_api_key','provider_unreachable','provider_auth_failed','invalid_endpoint'].includes(task?.result?.error?.code);
          return <article className={`agent-message ${message.role}`} key={message.id}>
            <span className="agent-message-author">{message.role==='user'?'你':message.role==='assistant'?'UrbanCool':'任务状态'}</span>
            <RichText text={message.content}/>
            {message.role!=='user'&&(hasEvidence||(modelProblem&&onModelSettings))&&<div className="agent-message-actions">
              {hasEvidence&&<button type="button" className="agent-text-button" onClick={()=>openEvidence(message.turn_id)}>查看本轮依据</button>}
              {modelProblem&&onModelSettings&&<button type="button" className="agent-text-button" onClick={onModelSettings}>检查模型设置</button>}
            </div>}
          </article>;
        })}
        {busy&&<div className="agent-working" role="status"><i/><span>{stopping?'正在停止本轮任务':activeStep(currentTask)}</span><button type="button" onClick={()=>setTab('tasks')}>查看进度</button></div>}
        {!busy&&lastReport&&<button className="agent-report-link" onClick={()=>download(`UrbanCool_规划记录_${lastReport.id.slice(0,8)}.md`,lastReport.markdown)}><DownloadSimple size={16}/>下载最近的规划讨论记录{lastReport.goal_version!==session.goal.version?'（旧目标版本）':''}</button>}
      </div>}
      {tab==='tasks'&&<AgentTasks key={sessionId} session={session} agents={health?.agents} onEvidence={openEvidence}/>}
      {tab==='plans'&&<div className="agent-plan-list"><h3>本轮目标配置 <small>v{session?.goal?.version || 0}</small></h3>
        {pilot&&<div className="agent-option"><h4>成都样例候选范围</h4><p>{pilot.candidates.map(c=>`${c.id}（${c.source_review_id||c.review_id}）${c.area_m2}㎡`).join(' · ')}</p><p>资料内边界、建筑、植被、道路中心线已检查。{pilot.outstanding.join('、')}待核实。</p><button className="agent-locate" onClick={()=>showMap(pilot.candidates.map(c=>({kind:'mapped_pilot_option',id:c.id,candidate_id:c.id,added_green_area_m2:c.area_m2,geometry:c.geometry,review_status:c.review_status,source_review_id:c.review_id})))}><MapPin size={14}/>查看候选范围</button><button className="agent-locate" disabled={busy} onClick={()=>send(PILOT_DEMO_PROMPT,localPlanning||modelOffline||!health?.configured?{type:'compare',fields:PILOT_DEMO_FIELDS}:undefined)}>按示例条件比较</button></div>}
        <p className="agent-caption">{pilot?'候选范围来自登记的多边形。可另填面积上限，单价按讨论假设核算。':'容量和单价由你声明，暂不代表已核实的可施工空间。'}</p><form className="agent-goal-form" onSubmit={submitAssumptions}>{Object.entries(draftFields).map(([field,value])=><label key={field}>{pilot&&field==='candidate_area_m2'?'面积上限（选填）':GOAL_LABELS[field][0]}<div><input type="number" min={field==='unit_cost_rmb_per_m2'?'0.01':'0'} step="any" value={value} placeholder={session?.goal?.[field] != null?String(session.goal[field]):'待提供'} onChange={event=>setDraftFields(previous=>({...previous,[field]:event.target.value}))} disabled={busy}/><span>{GOAL_LABELS[field][1]}</span></div></label>)}<button className="agent-primary" disabled={busy||(localPlanning&&!pilot)||!Object.values(draftFields).some(Boolean)}>登记条件并生成草案</button></form>
        {session?.goal?.version>0&&<div className="agent-goal-summary">{Object.entries(GOAL_LABELS).filter(([field])=>session.goal[field]!=null).map(([field,[label,unit]])=><div key={field}><span>{label}</span><strong>{format.format(session.goal[field])} {unit}</strong></div>)}<p>建筑保持不变 · 费用不含养护</p></div>}
        <div className="agent-options-heading"><h3>当前版本草案</h3><span>{currentScenarios.length} 个</span></div>
        {!currentScenarios.length&&<div className="agent-empty">条件齐全后，助手会创建可比较的配置目标。</div>}
        {currentScenarios.map(scenario=><article className="agent-option" key={scenario.id}>
          <div><h4>{scenario.title}</h4><span>{scenario.geometry?'讨论范围':'配置目标'} · v{scenario.goal_version}</span></div>
          <dl><div><dt>{scenario.geometry?'拟改面积':'新增绿量'}</dt><dd>{format.format(scenario.added_green_area_m2)}<small>㎡</small></dd></div><div><dt>假设建设费</dt><dd>{format.format(scenario.estimated_construction_cost_rmb)}<small>元</small></dd></div></dl>
          <p>{scenario.budget_check_passed&&scenario.capacity_check_passed?<><CheckCircle size={14}/>预算及面积条件通过</>:<><WarningCircle size={14}/>{[!scenario.budget_check_passed?'超预算':null,!scenario.capacity_check_passed?'超声明面积':null].filter(Boolean).join(' · ')}</>}</p>
          {scenario.added_green_target_met===false&&<p className="agent-target-gap"><WarningCircle size={14}/>距新增绿量目标还差 {format.format(scenario.added_green_target_gap_m2)}㎡</p>}
          {scenario.added_green_target_met===true&&<p>已达到声明的新增绿量目标</p>}
          {scenario.geometry&&<button className="agent-locate" onClick={()=>showMap([scenario])}><MapPin size={14}/>地图查看 v{scenario.goal_version}</button>}
          <footer>{scenario.geometry?'现场与管控待核实':'位置待落实'} · 预测降温未计算</footer>
        </article>)}
        {oldScenarios.length>0&&<details className="agent-old-options"><summary>{oldScenarios.length} 个旧目标版本草案</summary>{oldScenarios.map(s=><p key={s.id}>{s.title} · v{s.goal_version} · {format.format(s.added_green_area_m2)}㎡ / {format.format(s.estimated_construction_cost_rmb)}元 {s.geometry&&<button className="agent-locate" onClick={()=>showMap([s])}>地图查看</button>}</p>)}</details>}
        {pilot&&currentScenarios.length>0&&<button className="agent-locate" disabled={busy} onClick={()=>send('导出讨论记录',{type:'export'})}><DownloadSimple size={14}/>生成讨论记录</button>}
        {pilot&&scenarios.some(s=>s.geometry)&&<button className="agent-locate" onClick={()=>download('UrbanCool_落图方案版本.geojson',JSON.stringify(pilotGeoJson(scenarios),null,2),'application/geo+json')}><DownloadSimple size={14}/>导出各版地图 GeoJSON</button>}
      </div>}
      {tab==='evidence'&&<AgentEvidence key={`${sessionId}:${evidenceRun}`} traces={session?.traces||[]} tasks={tasks} runId={evidenceRun} isRunning={Boolean(evidenceRun&&activeRun===evidenceRun)} loadEvidence={loadEvidence} onShowAll={()=>setEvidenceRun(null)} onLocate={onLocate}/>}
      <footer className="agent-composer">
        {tab==='chat'&&<form onSubmit={event=>{event.preventDefault();send();}}>
          <label className="agent-sr-only" htmlFor="agent-question">规划问题</label>
          <textarea ref={inputRef} id="agent-question" rows={2} maxLength={4000} placeholder="描述你的规划目标，或询问当前场地…" value={input} onChange={event=>setInput(event.target.value)} disabled={busy} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();send();}}}/>
          <button type="submit" aria-label="发送规划问题" disabled={busy||!input.trim()}><ArrowUp size={20} weight="bold"/></button>
        </form>}
        <div className="agent-bottom-actions">
          {tab==='chat'?<span>Enter 发送 · Shift+Enter 换行</span>:<button type="button" className="agent-back-chat" onClick={()=>setTab('chat')}>返回对话</button>}
          <button onClick={refresh} disabled={busy||!session} aria-label="刷新 Agent 会话" title="刷新会话"><ArrowClockwise size={15}/></button>
          <button onClick={newConversation} disabled={busy}>新会话</button>
          {session&&<button onClick={()=>download(`UrbanCool_Agent_${session.id.slice(0,8)}.json`,JSON.stringify(session,null,2),'application/json;charset=utf-8')}>导出记录</button>}
          {busy&&<button className="agent-stop" disabled={!activeRun||stopping} onClick={stopTurn}>{stopping?'正在停止…':'停止本轮'}</button>}
        </div>
      </footer>
    </aside>}
  </>;
}
