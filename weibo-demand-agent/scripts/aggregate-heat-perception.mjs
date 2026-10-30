// P5-2：把逐条判定结果聚合成平台可读的快照（heat_perception.json）
// 用法：node scripts/aggregate-heat-perception.mjs
//
// 三条硬规则（写进产物里，前端和答辩都用得上）：
//   1. 只统计 in_scope=true 的线索（传了 scope 时才算命中目标城市），外地闲聊不进聚合；
//   2. 三个计数分开报：原始记录 / 去重后内容 / 可识别原创报告 —— 都不是“人数”；
//   3. 产物带 mode 与 limits，说明这是抽样观察，不是全市民意分布。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
// 分城市独立成账：--items 指定逐条判定结果，--out 指定快照输出位置
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const ITEMS_FILE = arg('--items', 'data/items.json');
const OUT_FILE = arg('--out', 'data/heat_perception.json');
const RAWS = String(arg('--raws', ''))
  .split(/[,，]/)
  .map((x) => x.trim())
  .filter(Boolean);
const NO_PLATFORM = argv.includes('--no-platform');

const TOPIC_ZH = {
  shade_deficit: '遮阴不足',
  tree_canopy: '树冠/绿化覆盖',
  waiting_transit: '候车/等候条件',
  walking_route: '步行路径',
  plaza_leisure: '广场与休闲',
  campus_school: '校园场地',
  park_greenway: '公园绿道',
  outdoor_work: '户外作业',
  water_cooling_facility: '饮水/降温设施',
  ventilation_stillness: '通风不畅',
  surface_heat: '地面与体感高温',
  positive_cooling: '降温改善体验',
  other: '一般性热感受（无具体空间诉求）',
};

// ---------- 读入 ----------
const raw = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
const items = raw.items || [];
// 分城市独立成账：只统计本次跑批读过的那些原始文件，避免把别的城市的采集量算进来
const files = fs
  .readdirSync('data')
  .filter((f) => /^raw_.*\.json$/.test(f))
  .filter((f) => !RAWS.length || RAWS.some((k) => f.includes(k)));
// 目标城市：优先取逐条判定里带回来的 scope_target，其次取命令行给的 --city
const CITY = String(arg('--city', '')).trim() || items.find((x) => x.scope_target)?.scope_target || null;
let rawPostCount = 0;
let rawCommentCount = 0;
const queries = new Set();
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join('data', f), 'utf8'));
  if (j.query) queries.add(j.query);
  rawPostCount += (j.posts || []).length;
  rawCommentCount += (j.comments || []).length;
}

// ---------- 归一化与去重 ----------
const normalize = (s) => String(s || '')
  .replace(/https?:\/\/\S+/g, '')
  .replace(/@[\w\-\u4e00-\u9fa5]+/g, '')
  .replace(/#[^#]{1,40}#/g, '')
  .replace(/\[[^\]]{1,8}\]/g, '')
  .replace(/[\s\p{P}\p{S}\p{Emoji_Presentation}]/gu, '')
  .trim();

const grams = (s) => {
  const set = new Set();
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
  return set;
};
const jaccard = (a, b) => {
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

const inScopeOf = (x) => x.in_scope === true || (x.in_scope === undefined && x.in_study_area === true);
// 时间窗：只聚合最近 N 天（默认 365）的帖子，按发布时间算。
// 这样即使 items.json 里还留着老条目，快照也不会把 2024 年的帖子端上来。
const DAYS = Number(arg('--days', '365')) || 0;
const cut = DAYS > 0 ? Date.now() - DAYS * 24 * 3600 * 1000 : null;
function fresh(ts) {
  if (!cut || !ts) return true;
  const t = Date.parse(ts);
  return !Number.isFinite(t) || t >= cut;
}
const oldCount = items.filter((x) => !fresh(x.published_at)).length;
if (oldCount) console.log(`时间窗 ${DAYS} 天：${oldCount} 条超出窗口的旧内容不进聚合`);
const pool = items.filter((x) => fresh(x.published_at) && inScopeOf(x) && x.heat_relevance === 'relevant' && x.review_status !== 'rule_only');
const groups = []; // {group_id, norm, grams, item_ids}
for (const it of pool) {
  const norm = normalize(it.text_full || it.excerpt || '');
  if (!norm) continue;
  const g = grams(norm);
  let hit = groups.find((x) => x.norm === norm || jaccard(x.grams, g) >= 0.85);
  if (!hit) {
    hit = { group_id: 'dg_' + sha(norm), norm, grams: g, item_ids: [] };
    groups.push(hit);
  }
  hit.item_ids.push(it.item_id);
  it.duplicate_group_id = hit.group_id;
}

// ---------- 事件聚类（按诉求话题；同一话题内的线索归成一个“关切点”）----------
const demandPool = pool.filter((x) => x.is_public_demand === true);
const observePool = pool.filter((x) => x.is_public_demand !== true);
const byTopic = new Map();
for (const it of demandPool) {
  const t = it.demand_topic || 'other';
  if (!byTopic.has(t)) byTopic.set(t, []);
  byTopic.get(t).push(it);
}
const toISO = (x) => (x ? String(x) : null);
const events = [];
for (const [topic, list] of [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const dates = list.map((x) => x.published_at).filter(Boolean).sort();
  const best = [...list].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
  const place = (best.place_evidence || []).find((e) => e.kind === 'target' || e.kind === 'study_area');
  events.push({
    event_cluster_id: 'ev_' + sha(topic + '|' + list.map((x) => x.item_id).sort().join(',')),
    demand_topic: topic,
    demand_topic_zh: TOPIC_ZH[topic] || topic,
    item_count: list.length,
    unique_content_count: new Set(list.map((x) => x.duplicate_group_id)).size,
    evaluation_direction: list.reduce((m, x) => ((m[x.evaluation_direction] = (m[x.evaluation_direction] || 0) + 1), m), {}),
    place_hint: place ? place.name : null,
    first_published_at: toISO(dates[0]),
    last_published_at: toISO(dates[dates.length - 1]),
    representative: {
      item_id: best.item_id,
      excerpt: best.excerpt,
      source_url: best.source_url,
      confidence: best.confidence,
      confidence_level: best.confidence_level,
    },
    item_ids: list.map((x) => x.item_id),
  });
}

// 体验观察：不是诉求，但按产品的标签口径必须保留（积极降温体验同样是证据）
const obsByTopic = new Map();
for (const it of observePool) {
  const t = it.demand_topic || 'other';
  if (!obsByTopic.has(t)) obsByTopic.set(t, []);
  obsByTopic.get(t).push(it);
}
const observations = [...obsByTopic.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([topic, list]) => ({
    demand_topic: topic,
    demand_topic_zh: TOPIC_ZH[topic] || topic,
    item_count: list.length,
    evaluation_direction: list.reduce((m, x) => ((m[x.evaluation_direction] = (m[x.evaluation_direction] || 0) + 1), m), {}),
    examples: list.slice(0, 2).map((x) => ({ item_id: x.item_id, excerpt: x.excerpt, source_url: x.source_url })),
  }));

// ---------- 计数（三个计数分开报，不合并成“人数”）----------
const inScope = items.filter(inScopeOf);
const snapshot = {
  schema: 'heat-perception/1',
  mode: 'historical_sample', // 抽样回放，不是实时流，也不是全市样本
  status: {
    overall: 'ok',
    collection: 'ok',
    classification: 'ok',
    place_filter: 'ok',
    note: '单机小样本采集；未做授权接口接入，仅用于链路演示',
  },
  generated_at: new Date().toISOString(),
  source: {
    window_days: DAYS || null,
    window_from: cut ? new Date(cut).toISOString().slice(0, 10) : null,
    channel: 'weibo',
    method: 'search + first-level comments',
    queries: [...queries],
    city: CITY,
    scope_filter: CITY ? 'only_target_city' : 'none',
    fetched_at: raw.generated_at || null,
  },
  counts: {
    raw_posts: rawPostCount,
    raw_comments: rawCommentCount,
    classified_items: items.filter((x) => fresh(x.published_at)).length,
    in_scope_items: inScope.filter((x) => fresh(x.published_at)).length,
    in_study_area_items: inScope.length,
    public_demand_items: demandPool.length,
    unique_contents: groups.length,
    identifiable_original_reports: pool.filter((x) => x.kind === 'post').length,
    out_of_scope_items: items.filter((x) => fresh(x.published_at) && (x.location_scope === 'other_place' || x.location_scope === 'other_city')).length,
    place_unknown_items: items.filter((x) => fresh(x.published_at) && x.location_scope === 'unknown').length,
  },
  meta: {
    contract_version: '1.0.0',
    taxonomy_version: 't1',
    rules_version: 'r1',
    classifier_version: 'c1-model',
    place_version: (items.find((x) => x.place_version) || {}).place_version || 'p2',
    model: 'deepseek-flash',
  },
  events,
  observations,
  items: pool.map((x) => ({
    item_id: x.item_id,
    source: 'weibo',
    source_post_id: x.source_post_id,
    source_url: x.source_url,
    kind: x.kind,
    author: x.author,
    published_at: x.published_at,
    text: x.text_full,
    excerpt: x.excerpt,
    heat_relevance: x.heat_relevance,
    is_public_demand: x.is_public_demand,
    demand_topic: x.demand_topic,
    demand_topic_zh: TOPIC_ZH[x.demand_topic] || x.demand_topic,
    evaluation_direction: x.evaluation_direction,
    experience_tags: x.experience_tags,
    spatial_demands: x.spatial_demands,
    activity_scene: x.activity_scene,
    time_status: x.time_status,
    location_scope: x.location_scope,
    scope_target: x.scope_target ?? null,
    in_scope: inScopeOf(x),
    in_study_area: inScopeOf(x),
    place_evidence: x.place_evidence,
    evidence_spans: x.evidence_spans,
    confidence: x.confidence,
    confidence_level: x.confidence_level,
    confidence_basis: x.confidence_basis,
    review_status: x.review_status,
    duplicate_group_id: x.duplicate_group_id,
    event_cluster_id: (events.find((e) => e.item_ids.includes(x.item_id)) || {}).event_cluster_id || null,
  })),
  limits: [
    `这是抽样观察，不代表${CITY || '查询范围'}居民总体感受，也不能推出受影响人数。`,
    '没有线索不等于没有热问题：微博用户结构不等于城市人口结构。',
    '不据此插值成 100m 网格的热感受分布图。',
    '首版不把它写入温度模型的训练标签。',
  ],
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot, null, 2), 'utf8');

// 平台前端的静止快照位置（零后端改动即可读到）
const platformDir = path.resolve('..', 'urban-cooling-platform-demo', 'public', 'data');
if (!NO_PLATFORM && fs.existsSync(platformDir)) {
  fs.writeFileSync(path.join(platformDir, 'heat_perception.json'), JSON.stringify(snapshot, null, 2), 'utf8');
  console.log('已同步到平台：' + path.join(platformDir, 'heat_perception.json'));
}

// ---------- 控制台摘要 ----------
console.log('\n=== 聚合结果 ===');
console.log('原始记录   :', rawPostCount, '帖 +', rawCommentCount, '评论');
console.log('送判条目   :', items.length, '｜', (CITY || '不做地点过滤') + ' 范围内相关：', pool.length);
console.log('去重后内容 :', groups.length, '条独立内容');
console.log('公开诉求   :', demandPool.length, '条 → 事件关切点', events.length, '个\n');
for (const e of events) {
  console.log(`  ${String(e.item_count).padStart(2)} 条 · ${e.demand_topic_zh.padEnd(8)} · ${e.evaluation_direction ? JSON.stringify(e.evaluation_direction) : ''}`);
  console.log(`       「${(e.representative.excerpt || '').slice(0, 46)}」`);
}
const size = fs.statSync('data/heat_perception.json').size;
console.log('\n写入 ' + OUT_FILE + '（' + size + ' 字节）');
