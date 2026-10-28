// 聊天窗第 3b 步：把 03 契约服务返回的单条判定结果说成人话
// 输入：HTTP 节点调 http://127.0.0.1:5678/webhook/weibo-demand/v1 的响应
const ctx = $('1-意图').first().json;
const resp = $input.first().json || {};

const fail = (msg) => [{ json: { output: msg } }];

// ---- 出错也要说清楚是哪一类错 ----
// 注意：成功响应里 errors 可能是空数组，空数组 truthy，必须看长度
const errs = Array.isArray(resp.errors) ? resp.errors : [];
if (resp.status === 'error' || errs.length) {
  const lines = ['**没能判定**（' + (resp.request_id || '-') + '）'];
  for (const e of errs.slice(0, 5)) {
    lines.push(`- \`${e.code}\`：${e.message}${e.path ? ' @ ' + e.path : ''}${e.retryable ? '（可重试）' : '（不可重试）'}`);
  }
  if (!errs.length) lines.push('- ' + JSON.stringify(resp).slice(0, 300));
  return fail(lines.join('\n'));
}

const result = resp.result || {};
const item = (Array.isArray(result.items) && result.items[0]) || result.item || result;
if (!item || !item.item_id && !item.heat_relevance) {
  return fail('返回体里没有找到判定条目：' + JSON.stringify(resp).slice(0, 300));
}

// 标签中文名来自 config/taxonomy.v1.json（构建时注入），别在这里手抄一份，否则迟早和词表不一致
const LBL = /*__TAXONOMY_ZH__*/null;
const KIND_ZH = { target: '查询城市', other_place: '范围外', study_area: '研究区' };

const zhOf = (dim, v) => {
  const m = (LBL && LBL[dim]) || {};
  return m[v] || KIND_ZH[v] || v || '-';
};
const list = (dim, a) => (Array.isArray(a) && a.length ? a.map((v) => zhOf(dim, v)).join('、') : '-');

const h = item.place || {};
const ev = (item.evidence_spans || []).map((s) => s.text || s.quote || '').filter(Boolean);
const notes = Array.isArray(item.notes) ? item.notes : [];

// 一句话：把标签拼成日常说法，别让读者先学一遍词表
const topicZh = item.demand_topic_zh || zhOf('demand_topic', item.demand_topic);
const dirZh = zhOf('evaluation_direction', item.evaluation_direction);
const demandZh = list('spatial_demands', item.spatial_demands);
const isDemand = item.is_public_demand === true;
let gist;
if (item.heat_relevance === 'irrelevant') {
  gist = '这句话不是在说热，和热环境无关。';
} else if (isDemand) {
  gist = `这句话是在提需求：说的是「${topicZh}」，希望能改的地方是${demandZh === '-' ? '（没写具体）' : demandZh}，感受偏${dirZh}。`;
} else {
  gist = `这句话是在讲体感：${topicZh}，感受偏${dirZh}，没提具体要改哪儿。`;
}

const L = [];
L.push(`**这句话说了什么**：${gist}`);
L.push('');
L.push(`**判定结果**（${resp.request_id || '-'}）`);
L.push(`- 原话：「${String(item.text || item.text_norm || ctx.text || '').slice(0, 80)}」`);
L.push(`- 和热有关吗：**${zhOf('heat_relevance', item.heat_relevance)}**`);
L.push(`- 这是哪种说法：${list('content_types', item.content_types)}`);
L.push(`- 体感：${list('experience_tags', item.experience_tags)}`);
L.push(`- 希望能改的地方：${demandZh}`);
L.push(`- 感受倾向：${dirZh} · 发生场景：${zhOf('activity_scene', item.activity_scene)}`);
L.push(`- 归类：${topicZh}`);
if (h.name || h.place_id) {
  L.push(`- 提到的地方：${h.name || h.place_id}（${zhOf('kind', h.kind)}${item.in_scope === true ? ' · 在查询范围内' : item.in_scope === false ? ' · 不在查询范围内' : ''}）`);
}
L.push(`- 把握有多大：${item.confidence ?? '-'}（${item.confidence_level || '-'}）· 需人工复核：${item.needs_review ? '是' : '否'}`);
// 粘贴进来的文本本身没有链接：明说，不伪造
L.push('- 原文链接：（这条是你粘贴的文本，没有可跳转的链接；可在微博里搜这句话核对）');
if (ev.length) {
  L.push('');
  L.push('**证据片段（可在原文里对上号）**');
  for (const s of ev.slice(0, 4)) L.push(`- 「${String(s).slice(0, 80)}」`);
}
if (notes.length) {
  L.push('');
  L.push('**判定说明**：' + notes.join('；'));
}
L.push('');
L.push('_这是对单条文本的判定：不代表温度观测，也不代表人数。_');

return [{ json: { output: L.join('\n') } }];
