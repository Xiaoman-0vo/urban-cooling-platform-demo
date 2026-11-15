import React,{useEffect,useState} from 'react';
import {accountRequest} from './account-api.js';

const active=collection=>['queued','running'].includes(collection?.status);
const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'});

const sources={
  weibo:{label:'微博',entry:'采集最新微博',item:'帖子',scope:'从微博搜索结果中抽样，仅保留近 7 天发布的内容。'},
  xhs:{label:'小红书',entry:'采集小红书',item:'笔记',scope:'按关键词发起新搜索，抽取公开笔记和页面已加载的一级评论。'},
};

export default function HeatCollection({accountId,channel}){
  const source=sources[channel];
  const route=`/${channel}-collection`;
  const [keyword,setKeyword]=useState('高温 遮阴');
  const [collection,setCollection]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [readError,setReadError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    let timer;
    async function refresh(){
      try{
        const {collection}=await accountRequest(route,{accountId,signal:controller.signal});
        if(controller.signal.aborted)return;
        setReadError('');
        setCollection(collection);
        if(active(collection))timer=setTimeout(refresh,3500);
      }catch(err){
        if(!controller.signal.aborted)setReadError(err.message);
      }
    }
    refresh();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[accountId,busy,revision,route]);

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

  const summary=collection?.summary;
  return <section className="agent-chat" aria-label={source.entry}>
    <h3>{source.entry}</h3>
    <p>{source.scope}</p>
    <form className="agent-weibo-form" onSubmit={submit}>
      <label>成都{source.label}关键词<input value={keyword} onChange={event=>setKeyword(event.target.value)} maxLength={40}
        required disabled={busy||active(collection)}/></label>
      <button type="submit" className="agent-primary" disabled={busy||active(collection)||!keyword.trim()}>
        {busy?'正在提交…':'开始采集'}
      </button>
    </form>
    {error&&<p role="alert" className="agent-error">{error}</p>}
    {readError&&<div role="alert" className="agent-error">{readError} <button type="button" onClick={()=>setRevision(value=>value+1)}>重新读取状态</button></div>}
    {!collection&&!error&&!readError&&<p role="status">正在读取采集状态…</p>}
    {collection&&collection.status!=='idle'&&<div className="agent-weibo-result" role="status">
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
        {!!summary.examples?.length&&<ul>{summary.examples.map(({url,excerpt})=><li key={url}><a href={url} target="_blank" rel="noreferrer">{excerpt||'查看原笔记'}</a></li>)}</ul>}
        <details><summary>查看来源</summary><p>{source.label}搜索及一级评论 · 文件 SHA-256</p><code>{summary.sha256}</code></details>
      </>}
    </div>}
  </section>;
}
