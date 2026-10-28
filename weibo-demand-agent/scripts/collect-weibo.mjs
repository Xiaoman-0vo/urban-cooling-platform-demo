#!/usr/bin/env node
/**
 * 微博采集器（W1 的脚本版，先跑通再搬进 n8n）
 *
 * 用法：
 *   node scripts/collect-weibo.mjs --query "成都 高温" --pages 2 --top 6 --comment-pages 1
 *
 * 依赖文件（都在仓库根目录，已被 .gitignore 忽略）：
 *   .weibo-cookie       —— 给 m.weibo.cn 用（搜索接口）
 *   .weibo-cookie-web   —— 给 weibo.com 用（评论接口，需要 XSRF-TOKEN）
 *
 * 输出：data/raw_weibo.json
 * 说明：这是采集层，只负责“抓回来、洗干净、存下来”。
 *       判定与抽取由 n8n 里的规则层/模型层负责，本脚本不做任何语义判断。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------- 参数 ---------------- */
function parseArgs(argv) {
  const out = { query: '成都 高温', pages: 2, top: 6, commentPages: 1, pace: 1500, out: 'data/raw_weibo.json', cookieDir: '', jobId: '', progress: '' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--query') { out.query = v; i++; }
    else if (k === '--pages') { out.pages = Number(v); i++; }
    else if (k === '--top') { out.top = Number(v); i++; }
    else if (k === '--comment-pages') { out.commentPages = Number(v); i++; }
    else if (k === '--pace') { out.pace = Number(v); i++; }
    else if (k === '--out') { out.out = v; i++; }
  else if (k === '--cookie-dir') { out.cookieDir = v; i++; }
  else if (k === '--job-id') { out.jobId = v; i++; }
  else if (k === '--progress') { out.progress = v; i++; }
  }
  return out;
}
const ARGS = parseArgs(process.argv);

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';

const COOKIE_DIR = ARGS.cookieDir ? path.resolve(ROOT, ARGS.cookieDir) : ROOT;

function readCookie(name) {
  const p = path.join(COOKIE_DIR, name);
  if (!fs.existsSync(p)) {
    throw new Error(`缺少 ${name}（在 ${COOKIE_DIR}）。先运行 scripts/refresh-cookie.ps1 从 Edge 取出 cookie。`);
  }
  const s = fs.readFileSync(p, 'utf8').trim();
  if (!s) throw new Error(`${name} 是空的`);
  return s;
}

/* ---------------- 进度文件（给前端轮询用） ---------------- */
// 不追求原子性：前端只读，读到写了一半的 JSON 就下次再读，前端已做容错。
const PROGRESS_FILE = ARGS.progress ? path.resolve(ROOT, ARGS.progress) : '';
const PROG = {
  job_id: ARGS.jobId || null,
  status: 'running',
  phase: 'starting',
  query: ARGS.query,
  pages_total: ARGS.pages,
  pages_done: 0,
  posts: 0,
  comment_targets: ARGS.top,
  comment_done: 0,
  comments: 0,
  message: '',
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
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


const COOKIE_MOBILE = readCookie('.weibo-cookie');
const COOKIE_WEB = readCookie('.weibo-cookie-web');
const XSRF = (/XSRF-TOKEN=([^;]+)/.exec(COOKIE_WEB) || [])[1] || '';

/* ---------------- 基础工具 ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...a) { console.log(...a); }

async function getJson(url, { web = false, referer } = {}) {
  const headers = {
    'User-Agent': web ? UA_DESKTOP : UA_MOBILE,
    'Cookie': web ? COOKIE_WEB : COOKIE_MOBILE,
    'Referer': referer || (web ? 'https://weibo.com/' : 'https://m.weibo.cn/'),
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (web && XSRF) headers['X-XSRF-TOKEN'] = decodeURIComponent(XSRF);

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`非 JSON：${text.slice(0, 120)}`);
      }
    } catch (e) {
      lastErr = e;
      log(`    ! 第 ${attempt} 次失败：${e.message}`);
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw lastErr;
}

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
/** 微博时间格式：Mon Oct 26 19:40:21 +0800 2026 或 10-26 19:40 */
function parseWeiboTime(s) {
  if (!s) return { iso: null, raw: null };
  const m = /^(\w{3}) (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4}) (\d{4})$/.exec(s);
  if (m) {
    const [, , mon, day, hh, mm, ss, tz, year] = m;
    const sign = tz[0] === '+' ? '+' : '-';
    return { iso: `${year}-${MONTHS[mon]}-${day.padStart(2, '0')}T${hh}:${mm}:${ss}${sign}${tz.slice(1, 3)}:${tz.slice(3)}`, raw: s };
  }
  const m2 = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (m2) return { iso: null, raw: s, guess_mmdd: true }; // 无年份，交给上层按 fetched_at 年补
  return { iso: null, raw: s };
}

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

/** 去 HTML、保留表情文本 [泪]、保留换行 */
function cleanText(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ');
  return s.trim();
}

const stripHash = (s) => (s || '').replace(/^#+|#+$/g, '').trim();

/* ---------------- 1. 搜索 ---------------- */
function postsFromCards(cards, out) {
  for (const card of cards || []) {
    const groups = [...(card.card_group || []), card];
    for (const g of groups) {
      const m = g.mblog;
      if (!m || !m.id) continue;
      out.push(m);
    }
  }
  return out;
}

async function searchAll(query, pages) {
  const cid = `100103type=1&q=${query}`;
  const found = new Map();
  for (let page = 1; page <= pages; page++) {
    const url = `https://m.weibo.cn/api/container/getIndex?containerid=${encodeURIComponent(cid)}&page_type=searchall&page=${page}`;
    log(`  · 搜索第 ${page} 页 …`);
    const j = await getJson(url, { referer: `https://m.weibo.cn/search?containerid=${encodeURIComponent(cid)}` });
    if (j.ok !== 1) { log(`    ! ok=${j.ok}，停止翻页`); break; }
    const before = found.size;
    postsFromCards(j.data?.cards, []).forEach((m) => found.set(String(m.id), m));
    const gained = found.size - before;
    const total = j.data?.cardlistInfo?.total;
    log(`    +${gained} 条（累计 ${found.size}${total ? ' / 平台称约 ' + total : ''}）`);
    writeProgress({ phase: 'searching', pages_done: page, posts: found.size });
    if (gained === 0) break;
    if (page < pages) await sleep(ARGS.pace);
  }
  return [...found.values()];
}

/** 长文补全：搜索结果里的 text 会被截断 */
async function extendIfLong(m) {
  if (!m.isLongText && !/全文|\.\.\.$/.test(cleanText(m.text))) return cleanText(m.text);
  try {
    const j = await getJson(`https://m.weibo.cn/statuses/extend?id=${m.id}`, { referer: `https://m.weibo.cn/detail/${m.id}` });
    if (j.ok === 1 && j.data?.longTextContent) return cleanText(j.data.longTextContent);
  } catch { /* 补全失败就用截断版，不阻断采集 */ }
  return cleanText(m.text);
}

/* ---------------- 2. 一级评论 ---------------- */
async function fetchComments(mid, pages) {
  const out = [];
  let maxId = '';
  for (let p = 1; p <= pages; p++) {
    let url = `https://weibo.com/ajax/statuses/buildComments?id=${mid}&is_reload=1&is_show_bulletin=2&is_mix=0&count=20&flow=1&page=${p}`;
    if (maxId) url = `https://weibo.com/ajax/statuses/buildComments?id=${mid}&is_reload=1&is_show_bulletin=2&is_mix=0&count=20&flow=1&max_id=${maxId}`;
    const j = await getJson(url, { web: true, referer: `https://weibo.com/detail/${mid}` });
    if (j.ok !== 1 || !Array.isArray(j.data) || j.data.length === 0) break;
    for (const c of j.data) {
      out.push({
        source_comment_id: String(c.id),
        parent_post_id: String(mid),
        author: c.user?.screen_name || null,
        author_verified: c.user?.verified_type >= 0 ? 'yellow_v' : (c.user?.verified ? 'blue_v' : null),
        published_at_raw: c.created_at || null,
        text: cleanText(c.text_raw || c.text),
        like_count: Number(c.like_counts ?? c.like_count ?? 0),
        floor: c.floor_number ?? null,
        level: 1,
      });
    }
    const total = j.total_number;
    log(`      · 评论第 ${p} 页 +${j.data.length}（累计 ${out.length}${total != null ? ' / 共 ' + total : ''}）`);
    maxId = j.max_id ? String(j.max_id) : '';
    if (!maxId || out.length >= (total ?? Infinity)) break;
    if (p < pages) await sleep(ARGS.pace);
  }
  return out;
}

/* ---------------- 3. 主流程 ---------------- */
async function main() {
  log(`采集开始：query=「${ARGS.query}」 搜索页=${ARGS.pages} 取评论的帖子数=${ARGS.top} 评论页=${ARGS.commentPages}`);
  log(`Cookie：m.weibo.cn ${COOKIE_MOBILE.length} 字符 / weibo.com ${COOKIE_WEB.length} 字符`);
  writeProgress({ phase: 'searching', message: `搜索「${ARGS.query}」第 1 页` });

  const fetchedAt = new Date().toISOString();
  const mblogs = await searchAll(ARGS.query, ARGS.pages);
  log(`搜索完成，共 ${mblogs.length} 条去重后帖子`);

  mblogs.sort((a, b) => (b.comments_count || 0) - (a.comments_count || 0));
  const targets = mblogs.slice(0, Math.min(ARGS.top, mblogs.length));

  const posts = [];
  for (let i = 0; i < mblogs.length; i++) {
    const m = mblogs[i];
    const text = await extendIfLong(m);
    const t = parseWeiboTime(m.created_at);
    posts.push({
      source_post_id: String(m.id),
      source_bid: m.bid || null,
      source_url: `https://m.weibo.cn/detail/${m.id}`,
      platform: 'weibo',
      author: m.user?.screen_name || null,
      author_id: m.user?.id ? String(m.user.id) : null,
      author_verified: m.user?.verified ? 'blue_v' : null,
      author_followers: m.user?.followers_count ?? null,
      published_at: t.iso,
      published_at_raw: t.raw,
      text,
      text_length: text.length,
      reposts_count: Number(m.reposts_count ?? 0),
      comments_count: Number(m.comments_count ?? 0),
      attitudes_count: Number(m.attitudes_count ?? 0),
      is_long_text: !!m.isLongText,
      query: ARGS.query,
      query_batch_id: `${fetchedAt}__${ARGS.query}`,
      fetched_at: fetchedAt,
      search_rank: i + 1,
      comments_fetched: false,
    });
    if (i < targets.length) await sleep(Math.round(ARGS.pace / 2));
  }

  const byId = new Map(posts.map((p) => [p.source_post_id, p]));
  const comments = [];
  log(`抓评论：按评论数取前 ${targets.length} 条帖子`);
  writeProgress({ phase: 'comments', posts: posts.length, comment_targets: targets.length, comment_done: 0, message: `抓一级评论（0/${targets.length} 条帖子）` });
  for (const m of targets) {
    const mid = String(m.id);
    const p = byId.get(mid);
    log(`  · ${p.author}（评论 ${p.comments_count}）${p.text.slice(0, 24).replace(/\n/g, ' ')}…`);
    try {
      const cs = await fetchComments(mid, ARGS.commentPages);
      const t = parseWeiboTime(p.published_at_raw);
      for (const c of cs) {
        const ct = parseWeiboTime(c.published_at_raw);
        comments.push({ ...c, published_at: ct.iso, raw_time: ct.raw, query: ARGS.query, fetched_at: fetchedAt });
      }
      p.comments_fetched = true;
      p.comments_collected = cs.length;
    } catch (e) {
      log(`    ! 评论抓取失败：${e.message}`);
      p.comments_fetched = false;
      p.comments_collected = 0;
      p.collect_error = e.message;
    }
    writeProgress({
      comment_done: PROG.comment_done + 1,
      comments: comments.length,
      message: `抓一级评论（${PROG.comment_done + 1}/${targets.length} 条帖子，累计 ${comments.length} 条）`
    });
    await sleep(ARGS.pace);
  }

  const result = {
    schema: 'weibo_raw/1',
    query: ARGS.query,
    fetched_at: fetchedAt,
    note: '本文件是采集层原始产物，未做任何语义判定；判定结果见 items.json',
    stats: {
      posts: posts.length,
      posts_with_comments: posts.filter((p) => p.comments_fetched).length,
      comments: comments.length,
      search_pages: ARGS.pages,
      comment_pages: ARGS.commentPages,
    },
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
    message: `完成：${posts.length} 条帖子 / ${comments.length} 条评论`
  });

  log('');
  log(`完成：${posts.length} 条帖子 / ${comments.length} 条一级评论`);
  log(`已写入 ${outPath}（${(fs.statSync(outPath).size / 1024).toFixed(1)} KB）`);
  log('');
  log('样例（评论数最多的 3 条）：');
  for (const p of [...posts].sort((a, b) => b.comments_count - a.comments_count).slice(0, 3)) {
    log(`  [${p.comments_count} 评论] @${p.author} ${p.published_at || p.published_at_raw}`);
    log(`      ${p.text.replace(/\n/g, ' ').slice(0, 100)}`);
  }
}

main().catch((e) => {
  console.error('采集失败：' + e.message);
  writeProgress({ status: 'failed', phase: 'failed', message: '采集失败：' + e.message });
  process.exit(1);
});
