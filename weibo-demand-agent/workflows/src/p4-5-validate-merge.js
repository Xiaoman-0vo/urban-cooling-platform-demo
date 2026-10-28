// P4 第 5 步：确定性校验 + 合并 + 组装响应
// 核心原则：模型说什么不算数，只有能被原文核对的部分才算数。
//   - 枚举越界 → 丢弃该值并记一条 note（不让脏值进下游）
//   - evidence_spans 的 quote 在原文里找不到 → 该 span 作废；全部作废 → 置信度降到 low
//   - 置信度由确定性依据合成，不用模型自报的概率

const ctx = $('3-构造模型请求').first().json;
const resp = $input.first().json || {};

const text = ctx.text;
const rules = ctx.rules || {};
const V = ctx.versions || {};
const ENUMS = {
  heat_relevance: ['relevant', 'needs_review', 'irrelevant'],
  content_types: ['firsthand', 'relay', 'suggestion', 'forecast', 'news', 'ad', 'unknown'],
  experience_tags: ['hot', 'muggy', 'sun_exposure', 'cool', 'mixed', 'unspecified'],
  spatial_demands: ['shade_deficit', 'ventilation', 'waiting_comfort', 'stay_comfort', 'water_or_cooling_facility'],
  activity_scene: ['walking', 'cycling', 'waiting', 'leisure', 'outdoor_work', 'other', 'unspecified'],
  evaluation_direction: ['discomfort', 'improvement', 'neutral', 'mixed', 'unclear'],
  demand_topic: ['shade_deficit', 'tree_canopy', 'waiting_transit', 'walking_route', 'plaza_leisure', 'campus_school', 'park_greenway', 'outdoor_work', 'water_cooling_facility', 'ventilation_stillness', 'surface_heat', 'positive_cooling', 'other'],
  actionability: ['A', 'B', 'C'],
  time_status: ['current', 'historical', 'future', 'unknown']
};

// ---------- 目标地点：与规则层同一份词表、同一份判定口径 ----------
// 词表由构建脚本从 config/place-lexicon.v2.json 注入：城市名 → 别名表 + 反查索引
const LEX = /*__PLACE_LEXICON__*/null;
const CITY_OF = {};        // 别名/城市名 → 所属城市
const ALL_PLACE_NAMES = []; // 全部已知地名，用于判断"提到了别的地方"
(function buildPlaceIndex() {
  const cities = (LEX && LEX.cities) || {};
  const pairs = [];
  for (const city of Object.keys(cities)) {
    pairs.push([city, city]);
    for (const a of (cities[city] && cities[city].aliases) || []) pairs.push([a, city]);
  }
  pairs.sort((x, y) => y[0].length - x[0].length);
  for (const [name, city] of pairs) {
    if (!CITY_OF[name]) CITY_OF[name] = city;
    ALL_PLACE_NAMES.push(name);
  }
})();

// 请求里的 scope：{ city: '重庆', aliases: ['重庆','渝中区'] }，都给不出就返回 null（= 不过滤）
function resolveScope(s) {
  if (!s || typeof s !== 'object') return null;
  const city = typeof s.city === 'string' && s.city.trim() ? s.city.trim() : null;
  let aliases = Array.isArray(s.aliases)
    ? s.aliases.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
    : [];
  if (!aliases.length && city) {
    const key = Object.keys((LEX && LEX.cities) || {}).includes(city) ? city : CITY_OF[city];
    aliases = key ? [key].concat((((LEX.cities || {})[key] || {}).aliases) || []) : [city];
  }
  if (!aliases.length) return null;
  return {
    city: city || CITY_OF[aliases[0]] || aliases[0],
    aliases: [...new Set(aliases)].sort((a, b) => b.length - a.length)
  };
}
const SCOPE = resolveScope(ctx && ctx.rules ? ctx.rules.scope_input : null);

function detectPlace(rawText, scope) {
  // @昵称不是事件发生地：先按等长掩码盖住 @xxx，避免『@成都大熊猫繁育研究基地』把哈尔滨的帖子判成成都
  const src = String(rawText || '').replace(/@[\w\-\u4e00-\u9fa5]{1,24}/g, (m) => ' '.repeat(m.length));
  const ev = [];
  const scan = (list, kind) => {
    for (const name of [...list].sort((a, b) => b.length - a.length)) {
      if (!name) continue;
      let from = 0;
      let idx = src.indexOf(name, from);
      while (idx >= 0) {
        const start = idx;
        const end = idx + name.length;
        // 已被更长的地点词覆盖（如「天府」落在「天府新区」里）则跳过
        if (!ev.some((e) => start < e.end && end > e.start)) ev.push({ name, kind, start, end });
        from = end;
        idx = src.indexOf(name, from);
      }
    }
  };
  // 传了 scope：只认目标城市的别名，其余地名算 other；没传：所有城市名都标 target（只标注，不过滤）
  scan(scope ? scope.aliases : ALL_PLACE_NAMES, 'target');
  scan(scope ? ALL_PLACE_NAMES.filter((n) => !scope.aliases.includes(n)) : [], 'other');
  ev.sort((a, b) => a.start - b.start);
  const hitTarget = ev.find((e) => e.kind === 'target');
  const hasOther = ev.some((e) => e.kind === 'other');
  const location_scope = hitTarget ? 'target' : (hasOther ? 'other_place' : 'unknown');
  return {
    location_scope,
    in_scope: scope ? location_scope === 'target' : true,
    scope_target: scope ? scope.city : (hitTarget ? (CITY_OF[hitTarget.name] || hitTarget.name) : null),
    place_version: (LEX && LEX.lexicon_version) || 'p0',
    place_evidence: ev.slice(0, 6)
  };
}

const notes = [];
const errors = [];
const latency = Math.max(0, Date.now() - (ctx.t0 || Date.now()));

// ---------- 0. 模型调用本身失败 ----------
const msg = (resp.choices && resp.choices[0] && resp.choices[0].message) || {};
const content = msg.content || '';
const reasoning = msg.reasoning_content || '';
const finish = (resp.choices && resp.choices[0] && resp.choices[0].finish_reason) || '';
if (!content && !reasoning) {
  const why = (resp.error && (resp.error.message || resp.error.code)) || ('content 为空，finish_reason=' + (finish || 'unknown'));
  return [{ json: { code: 502, body: {
    contract_version: '1.0.0',
    request_id: ctx.request_id,
    status: 'error',
    result: { route: 'model', stage: 'call_model' },
    meta: { rules_version: V.rules_version, classifier_version: V.classifier_version, taxonomy_version: V.taxonomy_version, model: V.model, latency_ms: latency, cached: false, processed_at: new Date().toISOString() },
    errors: [{ code: 'E_MODEL_CALL_FAILED', message: '模型调用失败：' + why, path: '$.model', retryable: true }]
  } } }];
}

// ---------- 1. 解析 JSON ----------
function extractJson(s) {
  const t = String(s).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* 继续 */ }
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* 继续 */ } }
  return null;
}

// 推理型模型（deepseek-flash）偶尔把结构化结果全写进 reasoning_content，content 留空。
// 这不是“模型挂了”，而是同一段输出的不同字段，所以先回退解析再判失败。
let raw = content ? extractJson(content) : null;
let content_source = 'content';
if (!raw && reasoning) {
  const alt = extractJson(reasoning);
  if (alt && typeof alt === 'object') { raw = alt; content_source = 'reasoning_content'; }
}
if (!raw || typeof raw !== 'object') {
  return [{ json: { code: 502, body: {
    contract_version: '1.0.0',
    request_id: ctx.request_id,
    status: 'error',
    result: { route: 'model', stage: 'parse_output' },
    meta: { rules_version: V.rules_version, classifier_version: V.classifier_version, taxonomy_version: V.taxonomy_version, model: V.model, latency_ms: latency, cached: false, processed_at: new Date().toISOString() },
    errors: [{ code: 'E_MODEL_OUTPUT_INVALID', message: '模型返回的不是合法 JSON（finish_reason=' + (finish || 'unknown') + '）', path: '$.choices[0].message.content', retryable: true }]
  } } }];
}
if (content_source === 'reasoning_content') notes.push('模型的 content 为空，已从 reasoning_content 中回退解析出结构化结果');

// ---------- 2. 枚举校验 ----------
function pickEnum(field, value, fallback) {
  if (ENUMS[field].includes(value)) return value;
  if (value != null) notes.push(`字段 ${field} 的取值 ${JSON.stringify(value)} 不在词表内，已按 ${fallback} 处理`);
  return fallback;
}
function pickEnumArray(field, value) {
  if (!Array.isArray(value)) { if (value != null) notes.push(`字段 ${field} 不是数组，已忽略`); return []; }
  const ok = value.filter((v) => ENUMS[field].includes(v));
  const bad = value.filter((v) => !ENUMS[field].includes(v));
  if (bad.length) notes.push(`字段 ${field} 丢弃非法取值：${bad.join('、')}`);
  return [...new Set(ok)];
}

const heat_relevance = pickEnum('heat_relevance', raw.heat_relevance, 'needs_review');
const content_types = pickEnumArray('content_types', raw.content_types);
const experience_tags = pickEnumArray('experience_tags', raw.experience_tags);
const spatial_demands = pickEnumArray('spatial_demands', raw.spatial_demands);
const activity_scene = pickEnumArray('activity_scene', raw.activity_scene);
const evaluation_direction = pickEnum('evaluation_direction', raw.evaluation_direction, 'unclear');
const demand_topic = pickEnum('demand_topic', raw.demand_topic, 'other');
const actionability = pickEnum('actionability', raw.actionability, 'C');
const time_status = pickEnum('time_status', raw.time_status, 'unknown');

// ---------- 3. 证据回查（唯一可信的锚点） ----------
const spans = [];
for (const s of Array.isArray(raw.evidence_spans) ? raw.evidence_spans.slice(0, 4) : []) {
  const q = typeof s === 'string' ? s : (s && s.quote);
  const field = (s && s.field) || 'unspecified';
  if (!q) continue;
  const start = text.indexOf(q);
  if (start < 0) { notes.push(`证据片段未在原文中找到，已作废：「${String(q).slice(0, 20)}」`); continue; }
  if (spans.some((x) => x.start === start && x.end === start + q.length)) continue;
  spans.push({ field, start, end: start + q.length, quote: q });
}
spans.sort((a, b) => a.start - b.start);

// excerpt 也要能回查；不能回查就退回用第一个证据 span
let excerpt = typeof raw.excerpt === 'string' ? raw.excerpt : '';
if (!excerpt || !text.includes(excerpt)) {
  if (excerpt) notes.push('模型给的 excerpt 未在原文中找到，已改用证据片段');
  excerpt = spans.length ? spans[0].quote : text.slice(0, 40);
}

// ---------- 4. 确定性置信度 ----------
const pre = rules.pre_labels || {};
const flags = rules.flags || {};
const ruleHit = (rules.hits && rules.hits.heat && rules.hits.heat.length) > 0;
const ruleAgrees = heat_relevance === 'relevant' && (pre.evaluation_direction === evaluation_direction || (experience_tags || []).some((t) => (pre.experience_tags || []).includes(t)));

let conf = 0.40;
const basis = [];
const place = detectPlace(text, SCOPE);
if (spans.length) { conf += 0.20; basis.push('span_valid'); }
if (ruleHit) { conf += 0.10; basis.push('rule_hit'); }
if (ruleAgrees) { conf += 0.10; basis.push('rule_agrees'); }
if (heat_relevance === 'relevant' && raw.is_public_demand === true) { conf += 0.10; basis.push('public_demand'); }
if (flags.ambiguous_only) { conf -= 0.15; basis.push('ambiguous_only'); }
if (flags.negated) { conf -= 0.05; basis.push('negation_flag'); }
if (!spans.length && heat_relevance === 'relevant') { conf -= 0.15; basis.push('no_evidence'); }
// 地名：明确指向外地扣分并转人工；没写地名只轻扣（微博正文常省地名，不能当成不是本地）
if (place.location_scope === 'other_place') { conf -= 0.10; basis.push('out_of_scope'); }
else if (place.location_scope === 'unknown') { conf -= 0.05; basis.push('place_unknown'); }
conf = Math.max(0.05, Math.min(0.92, Math.round(conf * 100) / 100));
const level = conf >= 0.80 ? 'high' : (conf >= 0.65 ? 'medium' : 'low');

// 自动通过的条件：高/中置信 + 有证据 + 不是“待核实” + 无冲突旗标 + 不在外地
const autoOk = conf >= 0.65 && spans.length > 0 && heat_relevance !== 'needs_review' && !flags.ambiguous_only && place.location_scope !== 'other_city';
const review_status = autoOk ? 'auto_accepted' : 'pending';

if (place.location_scope === 'other_place') {
  const names = place.place_evidence.filter((e) => e.kind === 'other').map((e) => e.name).slice(0, 3).join('、');
  notes.push(`原文地名指向目标城市之外（${names}，目标=${place.scope_target || '未指定'}）→ in_scope=false，转人工，不进入聚合统计`);
}

// 规则与模型冲突时降级人工
let finalHeat = heat_relevance;
if (flags.ambiguous_only && heat_relevance !== 'irrelevant') {
  finalHeat = 'needs_review';
  notes.push('规则判为仅命中歧义词，模型判为相关 → 降级为待核实');
}
if (heat_relevance === 'relevant' && !spans.length) {
  finalHeat = 'needs_review';
  notes.push('模型判为相关但没有任何可回查证据 → 降级为待核实');
}

const item = {
  item_id: 'wi_' + String(ctx.request_id).replace(/[^A-Za-z0-9]/g, '').slice(-12),
  source: 'weibo',
  source_post_id: null,
  source_url: null,
  heat_relevance: finalHeat,
  is_public_demand: raw.is_public_demand === true,
  content_types,
  experience_tags,
  spatial_demands,
  activity_scene,
  evaluation_direction,
  demand_topic,
  actionability,
  time_status,
  location_scope: place.location_scope,
  in_scope: place.in_scope,
  scope_target: place.scope_target,
  in_study_area: place.in_scope,
  place_version: place.place_version,
  place_evidence: place.place_evidence,
  excerpt: excerpt.slice(0, 120),
  evidence_spans: spans,
  location_mentions: Array.isArray(raw.location_mentions) ? raw.location_mentions.slice(0, 5) : [],
  confidence: conf,
  confidence_level: level,
  confidence_basis: basis,
  review_status,
  rules_version: V.rules_version,
  classifier_version: V.classifier_version,
  taxonomy_version: V.taxonomy_version,
  model: V.model
};

const out = {
  contract_version: '1.0.0',
  request_id: ctx.request_id,
  status: 'ok',
  result: {
    item,
    route: 'model',
    content_source,
    // 规则层的原始预标注也回传：出问题时能一眼看出是"规则判错"还是"模型判错"
    rules,
    rule_notes: (rules.rule_notes || []),
    model_notes: notes,
    usage: resp.usage || null
  },
  meta: {
    rules_version: V.rules_version,
    classifier_version: V.classifier_version,
    taxonomy_version: V.taxonomy_version,
    model: V.model,
    latency_ms: latency,
    cached: false,
    processed_at: new Date().toISOString()
  },
  errors
};

return [{ json: { ok: true, code: 200, body: out } }];
