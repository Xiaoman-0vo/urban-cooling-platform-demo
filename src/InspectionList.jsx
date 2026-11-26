import React,{useEffect,useState} from 'react';
import {accountRequest} from './account-api.js';
import HeatClue,{cluePlaceNames,clueTime} from './HeatClue.jsx';
import {inspectionStatuses as statuses,inspectionDraft,draftChanged,readInspectionDraft,writeInspectionDraft,filterInspections} from './inspection-state.js';

function draftStorage() {try{return window.sessionStorage;}catch{return null;}}

function InspectionRecord({item,accountId,currentSiteId,onSave,onDiscuss,onLocate}) {
  const [recovered]=useState(()=>readInspectionDraft(draftStorage(),accountId,item));
  const [draft,setDraft]=useState(()=>recovered||inspectionDraft(item));
  const [stored,setStored]=useState(Boolean(recovered));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const dirty=draftChanged(draft,item);
  const conflict=dirty&&draft.revision!==item.revision;
  const siteOptions=[...new Set([currentSiteId,item.site?.site_id,draft.site_id].filter(Boolean))];
  useEffect(()=>{
    if(!dirty)return;
    const warn=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  function edit(field,value) {
    const next={...draft,[field]:value};setDraft(next);setError('');
    setStored(writeInspectionDraft(draftStorage(),accountId,item,next));
  }
  function reset() {
    const next=inspectionDraft(item);setDraft(next);setError('');
    setStored(writeInspectionDraft(draftStorage(),accountId,item,next));
  }
  function rebase() {
    const next={...draft,revision:item.revision};setDraft(next);setError('');
    setStored(writeInspectionDraft(draftStorage(),accountId,item,next));
  }
  async function save(event) {
    event.preventDefault();if(conflict||!dirty||busy)return;setBusy(true);setError('');
    try{
      const {item:saved}=await accountRequest(`/inspection-items/${item.id}`,{
        accountId,method:'PUT',body:draft,
      });
      writeInspectionDraft(draftStorage(),accountId,saved,inspectionDraft(saved));
      onSave(saved);
    }catch(err){setError(err.message);}
    finally{setBusy(false);}
  }
  return <section className="agent-inspection-record">
    <HeatClue clue={item.clue} collectedAt={item.source.collected_at}>
      <button type="button" className="agent-text-button" disabled={busy||dirty} onClick={()=>onDiscuss(item)}>带入规划讨论</button>
    </HeatClue>
    <p className="agent-caption">已保存关联场地：{item.site?.site_id||'未关联'}
      {item.site?.center_lon_lat&&onLocate&&<button type="button" className="agent-text-button" onClick={()=>onLocate(item.site.center_lon_lat)}>地图查看网格中心</button>}
    </p>
    <form className="agent-inspection-form" onSubmit={save}>
      <label>关联研究场地<select value={draft.site_id||''} onChange={event=>edit('site_id',event.target.value||null)} disabled={busy}>
        <option value="">未关联</option>
        {siteOptions.map(id=><option value={id} key={id}>{id===currentSiteId?'当前场地 · ':''}{id}</option>)}
      </select></label>
      <p className="agent-caption">人工关联用于安排该场地的调查。具体体验发生位置请在「核实位置」中说明。</p>
      <label>核查状态<select value={draft.status} onChange={event=>edit('status',event.target.value)} disabled={busy}>
        {Object.entries(statuses).map(([value,label])=><option value={value} key={value}>{label}</option>)}
      </select></label>
      <label>核实位置<input value={draft.location_note} onChange={event=>edit('location_note',event.target.value)} maxLength={500}
        placeholder="如站点全名、道路一侧或现场照片编号" disabled={busy}/></label>
      <label>现场记录<textarea value={draft.verification_note} onChange={event=>edit('verification_note',event.target.value)} maxLength={2000} rows={3}
        placeholder="记录地面用途、遮阴、保留通道及仍待确认的条件" disabled={busy}/></label>
      {error&&<p role="alert" className="agent-error">{error}</p>}
      {conflict&&<div className="agent-inspection-conflict" role="alert">
        <p>账户记录已有新版本。你的草稿保留着，请对照后选择如何继续。</p>
        <details><summary>查看账户中的最新记录</summary>
          <p>核查状态：{statuses[item.status]}</p><p>核实位置：{item.location_note||'待填写'}</p>
          <p>关联研究场地：{item.site?.site_id||'未关联'}</p>
          <p>现场记录：{item.verification_note||'待填写'}</p>
        </details>
        <div className="agent-heat-clue-actions">
          <button type="button" className="agent-text-button" onClick={reset}>使用最新记录，放弃草稿</button>
          <button type="button" className="agent-text-button" onClick={rebase}>以草稿继续编辑最新版本</button>
        </div>
      </div>}
      <button className="agent-primary" disabled={busy||!dirty||conflict}>{busy?'正在保存…':'保存核查记录'}</button>
      {dirty&&<>
        <p className="agent-caption" role="status">{stored?'未保存的草稿已保留在当前标签页，切换视图后可恢复。':'记录尚未保存。'} 保存后同步到账户，并可带入规划讨论。</p>
        {!conflict&&<button type="button" className="agent-text-button" onClick={reset}>放弃草稿，恢复已保存记录</button>}
      </>}
      {!dirty&&item.revision>1&&<p className="agent-caption" role="status">已保存 · {clueTime(item.updated_at)}</p>}
    </form>
  </section>;
}

export default function InspectionList({accountId,currentSiteId,onDiscuss,onLocate}) {
  const [items,setItems]=useState(null);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true);
  const [status,setStatus]=useState('all');
  const [keyword,setKeyword]=useState('');
  const [siteScope,setSiteScope]=useState('all');
  useEffect(()=>setSiteScope('all'),[currentSiteId]);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);
    accountRequest('/inspection-items',{accountId,signal:controller.signal}).then(data=>{
      if(!controller.signal.aborted){setItems(data.items);setError('');}
    }).catch(err=>{if(!controller.signal.aborted)setError(err.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[accountId,revision]);
  const inScope=filterInspections(items||[],{siteId:siteScope==='current'?currentSiteId:null});
  const visible=filterInspections(inScope,{status,keyword});
  const counts=Object.keys(statuses).map(value=>({value,label:statuses[value],count:inScope.filter(item=>item.status===value).length}));
  function exportList() {
    const lines=['# UrbanCool 现场核查清单','',`筛选状态：${statuses[status]||'全部'}；搜索：${JSON.stringify(keyword.trim())}；共 ${visible.length} 条。`,
      `场地筛选：${siteScope==='current'?currentSiteId:'全部场地'}。`,
      '导出内容为已保存记录。','',...visible.flatMap(item=>[
      `## ${item.clue.topic} · ${statuses[item.status]}`,'',
      `- 人工关联研究场地 ${item.site?.site_id||'未关联'}（用于组织调查，体验发生位置另见核实位置）`,
      ...(item.site?[`- 场地中心参考 WGS84 ${item.site.center_lon_lat.join(', ')}；来源 ${item.site.source}；SHA-256 ${item.site.source_sha256}`,
        `- 人工关联时间 ${item.site.linked_at}`]:[]),
      `- 核实位置 ${item.location_note||'待填写'}`,
      `- 文本地点线索 ${cluePlaceNames(item.clue).join('、')||'待核查'}`,
      `- 现场记录 ${item.verification_note||'待填写'}`,
      `- 公开表达原文 ${JSON.stringify(item.clue.text)}`,
      `- 来源链接 ${item.clue.source_url||'本批未提供有效链接'}`,
      `- 采集查询 ${item.source.query} · ${item.source.collected_at}`,
      `- 来源批次 ${item.source.job_id} · 条目 ${item.source.item_id} · SHA-256 ${item.source.sha256}`,
      `- 核查记录 ${item.id} · v${item.revision} · ${item.updated_at}`,'',
    ])];
    const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='UrbanCool_现场核查清单.md';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  return <section className="agent-chat" aria-label="现场核查清单">
    <h3>现场核查清单</h3>
    <p>从采集线索登记待核查地点，补充现场位置与记录，再带入规划讨论。</p>
    <div className="agent-heat-clue-actions">
      <button type="button" className="agent-text-button" disabled={loading} onClick={()=>setRevision(value=>value+1)}>{loading?'正在读取…':'重新读取'}</button>
      {!!items?.length&&<button type="button" className="agent-text-button" disabled={!visible.length} onClick={exportList}>导出筛选结果（{visible.length}）</button>}
    </div>
    {!!items?.length&&<>
      {currentSiteId&&<div className="agent-inspection-counts" aria-label="场地筛选">
        <button type="button" aria-pressed={siteScope==='all'} onClick={()=>setSiteScope('all')}>全部场地</button>
        <button type="button" aria-pressed={siteScope==='current'} onClick={()=>setSiteScope('current')}>当前场地 · {currentSiteId}</button>
      </div>}
      <div className="agent-inspection-counts" aria-label="核查状态统计">
        <button type="button" aria-pressed={status==='all'} onClick={()=>setStatus('all')}>全部 {inScope.length}</button>
        {counts.map(({value,label,count})=><button type="button" key={value} aria-pressed={status===value} onClick={()=>setStatus(value)}>{label} {count}</button>)}
      </div>
      <label className="agent-inspection-search">搜索核查清单<input type="search" value={keyword} onChange={event=>setKeyword(event.target.value)} maxLength={200}
        placeholder="搜索地点、主题、原文或现场记录"/></label>
      <p className="agent-caption" role="status">显示 {visible.length} / {items.length} 条。搜索与导出使用已保存记录。</p>
    </>}
    {error&&<p role="alert" className="agent-error">{error}</p>}
    {!items&&!error&&<p role="status">正在读取核查清单…</p>}
    {items?.length===0&&<p>在采集结果的线索卡上点击「加入现场核查清单」，记录会保存在你的账户中。</p>}
    {!!items?.length&&!visible.length&&<p>没有符合筛选条件的记录。<button type="button" className="agent-text-button" onClick={()=>{setKeyword('');setStatus('all');setSiteScope('all');}}>清除筛选</button></p>}
    {visible.map(item=><InspectionRecord key={`${item.id}:${item.revision}`} item={item} accountId={accountId}
      currentSiteId={currentSiteId} onLocate={onLocate}
      onSave={saved=>setItems(previous=>previous.map(record=>record.id===saved.id?saved:record))} onDiscuss={onDiscuss}/>)}
  </section>;
}
