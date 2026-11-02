// 规则层本地回归测试（不需要 n8n，不需要联网）
// 原理：把 n8n Code 节点的 jsCode 当成函数体，注入一个假的 $input，直接跑。
// 用法：node scripts/test-rules-local.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = readFileSync(path.join(here, '..', 'workflows', 'src', 'p3-2-rule-layer.js'), 'utf8');
const contract = readFileSync(path.join(here, '..', 'workflows', 'src', 'p3-1-contract-check.js'), 'utf8');

const runContract = (body) => new Function('$input', contract)({ first: () => ({ json: { body } }) })[0].json;
const runRules = (req) => new Function('$input', code)({ first: () => ({ json: { req } }) })[0].json;

const req = (text, action = 'classify') => ({
  contract_version: '1.0.0',
  request_id: 'req-test-' + Math.random().toString(16).slice(2, 10),
  action,
  payload: { text },
});

const cases = [
  {
    name: '歧义-热搜（应短路，不调模型）',
    text: '热搜第一又是明星八卦，这个话题的热度真高。',
    expect: { decision: 'rule_only', route: 'rule_short_circuit', relevance: 'irrelevant' },
  },
  {
    name: '歧义-手机发热（应短路）',
    text: '手机发热太严重了，刚买就烫手，客服还说是正常的。',
    expect: { decision: 'rule_only', route: 'rule_short_circuit' },
  },
  {
    name: '纯广告-热卖（应短路）',
    text: '夏日热卖！全场五折，加微信领取优惠券，买一送一。',
    expect: { decision: 'rule_only', route: 'rule_short_circuit' },
  },
  {
    name: '亲历-树荫改善（应进模型，改善方向）',
    text: '今天在人民公园东门，树下凉快多了，就是没地方坐。',
    expect: { decision: 'needs_model', route: 'needs_model', time: 'current', direction: 'improvement', demand: 'stay_comfort', place: true },
  },
  {
    name: '预报-未来（应进模型，时间=未来）',
    text: '天气预报说下周会很热，最高温要到 38 度。',
    expect: { decision: 'needs_model', time: 'future', contentType: 'forecast' },
  },
  {
    name: '历史（应进模型，时间=历史）',
    text: '去年夏天在春熙路晒得受不了，走两步就想躲进商场。',
    expect: { decision: 'needs_model', time: 'historical', flag: 'negated_false' },
  },
  {
    name: '否定结构（应进模型，打 negated 旗标）',
    text: '不是我说，天府广场那边真的没树荫，等车的时候暴晒。',
    expect: { decision: 'needs_model', flag: 'negated', demand: 'shade_deficit' },
  },
  {
    name: '空文本（不能崩，应进模型）',
    text: '',
    expect: { decision: 'needs_model' },
  },
];

let pass = 0;
const rows = [];

for (const c of cases) {
  const out = runRules(req(c.text));
  const b = out.body;
  const r = b.result || {};
  const rules = r.rules || {};
  const pre = rules.pre_labels || {};
  const checks = [];
  const e = c.expect;

  if (e.decision) checks.push(['decision', out.decision === e.decision, out.decision]);
  if (e.route) checks.push(['route', r.route === e.route, r.route]);
  if (e.relevance) checks.push(['relevance', r.item && r.item.heat_relevance === e.relevance, r.item && r.item.heat_relevance]);
  if (e.time) checks.push(['time', rules.time_status_hint === e.time, rules.time_status_hint]);
  if (e.direction) checks.push(['direction', pre.evaluation_direction === e.direction, pre.evaluation_direction]);
  if (e.demand) checks.push(['demand', (pre.spatial_demands || []).includes(e.demand), (pre.spatial_demands || []).join('|')]);
  if (e.place) checks.push(['place_named', !!(rules.flags && rules.flags.has_place_name), String(rules.flags && rules.flags.has_place_name)]);
  if (e.contentType) checks.push(['content_hint', (rules.content_type_hints || []).includes(e.contentType), (rules.content_type_hints || []).join('|')]);
  if (e.flag === 'negated') checks.push(['negated', !!(rules.flags && rules.flags.negated), String(rules.flags && rules.flags.negated)]);
  if (e.flag === 'negated_false') checks.push(['negated=false', !(rules.flags && rules.flags.negated), String(rules.flags && rules.flags.negated)]);

  // 结构性校验：每个出口的 envelope 都必须自洽
  checks.push(['status', ['ok', 'accepted'].includes(b.status), b.status]);
  checks.push(['code', out.code === 200, String(out.code)]);
  checks.push(['meta', !!(b.meta && b.meta.rules_version === 'r1' && b.meta.taxonomy_version === 't1'), b.meta && b.meta.rules_version]);
  checks.push(['hash', /^fnv1a-[0-9a-f]{8}$/.test(rules.content_hash || '') || out.decision === 'health', rules.content_hash]);

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length === 0) pass++;
  rows.push({ case: c.name, result: failed.length ? 'FAIL' : 'PASS', detail: failed.length ? failed.map(f => f[0] + '=' + f[2]).join(', ') : (r.route || '') });
}

// 契约校验的正反例
const badMeta = runContract({ contract_version: '0.9', request_id: 'sh', action: 'nope' });
const goodMeta = runContract(req('test'));
// 该反例同时违反 4 条：contract_version / request_id 太短 / action 非法 / 缺 payload
const badExpect4 = badMeta.ok === false && badMeta.code === 400 && badMeta.body.errors.length === 4;
rows.push({ case: '契约-非法请求应返回 400 且 4 条字段错误', result: badExpect4 ? 'PASS' : 'FAIL', detail: `code=${badMeta.code} errors=${badMeta.body.errors.length}` });
rows.push({ case: '契约-合法请求应放行', result: goodMeta.ok === true ? 'PASS' : 'FAIL', detail: `ok=${goodMeta.ok}` });
if (badExpect4) pass++;
if (goodMeta.ok === true) pass++;

// 回归：证据片段不许重叠（重叠会让下游 span 回查说不清对应关系）
const spanCase = runRules(req('今天在人民公园东门，树下凉快多了，就是没地方坐。'));
const spans = spanCase.body.result.rules.evidence_spans;
const overlap = spans.some((s, i) => i > 0 && s.start < spans[i - 1].end);
rows.push({ case: '证据片段不重叠，且按出现顺序排列', result: !overlap ? 'PASS' : 'FAIL', detail: spans.map(s => `${s.text}@${s.start}-${s.end}`).join(' ') });
if (!overlap) pass++;

// health 短路
const health = runRules({ contract_version: '1.0.0', request_id: 'req-health-1', action: 'health', payload: {} });
rows.push({ case: 'health 应短路且不解析文本', result: health.decision === 'health' && health.body.result.alive === true ? 'PASS' : 'FAIL', detail: health.decision });
if (health.decision === 'health') pass++;

// 回归：契约错误信封必须被规则层原样透传（不能当成空文本微博重新分析）
const passthrough = new Function('$input', code)({ first: () => ({ json: badMeta }) })[0].json;
const okPass = passthrough.code === 400 && passthrough.body.errors.length === 4 && passthrough.body.status === 'error';
rows.push({ case: '错误信封透传：应保持 400 且有 4 条错误', result: okPass ? 'PASS' : 'FAIL', detail: `code=${passthrough.code} errors=${passthrough.body.errors.length}` });
if (okPass) pass++;

console.log('用例'.padEnd(34, ' '), '结果'.padEnd(6), '说明');
console.log('-'.repeat(96));
for (const r of rows) console.log(r.case.padEnd(34 - (r.case.length - [...r.case].length), ' '), r.result.padEnd(6), r.detail);
console.log('-'.repeat(96));
console.log(`合计 ${rows.length} 项，通过 ${pass} 项，失败 ${rows.length - pass} 项`);
process.exit(rows.length === pass ? 0 : 1);
