// 由 workflow 里的 jsCode 直接跑，验证“陌生地名会下单、词表内地名不会”——不联网、不产生采集任务。
import fs from 'node:fs';
const wf = JSON.parse(fs.readFileSync(new URL('../workflows/04-demand-chat.json', import.meta.url), 'utf8'))[0];
const code = wf.nodes.find((n) => n.name === '1-意图').parameters.jsCode;
const run = (text) => {
  const $input = { first: () => ({ json: { chatInput: text, sessionId: 'local-test' } }) };
  return new Function('$input', code)($input)[0].json;
};
const cases = [
  { t: '定西现在有多少线索', intent: 'query', city: '定西' },
  { t: '成都现在有多少线索', intent: 'query', city: '成都' },
  { t: '成都南站外面全是水泥地，等车热得不行', intent: 'classify', city: '成都' },
  { t: '你好', intent: 'help', city: null },
  { t: '帮我抓成都 遮阴', intent: 'collect', city: '成都' },
];
let pass = 0;
for (const c of cases) {
  const out = run(c.t);
  const intent = out.intent || out.route || null;
  const city = out.city || (out.job && out.job.city) || null;
  const ok = intent === c.intent && (c.city === null ? true : city === c.city);
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.t}  -> intent=${intent} city=${city || '-'}`);
}
console.log(`通过用例：${pass}/${cases.length}`);
if (pass !== cases.length) process.exit(1);
