import { appendFile, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLATFORM_URL = 'http://127.0.0.1:4173';
const READY_TIMEOUT_MS = 20000;
const POLL_MS = 250;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Build a project-specific user-session job; no system or login item is installed. */
export function serviceInfo(root, executable = process.execPath, uid = process.getuid?.()) {
  const label = 'local.chengdu.block-green.' + createHash('sha256').update(root).digest('hex').slice(0, 12);
  const runtime = path.join(root, '.runtime');
  return { root, executable, label, runtime, domain: `gui/${uid}`, target: `gui/${uid}/${label}`,
    plist: path.join(runtime, label + '.plist'), stdout: path.join(runtime, 'platform.stdout.log'),
    stderr: path.join(runtime, 'platform.stderr.log'), events: path.join(runtime, 'service-events.jsonl') };
}

const xml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);

/** Use argument arrays so Chinese paths, spaces and shell metacharacters stay literal. */
export function launchPlist(info) {
  const args = [info.executable, path.join(info.root, 'node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1', '--port', '4173', '--strictPort'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(info.label)}</string>
<key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(info.root)}</string>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>5</integer>
<key>StandardOutPath</key><string>${xml(info.stdout)}</string>
<key>StandardErrorPath</key><string>${xml(info.stderr)}</string>
</dict></plist>
`;
}

/** Compare actual served bytes, rather than treating any response on this port as our app. */
export async function serverMatches(root, url = PLATFORM_URL, timeoutMs = 1200) {
  const expected = await readFile(path.join(root, 'public/data/manifest.json'));
  try {
    const response = await fetch(`${url}/data/manifest.json`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    return response.ok && expected.equals(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    if (error instanceof TypeError || ['AbortError', 'TimeoutError'].includes(error.name)) return false;
    throw error;
  }
}

/** Detect occupied ports without signalling or terminating the listening process. */
export function portOccupied(url = PLATFORM_URL) {
  const address = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: address.hostname, port: Number(address.port) });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true));
    socket.setTimeout(1200, () => { socket.destroy(); reject(new Error('检查本机端口超时，请稍后重试。')); });
    socket.once('error', error => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve(false); else reject(error);
    });
  });
}

function launchctl(args, optional = false) {
  const result = spawnSync('/bin/launchctl', args, { encoding: 'utf8', timeout: 10000 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !optional) throw new Error(result.stderr.trim() || '本机服务托管操作未完成。');
  return result;
}

function jobState(info) {
  const result = launchctl(['print', info.target], true);
  if (result.status !== 0) return null;
  return { pid: Number(result.stdout.match(/\bpid = (\d+)/)?.[1]) || null };
}

async function record(info, event) {
  await appendFile(info.events, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 });
}

async function waitUntil(check, timeoutMs = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  do { if (await check()) return true; await delay(POLL_MS); } while (Date.now() < deadline);
  return false;
}

export async function manageService(action, root) {
  if (process.platform !== 'darwin') throw new Error('此常驻启动入口适用于当前Mac；其他系统仍可使用原开发入口。');
  const info = serviceInfo(await realpath(root));
  const state = jobState(info);
  if (action === 'status') return { action, managed: Boolean(state), pid: state?.pid,
    ready: await serverMatches(info.root), url: PLATFORM_URL, logs: info.runtime };
  await mkdir(info.runtime, { recursive: true, mode: 0o700 });
  if (action === 'stop') {
    if (state) launchctl(['bootout', info.target]);
    await record(info, { action, wasManaged: Boolean(state) });
    return { action, stopped: Boolean(state), url: PLATFORM_URL };
  }
  if (action !== 'start') throw new Error('不支持的服务操作。');
  if (await serverMatches(info.root)) {
    const result = { action, reused: true, managed: Boolean(state), pid: state?.pid, url: PLATFORM_URL };
    await record(info, result);
    return result;
  }
  if (await portOccupied()) throw new Error('4173端口已有其他服务，且不是当前展示包；没有停止任何进程。');
  if (state) launchctl(['bootout', info.target]);
  const started = Date.now();
  const temporary = info.plist + '.' + process.pid + '.tmp';
  await writeFile(temporary, launchPlist(info), { mode: 0o600 });
  await rename(temporary, info.plist);
  const lint = spawnSync('/usr/bin/plutil', ['-lint', info.plist], { encoding: 'utf8' });
  if (lint.error || lint.status !== 0) throw new Error('后台服务配置未通过检查，未启动。');
  const bootstrap = launchctl(['bootstrap', info.domain, info.plist], true);
  if (bootstrap.status !== 0 && !jobState(info)) throw new Error(bootstrap.stderr.trim() || '未能启动本机后台服务。');
  if (!await waitUntil(() => serverMatches(info.root))) {
    // Stop this failed job only, so invalid dependencies cannot cause endless retries.
    if (jobState(info)) launchctl(['bootout', info.target]);
    await record(info, { action, status: 'failed', startupMs: Date.now() - started });
    throw new Error(`启动后页面没有就绪，请查看 ${info.stderr}；没有停止其他服务。`);
  }
  const result = { action, reused: false, managed: true, pid: jobState(info)?.pid,
    startupMs: Date.now() - started, url: PLATFORM_URL, logs: info.runtime };
  await record(info, result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await manageService(process.argv[2] || 'status', fileURLToPath(new URL('../', import.meta.url)));
    if (result.action === 'stop') console.log(result.stopped ? '本平台后台服务已停止。' : '本平台没有已托管的服务；未停止任何外部进程。');
    else if (result.action === 'status') console.log(JSON.stringify(result, null, 2));
    else console.log(`${result.reused ? '已复用当前平台' : '本平台已在后台启动'}：${result.url}\n${result.managed ? '可以关闭启动窗口，网站继续运行；异常退出由本机托管恢复。' : '当前为外部启动的同一展示包，本次未接管其进程。'}\n需要关闭时双击“停止本地平台.command”。`);
  } catch (error) {
    console.error(`无法完成：${error.message}`);
    process.exitCode = 1;
  }
}
