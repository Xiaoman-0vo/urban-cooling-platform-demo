export const HEAT_PERCEPTION_TOOL='get_chengdu_heat_perception';
export const HEAT_PERCEPTION_DESCRIPTION='查询已归档的成都微博热感知抽样，返回城市级线索数量、主题和来源；不用于网格温度或人口估计。';
export const HEAT_PERCEPTION_PATH='public/data/weibo_heat_perception_archive.json';
export const START_HEAT_COLLECTION='start_chengdu_heat_collection';
export const GET_HEAT_COLLECTION='get_chengdu_heat_collection';

export function heatCollectionRequested(text) {
  return /微博|热感知/.test(text)&&/现在去|实时|最新|重新采集|抓取|采一批|采集/.test(text)&&
    !/不(?:要|用|必)|无需|别(?:查|采)/.test(text);
}

export function heatPerceptionRequested(text) {
  return /微博|热感知(?:线索|快照|归档)|公众热感/.test(text);
}

export function heatSnapshotOnly(text) {
  return /微博.*热感知|热感知(?:归档|快照)/.test(text)&&
    /查询|查一下|查看|读取|调取|多少|几条|有哪些/.test(text)&&
    !/不(?:要|用|必)|无需|别查|场地|网格|方案|预算|面积|费用|单价|温度/.test(text);
}

export function heatSnapshotReply(result) {
  const topics=result.demand_topics.map(({topic,count})=>`${topic} ${count} 条`).join('、');
  return `成都微博热感知归档有 ${result.sample_count} 条去重后保留的市内样本，其中 ${result.public_demand_count} 条为公开诉求。${topics?`诉求主题包括 ${topics}。`:''}${result.message}`;
}

export function summarizeHeatSnapshot(snapshot) {
  if(snapshot.schema!=='heat-perception/1'||snapshot.source?.city!=='成都'||!Array.isArray(snapshot.items))
    throw new Error('Unsupported heat perception snapshot');
  const inScope=snapshot.items.filter(item=>item.in_scope===true);
  const demand=inScope.filter(item=>item.is_public_demand===true);
  const topics=new Map();
  for(const item of demand){
    const topic=item.demand_topic_zh||item.demand_topic||'其他';
    topics.set(topic,(topics.get(topic)||0)+1);
  }
  return {sample_count:inScope.length,public_demand_count:demand.length,
    demand_topics:[...topics].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([topic,count])=>({topic,count}))};
}
