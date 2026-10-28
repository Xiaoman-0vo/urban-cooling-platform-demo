import React, {useEffect, useState} from 'react';
import {ArrowSquareOut, ChatCircleDots, Info, WarningCircle} from '@phosphor-icons/react';

const dataUrl = name => `${import.meta.env.BASE_URL}data/${name}`;

const MODE_LABELS = {
  live: '实时授权接口',
  historical_sample: '历史抽样回放',
  mock: '模拟数据（仅演示链路）',
};

const DIRECTION_LABELS = {
  discomfort: '不适',
  improvement: '改善',
  neutral: '中性',
  mixed: '混合',
  unclear: '不明确',
};

const REVIEW_LABELS = {
  auto_accepted: '规则与模型一致，自动通过',
  needs_review: '待人工核查',
  rule_only: '仅规则判定，未进模型',
  rejected: '已驳回',
};

const CONFIDENCE_LABELS = {high: '高', medium: '中', low: '低'};

const dateLabel = value => {
  if (!value) return '时间未知';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short',
  }).format(parsed);
};

const countText = value => (value == null ? '未提供' : Number(value).toLocaleString('zh-CN'));

function DirectionTally({tally}) {
  const entries = Object.entries(tally || {}).filter(([, count]) => count > 0);
  if (!entries.length) return null;
  return <em className="heat-tally">{entries.map(([key, count]) => `${DIRECTION_LABELS[key] || key} ${count}`).join(' · ')}</em>;
}

/**
 * 微博热感知：只读展示 n8n 工作流产出的抽样快照。
 * 快照里的每一条都是“公开表达线索”，不是观测温度，也不是居民总体感受。
 */
export default function HeatPerceptionPanel({mode = 'full'}) {
  const [state, setState] = useState({loading: true, error: '', snapshot: null});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch(dataUrl('heat_perception.json'), {cache: 'no-store'});
        if (!response.ok) throw new Error(`微博热感知快照尚未接入（HTTP ${response.status}）。`);
        const snapshot = await response.json();
        if (snapshot?.schema !== 'heat-perception/1') throw new Error('快照版本不是 heat-perception/1，未载入。');
        if (alive) setState({loading: false, error: '', snapshot});
      } catch (error) {
        if (alive) setState({loading: false, error: error.message, snapshot: null});
      }
    })();
    return () => {alive = false;};
  }, []);

  if (state.loading) return <section className="heat-perception" aria-label="微博热感知">
    <h3>微博热感知</h3>
    <p className="muted">正在读取抽样快照……</p>
  </section>;

  if (state.error) return <section className="heat-perception" aria-label="微博热感知">
    <h3>微博热感知</h3>
    <div className="empty-note"><Info size={22}/><span>{state.error}</span></div>
    <p className="evidence-note">这一栏没有数据时保持空缺，不用其它资料补齐，也不推断“没有人反映”。</p>
  </section>;

  const snapshot = state.snapshot;
  const counts = snapshot.counts || {};
  const events = snapshot.events || [];
  const observations = snapshot.observations || [];
  const items = snapshot.items || [];
  const limits = snapshot.limits || [];
  const shown = mode === 'full' ? items.slice(0, 40) : items.slice(0, 2);
  const degraded = snapshot.mode !== 'live';

  return <section className="heat-perception" aria-label="微博热感知">
    <h3>微博热感知 <span className={`heat-mode ${snapshot.mode}`}>{MODE_LABELS[snapshot.mode] || snapshot.mode}</span></h3>
    <p className="muted">来自公开微博搜索与一级评论的抽样线索，经工作流判定后回放。它描述“有人这样表达”，不描述温度，也不代表全市民意分布。</p>

    <div className="stat-rows heat-counts">
      <div><span>原始记录（帖 / 评）</span><strong>{countText(counts.raw_posts)} / {countText(counts.raw_comments)}</strong></div>
      <div><span>判定条数</span><strong>{countText(counts.classified_items)}</strong></div>
      <div><span>落在查询城市</span><strong>{countText(counts.in_scope_items)}</strong></div>
      <div><span>可识别公开诉求</span><strong>{countText(counts.public_demand_items)}</strong></div>
      <div><span>去重后内容</span><strong>{countText(counts.unique_contents)}</strong></div>
      <div><span>范围外 / 地点待定</span><strong>{countText(counts.out_of_scope_items)} / {countText(counts.place_unknown_items)}</strong></div>
    </div>
    <p className="evidence-note">三个计数分别报告：原始记录 {countText(counts.raw_posts)} 帖 + {countText(counts.raw_comments)} 评、去重后内容 {countText(counts.unique_contents)} 条、可识别原创报告 {countText(counts.identifiable_original_reports)} 条。都不是“人数”。</p>

    <h3>关切点（按诉求话题归并）</h3>
    {events.length === 0 && <div className="empty-note"><Info size={22}/><span>本轮抽样没有抽到可归纳为空间诉求的线索。没有线索不等于没有热问题。</span></div>}
    {events.length > 0 && <div className="heat-event-list">{events.map(event => <details key={event.event_cluster_id}>
      <summary><span>{event.demand_topic_zh}</span><strong>{event.item_count} 条</strong></summary>
      <dl>
        <dt>方向分布</dt><dd>{Object.entries(event.evaluation_direction || {}).map(([key, value]) => `${DIRECTION_LABELS[key] || key} ${value}`).join(' / ') || '未提供'}</dd>
        <dt>地点线索</dt><dd>{event.place_hint || '未提供地点名（地点待核）'}</dd>
        <dt>时间范围</dt><dd>{dateLabel(event.first_published_at)} — {dateLabel(event.last_published_at)}</dd>
        <dt>代表片段</dt><dd>{event.representative?.excerpt || '未提供'}</dd>
      </dl>
      {event.representative?.source_url && <a className="heat-link" href={event.representative.source_url} target="_blank" rel="noreferrer"><ArrowSquareOut size={15}/>查看原帖</a>}
    </details>)}</div>}

    <h3>体验观察（不是诉求，但同样保留）</h3>
    {observations.length === 0 && <p className="evidence-note">本轮没有单独的体验类观察。</p>}
    {observations.length > 0 && <div className="heat-event-list">{observations.map(observation => <details key={observation.demand_topic}>
      <summary><span>{observation.demand_topic_zh}</span><strong>{observation.item_count} 条</strong></summary>
      <dl><dt>方向分布</dt><dd>{Object.entries(observation.evaluation_direction || {}).map(([key, value]) => `${DIRECTION_LABELS[key] || key} ${value}`).join(' / ') || '未提供'}</dd></dl>
      {(observation.examples || []).map(example => <p className="heat-excerpt" key={example.item_id}>{example.excerpt}</p>)}
    </details>)}</div>}

    <h3>线索明细</h3>
    <div className="heat-item-list">{shown.map(item => <article className="heat-item" key={item.item_id}>
      <header>
        <span className="heat-topic">{item.demand_topic_zh || item.demand_topic}</span>
        <DirectionTally tally={{[item.evaluation_direction]: 1}}/>
        <span className={`heat-conf ${item.confidence_level || 'low'}`} title={REVIEW_LABELS[item.review_status] || item.review_status}>
          置信 {CONFIDENCE_LABELS[item.confidence_level] || item.confidence_level || '?'}
        </span>
      </header>
      <p>{item.excerpt || item.text}</p>
      <footer>
        <span>{item.is_public_demand ? '公开诉求' : '热感受记录'} · {dateLabel(item.published_at)} · {item.author || '作者未知'}</span>
        <span>{item.place_evidence?.[0]?.name || '地点待核'}{item.in_scope === false ? ' · 不在查询城市' : ''}</span>
      </footer>
      {item.source_url && <a className="heat-link" href={item.source_url} target="_blank" rel="noreferrer"><ArrowSquareOut size={14}/>原帖</a>}
    </article>)}</div>
    {items.length > shown.length && <p className="evidence-note">还有 {items.length - shown.length} 条未展示；快照里全量保留。</p>}

    <h3>这条数据能说明什么</h3>
    <ul className="heat-limits">{limits.map((limit, index) => <li key={index}>{limit}</li>)}</ul>
    <p className="evidence-note">
      <WarningCircle size={15}/> 生成于 {dateLabel(snapshot.generated_at)} · 城市 {snapshot.source?.city || '未指定'} · 查询词 {(snapshot.source?.queries || []).join(' / ') || '未记录'} · 契约 {snapshot.meta?.contract_version} · 规则 {snapshot.meta?.rules_version} · 分类器 {snapshot.meta?.classifier_version}
      {snapshot.status?.note ? ` · ${snapshot.status.note}` : ''}{degraded ? ' · 当前为回放模式，不会自动触发温度预测或改造方案。' : ''}
    </p>
    <p className="evidence-note"><ChatCircleDots size={15}/> 采集与判定由 n8n 工作流完成；快照为只读产物，前端不写回。</p>
  </section>;
}
