import React,{useState} from 'react';
import {pilotSearchIsCurrent,SEARCH_STRATEGIES} from './pilot-search-state.js';
import {candidateQuality} from './candidate-quality.js';
import {candidateDecision} from './candidate-decision.js';
import CandidateDecision from './CandidateDecision.jsx';

const fmt=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2});
export default function PilotCandidateSearch({session,area,busy,temperatureConfigured,onGenerate,onAdopt,onPreview,onEvaluate,onEvaluateCandidates,onReport,onEvidence}) {
  const batch=session?.pilot_searches?.at(-1),goal=session?.goal;
  const [minimum,setMinimum]=useState(null);
  const value=minimum??(batch?String(batch.scope.minimum_area_m2):'');
  const ready=Number.isFinite(goal?.budget_rmb)&&goal.budget_rmb>=0&&Number.isFinite(goal?.unit_cost_rmb_per_m2)&&goal.unit_cost_rmb_per_m2>0;
  const target=Number(value),valid=value.trim()!==''&&Number.isSafeInteger(target)&&target>=1&&target<=1e6;
  const fresh=pilotSearchIsCurrent(batch,session,area),current=session?.pilot_temperature_scenarios?.at(-1);
  function view(candidate,index){onPreview(candidate.bounds_utm,true,'change',{
    label:`候选 ${index+1} · ${candidate.strategies.map(s=>SEARCH_STRATEGIES[s]).join(' / ')}`,
    area_m2:candidate.area_m2,cost_rmb:candidate.cost_rmb});}
  async function adopt(candidate,index){
    if(await onAdopt({search_id:batch.id,candidate_id:candidate.id,expected_current_scenario_id:current?.id??null}))view(candidate,index);
  }
  return <section className="agent-spatial-search" aria-label="按约束生成空间候选">
    <header className="planning-section-heading"><div><small>01 / 生成候选</small><h4>在你的条件内，找不同取舍</h4></div><span className="planning-area-badge">登记区 {area.area_m2??((area.bounds_utm[2]-area.bounds_utm[0])*(area.bounds_utm[3]-area.bounds_utm[1]))}㎡</span></header>
    <p>先限定最低面积，再比较节约投入、扩大面积与优先覆盖。</p>
    {!ready&&<p role="status">先在上方保存预算和大于零的假设建设单价。</p>}
    <form onSubmit={event=>{event.preventDefault();if(ready&&valid&&!busy)onGenerate({minimum_area_m2:target,expected_area_sha256:area.sha256});}}>
      <label>最低改造面积（㎡）<input type="number" min="1" max="1000000" step="1" placeholder="例如 102" value={value} onChange={event=>setMinimum(event.target.value)} disabled={busy}/></label>
      <button type="submit" className="agent-primary" disabled={busy||!ready||!valid}>{batch?'按当前条件重新生成':'生成空间候选'}</button>
    </form>
    <p className="agent-caption">生成仅检查空间与费用；温度由你在下一步手动运行。</p>
    {batch&&<>
      <div className="planning-search-receipt"><strong>{batch.candidates.length} 个代表候选</strong><span>{fmt.format(batch.feasible_count)} 个范围满足登记条件</span><details><summary>搜索范围与限制</summary><p>检查 {fmt.format(batch.scanned_count)} 个整数米单矩形；本轮最低 {batch.scope.minimum_area_m2}㎡。代表候选尚未按降温、现场可施工性或公平性排名。</p>{batch.notes.map(note=><p key={note}>{note}</p>)}</details></div>
      {!fresh&&<p className="agent-target-gap" role="status">条件已变化，以下候选仅供回看。请重新生成后再评价或采用。</p>}
      {!batch.candidates.length&&<div className="decision-verdict" data-state="partial" role="status"><div><strong>本轮条件下没有可行候选</strong>{batch.notes.map(note=><p key={note}>{note}</p>)}</div></div>}
      <CandidateDecision decision={candidateDecision(session,area)} busy={busy} configured={temperatureConfigured} onEvaluate={onEvaluateCandidates} onReport={onReport} onEvidence={onEvidence}/>
      {batch.candidates.length>0&&<><header className="planning-section-heading planning-choice-heading"><div><small>03 / 选择待复核方案</small><h4>查看位置，再决定保存哪一个</h4></div></header><div className="planning-candidate-grid">
      {batch.candidates.map((c,index)=>{
        const adopted=current?.change?.search_id===batch.id&&current.change.candidate_id===c.id;
        const quality=candidateQuality(c,batch,session,area);
        return <article className="agent-search-candidate" key={c.id} data-adopted={adopted}>
          <header><span className="candidate-number">0{index+1}</span><div><h6>{c.strategies.map(s=>SEARCH_STRATEGIES[s]).join(' / ')}</h6><span>{adopted?'已保存为当前方案':'空间与费用候选'}</span></div></header>
          <dl><div><dt>改造面积</dt><dd>{fmt.format(c.area_m2)}<small>㎡</small></dd></div><div><dt>假设建设费</dt><dd>{fmt.format(c.cost_rmb)}<small>元</small></dd></div></dl>
          <p>预算余量 {fmt.format(quality.remainingBudget)} 元 · {quality.prioritySet?`优先覆盖 ${fmt.format(c.priority_overlap_m2)}㎡`:'未设优先区'}</p>
          <details><summary>条件检查与适用范围</summary><p>{quality.status} · 占登记区 {fmt.format(quality.registeredAreaShare)}%。{quality.protectionSet?'避开已登记保留区。':'尚未登记保留区，现场保护条件待核查。'}</p><p>{quality.temperatureSummary}</p></details>
          <div className="pilot-temperature-actions"><button type="button" className="agent-locate" disabled={busy} onClick={()=>view(c,index)}>地图查看候选 {index+1}</button><button type="button" className="agent-primary" disabled={busy||!fresh||adopted||!quality.valid} onClick={()=>adopt(c,index)}>{adopted?'已保存':`采用候选 ${index+1}`}</button></div>
          {adopted&&!current.result&&<button type="button" className="agent-text-button" disabled={busy||!fresh||!temperatureConfigured} onClick={()=>onEvaluate(current.id)}>评价已保存方案</button>}
        </article>;
      })}</div></>}
      <p className="planning-model-boundary">评价把改造面积转为100米网格内的覆盖比例；同面积的不同摆放暂不能区分。现场权属、植栽条件、人体热舒适和实际受益人口仍待核查。</p>
    </>}
  </section>;
}
