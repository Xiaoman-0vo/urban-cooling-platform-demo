// 聊天窗「问现状」第 2g 步：把快照整理成两样东西
//   ① facts —— 渲染层唯一的事实来源（条数、类别、代表原文、原文链接）
//   ② model_body —— 交给大模型"组织语言"的请求体
// 关键约束：模型只负责把 facts 讲成人话，数字与原文都由这里提供，渲染层还会再校对一遍。
const ctx = $('1-意图').first().json;
const first = $input.first();

// 快照文本两种可能：上一节点已解成 json.data，或者仍是二进制 base64
let text = first.json && typeof first.json.data === 'string' ? first.json.data : null;
if (!text) {
  const bin = first.binary && first.binary.data && first.binary.data.data;
  if (!bin) return [{ json: { snapshot_missing: true, city: ctx.city || null, facts: null, model_body: null } }];
  text = Buffer.from(bin, 'base64').toString('utf8');
}

let snap;
try {
  snap = JSON.parse(text);
} catch (e) {
  return [{ json: { snapshot_broken: true, error: e.message, facts: null, model_body: null } }];
}

const c = snap.counts || {};
const cityLabel = ctx.city || (snap.source && snap.source.city) || '成都';

// ---- 原文链接：来源唯一，就是快照里每条记录的 source_url（采集器写入 m.weibo.cn/detail/<id>）
// 缺失 / 空串 / 不是 http 开头 → 一律当成"原文不可访问"，绝不拼接猜测的链接
function normUrl(u) {
  if (typeof u !== 'string') return null;
  const s = u.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(s)) return null;
  return s;
}

const DIR_ZH = { discomfort: '不适', improvement: '改善', mixed: '混合', neutral: '中性', unknown: '未说明' };
function dirZh(dir) {
  if (!dir || typeof dir !== 'object') return '';
  return Object.entries(dir)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => DIR_ZH[k] || k)
    .join('、');
}

function pickReps(list, max) {
  const out = [];
  const seen = new Set();
  for (const r of list || []) {
    if (!r || !r.excerpt) continue;
    const key = String(r.excerpt).slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      excerpt: String(r.excerpt).slice(0, 80),
      url: normUrl(r.source_url),
      published_at: r.published_at || null,
      item_id: r.item_id || null,
    });
    if (out.length >= max) break;
  }
  return out;
}

// ---- 关切点（有具体空间诉求）----
// "other"（一般性热感受）不是空间诉求，归到下面的体验观察里，避免同一个类别在两处重复计数
const events = (Array.isArray(snap.events) ? snap.events : [])
  .filter((e) => e && e.demand_topic !== 'other')
  .slice()
  .sort((a, b) => (b.item_count || 0) - (a.item_count || 0))
  .map((e) => ({
    topic_zh: e.demand_topic_zh || e.demand_topic || '未分类',
    topic: e.demand_topic || null,
    count: Number(e.item_count || 0),
    dir: dirZh(e.evaluation_direction),
    place: e.place_hint || null,
    first_at: e.first_published_at || null,
    last_at: e.last_published_at || null,
    reps: pickReps([e.representative, ...(Array.isArray(e.representatives) ? e.representatives : [])], 3),
  }));

// ---- 体验观察（没有具体空间诉求，但是民意）----
// 把 events 里的 "other" 也并进来（同一个维度，只在该出现的地方出现一次）
const otherEvents = (Array.isArray(snap.events) ? snap.events : []).filter((e) => e && e.demand_topic === 'other');
const obsRaw = (Array.isArray(snap.observations) ? snap.observations : []).slice();
for (const e of otherEvents) {
  const hit = obsRaw.find((o) => o && o.demand_topic === 'other');
  if (hit) {
    const seen = new Set((hit.examples || []).map((x) => x.item_id));
    const extra = [e.representative].filter((r) => r && !seen.has(r.item_id));
    hit.examples = [...(hit.examples || []), ...extra];
    hit.item_count = Math.max(hit.item_count || 0, e.item_count || 0);
  } else {
    obsRaw.push({ demand_topic: 'other', demand_topic_zh: e.demand_topic_zh, item_count: e.item_count, evaluation_direction: e.evaluation_direction, examples: [e.representative].filter(Boolean) });
  }
}
const observations = obsRaw
  .slice()
  .sort((a, b) => (b.item_count || 0) - (a.item_count || 0))
  .map((o) => ({
    topic_zh: o.demand_topic_zh || o.demand_topic || '未分类',
    topic: o.demand_topic || null,
    count: Number(o.item_count || 0),
    dir: dirZh(o.evaluation_direction),
    reps: pickReps(o.examples, 2),
  }));

const allReps = [...events.flatMap((e) => e.reps), ...observations.flatMap((o) => o.reps)];
const facts = {
  city: cityLabel,
  mode: snap.mode || 'unknown',
  generated_at: snap.generated_at || null,
  city_note: ctx.city_note || null,
  counts: {
    raw_posts: c.raw_posts ?? null,
    raw_comments: c.raw_comments ?? null,
    classified_items: c.classified_items ?? null,
    in_scope_items: c.in_scope_items ?? c.in_study_area_items ?? null,
    unique_contents: c.unique_contents ?? null,
    public_demand_items: c.public_demand_items ?? null,
    out_of_scope_items: c.out_of_scope_items ?? null,
    place_unknown_items: c.place_unknown_items ?? null,
  },
  limits: (Array.isArray(snap.limits) ? snap.limits : []).slice(0, 4),
  demands: events,
  observations,
  link_stats: {
    reps: allReps.length,
    with_url: allReps.filter((r) => r.url).length,
    missing: allReps.filter((r) => !r.url).length,
  },
};

// ---- 给模型的材料：只给结论与原文，明确要求"不许改数字、不许编原文"----
const material = {
  city: facts.city,
  counts: facts.counts,
  demands: events.map((e) => ({ 类别: e.topic_zh, 条数: e.count, 倾向: e.dir, 地点: e.place, 代表原文: e.reps.map((r) => r.excerpt) })),
  observations: observations.map((o) => ({ 类别: o.topic_zh, 条数: o.count, 倾向: o.dir, 例子: o.reps.map((r) => r.excerpt) })),
};

const system = [
  '你是微博热感知助手的"讲人话"环节。给你一份已经抽取好的统计结果，你要把它组织成普通读者能看懂的中文。',
  '',
  '硬性规则：',
  '1. 只能使用给定材料里的数字和原文，不得新增、不得改写条数、不得编造原文，不得推测受影响人数；',
  '2. 不要使用"热相关性""空间诉求""分类维度""抽样口径"这类内部术语，改用日常说法（比如"抱怨没有遮阴""说等车太晒"）；',
  '3. 不要输出链接、不要输出 Markdown 标题或列表，只输出 JSON；',
  '4. 如果材料里没有具体诉求，就如实说"这批样本里没看到明确的改造诉求，多是笼统的热感受"。',
  '',
  '输出 JSON，字段如下：',
  '{',
  '  "summary": "一两句大白话，说清这批人在抱怨什么/夸什么，不超过 80 字",',
  '  "categories": [{"类别": "与材料中类别完全一致", "一句话": "这条类别用大白话解释，不超过 40 字"}],',
  '  "needs": ["从材料归纳出的可落地需求，最多 3 条，每条不超过 30 字"],',
  '  "caveat": "一句话提醒这不是温度观测、不代表人数"',
  '}',
].join('\n');

const model_body = {
  model: 'deepseek-flash',
  temperature: 0.3,
  max_tokens: 900,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: '材料如下（JSON）：\n' + JSON.stringify(material, null, 2) },
  ],
};

return [{ json: { facts, model_body, city: cityLabel } }];
