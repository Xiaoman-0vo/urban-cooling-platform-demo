// P5-1：把采集结果送进 n8n 判定，产出带来源元数据的 items.json
// 用法：node scripts/run-pipeline.mjs [--max 40] [--pace 400]
//
// 与 classify-samples.mjs 的区别：这里保留「这句话是谁在哪个帖子下说的」，
// 聚合阶段要按帖子、时间、话题分组，丢了来源就没法聚类，也没法回查。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE = 'http://127.0.0.1:5678/webhook/weibo-demand/v1';
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const MAX = Number(arg('--max', 40));
const PACE = Number(arg('--pace', 400));
// 抓什么、按什么口径过滤，由用户提问决定（例如用户问「重庆热不热」→ --city 重庆）
const CITY = String(arg('--city', '')).trim();
const ALIASES = String(arg('--aliases', ''))
  .split(/[,，、;；]/)
  .map((x) => x.trim())
  .filter(Boolean);
const SCOPE = CITY || ALIASES.length ? { city: CITY || null, aliases: ALIASES } : null;
// 分城市独立成账：--raws 只读指定原始文件（子串匹配），--out 写不同的 items 文件，互不污染
const RAWS = String(arg('--raws', ''))
  .split(/[,，]/)
  .map((x) => x.trim())
  .filter(Boolean);
const OUT = String(arg('--out', 'data/items.json')).trim();
// 进度文件：后台任务（job-worker.mjs）靠它把"判到第几条"报给前端进度条
const PROGRESS = String(arg('--progress', '')).trim();
function writeProgress(patch) {
  if (!PROGRESS) return;
  try {
    fs.writeFileSync(PROGRESS, JSON.stringify({ phase: 'classify', ...patch, updated_at: new Date().toISOString() }, null, 2), 'utf8');
  } catch { /* 写进度失败不影响判定 */ }
}
if (SCOPE) console.log(`目标地点：${SCOPE.city || '(仅别名)'} 别名 ${SCOPE.aliases.length} 个（只统计命中它的线索）`);
else console.log('目标地点：未指定 → 不做地点过滤，任何城市的热感受都保留');

// 只有提到这些词的文本才值得花钱调模型（确定性预筛，不判结论）
const HEAT_WORDS = ['热', '闷', '晒', '遮阴', '树荫', '荫', '凉快', '降温', '高温', '空调', '汗', '太阳', '暴晒', '温度', '湿', '烫', '烤箱', '烤'];
const hasHeat = (s) => HEAT_WORDS.some((w) => s.includes(w));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

// ---------- 1. 合并所有 raw_*.json ----------
const files = fs
  .readdirSync('data')
  .filter((f) => /^raw_.*\.json$/.test(f))
  .filter((f) => !RAWS.length || RAWS.some((k) => f.includes(k)))
  .sort();
const posts = new Map();
const comments = new Map();
const queries = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join('data', f), 'utf8'));
  if (j.query) queries.push(j.query);
  for (const p of j.posts || []) if (p.source_post_id && !posts.has(p.source_post_id)) posts.set(p.source_post_id, p);
  for (const c of j.comments || []) if (c.source_comment_id && !comments.has(c.source_comment_id)) comments.set(c.source_comment_id, c);
}
console.log(`${files.length} 个原始文件 → 帖子 ${posts.size} 条、评论 ${comments.size} 条；查询词：${[...new Set(queries)].join(' / ')}`);

// ---------- 2. 组装候选（正文 + 一级评论，每帖评论最多 2 条）----------
const candidates = [];
for (const p of posts.values()) {
  const body = (p.text || '').trim();
  if (body.length >= 12 && hasHeat(body)) {
    candidates.push({
      kind: 'post', id: p.source_post_id, text: body,
      published_at: p.published_at || null, author: p.author || null,
      like: p.attitudes_count ?? null, comment_count: p.comments_count ?? null,
      parent_post_id: p.source_post_id, source_url: p.source_url || `https://m.weibo.cn/detail/${p.source_post_id}`,
    });
  }
}
const perPost = new Map();
for (const c of comments.values()) {
  if (Number(c.level || 1) !== 1) continue;
  const ct = (c.text || '').trim();
  if (ct.length < 12 || !hasHeat(ct)) continue;
  const n = perPost.get(c.parent_post_id) || 0;
  if (n >= 2) continue;
  perPost.set(c.parent_post_id, n + 1);
  candidates.push({
    kind: 'comment', id: c.source_comment_id, text: ct,
    published_at: c.published_at || null, author: c.author || null,
    like: c.like_count ?? null, comment_count: null,
    parent_post_id: c.parent_post_id,
    source_url: `https://m.weibo.cn/detail/${c.parent_post_id}`,
  });
}
// 时间窗：只看最近 N 天（默认 365，可用 --days 改）。
// 判定按"帖子发布时间"算，不看抓取时间——旧帖再新抓也还是旧帖。
const DAYS = Number(arg('--days', '365')) || 0;
const cut = DAYS > 0 ? Date.now() - DAYS * 24 * 3600 * 1000 : null;
function tooOld(ts) {
  if (!cut || !ts) return false;
  const t = Date.parse(ts);
  return Number.isFinite(t) && t < cut;
}
const beforeWindow = candidates.length;
const kept = candidates.filter((c) => !tooOld(c.published_at));
const dropped = beforeWindow - kept.length;
if (dropped) console.log(`时间窗 ${DAYS} 天：丢弃 ${dropped} 条超出窗口的旧内容（按发布时间）`);
candidates.length = 0;
candidates.push(...kept);

// 增量：已判过的跳过，重跑只补失败的和新采的（省时间也省钱）
let prev = [];
try {
  prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).items || [];
} catch { prev = []; }
const doneIds = new Set(prev.map((x) => x.item_id));
const fresh = candidates.filter((c) => !doneIds.has('wi_' + sha(c.id + c.text)));
const todo = fresh.slice(0, MAX);
console.log(`候选 ${candidates.length} 条，已判过 ${candidates.length - fresh.length} 条，本轮送判 ${todo.length} 条（上限 ${MAX}，约 ${Math.round(todo.length * 4 / 60)} 分钟）`);

// ---------- 3. 逐条送判 ----------
const items = prev.slice();
let fail = 0;
for (let i = 0; i < todo.length; i++) {
  const c = todo[i];
  const request_id = 'pl-' + sha(c.id + c.text) + '-' + Date.now().toString(36);
  const body = { contract_version: '1.0.0', request_id, action: 'classify', payload: { text: c.text, ...(SCOPE ? { scope: SCOPE } : {}) } };
  let j = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(BASE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      });
      j = await r.json();
      if (r.ok) break;
      if (attempt === 3) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(j.errors || j).slice(0, 100));
      await sleep(2000);
    } catch (e) {
      if (attempt === 3) { console.log(`  [${i + 1}] 失败：${e.message}`); fail++; j = null; }
      else await sleep(2000);
    }
  }
  if (j && j.result && j.result.item) {
    const it = j.result.item;
    items.push({
      ...it,
      item_id: 'wi_' + sha(c.id + c.text),
      kind: c.kind,
      author: c.author,
      published_at: c.published_at,
      fetched_at: new Date().toISOString(),
      like_count: c.like,
      comment_count: c.comment_count,
      parent_post_id: c.kind === 'comment' ? c.parent_post_id : null,
      source_post_id: c.parent_post_id,
      source_url: c.source_url,
      text_full: c.text,
      scope_target: it.scope_target ?? null,
      in_scope: it.in_scope === true,
      route: j.result.route,
      latency_ms: j.meta && j.meta.latency_ms,
    });
    console.log(`  [${i + 1}/${todo.length}] ${(it.location_scope || '?').padEnd(10)} ${(it.heat_relevance || '?').padEnd(12)} ${it.demand_topic}  ${c.text.slice(0, 40)}`);
    writeProgress({ done: items.length, total: todo.length, ok: items.length, failed: fail, message: `已判定 ${items.length}/${todo.length} 条` });
  }
  await sleep(PACE);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), queries: [...new Set(queries)], scope: SCOPE, items }, null, 2), 'utf8');

const by = (k) => items.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {});
console.log('\n=== 判定小结 ===');
console.log('成功', items.length, '/ 失败', fail);
console.log('地名范围 :', JSON.stringify(by('location_scope')));
console.log('热相关性 :', JSON.stringify(by('heat_relevance')));
console.log('结论方向 :', JSON.stringify(by('evaluation_direction')));
console.log('诉求话题 :', JSON.stringify(by('demand_topic')));
console.log('复核状态 :', JSON.stringify(by('review_status')));
console.log('已写入', OUT);
