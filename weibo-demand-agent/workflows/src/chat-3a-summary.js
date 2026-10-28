// 聊天窗「问现状」第 3a 步：渲染最终回答
// 输入两种可能：① 大模型回的 JSON（choices[0].message.content）② 模型失败（节点 onError 透传上来的 error）
// 事实一律取自 2g 节点的 facts；模型只贡献"一句话总结""类别解释""需求归纳"这些措辞。
// 只要模型给的类别不在 facts 里、或者模型说了别的数字，一律以 facts 为准（模型不得改条数）。
const ctx = $('1-意图').first().json;
const up = $('2g-构造摘要').first().json;
const facts = up && up.facts;

// 快照读不到 / 不是合法 JSON：交给后面的 If-缺快照? 决定（有城市名就去自动下单采集）
if (!facts) {
  return [{ json: { output: '', snapshot_missing: true, city: (up && up.city) || ctx.city || null } }];
}

// ---------- 1. 取模型输出（失败就退化成规则摘要，不编造）----------
let ai = null;
let ai_error = null;
try {
  const body = $input.first().json || {};
  if (body.error) {
    ai_error = body.error.message || body.error.code || 'model_error';
  } else {
    const content = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    if (content) {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') ai = parsed;
    } else {
      ai_error = 'empty_model_response';
    }
  }
} catch (e) {
  ai_error = 'parse_failed: ' + e.message;
}

// ---------- 2. 事实与措辞的校对 ----------
const c = facts.counts || {};
const demandCats = (facts.demands || []).filter((e) => e.count > 0);
const obsCats = (facts.observations || []).filter((o) => o.count > 0);

// 模型给的类别解释（按类别中文名匹配；多了的丢掉，少了的不补）
const catExplain = {};
if (ai && Array.isArray(ai.categories)) {
  for (const item of ai.categories) {
    if (!item) continue;
    const key = String(item['类别'] || item.category || item.name || '').trim();
    const val = String(item['一句话'] || item.explain || item.description || '').trim();
    if (key && val) catExplain[key] = val;
  }
}

// 一句话总结：模型给了就用；没有就用事实拼一句同样通俗的
function fallbackSummary() {
  if (!demandCats.length) {
    const total = c.in_scope_items || c.in_study_area_items || 0;
    return `这批样本里没看到明确的改造诉求，${total} 条内容多是笼统的热感受，另有 ${c.unique_contents || 0} 条去重后的内容可看。`;
  }
  const top = demandCats[0];
  const rest = demandCats.length > 1 ? `，其次是「${demandCats[1].topic_zh}」（${demandCats[1].count} 条）` : '';
  return `大家主要在说「${top.topic_zh}」（${top.count} 条）${rest}。`;
}
const summary = (ai && typeof ai.summary === 'string' && ai.summary.trim()) ? ai.summary.trim() : fallbackSummary();

// 需求归纳：模型给了就取前 3 条；没有就从类别里直接生成
let needs = [];
if (ai && Array.isArray(ai.needs)) {
  needs = ai.needs.map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
}
if (!needs.length) {
  needs = demandCats.slice(0, 3).map((e) => `${e.topic_zh}${e.place ? '（' + e.place + '）' : ''}`);
}

// ---------- 3. 原文链接：有就点得开，没有就明说 ----------
function linkOf(rep) {
  if (rep && rep.url) return `[原文](${rep.url})`;
  return '（原文不可访问）';
}
function quoteOf(rep) {
  return rep ? `「${String(rep.excerpt).replace(/\s+/g, ' ').slice(0, 70)}」` : '';
}

const modeZh = facts.mode === 'historical_sample' ? '历史抽样回放' : (facts.mode || '未知模式');
const L = [];

// ---------- 4. 排版：一句话 / 分类明细 / 需求 / 边界 ----------
L.push(`**${facts.city} · 微博热感知（${modeZh}）**`);
if (facts.city_note) L.push(`_${facts.city_note}_`);
L.push('');
L.push(`**一句话**：${summary}`);
L.push('');

L.push('**分类明细**（类别 · 条数 · 代表原文，点「原文」可跳转核对）');
if (!demandCats.length) {
  L.push('- 这批样本里没有检出带具体地点的改造诉求。');
} else {
  for (const e of demandCats) {
    const meta = [e.dir ? `倾向：${e.dir}` : '', e.place ? `地点：${e.place}` : ''].filter(Boolean).join(' · ');
    L.push(`- **${e.topic_zh}** · ${e.count} 条${meta ? ' · ' + meta : ''}`);
    if (catExplain[e.topic_zh]) L.push(`  - 说的是：${catExplain[e.topic_zh]}`);
    for (const rep of (e.reps || []).slice(0, 2)) {
      L.push(`  - ${linkOf(rep)} ${quoteOf(rep)}`);
    }
    if (!(e.reps || []).length) L.push('  - （原文不可访问）这一类没有可回查的原文。');
  }
}

if (obsCats.length) {
  L.push('');
  L.push('**体验观察**（不是改造诉求，但同样是民意）');
  for (const o of obsCats.slice(0, 5)) {
    const head = `- **${o.topic_zh}** · ${o.count} 条${o.dir ? '（倾向：' + o.dir + '）' : ''}`;
    L.push(head);
    const rep = (o.reps || [])[0];
    if (rep) L.push(`  - ${linkOf(rep)} ${quoteOf(rep)}`);
  }
}

L.push('');
L.push('**这些线索属于哪些需求**');
for (const n of needs) L.push(`- ${n}`);

// 数据口径一行（保留可追溯性，但不堆术语）
L.push('');
L.push(`_样本：原始 ${c.raw_posts ?? '?'} 帖 / ${c.raw_comments ?? '?'} 条评论 → 判定 ${c.classified_items ?? '?'} 条 → 落在${facts.city} ${c.in_scope_items ?? '?'} 条 → 去重后 ${c.unique_contents ?? '?'} 条；范围外 ${c.out_of_scope_items ?? '?'} 条、地点待定 ${c.place_unknown_items ?? '?'} 条。_`);
const ls = facts.link_stats || {};
L.push(`_原文链接：${ls.with_url ?? 0} 条可跳转${ls.missing ? `，${ls.missing} 条已缺失或已删除（标注为「原文不可访问」）` : ''}。_`);

if (ai && ai.caveat) {
  L.push('');
  L.push(`> ${String(ai.caveat).slice(0, 120)}`);
}
const limits = Array.isArray(facts.limits) ? facts.limits : [];
if (limits.length) {
  L.push('');
  L.push('**边界**');
  for (const l of limits.slice(0, 3)) L.push(`- ${l}`);
}
if (ai_error) L.push('');
if (ai_error) L.push(`_（这次没能请大模型润色，上面是按规则拼的；原因：${ai_error}）_`);
L.push(`_快照生成于 ${facts.generated_at || '未知时间'}。_`);

return [{ json: { output: L.join('\n'), ai_used: !!ai, ai_error } }];
