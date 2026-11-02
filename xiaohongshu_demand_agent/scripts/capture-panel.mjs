// 用 Edge 无头模式打开平台页面，点开「微博热感知」抽屉并截图。
// 用法：node scripts/capture-panel.mjs [--url http://127.0.0.1:5173/] [--out data/screens/weibo-panel.png]
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const URL_TO_OPEN = arg('--url', 'http://127.0.0.1:5173/');
const OUT = path.resolve(ROOT, arg('--out', 'data/screens/weibo-panel.png'));
const PORT = Number(arg('--port', '9223'));
// 抽屉内容比 1000px 高一截，默认给到 1440 才能一屏看完（--height 可改）
const WIDTH = Number(arg('--width', '1570'));
const HEIGHT = Number(arg('--height', '1440'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) throw new Error('找不到 Edge');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-shot-'));
const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1600,1100', '--hide-scrollbars', '--no-first-run', '--disable-gpu',
  'about:blank',
], {stdio: 'ignore'});

async function version() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('Edge 调试端口未就绪');
}

const ws = new WebSocket((await version()).webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let seq = 0;
const pending = new Map();
const events = [];
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    const {resolve, reject} = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message)); else resolve(data.result);
    return;
  }
  events.push(data);
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, {resolve, reject});
  ws.send(JSON.stringify({id, method, params, sessionId}));
});

const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});

const consoleErrors = [];
ws.addEventListener('message', (message) => {
  const data = JSON.parse(message.data);
  if (data.method === 'Runtime.exceptionThrown') consoleErrors.push(data.params?.exceptionDetails?.text || 'exception');
  if (data.method === 'Runtime.consoleAPICalled' && data.params?.type === 'error') {
    consoleErrors.push((data.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  }
});

await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', {width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false}, sessionId);
await send('Page.navigate', {url: URL_TO_OPEN}, sessionId);
await sleep(1500);
for (let i = 0; i < 60; i += 1) {
  const {result} = await send('Runtime.evaluate', {expression: 'document.readyState', returnByValue: true}, sessionId);
  if (result.value === 'complete') break;
  await sleep(250);
}
await sleep(3500); // 等 scene.json / heat_perception.json 拉取与地图首帧

const waitEval = async (expression, tries = 80, gap = 500) => {
  for (let i = 0; i < tries; i += 1) {
    const {result} = await send('Runtime.evaluate', {expression, returnByValue: true}, sessionId);
    if (result.value) return result.value;
    await sleep(gap);
  }
  return null;
};
// 首页要等场景数据载入后才会出现工具条按钮
const ready = await waitEval(`(() => !!document.querySelector('.masthead'))()`);
const bootError = await send('Runtime.evaluate', {
  expression: `document.querySelector('.boot')?.textContent || ''`, returnByValue: true,
}, sessionId);

const click = await send('Runtime.evaluate', {
  expression: `(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'') === '微博热感知');
    if (!btn) return 'no-button';
    btn.click();
    return 'clicked';
  })()`,
  returnByValue: true,
}, sessionId);
await sleep(1800);
const opened = await waitEval(`(() => !!document.querySelector('.heat-perception'))()`, 30, 400);

const probe = await send('Runtime.evaluate', {
  expression: `(() => {
    const panel = document.querySelector('.heat-perception');
    const items = document.querySelectorAll('.heat-item').length;
    const events = document.querySelectorAll('.heat-event-list details').length;
    const counts = [...document.querySelectorAll('.heat-counts > div')].map(d => d.textContent.trim());
    const err = document.querySelector('.heat-perception .empty-note')?.textContent.trim() || '';
    return JSON.stringify({click: ${JSON.stringify(click.result.value)}, ready: ${JSON.stringify(ready)}, opened: ${JSON.stringify(opened)}, boot: ${JSON.stringify((bootError.result.value || '').slice(0, 120))}, hasPanel: !!panel, items, events, counts, err, title: document.title});
  })()`,
  returnByValue: true,
}, sessionId);

// 截图前清掉"瓦片加载失败"这类临时提示：它只说明本机到 OSM 的墙/网速问题，不该进演示图
await send('Runtime.evaluate', {
  expression: `(() => {
    const junk = [...document.querySelectorAll('div,aside,section')].filter((el) => {
      const t = (el.textContent || '').trim();
      return /AJAXError|Failed to fetch|瓦片/.test(t) && t.length < 220 && el.querySelectorAll('button').length < 4;
    });
    junk.forEach((el) => el.remove());
    return junk.length;
  })()`,
  returnByValue: true,
}, sessionId);

const shot = await send('Page.captureScreenshot', {format: 'png'}, sessionId);

fs.mkdirSync(path.dirname(OUT), {recursive: true});
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('页面探针：', probe.result.value);
if (consoleErrors.length) console.log('控制台错误：', [...new Set(consoleErrors)].slice(0, 5));
console.log('截图：', OUT, fs.statSync(OUT).size, 'bytes');

ws.close();
child.kill();
await sleep(400);
fs.rmSync(profile, {recursive: true, force: true});
