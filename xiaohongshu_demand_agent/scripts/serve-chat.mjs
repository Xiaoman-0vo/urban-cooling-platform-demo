// 本地聊天页服务：静态文件 + /webhook/* 反向代理到 n8n
// 用法：node scripts/serve-chat.mjs          （默认 127.0.0.1:4177）
//       node scripts/serve-chat.mjs --port 4178 --no-open
// 为什么需要它：n8n 自带的托管聊天页把样式与脚本写死在 cdn.jsdelivr.net，
// 本机访问不到该 CDN 时会白屏；这里把同一份前端资源放到本地，并代理到 n8n，避免跨域。
import http from 'node:http';
import fs from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
fs.mkdirSync(path.join(ROOT, 'data', 'jobs'), { recursive: true }); // n8n 写任务单需要这个目录存在
const CHAT_DIR = path.join(ROOT, 'chat');

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(readArg('port', process.env.CHAT_PORT || 4177));
// 绑 127.0.0.1 只有本机能开；绑 0.0.0.0 同一局域网里别人也能开（演示"人人都能聊"用）
const HOST = readArg('host', process.env.CHAT_HOST || '127.0.0.1');
const N8N = readArg('n8n', process.env.N8N_URL || 'http://127.0.0.1:5678');
const OPEN = !args.includes('--no-open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

async function serveStatic(req, res) {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(CHAT_DIR, '.' + rel);
  // 目录穿越保护
  if (!file.startsWith(CHAT_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not file');
    const buf = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found: ' + rel);
  }
}

// 反向代理：保持方法/头/请求体，原样回传（含 SSE 流）
function proxyToN8n(req, res) {
  const target = new URL(req.url, N8N);
  const headers = { ...req.headers, host: target.host };
  delete headers['accept-encoding'];
  delete headers.origin;
  delete headers.referer;

  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname + target.search,
      method: req.method,
      headers
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );

  upstream.setTimeout(180000, () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', (err) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' }).end(
      JSON.stringify({
        error: 'n8n 不可达',
        detail: String(err && err.message),
        hint: `确认容器在跑：docker ps --filter name=n8n；目标 ${N8N}`
      })
    );
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url.startsWith('/webhook/') || url.startsWith('/rest/')) {
    proxyToN8n(req, res);
    return;
  }
  serveStatic(req, res);
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.listen(PORT, HOST, () => {
  const local = `http://127.0.0.1:${PORT}/`;
  console.log(`聊天页已启动：${local}`);
  if (HOST === '0.0.0.0') {
    // 列出本机局域网地址，别人用这些地址就能打开
    import('node:os').then(({ networkInterfaces }) => {
      const lan = [];
      for (const list of Object.values(networkInterfaces())) {
        for (const it of list || []) {
          if (it.family === 'IPv4' && !it.internal) lan.push(`http://${it.address}:${PORT}/`);
        }
      }
      if (lan.length) console.log('同一局域网内可用：' + lan.join('  '));
      else console.log('没找到局域网地址：确认电脑已连上 Wi-Fi/网线，且防火墙允许 ' + PORT + ' 端口。');
    });
  }
  console.log(`代理目标：${N8N}（/webhook/* 转发到 n8n）`);
  console.log('按 Ctrl+C 停止。');
  if (OPEN && HOST !== '0.0.0.0') {
    try {
      spawn('cmd', ['/c', 'start', '', local], { detached: true, stdio: 'ignore' }).unref();
    } catch {
      /* 打不开就让用户自己点链接 */
    }
  }
});
