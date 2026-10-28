// 聊天窗 3e：把任务进度文件读成人话
// 数据流：2e-读进度 → 2f-进度文本(extractFromFile text → json.data) → 3e-进度 → 聊天窗
const raw = $('2f-进度文本').first().json.data;
const L = [];

let job = null;
try {
  job = typeof raw === 'string' ? JSON.parse(raw) : raw;
} catch {
  job = null;
}

const PHASE = {
  queued: '排队中（后台工人马上接单）',
  collecting: '第 1 步 / 共 3 步：采微博',
  classifying: '第 2 步 / 共 3 步：逐条判定',
  aggregating: '第 3 步 / 共 3 步：汇总快照',
  done: '全部完成',
  failed: '中途失败',
  idle: '当前没有任务',
};

if (!job || !job.id) {
  L.push('**当前没有采集任务**');
  L.push('');
  L.push('说一句「帮我抓成都 遮阴」就会下单；也可以说「进度」看正在跑的任务。');
  return [{ json: { output: L.join('\n') } }];
}

const pct = () => {
  if (job.status === 'done') return 100;
  if (!job.total) return job.phase === 'collecting' ? 15 : 30;
  return Math.min(99, Math.round(30 + (Number(job.done || 0) / Number(job.total)) * 65));
};

L.push('**任务 `' + job.id + '`**');
L.push('');
L.push('- 状态：' + (PHASE[job.phase] || job.phase || job.status || '未知'));
L.push('- 搜索词：`' + (job.query || '') + '`' + (job.city ? '（地点：' + job.city + '）' : '（不限城市）'));
if (job.posts || job.comments) L.push('- 已抓：帖子 ' + (job.posts || 0) + ' 条 / 评论 ' + (job.comments || 0) + ' 条');
if (job.total) L.push('- 判定进度：' + (job.done || 0) + ' / ' + job.total);
if (job.message) L.push('- 最近一步：' + job.message);
L.push('- 整体完成度：约 **' + pct() + '%**');

if (job.status === 'done') {
  L.push('');
  L.push('跑完了。现在可以问「' + (job.city || '') + '现在有多少线索」，或贴一条微博让我判。');
  if (job.snapshot) L.push('（快照：`' + job.snapshot + '`）');
} else if (job.status === 'failed') {
  L.push('');
  L.push('**失败原因**：' + (job.error || job.message || '未提供'));
  L.push('常见原因：微博 Cookie 过期（重新打开 Edge 登录一次再跑）、或网络被限流。');
} else {
  L.push('');
  L.push('_还在跑，过一会儿再说一次「进度」即可。_');
}

L.push('');
L.push('_这些数字是抽样抓取的条数，不是人数。_');

return [{ json: { output: L.join('\n') } }];
