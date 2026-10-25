// Adapted from knight-L/sc-datav src/components/seamVirtualScroll.tsx,
// Apache-2.0. Modified 2026-10-25: source grid records, semantic buttons,
// explicit play/pause, keyboard/hover pause, bounded paging and reduced motion.
import React, {useEffect, useState} from 'react';
import {ArrowRight, CaretLeft, CaretRight, Pause, Play} from '@phosphor-icons/react';

const PAGE_SIZE = 4;
export default function GridStream({features, onLocate}) {
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reading = hovered || focused;
  const pageCount = Math.max(1, Math.ceil(features.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {if (preference.matches) setPlaying(false);};
    preference.addEventListener('change', stop);
    if (!playing || reading || preference.matches || pageCount < 2) {
      stop();
      return () => preference.removeEventListener('change', stop);
    }
    const timer = window.setInterval(() => setPage(value => (value + 1) % pageCount), 6000);
    return () => {window.clearInterval(timer); preference.removeEventListener('change', stop);};
  }, [playing, reading, pageCount]);
  const changePage = delta => {setPlaying(false); setPage((currentPage + delta + pageCount) % pageCount);};
  return <div className="uc-grid-stream" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={event => setFocused(Boolean(event.target.closest('li')))} onBlur={event => {if (!event.relatedTarget?.closest('li') || !event.currentTarget.contains(event.relatedTarget)) setFocused(false);}}>
    <div className="uc-stream-label"><span>研究网格索引</span><button aria-label={playing?'暂停网格轮播':'播放网格轮播'} aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing?<Pause size={14}/>:<Play size={14}/>}</button></div>
    {features.length ? <ul>{features.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(feature => <li key={feature.properties.grid_id}>
      <button onClick={() => onLocate(feature)}><span><strong>{feature.properties.grid_id}</strong><small>完整内格 · 100 × 100 m</small></span><ArrowRight size={17}/></button>
    </li>)}</ul> : <p className="uc-note">暂无可定位的完整内格。</p>}
    <div className="uc-stream-controls"><span>{currentPage + 1} / {pageCount} 页</span><button aria-label="上一页网格" disabled={pageCount < 2} onClick={() => changePage(-1)}><CaretLeft size={14}/></button><button aria-label="下一页网格" disabled={pageCount < 2} onClick={() => changePage(1)}><CaretRight size={14}/></button></div>
    <p className="uc-note">历史来源索引，按编号排列。点选仅定位，不运行预测。</p>
  </div>;
}
