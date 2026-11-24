import React from 'react';

const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'});

export function clueTime(value) {
  return value&&Number.isFinite(Date.parse(value))?time.format(new Date(value)):'待核查';
}

export function cluePlaceNames(clue) {
  return [...new Set(clue.places.map(place=>place.name))];
}

export default function HeatClue({clue,collectedAt,children}) {
  const places=cluePlaceNames(clue);
  return <article className="agent-heat-clue">
    <header><strong>{clue.topic}</strong><span>{clue.is_public_demand?'公开诉求':'体验记录'} · {clue.kind==='comment'?'一级评论':'笔记正文'}</span></header>
    <blockquote>{clue.excerpt}</blockquote>
    <p>文本地点线索 · {places.length?places.join('、'):'地点待核查'}</p>
    <p>记录日期 {clueTime(clue.published_at)} · 本批采集 {clueTime(collectedAt)}</p>
    <div className="agent-heat-clue-actions">
      {clue.source_url&&<a href={clue.source_url} target="_blank" rel="noreferrer">查看原文</a>}
      {children}
    </div>
    <details><summary>查看本批原文记录</summary><p className="agent-clue-original">{clue.text}</p></details>
  </article>;
}
