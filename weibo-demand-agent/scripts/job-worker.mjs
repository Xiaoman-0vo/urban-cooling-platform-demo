// 后台任务工人：轮询 data/jobs/*.json，把"排队中"的任务真正跑起来
//
// 为什么要单独一个进程：
//   n8n 在 Docker 里、采集与判定脚本在宿主机上（要读 Edge 的 Cookie、要用本机的模型网络）。
//   让 n8n 只负责"下单"（往挂载目录写一个 job 文件），由这个工人负责"干活"，
//   两边的路径和依赖都不用改，也不用把脚本搬进容器。
//
// 用法：
//   node scripts/job-worker.mjs            # 前台跑，Ctrl+C 停
//   node scripts/job-worker.mjs --once     # 只处理当前队列里已有的任务，然后退出（调试用）
//
// 一个任务按三步跑：采集 → 判定 → 聚合，每一步都往同一个 job 文件里写进度。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JOBS = path.join(ROOT, 'data', 'jobs');
const ONCE = process.argv.includes('--once');
const POLL_MS = 1500;

fs.mkdirSync(JOBS, { recursive: true });

const now = () => new Date().toISOString();
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(job, line) {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const text = `[${stamp}] ${line}`;
  console.log(`(${job.id}) ${text}`);
  try {
    fs.appendFileSync(path.join(JOBS, `${job.id}.log`), text + '\n', 'utf8');
  } catch {}
}

function save(job, patch) {
  Object.assign(job, patch, { updated_at: now() });
  const body = JSON.stringify(job, null, 2);
  const tmp = path.join(JOBS, `${job.id}.tmp`);
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, path.join(JOBS, `${job.id}.json`)); // 原子替换，避免前端读到半截
  // latest.json 给"查进度"和前端进度条看：永远指向最近动过的那个任务
  try {
    fs.writeFileSync(path.join(JOBS, 'latest.json'), body, 'utf8');
  } catch {}
}

// 子进程把进度写到独立的 <id>.progress.json（避免和工人写 job 文件互相覆盖），
// 工人每 1.2 秒把它合并进 job，前端只读 job 文件。
const progressPath = (job) => path.join(JOBS, `${job.id}.progress.json`);

function readChildProgress(job) {
  try {
    return readJson(progressPath(job));
  } catch {
    return null;
  }
}

function run(cmd, args, job, phaseLabel) {
  return new Promise((resolve, reject) => {
    log(job, phaseLabel);
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const onData = (buf) => {
      const s = buf.toString();
      tail = (tail + s).slice(-2000);
      for (const line of s.split(/\r?\n/)) if (line.trim()) log(job, '  ' + line.trim().slice(0, 160));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setInterval(() => {
      // 子进程每写一次进度，就把 message 搬到 job 上，前端就能看到"抓评论 3/6"
      const p = readChildProgress(job);
      if (!p) return;
      if (p.message && p.message !== job.message) {
        save(job, {
          message: p.message,
          posts: p.posts ?? job.posts,
          comments: p.comments ?? job.comments,
          pages_done: p.pages_done ?? job.pages_done,
          comment_done: p.comment_done ?? job.comment_done,
          comment_targets: p.comment_targets ?? job.comment_targets,
          done: p.done ?? job.done,
          total: p.total ?? job.total
        });
      }
    }, 1200);
    child.on('error', (e) => {
      clearInterval(timer);
      reject(new Error(`${cmd} 启动失败：${e.message}`));
    });
    child.on('close', (code) => {
      clearInterval(timer);
      if (code === 0) resolve(tail);
      else reject(new Error(`${cmd} 退出码 ${code}：${tail.split('\n').filter(Boolean).slice(-3).join(' | ')}`));
    });
  });
}

function nodeBin() {
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

async function runJob(job) {
  save(job, { status: 'running', phase: 'collecting', message: '开始采集', started_at: now() });

  const rawName = `raw_job_${job.id}`;
  await run(
    nodeBin(),
    [
      'scripts/collect-weibo.mjs',
      '--query', job.query,
      '--pages', String(job.pages || 1),
      '--top', String(job.top || 6),
      '--comment-pages', String(job.comment_pages || 1),
      '--out', `data/${rawName}.json`,
      '--job-id', job.id,
      '--progress', `data/jobs/${job.id}.progress.json`,
      '--pace', String(job.pace || 1200)
    ],
    job,
    `采集：${job.query}`
  );

  save(job, { phase: 'classifying', message: '开始判定', done: 0, total: null });
  const itemsName = `items_job_${job.id}`;
  await run(
    nodeBin(),
    [
      'scripts/run-pipeline.mjs',
      '--city', job.city || '',
      ...(Array.isArray(job.aliases) && job.aliases.length
        ? ['--aliases', job.aliases.join(',')]
        : []),
      '--raws', rawName,
      '--out', `data/${itemsName}.json`,
      '--max', String(job.max || 120),
      '--pace', '300',
      '--progress', `data/jobs/${job.id}.progress.json`
    ],
    job,
    `判定：${job.city || '(不限定城市)'}`
  );

  save(job, { phase: 'aggregating', message: '汇总成快照' });
  const snapName = `heat_perception_${job.city || 'all'}.json`;
  await run(
    nodeBin(),
    [
      'scripts/aggregate-heat-perception.mjs',
      '--items', `data/${itemsName}.json`,
      '--city', job.city || '',
      '--raws', rawName,
      '--no-platform',
      '--out', `data/${snapName}`
    ],
    job,
    '聚合：生成快照（不改平台那份）'
  );

  // 让聊天窗能立刻查到：成都写回默认文件名，其他城市写回 heat_perception_<城市>.json
  const fixed = job.city === '成都' ? 'heat_perception.json' : `heat_perception_${job.city}.json`;
  fs.copyFileSync(path.join(ROOT, 'data', snapName), path.join(ROOT, 'data', fixed));
  log(job, `快照就位：data/${fixed}`);

  save(job, {
    status: 'done',
    phase: 'done',
    message: '完成：可以直接问「' + (job.city || '') + '现在有多少线索」',
    snapshot: `data/${fixed}`,
    items_file: `data/${itemsName}.json`,
    raw_file: `data/${rawName}.json`,
    finished_at: now()
  });
}

async function pickReady() {
  const files = fs.readdirSync(JOBS).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'));
  const ready = [];
  for (const f of files) {
    try {
      const j = readJson(path.join(JOBS, f));
      if (j.status !== 'queued') continue;
      if (path.basename(f, '.json') !== j.id) continue;
      ready.push({ file: f, job: j });
    } catch {}
  }
  ready.sort((a, b) => String(a.job.created_at || '').localeCompare(String(b.job.created_at || '')));
  return ready;
}

// 去重：同一个搜索词刚跑完（默认 30 分钟内），不重复花钱。
// 为什么需要：用户问"北京现在有多少线索"会触发自动补采；他连问三次就下三单，
// 而每单要花 2-3 分钟和几十次模型调用。这里直接把后两单标成"复用了刚才的结果"。
const DEDUPE_MS = 30 * 60 * 1000;
function findRecentDone(job) {
  const nowMs = Date.now();
  let best = null;
  for (const f of fs.readdirSync(JOBS)) {
    if (!f.endsWith('.json') || f.endsWith('.tmp') || f === `${job.id}.json`) continue;
    try {
      const j = readJson(path.join(JOBS, f));
      if (j.status !== 'done' || j.query !== job.query) continue;
      if (!j.snapshot) continue;
      const t = Date.parse(j.finished_at || j.updated_at || '');
      if (!Number.isFinite(t) || nowMs - t > DEDUPE_MS) continue;
      if (!best || t > best.t) best = { t, job: j };
    } catch {}
  }
  return best ? best.job : null;
}

console.log('后台任务工人已启动');
console.log(`  队列目录：${JOBS}`);
console.log(`  轮询间隔：${POLL_MS} ms${ONCE ? '（--once：处理完当前队列就退出）' : ''}`);
console.log('  等待任务…（在聊天窗里说「帮我抓成都 遮阴」就会进来一个任务）');

let busy = false;
for (;;) {
  if (!busy) {
    const ready = await pickReady();
    if (ready.length) {
      busy = true;
      const { file, job } = ready[0];
      try {
        const fresh = readJson(path.join(JOBS, file));
        if (fresh.status !== 'queued') throw Object.assign(new Error('skip'), { skip: true });

        // 只对"自动补采"去重：那是系统自己替用户决定的，重复跑纯属浪费。
        // 用户明确说"帮我抓…"就照办——他要的就是新鲜数据，去重会让他以为命令没生效。
        const dup = fresh.auto ? findRecentDone(fresh) : null;
        if (dup) {
          const mins = Math.max(1, Math.round((Date.now() - Date.parse(dup.finished_at || dup.updated_at)) / 60000));
          save(fresh, {
            status: 'done',
            phase: 'done',
            message: `「${fresh.query}」${mins} 分钟前刚采过，直接复用那份结果（没有重复花模型额度）`,
            snapshot: dup.snapshot,
            items_file: dup.items_file || null,
            raw_file: dup.raw_file || null,
            deduped_from: dup.id,
            finished_at: now()
          });
          log(fresh, `复用 ${dup.id} 的结果，跳过采集与判定`);
        } else {
          await runJob(fresh);
        }
      } catch (e) {
        if (e && e.skip) { busy = false; continue; }
        try {
          const j = readJson(path.join(JOBS, file));
          save(j, { status: 'failed', phase: 'failed', message: '失败：' + e.message, finished_at: now() });
          log(j, '失败：' + e.message);
        } catch {}
      }
      busy = false;
      continue; // 立刻看下一个
    }
  }
  if (ONCE) break;
  await sleep(POLL_MS);
}
console.log('工人退出。');
