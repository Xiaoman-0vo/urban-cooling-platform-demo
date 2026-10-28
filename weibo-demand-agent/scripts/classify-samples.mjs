#!/usr/bin/env node
/**
 * 把采集到的真实微博送进 n8n 的规则层做判定（走已上线的契约接口）
 *
 * 用法：
 *   node scripts/classify-samples.mjs                 # 默认取 12 条含热相关词的评论
 *   node scripts/classify-samples.mjs --limit 20 --include-posts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = process.env.WEIBO_AGENT_ENDPOINT || 'http://127.0.0.1:5678/webhook/weibo-demand/v1';

const args = process.argv.slice(2);
const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const LIMIT = num('--limit', 12);
const INCLUDE_POSTS = args.includes('--include-posts');

/** 只取“可能有热相关线索”的样本：真实使用时全量送，这里为了看结果才先筛 */
const HEAT_WORDS = ['热', '烫', '晒', '闷', '凉', '空调', '风扇', '阴凉', '树荫', '遮', '汗', '温度', '气温', '高温', '降温', '雨'];

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw_weibo.json'), 'utf8'));
const pool = INCLUDE_POSTS
  ? [...raw.comments.map((c) => ({ id: c.source_comment_id, text: c.text, at: c.published_at, kind: 'comment' })),
     ...raw.posts.map((p) => ({ id: p.source_post_id, text: p.text, at: p.published_at, kind: 'post' }))]
  : raw.comments.map((c) => ({ id: c.source_comment_id, text: c.text, at: c.published_at, kind: 'comment' }));

const picked = pool
  .filter((x) => x.text && x.text.length >= 6 && HEAT_WORDS.some((w) => x.text.includes(w)))
  .slice(0, LIMIT);

console.log(`原始：${raw.stats.posts} 条帖子 / ${raw.stats.comments} 条评论`);
console.log(`含热相关词：${picked.length} 条，逐条送 ${ENDPOINT}`);
console.log('');

async function classifyOne(x, i) {
  const body = {
    contract_version: '1.0.0',
    request_id: `collect-${Date.now()}-${i}`.slice(0, 64),
    client: { name: 'collector-script', version: '1.0.0' },
    action: 'classify',
    payload: { text: x.text, source: 'weibo', published_at: x.at || undefined, hints: { city: '成都' } },
    options: { min_confidence: 0.65, return_evidence: true },
  };
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json();
  return { http: res.status, ms: Date.now() - t0, req: body, res: j };
}

const results = [];
for (let i = 0; i < picked.length; i++) {
  const x = picked[i];
  try {
    const r = await classifyOne(x, i);
    const item = r.res?.result?.item || {};
    results.push({
      source: x.kind, id: x.id, text: x.text,
      http: r.http, ms: r.ms,
      heat_relevance: item.heat_relevance,
      demand_topic: item.demand_topic,
      evaluation_direction: item.evaluation_direction,
      experience_tags: item.experience_tags,
      spatial_demands: item.spatial_demands,
      confidence: item.confidence,
      route: item.route || r.res?.result?.route,
      status: r.res?.status,
      errors: r.res?.errors,
    });
    const mark = item.heat_relevance === 'relevant' ? '★' : (item.heat_relevance === 'needs_review' ? '?' : '·');
    console.log(`${mark} [${r.http}] ${r.ms}ms ${x.text.replace(/\n/g, ' ').slice(0, 46)}`);
    console.log(`    ${item.heat_relevance ?? '-'} | ${item.demand_topic ?? '-'} | ${item.evaluation_direction ?? '-'} | conf=${item.confidence ?? '-'}`);
  } catch (e) {
    console.log(`✗ 调用失败：${e.message}`);
    results.push({ source: x.kind, id: x.id, text: x.text, error: e.message });
  }
  await new Promise((r) => setTimeout(r, 150));
}

const outPath = path.join(ROOT, 'data', 'classified_weibo.json');
fs.writeFileSync(outPath, JSON.stringify({ endpoint: ENDPOINT, classified_at: new Date().toISOString(), results }, null, 2), 'utf8');

const rel = results.filter((r) => r.heat_relevance === 'relevant').length;
const nr = results.filter((r) => r.heat_relevance === 'needs_review').length;
const irr = results.filter((r) => r.heat_relevance === 'irrelevant').length;
console.log('');
console.log(`汇总：相关 ${rel} / 待核实 ${nr} / 不相关 ${irr} / 失败 ${results.filter((r) => r.error).length}`);
console.log(`已写入 ${outPath}`);
