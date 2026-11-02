#!/usr/bin/env node
/**
 * 小红书采集器（替换原来的微博采集器 collect-weibo.mjs）
 *
 * 走的是 Agent Reach 的 xiaohongshu 渠道（opencli 登录态浏览器桥）：
 *   search  → 拿到带 xsec_token 的签名链接
 *   read    → 读正文
 *   comments→ 读已加载的一级评论
 *
 * 用法：
 *   node scripts/collect-xhs.mjs --query "成都 遮阴" --limit 6 --comments 8 --out data/raw_成都_xhs.json
 *
 * 关键约束：
 *   1) xsec_token 会过期，签名链接不能缓存复用 → 必须在同一轮里 search 完立刻 read。
 *   2) 单条笔记 20–35 秒 → 本脚本只负责跑，进度写 --progress 文件，由 job-worker 合并给前端。
 *   3) 登录态失效（UPSTREAM_BROKEN / 需要登录）→ 直接失败退出，不写残缺 raw 文件。
 *
 * 输出结构与微博版一致（schema weibo_raw/1），只是 platform 变成 xiaohongshu，
 * 这样判定链 / 聚合 / 平台快照一行都不用改。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------- 参数 ---------------- */
function parseArgs(argv) {
  const out = {
    query: '成都 遮阴',
    limit: 6,          // 抓几条笔记
    comments: 8,       // 每条笔记取多少条一级评论（小红书只给"已加载"的）
    out: 'data/raw_xhs.json',
    jobId: '',
    progress: '',
    timeout: 180000,   // 单次 agent-reach 调用超时（毫秒）
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--query') { out.query = v; i++; }
    else if (k === '--limit') { out.limit = Number(v); i++; }
    else if (k === '--comments') { out.comments = Number(v); i++; }
    else if (k === '--out') { out.out = v; i++; }
    else if (k === '--job-id') { out.jobId = v; i++; }
    else if (k === '--progress') { out.progress = v; i++; }
    else if (k === '--timeout') { out.timeout = Number(v); i++; }
  }
  return out;
}
const ARGS = parseArgs(process.argv);

function log(...a) { console.log(...a); }

/* ---------------- 进度文件（job-worker 会把它合并进任务单） ---------------- */
const PROGRESS_FILE = ARGS.progress ? path.resolve(ROOT, ARGS.progress) : '';
const PROG = {
  job_id: ARGS.jobId || null,
  status: 'running',
  phase: 'starting',
  query: ARGS.query,
  channel: 'xiaohongshu',
  pages_total: 1,
  pages_done: 0,
  posts: 0,
  comment_targets: 0,
  comment_done: 0,
  comments: 0,
  message: '',
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
function writeProgress(patch) {
  if (!PROGRESS_FILE) return;
  Object.assign(PROG, patch || {});
  PROG.updated_at = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(PROG, null, 2), 'utf8');
  } catch (e) {
    log(`  ! 进度写入失败：${e.message}`);
  }
}

/* ---------------- agent-reach 调用 ---------------- */
function agentReachBin() {
  if (process.env.AGENT_REACH) return process.env.AGENT_REACH;
  const home = os.homedir();
  const exe = process.platform === 'win32' ? 'agent-reach.exe' : 'agent-reach';
  const p = path.join(home, '.local', 'bin', exe);
  return fs.existsSync(p) ? p : 'agent-reach';
}

// opencli（小红书渠道的浏览器桥）装在 agent-reach 自己的 npm 前缀里，PATH 里没有
const CHILD_ENV = {
  ...process.env,
  PATH: [
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.agent-reach', 'tools', 'npm-global'),
    process.env.PATH || '',
  ].join(path.delimiter),
};

/** 调一次 agent-reach，返回解析后的 JSON 对象 */
function callAgentReach(args, label) {
  const bin = agentReachBin();
  const r = spawnSync(bin, args, {
    cwd: ROOT,
    env: CHILD_ENV,
    encoding: 'utf8',
    timeout: ARGS.timeout,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  const stdout = (r.stdout || '').trim();
  const stderr = (r.stderr || '').trim();
  if (r.error && r.error.code === 'ETIMEDOUT') {
    throw Object.assign(new Error(`${label} 超时（>${Math.round(ARGS.timeout / 1000)}s）`), { code: 'TIMEOUT' });
  }
  // agent-reach 打出的是单个 JSON 对象；万一夹了别的行，取最后一个能解析的
  const lines = stdout.split(/\r?\n/).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      if (j && typeof j === 'object' && 'ok' in j) return j;
    } catch { /* 继续找 */ }
  }
  throw Object.assign(
    new Error(`${label} 返回无法解析：${(stdout || stderr || '（空输出）').slice(0, 200)}`),
    { code: 'BAD_OUTPUT' }
  );
}

/** 登录态失效 / 上游协议变化，统一判定为"需要重新登录" */
function isLoginProblem(j) {
  const code = (j && j.error && j.error.code) || '';
  const msg = (j && j.error && j.error.message) || '';
  if (['UPSTREAM_BROKEN', 'AUTH_REQUIRED', 'LOGIN_REQUIRED', 'NOT_LOGGED_IN'].includes(code)) return true;
  return /signed url|需要登录|login|未登录|登录态/i.test(msg);
}

/* ---------------- 文本清洗 ---------------- */
function cleanText(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 从签名链接里取笔记 ID；拿不到就返回 null */
function noteIdOf(url) {
  const m = /\/(?:search_result|explore|discovery\/item)\/([0-9a-f]{24})/i.exec(String(url || ''));
  return m ? m[1] : null;
}

/* ---------------- 主流程 ---------------- */
const XHS_BASE = 'https://www.xiaohongshu.com/explore/';

async function main() {
  log(`小红书采集开始：query=「${ARGS.query}」 笔记数=${ARGS.limit} 每条评论=${ARGS.comments}`);
  writeProgress({ phase: 'searching', message: `搜索小红书「${ARGS.query}」` });

  // 1) 搜索（拿签名链接）
  const s = callAgentReach(['xiaohongshu', 'search', ARGS.query], '搜索');
  if (!s.ok) {
    if (isLoginProblem(s)) {
      throw Object.assign(
        new Error(`小红书登录态失效：请在终端运行「agent-reach login xiaohongshu」重新登录后重试（${(s.error && s.error.message) || ''}）`),
        { code: 'NEED_LOGIN' }
      );
    }
    throw new Error(`搜索失败：${(s.error && s.error.code) || ''} ${(s.error && s.error.message) || ''}`.trim());
  }
  const found = Array.isArray(s.items) ? s.items : [];
  log(`  搜索命中 ${found.length} 条笔记（backend=${s.backend}，耗时 ${s.meta && s.meta.elapsed_ms}ms）`);
  writeProgress({ phase: 'searching', pages_done: 1, posts: 0, message: `搜索命中 ${found.length} 条笔记，开始逐条读正文` });
  if (!found.length) throw new Error('搜索没有结果（可能是关键词太窄，或登录态已失效）');

  const targets = found.slice(0, Math.max(1, ARGS.limit));
  writeProgress({ comment_targets: targets.length, message: `逐条读正文（0/${targets.length}）` });

  // 2) 逐条读正文（同一轮里立刻读，签名链接不落地缓存）
  const fetchedAt = new Date().toISOString();
  const posts = [];
  const errors = [];
  for (let i = 0; i < targets.length; i++) {
    const it = targets[i];
    const url = it.url || '';
    const id = noteIdOf(url);
    try {
      log(`  · [${i + 1}/${targets.length}] 读正文：${String(it.title || '').slice(0, 30)}`);
      const r = callAgentReach(['xiaohongshu', 'read', url], '读正文');
      if (!r.ok) {
        if (isLoginProblem(r)) {
          throw Object.assign(new Error('读正文时发现登录态失效'), { code: 'NEED_LOGIN' });
        }
        throw new Error(`${(r.error && r.error.code) || ''} ${(r.error && r.error.message) || ''}`.trim());
      }
      const body = cleanText((r.items && r.items[0] && r.items[0].text) || '');
      const title = cleanText(it.title || (r.items && r.items[0] && r.items[0].title) || '');
      if (!body) throw new Error('正文为空');
      const text = cleanText(body.startsWith(title) ? body : `${title}\n\n${body}`);
      posts.push({
        source_post_id: id || url,
        source_url: id ? XHS_BASE + id : url,
        source_url_note: id ? 'canonical 链接，不含 xsec_token；签名链接约 1 天后失效' : '搜索引擎原始链接',
        platform: 'xiaohongshu',
        author: it.author || (r.items && r.items[0] && r.items[0].author) || null,
        author_id: null,
        published_at: (r.items && r.items[0] && r.items[0].published_at) || it.published_at || null,
        published_at_raw: null,
        text,
        text_length: text.length,
        title,
        like_count: null,
        comments_count: null,
        query: ARGS.query,
        query_batch_id: `${fetchedAt}__${ARGS.query}`,
        fetched_at: fetchedAt,
        search_rank: (it.rank != null ? it.rank : i + 1),
        comments_fetched: false,
        comments_collected: 0,
        read_ms: (r.meta && r.meta.elapsed_ms) || null,
      });
    } catch (e) {
      if (e.code === 'NEED_LOGIN') throw e;
      log(`    ! 读正文失败：${e.message}`);
      errors.push({ stage: 'read', url, message: e.message });
    }
    writeProgress({
      posts: posts.length,
      message: `逐条读正文（${i + 1}/${targets.length}，成功 ${posts.length} 条）`,
    });
  }

  if (!posts.length) {
    throw new Error('所有笔记都没读到正文：' + (errors[0] ? errors[0].message : '未知原因'));
  }

  // 3) 逐条取已加载的一级评论
  const comments = [];
  writeProgress({ phase: 'comments', comment_done: 0, comments: 0, message: `抓一级评论（0/${posts.length} 条笔记）` });
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const url = (targets[i] && targets[i].url) || p.source_url;
    try {
      log(`  · [${i + 1}/${posts.length}] 抓评论：${String(p.title || '').slice(0, 24)}`);
      const c = callAgentReach(['xiaohongshu', 'comments', url], '抓评论');
      if (!c.ok) {
        if (isLoginProblem(c)) throw Object.assign(new Error('抓评论时发现登录态失效'), { code: 'NEED_LOGIN' });
        throw new Error(`${(c.error && c.error.code) || ''} ${(c.error && c.error.message) || ''}`.trim());
      }
      const items = Array.isArray(c.items) ? c.items : [];
      const take = items.slice(0, Math.max(0, ARGS.comments));
      for (const it of take) {
        const t = cleanText(it.text);
        if (!t) continue;
        comments.push({
          source_comment_id: it.id ? String(it.id) : `${p.source_post_id}-c${comments.length + 1}`,
          parent_post_id: String(p.source_post_id),
          author: it.author || null,
          author_verified: null,
          published_at: it.published_at || null,
          published_at_raw: null,
          text: t,
          like_count: Number(it.like_count ?? 0) || 0,
          floor: it.floor ?? null,
          level: 1,
          query: ARGS.query,
          fetched_at: fetchedAt,
        });
      }
      // 如实标注：只拿到"已加载"的部分，总量未知
      p.comments_fetched = true;
      p.comments_collected = take.length;
      p.comments_loaded = take.length;
      p.comments_total_unknown = true;
    } catch (e) {
      if (e.code === 'NEED_LOGIN') throw e;
      log(`    ! 抓评论失败：${e.message}`);
      p.comments_fetched = false;
      p.comments_collected = 0;
      p.collect_error = e.message;
      errors.push({ stage: 'comments', url, message: e.message });
    }
    writeProgress({
      comment_done: i + 1,
      comments: comments.length,
      message: `抓一级评论（${i + 1}/${posts.length} 条笔记，累计 ${comments.length} 条）`,
    });
  }

  // 4) 落盘
  const result = {
    schema: 'weibo_raw/1',           // 结构不变，判定链不认来源
    query: ARGS.query,
    fetched_at: fetchedAt,
    note: '采集层原始产物，未做任何语义判定；判定结果见 items.json',
    stats: {
      channel: 'xiaohongshu',
      source_channel: 'xiaohongshu_opencli',
      mode: 'live',
      notes_found: found.length,
      notes_read: posts.length,
      posts: posts.length,
      posts_with_comments: posts.filter((p) => p.comments_fetched).length,
      comments: comments.length,
      comments_note: '小红书只返回已加载的评论，不是全量导出',
      search_ms: (s.meta && s.meta.elapsed_ms) || null,
      errors: errors.length,
    },
    limits: [
      '登录态读取小红书公开笔记，非官方授权接口；仅只读，不发布、不评论、不采集私密信息。',
      '评论只包含页面已加载的部分（comments_loaded / total_unknown），不承诺全量导出。',
      '签名链接（xsec_token）会过期，本文件只保存不含 token 的 canonical 链接。',
    ],
    posts,
    comments,
  };

  const outPath = path.resolve(ROOT, ARGS.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  writeProgress({
    status: 'done',
    phase: 'done',
    posts: posts.length,
    comments: comments.length,
    out: outPath,
    message: `完成：${posts.length} 条笔记 / ${comments.length} 条评论`,
  });

  log('');
  log(`完成：${posts.length} 条笔记 / ${comments.length} 条一级评论`);
  log(`已写入 ${outPath}（${(fs.statSync(outPath).size / 1024).toFixed(1)} KB）`);
  for (const p of posts.slice(0, 3)) {
    log(`  [${p.comments_collected} 评论] @${p.author} ${p.title.slice(0, 40)}`);
    log(`      ${p.text.replace(/\n/g, ' ').slice(0, 90)}`);
  }
}

main().catch((e) => {
  console.error('采集失败：' + e.message);
  writeProgress({
    status: 'failed',
    phase: 'failed',
    message: '采集失败：' + e.message,
    need_login: e.code === 'NEED_LOGIN' || undefined,
  });
  process.exit(e.code === 'NEED_LOGIN' ? 4 : 1);
});
