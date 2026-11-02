// 打开聊天窗，自动发一到两句话并截图（证明"用户看到的样子"）
// 用法：
//   node scripts/capture-chat.mjs                                  # 本地页 http://127.0.0.1:4177/
//   node scripts/capture-chat.mjs --text "成都现在有多少线索" --text2 "成都南站外面全是水泥地，等车热得不行"
//   node scripts/capture-chat.mjs --url http://127.0.0.1:5678/webhook/wc9d1f2a34b7e48c0/chat
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const CHAT_URL = arg('--url', 'http://127.0.0.1:4177/');
const TEXT = arg('--text', '成都现在有多少线索');
const TEXT2 = arg('--text2', '成都南站外面全是水泥地，等车热得不行');
const OUT = path.resolve(ROOT, arg('--out', 'data/screens/chat-local.png'));
const PORT = Number(arg('--port', '9224'));
const WIDTH = Number(arg('--width', '1100'));
const HEIGHT = Number(arg('--height', '1500'));
// --welcome：只拍首屏（品牌条 + 欢迎页 + 快捷例句），不发送任何消息
const WELCOME_ONLY = process.argv.includes('--welcome');
// --scroll=top：截图前把对话滚到顶部（默认停在最新一条）
const SCROLL = arg('--scroll', 'bottom');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find((p) => fs.existsSync(p));
if (!EDGE) throw new Error('找不到 Edge');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-chat-'));
const child = spawn(
  EDGE,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--disable-gpu',
    'about:blank'
  ],
  { stdio: 'ignore' }
);

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
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let seq = 0;
const pending = new Map();
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message));
    else resolve(data.result);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send(
  'Emulation.setDeviceMetricsOverride',
  { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
  sessionId
);
await send('Page.navigate', { url: CHAT_URL }, sessionId);
await sleep(3000);

const evalJs = async (expression) => {
  const { result } = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId
  );
  return result.value;
};
const waitFor = async (expression, tries = 60, gap = 500) => {
  for (let i = 0; i < tries; i += 1) {
    if (await evalJs(expression)) return true;
    await sleep(gap);
  }
  return false;
};

// 欢迎页：先点"开始对话"（不同版本按钮文案不同，逐个试）
const clicked = await evalJs(`(() => {
  const b = [...document.querySelectorAll('button, a')].find((x) => /开始对话|New Conversation|Get started|Get Started/i.test((x.innerText || x.textContent || '').trim()));
  if (b) { b.click(); return (b.innerText || '').trim(); }
  return '';
})()`);
console.log('欢迎页按钮：', clicked || '（无，可能已直接进入输入）');
await sleep(1200);

const hasInput = await waitFor(
  `(() => !!(document.querySelector('textarea') || document.querySelector('[contenteditable="true"]')))()`,
  60,
  500
);
if (!hasInput) {
  const html = await evalJs('document.body.innerHTML.replace(/\\s+/g, " ").slice(0, 400)');
  throw new Error('聊天输入框没出现：' + html);
}

const typeAndSend = async (text) => {
  await evalJs(`(() => {
    const el = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
    el.focus();
    if (el.tagName === 'TEXTAREA') { el.value = ''; } else { el.textContent = ''; }
    return true;
  })()`);
  // CDP 输入法插入文本（比逐字符敲键稳）
  await send('Input.insertText', { text }, sessionId);
  await sleep(400);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
};

const bubbles = () => evalJs(`document.querySelectorAll('.chat-message, [class*="message"]').length`);

if (WELCOME_ONLY) {
  await sleep(1200);
  const welcomeProbe = await evalJs(`JSON.stringify({
    title: document.title,
    chips: [...document.querySelectorAll('.chip')].map((c) => c.textContent),
    hasInput: !!document.querySelector('textarea'),
    tree: (() => {
      const out = [];
      const walk = (el, depth) => {
        if (depth > 4 || out.length > 40) return;
        const r = el.getBoundingClientRect();
        const cls = (el.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.');
        if (cls && r.height > 0) out.push(depth + ':' + el.tagName.toLowerCase() + '.' + cls + ' h=' + Math.round(r.height) + ' y=' + Math.round(r.top));
        [...el.children].forEach((c) => walk(c, depth + 1));
      };
      const root = document.querySelector('#n8n-chat .chat-layout');
      if (root) walk(root, 0);
      return out;
    })(),
  })`);
  console.log('欢迎页探针：', welcomeProbe);
  if (SCROLL === 'top') {
  // 聊天区的滚动容器可能是 .chat-body / .chat-messages-list / .chat-list 中的任意一个，
  // 干脆把所有"内容超出高度"的子元素都滚到顶，滚两轮（滚动后高度会变化）
  for (let i = 0; i < 2; i++) {
    await evalJs(`(() => {
      let n = 0;
      document.querySelectorAll('#n8n-chat, #n8n-chat *').forEach((el) => {
        if (el.scrollHeight > el.clientHeight + 8) { el.scrollTop = 0; n++; }
      });
      window.scrollTo(0, 0);
      return n;
    })()`);
    await sleep(400);
  }
  await sleep(400);
}
const wshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(wshot.data, 'base64'));
  console.log('截图：', OUT, fs.statSync(OUT).size, 'bytes');
  ws.close();
  child.kill();
  await sleep(400);
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(0);
}

await typeAndSend(TEXT);
const parts = await waitFor(
  `(() => /微博热感知|两种用法|判定结果|没能判定|目前只有/.test(document.body.innerText))()`,
  120,
  700
);
console.log('第一问已回复：', parts, '气泡数', await bubbles());
await sleep(1500);

if (TEXT2) {
  await typeAndSend(TEXT2);
  await sleep(1200);
  const done = await waitFor(
    `(() => (document.body.innerText.match(/判定结果/g) || []).length >= 1)()`,
    180,
    800
  );
  console.log('第二问（判定）已回复：', done, '气泡数', await bubbles());
  await sleep(2000);
}

const probe = await evalJs(`JSON.stringify({
  title: document.title,
  input: !!document.querySelector('textarea'),
  text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 260),
})`);

// captureBeyondViewport=false：只拍当前视口，顶部固定的进度条才会出现在画面顶部
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('页面探针：', probe);
console.log('截图：', OUT, fs.statSync(OUT).size, 'bytes');

ws.close();
child.kill();
await sleep(400);
fs.rmSync(profile, { recursive: true, force: true });
