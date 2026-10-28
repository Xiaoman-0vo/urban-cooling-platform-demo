// 地名判定的单元测试：直接从「构建产物」里取代码，保证测的是真正上线的那个版本。
// 用法：node scripts/test-place-scope.mjs
// 要点：地点不再写死成都，判定结果取决于请求里传的 scope（由用户提问决定）。
import fs from 'node:fs';

const wf = JSON.parse(fs.readFileSync('workflows/03-demand-agent-api.json', 'utf8'))[0];
const node = wf.nodes.find((n) => n.name === '5-校验与合并');
if (!node) throw new Error('找不到节点 5-校验与合并，先跑 python scripts/build-p4-workflow.py');

const code = node.parameters.jsCode;
const start = code.indexOf('// ---------- 目标地点');
const end = code.indexOf('const notes = [];');
if (start < 0 || end < 0) throw new Error('切片失败：目标地点代码块不存在');
// SCOPE 依赖 n8n 的 ctx，单测里去掉，改成逐条显式传入
const block = code.slice(start, end).replace(/const SCOPE = resolveScope\([\s\S]*?\);/, '');
const { detectPlace, resolveScope } = new Function(block + '\nreturn { detectPlace, resolveScope };')();

const CD = { city: '成都' };
const CQ = { city: '重庆' };
const cases = [
  // [scope, 原文, 期望 location_scope, 期望 in_scope]
  [CD, '成都今天太闷热，公交站等车又没有遮阴。', 'target', true],
  [CD, '在锦江区上班，每天走到春熙路那段要命', 'target', true],
  [CD, '天府新区兴隆湖边上晒得头皮发麻', 'target', true],
  [CD, '重庆今天已经下雨降温了，晚上很凉快', 'other_place', false],
  [CD, '福州今天40度，热死了', 'other_place', false],
  [CD, '@成都大熊猫繁育研究基地 今天哈尔滨气温28度，全天外场暴晒', 'other_place', false],
  [CD, '今天好热啊，受不了了', 'unknown', false],
  [CQ, '重庆今天太闷热了，江边一点风都没有', 'target', true],
  [CQ, '从成都跑到重庆避暑，结果重庆更热', 'target', true],
  [CQ, '成都今天太闷热，公交站没遮阴', 'other_place', false],
  [null, '重庆今天已经下雨降温了', 'target', true],
  [null, '今天好热啊，受不了了', 'unknown', true],
  [null, '这个明星最近热度真高，热搜挂了好几天', 'unknown', true],
  // 只给别名、不给城市名：口径收窄到这几个别名
  [{ city: '成都', aliases: ['兴隆湖', '天府新区'] }, '兴隆湖边上晒得头皮发麻', 'target', true],
  [{ city: '成都', aliases: ['兴隆湖', '天府新区'] }, '在锦江区上班，走到春熙路要命', 'other_place', false],
  // 空文本
  [CD, '', 'unknown', false],
];

let bad = 0;
console.log('目标地点'.padEnd(14) + '原文'.padEnd(30) + '期望'.padEnd(12) + '实际'.padEnd(12) + '命中地点');
console.log('-'.repeat(104));
for (const [scope, text, want, wantIn] of cases) {
  const s = resolveScope(scope);
  const r = detectPlace(text, s);
  const ok = r.location_scope === want && r.in_scope === wantIn;
  if (!ok) bad++;
  const names = r.place_evidence.map((e) => `${e.name}(${e.kind === 'target' ? '目标' : '外地'})`).join(' ') || '—';
  const tag = s ? s.city : '(不过滤)';
  console.log(
    tag.slice(0, 12).padEnd(14) + (text || '(空)').slice(0, 28).padEnd(30) +
    `${want}/${wantIn}`.padEnd(12) +
    (ok ? `${r.location_scope}/${r.in_scope}` : `✗ ${r.location_scope}/${r.in_scope}`).padEnd(12) + names
  );
}
console.log('-'.repeat(104));
if (bad) {
  console.log(`失败 ${bad}/${cases.length}`);
  process.exit(1);
}
console.log(`全部通过：${cases.length}/${cases.length}（地点由 scope 决定，未传 scope 时不过滤）`);
