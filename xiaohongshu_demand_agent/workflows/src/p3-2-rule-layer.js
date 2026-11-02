// P3 第 2 步：规则层 v1（rules_version = r1）
// 目的：在花模型的钱之前，用确定性规则先做三件事
//   ① 歧义排除：热搜 / 热度 / 热卖 / 手机发热 → 直接判不相关，根本不调模型
//   ② 时间判定：历史 / 未来 / 当前（不得用发帖时间顶上）
//   ③ 预标注：体验方向、空间诉求、可行动性 —— 给 P4 的模型当骨架，模型只做"确认或推翻"
// 边界：规则只提高候选优先级，不单独决定最终标签（见 config/taxonomy.v1.json 的 keyword_groups.note）
const first = $input.first().json || {};

// 契约校验不通过时，它已经把完整的 400 错误响应装好了 —— 这里原样透传，绝不进入任何分析逻辑。
// （P2 的教训：删掉分支节点后，错误信封会顺着连线流进下一个节点，被当成"没有正文的微博"重新分析一遍）
if (first.ok === false) return [{ json: first }];

const req = first.req || {};
const payload = req.payload || {};

// health 不需要走分析，直接在这里短路返回（P4 接模型后，health 同样绕过模型）
if (req.action === 'health') {
  return [{ json: { decision: 'health', ok: true, code: 200, body: {
    contract_version: '1.0.0',
    request_id: req.request_id,
    status: 'ok',
    result: {
      alive: true,
      route: 'health',
      rules_version: 'r1',
      taxonomy_version: 't1',
      classifier_version: 'c1-rule',
      upstreams: { model: 'not_configured', storage: 'file', platform_api: 'not_used' }
    },
    meta: {
      rules_version: 'r1', classifier_version: 'c1-rule', taxonomy_version: 't1',
      model: 'none', latency_ms: 0, cached: false, processed_at: new Date().toISOString()
    },
    errors: []
  } } }];
}

// ---- 输入文本（支持单条 text，也支持 items[] 批量中的第一条，P3 先只处理单条）----
let raw = '';
if (typeof payload.text === 'string') raw = payload.text;
else if (Array.isArray(payload.items) && payload.items.length && typeof payload.items[0].text === 'string') raw = payload.items[0].text;

// 清洗只用于"匹配"，原文 original 保留用于证据回查
const clean = (s) => String(s || '')
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/@[\w\-\u4e00-\u9fa5]+/g, ' ')
  .replace(/\[[^\]]{1,8}\]/g, ' ')
  .replace(/#([^#]{1,40})#/g, ' $1 ')
  .replace(/\s+/g, ' ')
  .trim();

const t = clean(raw);
const original = String(raw || '');

// ---- 目标地点：由请求的 payload.scope 决定（不写死城市；不传就不做地点过滤）----
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
const SCOPE = resolveScope(payload.scope);

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
const place = detectPlace(original, SCOPE);

// ---- 关键词组（与 taxonomy.v1.json keyword_groups 对应，r1 版本内联，改动即升版本）----
const G = {
  ambiguous: ['热搜', '热卖', '热度', '热爱', '火爆', '手机发热', '热血', '热点', '热映', '热播', '热门'],
  heat_hot: ['太热', '热死了', '热得受不了', '高温', '热炸', '热到融化', '很热', '热得慌', '烤'],
  heat_muggy: ['闷热', '焖热', '不透风', '憋闷', '没有风', '没风'],
  heat_sun: ['暴晒', '晒得', '晒太阳', '晒死', '日头', '直晒', '晒爆'],
  shade_stay: ['没树荫', '没有树荫', '没有遮阳', '没遮阳', '等车暴晒', '晒得烫', '没地方躲太阳', '树荫', '遮阳棚', '树太小', '光秃秃', '没地方坐'],
  mobility: ['步行', '走路', '候车', '公交站', '地铁口', '广场', '公园', '绿道', '室外工作', '工地', '外卖', '骑行', '共享单车'],
  positive: ['树下凉快', '绿道凉爽', '终于不热了', '通风舒服', '凉快多了', '凉快', '凉爽', '舒服', '凉风'],
  place_names: ['环球中心', '天府广场', '春熙路', '人民公园', '东门', '南门', '北门', '西门', '校区', '客运站', '二环', '三环', '高新', '锦江', '武侯', '成华', '金牛', '青羊'],
  place_categories: ['学校', '广场', '公园', '公交站', '商场', '医院', '小区', '菜市场', '天桥', '地铁站'],
  spatial_relation: ['东门', '南门', '北门', '西门', '南侧', '北侧', '旁边', '对面', '门口', '附近', '外面'],
  negative: ['不是', '没说', '哪来的', '并没有', '呵呵', '就这'],
  relay: ['听说', '据说', '网友说', '转发', '转自', '看到有人', '我朋友说', '专家说'],
  forecast: ['预报', '预计', '气象台', '高温预警', '橙色预警', '红色预警', '未来一周', '明天'],
  ad: ['广告', '促销', '团购', '优惠', '代金', '加微信', '领取', '抽奖', '买一送一'],
  historical: ['去年', '上周', '上个月', '以前', '小时候', '回忆', '那年', '大一', '高中', '当年'],
  future: ['下周', '明天', '预计', '要来', '将会', '以后', '未来'],
  current: ['今天', '刚刚', '现在', '这两天', '刚才', '今早', '今晚'],
  suggestion: ['应该', '建议', '能不能', '希望', '最好能', '加点', '多搞点', '装个', '挖'],
  firsthand: ['我在', '我每天', '天天', '我住', '我家', '我今天', '我昨天']
};

const hit = (arr) => {
  const out = [];
  for (const w of arr) {
    const i = t.indexOf(w);
    if (i >= 0) out.push({ term: w, start: i, end: i + w.length });
  }
  return out;
};
const terms = (arr) => hit(arr).map(x => x.term);

// ---- 逐组命中 ----
const h = {
  ambiguous: hit(G.ambiguous),
  hot: hit(G.heat_hot),
  muggy: hit(G.heat_muggy),
  sun: hit(G.heat_sun),
  shade: hit(G.shade_stay),
  mobility: hit(G.mobility),
  positive: hit(G.positive),
  place_name: hit(G.place_names),
  place_category: hit(G.place_categories),
  spatial_relation: hit(G.spatial_relation),
  negative: hit(G.negative),
  relay: hit(G.relay),
  forecast: hit(G.forecast),
  ad: hit(G.ad),
  historical: hit(G.historical),
  future: hit(G.future),
  current: hit(G.current),
  suggestion: hit(G.suggestion),
  firsthand: hit(G.firsthand)
};
const all = (...keys) => keys.reduce((acc, k) => acc.concat(h[k]), []);
const heatEnv = all('hot', 'muggy', 'sun', 'shade', 'positive'); // 非歧义的热环境/体感证据

// ---- 判定 1：歧义短路 ----
// 严格条件：命中歧义词 + 没有任何非歧义热环境证据 + 没有具体地点名
// 只命中"场所类别"（广场/公园）不算证据，否则「热搜第一是某广场活动」会被误留
const ambiguousOnly = h.ambiguous.length > 0 && heatEnv.length === 0 && h.place_name.length === 0;
const decision = ambiguousOnly ? 'rule_only' : 'needs_model';

// ---- 判定 2：时间（历史 > 未来 > 当前 > 未知；不得用 published_at 顶上）----
let time_hint = 'unknown';
if (h.historical.length) time_hint = 'historical';
else if (h.future.length) time_hint = 'future';
else if (h.current.length) time_hint = 'current';

// ---- 判定 3：内容性质（只做预判，最终由模型确认）----
const content_hints = [];
if (h.ad.length) content_hints.push('ad');
if (h.forecast.length) content_hints.push('forecast');
if (h.relay.length) content_hints.push('relay');
if (h.suggestion.length) content_hints.push('suggestion');
if (h.firsthand.length && !h.relay.length) content_hints.push('firsthand');

// ---- 判定 4：体验方向（惊叹号/脏话不等于负面；「终于不热了」= 改善）----
const coolTerm = terms(['凉快', '凉爽', '不热', '凉风', '舒服']);
const hotTerm = terms(['太热', '热死', '高温', '闷热', '暴晒', '热炸', '很热', '热得', '晒']);
let direction = 'unclear';
if (coolTerm.length && (hotTerm.length || h.negative.length)) direction = 'mixed';
else if (coolTerm.length) direction = 'improvement';
else if (hotTerm.length) direction = 'discomfort';

// ---- 判定 5：空间诉求（多标签）----
const demands = [];
const addDemand = (code, arr) => { if (terms(arr).length) demands.push(code); };
addDemand('shade_deficit', ['没树荫', '没有树荫', '没有遮阳', '没遮阳', '遮阳', '暴晒', '晒得', '树太小', '光秃秃']);
addDemand('ventilation', ['没有风', '没风', '不透风', '闷热', '憋闷', '通风']);
addDemand('waiting_comfort', ['候车', '公交站', '等车', '地铁口', '换乘']);
addDemand('stay_comfort', ['没地方坐', '休息', '坐着', '停留', '没地方躲']);
addDemand('water_or_cooling_facility', ['饮水', '直饮水', '喝水', '凉水', '喷泉', '降温设施', '风扇', '空调']);

// ---- 判定 6：话题（固定词表，只给提示）----
const topics = [];
const addTopic = (code, arr) => { if (terms(arr).length) topics.push(code); };
addTopic('shade_deficit', ['没树荫', '没有树荫', '遮阳', '暴晒', '晒得']);
addTopic('tree_canopy', ['树荫', '树太小', '光秃秃', '种树']);
addTopic('waiting_transit', ['候车', '公交站', '等车', '地铁口', '换乘']);
addTopic('walking_route', ['步行', '走路', '人行道', '过马路', '骑行']);
addTopic('plaza_leisure', ['广场', '公园', '歇脚']);
addTopic('campus_school', ['学校', '校区', '接送', '放学']);
addTopic('park_greenway', ['绿道', '公园']);
addTopic('outdoor_work', ['工地', '外卖', '室外工作', '跑腿']);
addTopic('water_cooling_facility', ['饮水', '直饮水', '喷泉', '降温设施']);
addTopic('ventilation_stillness', ['闷热', '没有风', '没风', '不透风']);
addTopic('surface_heat', ['地面', '铺装', '烫', '柏油']);
addTopic('positive_cooling', ['凉快', '凉爽', '不热了', '凉风', '舒服']);

// ---- 判定 7：可行动性 A/B/C ----
let actionability = 'C';
if (h.place_name.length && (heatEnv.length || demands.length)) actionability = 'A';
else if (h.place_category.length || h.spatial_relation.length) actionability = 'B';

// ---- 判定 8：置信度依据（ordinal，不用模型自报概率）----
const basis = [];
if (heatEnv.length) basis.push('rule_hit');
if (h.place_name.length) basis.push('place_named');
let rule_conf = 'medium';
if (h.negative.length || h.relay.length || h.ambiguous.length) rule_conf = 'low';
else if (heatEnv.length && h.place_name.length) rule_conf = 'high';

// ---- 人话解释（答辩时直接念这段）----
const notes = [];
if (h.ambiguous.length) notes.push('命中歧义词：' + terms(G.ambiguous).join('、'));
if (heatEnv.length) notes.push('命中热环境/遮阴证据：' + heatEnv.map(x => x.term).slice(0, 5).join('、'));
if (!heatEnv.length) notes.push('没有任何非歧义热环境词');
if (h.place_name.length) notes.push('命中具体地点：' + terms(G.place_names).join('、'));
else if (h.place_category.length) notes.push('只有场所类别（' + terms(G.place_categories).join('、') + '），不算具体地点');
if (ambiguousOnly) notes.push('→ 歧义排除成立：判不相关（irrelevant），本次不调用模型');
else notes.push('→ 未触发短路：交给模型做结构化抽取');
if (time_hint !== 'unknown') notes.push('时间线索：' + time_hint + '（' + all('historical', 'future', 'current').map(x => x.term).join('、') + '）');
if (direction !== 'unclear') notes.push('体验方向预判：' + direction);
if (demands.length) notes.push('空间诉求预判：' + demands.join('、'));

// 内容指纹（P5 去重用，先把哈希算好存着）
let fhash = 2166136261;
for (let i = 0; i < t.length; i++) { fhash ^= t.charCodeAt(i); fhash = Math.imul(fhash, 16777619) >>> 0; }
const content_hash = 'fnv1a-' + fhash.toString(16).padStart(8, '0');

const rules = {
  rules_version: 'r1',
  taxonomy_version: 't1',
  decision,
  scope_input: SCOPE,
  place,
  rule_relevance: ambiguousOnly ? 'irrelevant' : null,
  time_status_hint: time_hint,
  content_type_hints: content_hints,
  pre_labels: {
    experience_tags: [].concat(h.hot.length ? ['hot'] : [], h.muggy.length ? ['muggy'] : [], h.sun.length ? ['sun_exposure'] : [], coolTerm.length ? ['cool'] : []),
    evaluation_direction: direction,
    spatial_demands: demands,
    demand_topics: topics,
    actionability
  },
  rule_confidence: { level: rule_conf, basis },
  flags: {
    has_heat_env: heatEnv.length > 0,
    ambiguous_only: ambiguousOnly,
    negated: h.negative.length > 0,
    relayed: h.relay.length > 0,
    is_ad: h.ad.length > 0,
    is_forecast: h.forecast.length > 0,
    has_place_name: h.place_name.length > 0
  },
  hits: {
    ambiguous: terms(G.ambiguous),
    heat: heatEnv.map(x => x.term),
    place: [].concat(terms(G.place_names), terms(G.place_categories)),
    markers: [].concat(terms(G.negative), terms(G.relay), terms(G.forecast), terms(G.ad))
  },
  evidence_spans: buildSpans(),
  content_hash,
  text_norm: t,
  original_length: original.length
};

// 证据片段去重叠：同一段文字被「凉快 / 凉快多了 / 树下凉快」同时命中时只留最长的那个，
// 否则下游做 span_valid 回查时，重叠区间会让"这句话到底对应哪条证据"说不清。
function buildSpans() {
  const pool = [].concat(h.ambiguous, heatEnv, h.place_name)
    .sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)));
  const kept = [];
  for (const s of pool) {
    if (kept.length && s.start < kept[kept.length - 1].end) continue; // 与已保留片段重叠 → 丢弃短的
    kept.push(s);
  }
  return kept.slice(0, 8).map(x => ({ text: x.term, start: x.start, end: x.end }));
}

const meta = {
  rules_version: 'r1',
  classifier_version: 'c1-rule',
  taxonomy_version: 't1',
  model: 'none',
  latency_ms: 0,
  cached: false,
  processed_at: new Date().toISOString()
};

const base = { contract_version: '1.0.0', request_id: req.request_id || 'req-unknown', meta };

if (decision === 'rule_only') {
  // 短路：不算模型，直接给出"不相关"结论，但仍然保留计数（不是丢弃）
  return [{ json: { decision, ok: true, code: 200, body: {
    ...base,
    status: 'ok',
    result: {
      decision,
      route: 'rule_short_circuit',
      rules,
      item: {
        heat_relevance: 'irrelevant',
        content_types: ['unknown'],
        experience_tags: [],
        evaluation_direction: 'unclear',
        time_status: time_hint,
        review_status: 'rule_only',
        rule_based: true,
        location_scope: place.location_scope,
        in_scope: place.in_scope,
        scope_target: place.scope_target,
        in_study_area: place.in_scope,
        place_version: place.place_version,
        place_evidence: place.place_evidence,
        excerpt: original.slice(0, 140),
        rule_notes: notes,
        classifier_version: 'c1-rule'
      }
    },
    errors: []
  } } }];
}

return [{ json: { decision, ok: true, code: 200, body: {
  ...base,
  status: 'accepted',
  result: {
    decision,
    route: 'needs_model',
    rules,
    rule_notes: notes,
    pending: 'P4 阶段接入模型：规则预标注 + 模型结构化抽取 + 确定性校验'
  },
  errors: []
} } }];
