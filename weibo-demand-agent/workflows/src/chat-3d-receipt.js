// 聊天窗 3d：任务已写入队列，回执给用户（含怎么查进度）
// 数据流：2d3-写任务文件 → 3d-回执 → 聊天窗
// 两种来源：用户自己说"帮我抓…"（job.auto=false）；或问了一个没有快照的城市（job.auto=true）
const src = $('1-意图').first().json;
const job = src.job || {};
const L = [];

if (job.auto) {
  L.push('**「' + job.city + '」我手上还没有快照，已经自动下单去采了**');
  if (src.city_note) L.push('');
  if (src.city_note) L.push('> ' + src.city_note);
  L.push('');
  L.push('- 任务号：`' + (job.id || '（生成失败）') + '`');
  L.push('- 搜索词：`' + (job.query || '') + '`');
  L.push('- 抓取深度：微博 ' + (job.pages || 2) + ' 页 / 每帖最多 ' + (job.top || 6) + ' 条一级评论 × ' + (job.comment_pages || 1) + ' 页');
  L.push('');
  L.push('页面顶部的进度条会自动跟：**采微博 → 逐条判定 → 汇总成快照**，大约 2–3 分钟。');
  L.push('跑完再问我一句「' + job.city + '现在有多少线索」，就有数字了；中途问「进度」也可以。');
  L.push('');
  L.push('_这次是现场抽样采集，样本量决定结论强弱：样本小的时候，没有检出诉求不等于没有热问题。_');
  L.push('');
  L.push('_需要后台工人开着（`2-启动采集工人.cmd`）才会真的去跑。_');
} else {
  L.push('**已下单，后台开始采集**');
  L.push('');
  L.push('- 任务号：`' + (job.id || '（生成失败）') + '`');
  L.push('- 搜索词：`' + (job.query || '') + '`');
  if (job.city) L.push('- 地点范围：**' + job.city + '**（只统计命中这个城市的线索）');  else L.push('- 地点范围：**不限定城市**（这句话里没提地名，所以只按关键词搜）');
  L.push('- 抓取深度：微博 ' + (job.pages || 1) + ' 页 / 每帖最多 ' + (job.top || 6) + ' 条一级评论 × ' + (job.comment_pages || 1) + ' 页');
  L.push('');
  L.push('三步会依次跑：**采微博 → 逐条判定 → 汇总成快照**，通常 1–3 分钟。');
  L.push('问一句「进度」我就报当前到哪一步；跑完后问「' + (job.city || '') + '现在有多少线索」就能看结果。');
  L.push('');
  L.push('_采集的是公开微博与一级评论的样本，不是温度观测，也不代表受影响人数。_');
}

return [{ json: { output: L.join('\n') } }];
