export const HEAT_PERCEPTION_TOOL='get_chengdu_heat_perception';
export const HEAT_PERCEPTION_DESCRIPTION='查询已归档的成都微博热感知抽样，返回城市级线索数量、主题和来源；不用于网格温度或人口估计。';
export const HEAT_PERCEPTION_PATH='public/data/weibo_heat_perception_archive.json';
export const XHS_HEAT_PERCEPTION_TOOL='get_chengdu_xhs_heat_perception';
export const XHS_HEAT_PERCEPTION_DESCRIPTION='查询成都小红书热感知归档，返回市内公开样本、诉求及可回查来源。';
export const XHS_HEAT_PERCEPTION_PATH='public/data/heat_perception.json';
export const START_HEAT_COLLECTION='start_chengdu_heat_collection';
export const GET_HEAT_COLLECTION='get_chengdu_heat_collection';
export const START_XHS_COLLECTION='start_chengdu_xhs_heat_collection';
export const GET_XHS_COLLECTION='get_chengdu_xhs_heat_collection';

export function heatCollectionRequested(text) {
  return /微博|小红书|热感知/.test(text)&&/现在去|实时|最新|重新采集|抓取|采一批|采集/.test(text)&&
    !/最新(?:的|一批)?(?:归档|快照)/.test(text)&&
    !/不(?:要|用|必)|无需|别(?:查|采)/.test(text);
}

export function heatPerceptionRequested(text) {
  return /微博|热感知(?:线索|快照|归档)|公众热感/.test(text);
}

export function heatSnapshotOnly(text) {
  return /微博.*热感知|小红书|热感知(?:归档|快照)/.test(text)&&
    /查|读取|调取|多少|几条|有哪些/.test(text)&&
    !/不(?:要|用|必)|无需|别查|场地|网格|方案|预算|面积|费用|单价|温度/.test(text);
}

export function heatSnapshotReply(result) {
  const topics=result.demand_topics.map(({topic,count})=>`${topic} ${count} 条`).join('、');
  const samples=result.source.channel==='微博'?'去重后保留的市内样本':'市内样本';
  return `成都${result.source.channel}热感知归档有 ${result.sample_count} 条${samples}，其中 ${result.public_demand_count} 条为公开诉求。${topics?`诉求主题包括 ${topics}。`:''}${result.message}`;
}

export function summarizeHeatSnapshot(snapshot,channel) {
  if(snapshot.schema!=='heat-perception/1'||snapshot.source?.city!=='成都'||!Array.isArray(snapshot.items))
    throw new Error('Unsupported heat perception snapshot');
  const inScope=snapshot.items.filter(item=>item.in_scope===true);
  const demand=inScope.filter(item=>item.is_public_demand===true);
  const topics=new Map();
  for(const item of demand){
    const topic=item.demand_topic_zh||item.demand_topic||'其他';
    topics.set(topic,(topics.get(topic)||0)+1);
  }
  const summary={sample_count:inScope.length,public_demand_count:demand.length,
    demand_topics:[...topics].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([topic,count])=>({topic,count}))};
  if(channel==='xiaohongshu'){
    const notes=new Map();
    for(const item of [...demand,...inScope]){
      const url=/^https:\/\/(?:www\.)?xiaohongshu\.com\/explore\/[0-9a-f]{24}(?=$|[/?#])/i.exec(item.source_url)?.[0];
      if(url&&!notes.has(url))notes.set(url,{url,excerpt:String(item.excerpt||item.text||'').slice(0,160)});
      if(notes.size===3)break;
    }
    summary.examples=[...notes.values()];
  }
  return summary;
}

export function heatClues(snapshot,channel) {
  return snapshot.items.filter(item=>item.in_scope===true&&typeof item.item_id==='string').map(item=>{
    const source=String(item.source_url||'');
    const allowed=channel==='xiaohongshu'
      ?/^https:\/\/(?:www\.)?xiaohongshu\.com\/explore\/[0-9a-f]{24}(?=$|[/?#])/i
      :/^https:\/\/(?:(?:m|www)\.)?weibo\.(?:com|cn)\//i;
    const match=source.match(allowed);
    let sourceUrl=null;
    if(match){
      const url=new URL(source);url.search='';url.hash='';
      sourceUrl=channel==='xiaohongshu'?match[0]:url.href;
    }
    const places=new Map();
    for(const place of Array.isArray(item.place_evidence)?item.place_evidence:[]){
      if(typeof place?.name!=='string')continue;
      const name=place.name.trim().slice(0,200);
      if(name&&!places.has(name))places.set(name,{name,kind:String(place.kind||'')});
    }
    return {
      item_id:item.item_id,kind:item.kind==='comment'?'comment':'post',
      excerpt:String(item.excerpt||item.text||'').slice(0,600),
      text:String(item.text||item.text_full||item.excerpt||'').slice(0,8000),
      author:typeof item.author==='string'?item.author.slice(0,120):null,
      source_url:sourceUrl,
      published_at:item.published_at||null,topic:String(item.demand_topic_zh||item.demand_topic||'待分类'),
      is_public_demand:item.is_public_demand===true,places:[...places.values()],
      review_status:typeof item.review_status==='string'?item.review_status:'needs_review',
    };
  });
}
