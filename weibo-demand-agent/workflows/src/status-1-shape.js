// 05-job-status 第 3 步：把 latest.json 整理成前端好用的形状
// 数据流：1-读任务 → 2-转文本(json.data) → 3-整理 → 4-回包
// 前端只关心这几件事：现在在第几步、百分比、一句话状态、跑完了没有。
const raw = $input.first().json.data;
const PHASE_ZH = {
  queued: '排队中',
  collecting: '正在采集微博',
  classifying: '正在逐条判定',
  aggregating: '正在汇总快照',
  done: '已完成',
  failed: '失败',
  idle: '空闲'
};

let job = null;
try {
  job = typeof raw === 'string' ? JSON.parse(raw) : raw;
} catch {
  job = null;
}

if (!job || !job.id) {
  return [{
    json: {
      ok: true,
      active: false,
      job_id: null,
      status: 'idle',
      phase: 'idle',
      phase_label: '当前没有任务',
      message: '说「帮我抓成都 遮阴」就会下单',
      progress: 0,
      http_status: 200
    }
  }];
}

// 三阶段加权：采集 0–30%，判定 30–95%，汇总 95–100%
let progress = 0;
if (job.status === 'done') progress = 100;
else if (job.status === 'failed') progress = 0;
else if (job.phase === 'collecting') progress = 12;
else if (job.phase === 'aggregating') progress = 97;
else if (job.phase === 'classifying') {
  const total = Number(job.total || 0);
  const done = Number(job.done || 0);
  progress = total > 0 ? Math.min(95, 30 + Math.round((done / total) * 65)) : 32;
}

const active = !['done', 'failed', 'idle'].includes(job.status);

return [{
  json: {
    ok: true,
    active,
    job_id: job.id,
    status: job.status,
    phase: job.phase,
    phase_label: PHASE_ZH[job.phase] || job.phase,
    message: job.message || '',
    query: job.query || '',
    city: job.city || null,
    posts: job.posts ?? null,
    comments: job.comments ?? null,
    done: job.done ?? null,
    total: job.total ?? null,
    progress,
    error: job.error || null,
    snapshot: job.snapshot || null,
    updated_at: job.updated_at || null,
    http_status: 200
  }
}];
