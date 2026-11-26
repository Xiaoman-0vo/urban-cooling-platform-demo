import React,{useEffect,useState} from 'react';
import {accountRequest} from './account-api.js';
import HeatClue from './HeatClue.jsx';
import {collectionUnavailable,collectionReadinessRetryDelay} from './collection-readiness.js';

const active=collection=>['queued','running'].includes(collection?.status);
const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'});

const sources={
  weibo:{label:'微博',entry:'采集最新微博',item:'帖子',scope:'从微博搜索结果中抽样，仅保留近 7 天发布的内容。'},
  xhs:{label:'小红书',entry:'采集小红书',item:'笔记',scope:'按关键词发起新搜索，抽取公开笔记和页面已加载的一级评论。'},
};

export default function HeatCollection({accountId,channel,onInspect,onArchive}){
  const source=sources[channel];
  const route=`/${channel}-collection`;
  const [keyword,setKeyword]=useState('高温 遮阴');
  const [collection,setCollection]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [readError,setReadError]=useState('');
  const [revision,setRevision]=useState(0);
  const [readiness,setReadiness]=useState(null);
  const [readinessError,setReadinessError]=useState('');
  const [saved,setSaved]=useState({});
  const [saving,setSaving]=useState(null);
  const [savedError,setSavedError]=useState('');
  const unavailable=collectionUnavailable(readiness);
  useEffect(()=>{
    const controller=new AbortController();
    let timer;
    async function refresh(){
      let retry=15000;
      try{
        const result=await accountRequest(`/collection-readiness?channel=${channel}`,{accountId,signal:controller.signal});
        if(controller.signal.aborted)return;
        setReadiness(result);setReadinessError('');
        retry=collectionReadinessRetryDelay(result);
      }catch(err){if(!controller.signal.aborted)setReadinessError(err.message);}
      finally{if(!controller.signal.aborted&&retry!==null)timer=setTimeout(refresh,retry);}
    }
    refresh();
    return()=>{controller.abort();clearTimeout(timer);};
  },[accountId,channel,revision]);
  useEffect(()=>{
    const controller=new AbortController();
    let timer;
    async function refresh(){
      try{
        const {collection}=await accountRequest(route,{accountId,signal:controller.signal});
        if(controller.signal.aborted)return;
        setReadError('');
        setCollection(collection);
        if(active(collection)&&!unavailable)timer=setTimeout(refresh,3500);
      }catch(err){
        if(!controller.signal.aborted){setReadError(err.message);if(!unavailable)timer=setTimeout(refresh,5000);}
      }
    }
    refresh();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[accountId,busy,revision,route,unavailable]);
  useEffect(()=>{
    if(collection?.status!=='done')return;
    const controller=new AbortController();
    accountRequest('/inspection-items',{accountId,signal:controller.signal}).then(({items})=>{
      if(controller.signal.aborted)return;
      const added=Object.fromEntries(items.filter(item=>item.source.channel===channel&&item.source.job_id===collection.job_id)
        .map(item=>[`${item.source.job_id}:${item.source.item_id}`,true]));
      setSaved(previous=>({...previous,...added}));setSavedError('');
    }).catch(err=>{if(!controller.signal.aborted)setSavedError(err.message);});
    return()=>controller.abort();
  },[accountId,channel,collection?.job_id,collection?.status,revision]);

  async function submit(event){
    event.preventDefault();
    if(busy||active(collection)||!keyword.trim())return;
    setBusy(true);
    setError('');
    try{
      const {collection}=await accountRequest(route,{accountId,method:'POST',body:{keyword}});
      setCollection(collection);
    }catch(err){setError(err.message);}
    finally{setBusy(false);}
  }

  async function addInspection(clue) {
    setSaving(clue.item_id);setError('');
    try{
      await accountRequest('/inspection-items',{accountId,method:'POST',
        body:{channel,job_id:collection.job_id,item_id:clue.item_id}});
      setSaved(previous=>({...previous,[`${collection.job_id}:${clue.item_id}`]:true}));
    }catch(err){setError(err.message);}
    finally{setSaving(null);}
  }

  const summary=collection?.summary;
  return <section className="agent-chat" aria-label={source.entry}>
    <h3>{source.entry}</h3>
    {!unavailable&&<p>{source.scope}</p>}
    {!unavailable&&channel==='xhs'&&<p className="agent-caption">采集在后台浏览器窗口读取页面。你可以留在工作台查看进度。</p>}
    <section className="agent-collection-readiness" aria-label="采集准备情况">
      {unavailable?<>
        <div className="agent-collection-readiness-heading"><h4>此入口未启用新采集</h4></div>
        <p>可以继续查询{source.label}历史归档和整理核查记录。</p>
        <p className="agent-caption">这是当前入口的功能范围，重复检查不会开启采集。新采集需要在已连接浏览器的本机工作台运行。</p>
        {onArchive&&<button type="button" className="agent-text-button" onClick={onArchive}>查看{source.label}历史归档</button>}
      </>:<>
      <div className="agent-collection-readiness-heading"><h4>采集准备</h4>
        <button type="button" className="agent-text-button" onClick={()=>setRevision(value=>value+1)}>重新检查</button>
      </div>
      {readiness?.checks.map(check=><div className="agent-collection-check" key={check.id}>
        <span className={check.ready?'agent-dot ready':'agent-dot'} aria-hidden="true"/>
        <strong>{check.label}</strong><span>{check.ready?'已就绪':check.state==='starting'?'正在启动':'待处理'}</span>
        {!check.ready&&<p>{check.message}</p>}
      </div>)}
      {!readiness&&!readinessError&&<p role="status">正在检查采集依赖…</p>}
      {readinessError&&<p role="alert">{readinessError} 将自动重新检查。</p>}
      {channel==='xhs'&&readiness?.checks.some(check=>check.id==='browser'&&!check.ready)&&
        <div className="agent-collection-browser-links">
          <a href="https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk" target="_blank" rel="noreferrer">安装 OpenCLI 扩展</a>
          <a href="https://www.xiaohongshu.com/" target="_blank" rel="noreferrer">打开小红书</a>
        </div>}
      </>}
    </section>
    {!unavailable&&<form className="agent-weibo-form" onSubmit={submit}>
      <label>成都{source.label}关键词<input value={keyword} onChange={event=>setKeyword(event.target.value)} maxLength={40}
        required disabled={busy||active(collection)}/></label>
      <button type="submit" className="agent-primary" disabled={busy||active(collection)||!keyword.trim()||readiness?.ready!==true||Boolean(readinessError)}>
        {busy?'正在提交…':readiness?.ready?'开始采集':'等待采集条件就绪'}
      </button>
    </form>}
    {error&&<p role="alert" className="agent-error">{error}</p>}
    {readError&&<div role="alert" className="agent-error">{readError} 将自动重试。 <button type="button" onClick={()=>setRevision(value=>value+1)}>重新读取状态</button></div>}
    {!unavailable&&!collection&&!error&&!readError&&<p role="status">正在读取采集状态…</p>}
    {collection&&collection.status!=='idle'&&<div className="agent-weibo-result" role="status">
      {collection.status==='failed'&&<p className="agent-caption">上一次采集未完成；当前准备情况见上方。条件就绪后可重新采集。</p>}
      <strong>{collection.message}</strong>
      <p>{collection.query}</p>
      {active(collection)&&collection.posts!=null&&<p>已抓取 {collection.posts} 条{source.item}{collection.comments!=null&&`、${collection.comments} 条一级评论`}</p>}
      {active(collection)&&collection.total!=null&&<p>已判定 {collection.classified||0} / {collection.total} 条</p>}
      {summary&&<>
        <p>采集时间 {time.format(new Date(summary.collected_at))}（北京时间）</p>
        <p>本批 {summary.raw_posts} 条{source.item}、{summary.raw_comments} 条一级评论。筛选后保留 {summary.sample_count} 条市内样本，其中 {summary.public_demand_count} 条公开诉求。</p>
        {summary.demand_topics.length>0&&<p>{summary.demand_topics.map(({topic,count})=>`${topic} ${count} 条`).join('、')}</p>}
        {summary.classification==='partial'&&<p>部分记录未完成判定。</p>}
        {summary.collection==='partial'&&<p>部分笔记或评论未能读取。</p>}
        {collection.clues?.length===0&&<p>本批暂无通过成都范围筛选的线索。</p>}
        {!!summary.examples?.length&&!collection.clues?.length&&<ul>{summary.examples.map(({url,excerpt})=><li key={url}><a href={url} target="_blank" rel="noreferrer">{excerpt||'查看原笔记'}</a></li>)}</ul>}
        <details><summary>查看来源</summary><p>{source.label}搜索及一级评论 · 文件 SHA-256</p><code>{summary.sha256}</code></details>
      </>}
    </div>}
    {!!collection?.clues?.length&&<section aria-label="本批公开线索">
      <div className="agent-collection-readiness-heading"><h4>本批公开线索</h4>
        <button type="button" className="agent-text-button" onClick={onInspect}>查看核查清单</button>
      </div>
      {savedError&&<p className="agent-caption" role="alert">暂时未能读取已加入状态。<button type="button" className="agent-text-button" onClick={()=>setRevision(value=>value+1)}>重新读取</button></p>}
      {collection.clues.map(clue=>{
        const added=saved[`${collection.job_id}:${clue.item_id}`];
        return <HeatClue key={clue.item_id} clue={clue} collectedAt={summary.collected_at}>
          <button type="button" className="agent-text-button" disabled={Boolean(saving)||added} onClick={()=>addInspection(clue)}>
            {added?'已加入核查清单':saving===clue.item_id?'正在加入…':'加入现场核查清单'}
          </button>
        </HeatClue>;
      })}
    </section>}
  </section>;
}
