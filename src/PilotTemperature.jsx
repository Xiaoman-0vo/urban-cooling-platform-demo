import React,{useEffect,useState} from 'react';
import {DownloadSimple,MapPin} from '@phosphor-icons/react';
import {pilotBoxGeometry,pilotBoxWithin,pilotMapPoint} from './pilot-map.js';
import {scenarioConstraintCheck,temperatureResultSummary} from './scenario-checks.js';
import {currentPilotProtection,protectionConflicts} from './protected-areas.js';
import {currentPilotPriority} from './priority-areas.js';
import PilotCandidateSearch from './PilotCandidateSearch.jsx';

const format=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2});
const amount=(value,unit)=>value==null?'待填写':`${format.format(value)} ${unit}`;

function ScenarioCosts({scenario}) {
  if(scenario.goal_version==null)return <p>该历史版本未记录对应预算与单价。</p>;
  const checks=scenarioConstraintCheck(scenario).checks;
  const passed=id=>['passed','failed'].includes(checks.find(c=>c.id===id)?.state)?checks.find(c=>c.id===id).state==='passed':null;
  const budgetCheck=passed('budget'),areaCheck=passed('area');
  return <>
    <dl className="agent-temperature-result" aria-label="方案预算与费用">
      <div><dt>假设建设费</dt><dd>{amount(scenario.estimated_construction_cost_rmb,'元')}</dd></div>
      <div><dt>预算上限</dt><dd>{amount(scenario.budget_rmb,'元')}</dd></div>
      <div><dt>假设单价</dt><dd>{amount(scenario.assumed_unit_cost_rmb_per_m2,'元/㎡')}</dd></div>
    </dl>
    <p>目标 v{scenario.goal_version} · {budgetCheck==null?'预算检查待填写':budgetCheck?'预算内':'超预算'} · {areaCheck==null?'未设面积上限':`面积上限 ${format.format(scenario.declared_candidate_area_m2)}㎡，${areaCheck?'上限内':'超上限'}`}</p>
  </>;
}

function TemperatureValues({result}) {
  return <><dl className="agent-temperature-result">
    <div><dt>模型基线</dt><dd>{result.baseline_lst_c.toFixed(3)}℃</dd></div>
    <div><dt>情景预测</dt><dd>{result.scenario_lst_c.toFixed(3)}℃</dd></div>
    <div><dt>温差（基线减情景）</dt><dd>{result.predicted_delta_lst_c.toFixed(3)}℃</dd></div>
  </dl><p>{temperatureResultSummary(result)} 实际效果和不确定性仍待验证。</p></>;
}

export default function PilotTemperature({area,configured,scenarios,planningSession,protectionVersions=[],priorityVersions=[],priorityComparison,busy,onMapEdit,onPreview,onSave,onRestore,onProtection,onPriority,onGenerateCandidates,onAdoptCandidate,onEvaluate,onEvaluateCandidates,onEvidence,onReport,onDownload}) {
  const [drawing,setDrawing]=useState(false);
  const [first,setFirst]=useState(null);
  const [box,setBox]=useState(null);
  const [error,setError]=useState('');
  const [drawingMode,setDrawingMode]=useState('change'),[label,setLabel]=useState('');
  const current=scenarios.at(-1);
  const lastEvaluated=scenarios.findLast(scenario=>scenario.result);
  const constraints=scenarioConstraintCheck(current);
  const protection=currentPilotProtection({pilot_protection_versions:protectionVersions});
  const conflicts=protectionConflicts(box||current?.bounds_utm,protection.areas);
  const protectionArgs={expected_protection_version:protection.version,expected_current_scenario_id:current?.id??null};
  const priority=currentPilotPriority({pilot_priority_versions:priorityVersions});
  const priorityArgs={expected_priority_version:priority.version,expected_area_sha256:area.sha256};

  function preview(bounds,focus=false,kind='change',details={}) {
    const features=[{type:'Feature',geometry:area.geometry,properties:{pilot_display:'temperature_area'}}];
    features.push(...protection.areas.map(a=>({type:'Feature',geometry:a.geometry,properties:{pilot_display:'protection_area',label:a.label}})));
    features.push(...priority.areas.map(a=>({type:'Feature',geometry:a.geometry,properties:{pilot_display:'priority_area',label:a.label}})));
    if(bounds)features.push({type:'Feature',geometry:pilotBoxGeometry(bounds),properties:{pilot_display:kind==='priority'?'priority_area':kind==='protection'?'protection_area':protectionConflicts(bounds,protection.areas).length?'protection_conflict':'temperature_selection'}});
    const center=focus?area.geometry.coordinates[0].slice(0,4).reduce(
      ([x,y],[lng,lat])=>[x+lng/4,y+lat/4],[0,0]):null;
    onPreview({type:'FeatureCollection',features},center,21.1,details);
  }

  useEffect(()=>{if((protection.version>0||priority.version>0)&&!drawing&&!box)preview(current?.bounds_utm);},[protection.version,priority.version,Boolean(box),drawing]);

  useEffect(()=>{
    if(!drawing)return;
    onMapEdit(point=>{
      const [x,y]=pilotMapPoint(point);
      const [left,bottom,right,top]=area.bounds_utm;
      if(x<left||x>right||y<bottom||y>top){
        setError('请在地图标出的试算范围内点选。');
        return;
      }
      setError('');
      if(!first){setFirst([x,y]);return;}
      const next=[Math.min(first[0],x),Math.min(first[1],y),Math.max(first[0],x),Math.max(first[1],y)];
      if(!pilotBoxWithin(next,area.bounds_utm)){
        setError('两个角需要在东西和南北方向上都有间距。');
        return;
      }
      setBox(next);setDrawing(false);setFirst(null);preview(next,false,drawingMode);
    });
    return ()=>onMapEdit(null);
  },[drawing,drawingMode,first,area,onMapEdit,onPreview,protection.version,priority.version]);

  function startDrawing(kind='change') {
    setDrawingMode(kind);setDrawing(true);setBox(null);setFirst(null);setError('');preview(null,true);
  }

  function useWholeArea() {
    setDrawingMode('change');
    setDrawing(false);setFirst(null);setError('');
    setBox(area.bounds_utm);preview(area.bounds_utm,true);
  }

  function cancelDrawing() {
    setDrawing(false);setBox(null);setFirst(null);setError('');preview(current?.bounds_utm);
  }

  async function save() {
    if(box&&await onSave(box))setBox(null);
  }

  async function saveProtection() {
    if(box&&label.trim()&&await onProtection({...protectionArgs,operation:'add',bounds_utm:box,label:label.trim()})){
      setBox(null);setLabel('');setDrawingMode('change');
    }
  }

  async function savePriority() {
    if(box&&label.trim()&&await onPriority({...priorityArgs,operation:'add',bounds_utm:box,label:label.trim()})){
      setBox(null);setLabel('');setDrawingMode('change');
    }
  }

  return <section className={`agent-option pilot-temperature${drawing?' pilot-temperature-drawing':''}`} aria-label="地表温度情景试算">
    <div className="planning-reference"><span>成都示范区</span><span>参考日期 {area.reference_date}</span><span>不透水面 → 树木／灌木覆盖假设</span></div>
    <PilotCandidateSearch session={planningSession} area={area} busy={busy||drawing||Boolean(box)} temperatureConfigured={configured}
      onGenerate={onGenerateCandidates} onAdopt={onAdoptCandidate} onPreview={preview} onEvaluate={onEvaluate}
      onEvaluateCandidates={onEvaluateCandidates} onReport={onReport} onEvidence={onEvidence}/>
    <details className="planning-advanced" open={drawing||Boolean(box)}><summary>空间约束与自主绘制 <small>保留区 {protection.areas.length} · 优先区 {priority.areas.length}</small></summary>
    <section className="agent-protected-areas" aria-label="用户保留范围">
      <h5>用户保留范围 · v{protection.version}</h5>
      <p>标记必须保留的活动空间或其他不可改造范围。粉色为保留区，冲突的改造范围显示为红色。</p>
      <button type="button" className="agent-locate" disabled={busy||drawing||Boolean(box)} onClick={()=>startDrawing('protection')}>地图框选保留范围</button>
      {protection.areas.length?protection.areas.map(a=><div key={a.id} className="agent-protection-item">
        <span>{a.label} · {(a.bounds_utm[2]-a.bounds_utm[0])*(a.bounds_utm[3]-a.bounds_utm[1])}㎡</span>
        <button type="button" className="agent-text-button" disabled={busy||drawing||Boolean(box)} onClick={()=>preview(a.bounds_utm,true,'protection')}>查看 {a.label}</button>
        <button type="button" className="agent-text-button" disabled={busy||drawing||Boolean(box)} onClick={()=>onProtection({...protectionArgs,operation:'remove',area_id:a.id})}>解除 {a.label} 约束</button>
      </div>):<p>尚未设置用户保留区，不表示现场保护条件已核查。</p>}
      <p>添加或解除约束会保留旧版，并使当前情景生成待重新评价的新版本。</p>
    </section>
    <section className="agent-priority-areas" aria-label="用户优先区域">
      <h5>用户优先区域 · v{priority.version}</h5>
      <p>蓝色为希望优先覆盖的位置。优先区域用于比较几何覆盖，保留区仍不可改造。</p>
      <button type="button" className="agent-locate" disabled={busy||drawing||Boolean(box)} onClick={()=>startDrawing('priority')}>地图框选优先区域</button>
      {priority.areas.length?priority.areas.map(a=><div key={a.id} className="agent-protection-item">
        <span>{a.label} · {(a.bounds_utm[2]-a.bounds_utm[0])*(a.bounds_utm[3]-a.bounds_utm[1])}㎡</span>
        <button type="button" className="agent-text-button" disabled={busy||drawing||Boolean(box)} onClick={()=>preview(a.bounds_utm,true,'priority')}>查看优先区域 {a.label}</button>
        <button type="button" className="agent-text-button" disabled={busy||drawing||Boolean(box)} onClick={()=>onPriority({...priorityArgs,operation:'remove',area_id:a.id})}>移除优先区域 {a.label}</button>
      </div>):<p>尚未指定优先区域。</p>}
      {priority.areas.length>0&&priorityComparison&&<>
        <p>优先区域合计 {priorityComparison.total_priority_area_m2??'不可用'}㎡（重叠部分只计一次）。</p>
        {!priorityComparison.source_valid?<p role="alert">优先区域来源已变化，请核对资料后重新建立。</p>:<table className="agent-priority-comparison"><caption>覆盖当前优先区域</caption><thead><tr><th>讨论范围</th><th>覆盖㎡</th><th>保留区检查</th></tr></thead><tbody>{priorityComparison.rows.map(r=><tr key={r.id}><td>{r.label}</td><td>{r.priority_overlap_m2??'不可用'}</td><td>{r.protected_conflicts.length?'有冲突':'无重叠'}</td></tr>)}</tbody></table>}
      </>}
      <p>修改优先区域会更新覆盖比较和报告状态，保留已有温度结果。覆盖面积不代表降温或实际受益。</p>
    </section>
    <div className="pilot-temperature-actions">
      <button type="button" className="agent-locate" disabled={busy||drawing||Boolean(box)} onClick={()=>startDrawing()}><MapPin size={14}/>地图框选改造范围</button>
      <button type="button" className="agent-locate" disabled={busy||drawing||Boolean(box)} onClick={useWholeArea}>选择整块试算范围</button>
    </div>
    {drawing&&<p role="status">{{protection:'保留范围：',priority:'优先区域：',change:'改造范围：'}[drawingMode]}{first?'请点选矩形另一角':'请在地图上点选矩形第一角'}</p>}
    {error&&<p role="alert">{error}</p>}
    {box&&<p role="status">所选{{protection:'保留',priority:'优先区域',change:'覆盖变化'}[drawingMode]}面积 {(box[2]-box[0])*(box[3]-box[1])}㎡</p>}
    {box&&drawingMode==='protection'&&<label className="agent-protection-label">保留用途或依据<input value={label} onChange={event=>setLabel(event.target.value)} maxLength={80} placeholder="例如：保留活动空间"/></label>}
    {box&&drawingMode==='priority'&&<label className="agent-protection-label">优先原因<input value={label} onChange={event=>setLabel(event.target.value)} maxLength={80} placeholder="例如：优先改善等候空间"/></label>}
    {box&&drawingMode==='change'&&conflicts.length>0&&<p role="alert">与保留区 {conflicts.map(c=>`${c.label}（重叠 ${c.overlap_m2}㎡）`).join('、')} 冲突，请重新框选。</p>}
    {(drawing||box)&&<div className="pilot-temperature-actions">
      <button type="button" className="agent-locate" disabled={busy} onClick={cancelDrawing}>取消本次修改</button>
      {box&&(drawingMode==='priority'
        ?<button type="button" className="agent-primary" disabled={busy||!label.trim()} onClick={savePriority}>保存优先区域</button>
        :drawingMode==='protection'
        ?<button type="button" className="agent-primary" disabled={busy||!label.trim()} onClick={saveProtection}>保存保留范围</button>
        :<button type="button" className="agent-primary" disabled={busy||conflicts.length>0} onClick={save}>保存新情景</button>)}
    </div>}
    </details>
    {current&&<details className="planning-saved-scenario"><summary>已保存方案 v{current.version} <small>{current.area_m2}㎡ · {current.result?'含已完成评价':'待评价'}</small></summary>
      <h5>当前情景 v{current.version} · {current.area_m2}㎡</h5>
      <ScenarioCosts scenario={current}/>
      <section aria-label="当前情景约束检查" className="agent-scenario-checks" data-status={constraints.status}>
        <strong>{constraints.label}</strong>
        <ul>{constraints.checks.map(check=><li key={check.id}>{check.detail}</li>)}</ul>
        <p>检查本版数值条件和用户已登记保留范围。现场、管控和可施工性仍需核实；运行模型不会消除冲突。</p>
      </section>
      {current.change?.type==='restore'&&<p>从旧范围恢复，已按当前目标重新核价；旧预测保留在原版本。</p>}
      {current.result?<TemperatureValues result={current.result}/>:<p role="status">
        已保存本版，等待手动运行评价。{lastEvaluated&&`v${lastEvaluated.version} 的温度结果见旧版。`}
      </p>}
      <div className="pilot-temperature-actions">
        <button type="button" className="agent-locate" disabled={drawing||Boolean(box)} onClick={()=>preview(current.bounds_utm,true)}>查看当前范围</button>
        {current.result
          ? <button type="button" className="agent-locate" onClick={()=>onEvidence(current.result.run_id)}>查看运行依据</button>
          : <button type="button" className="agent-primary" disabled={busy||drawing||Boolean(box)||!configured||protectionConflicts(current.bounds_utm,protection.areas).length>0} onClick={()=>onEvaluate(current.id)}>运行地表温度评价</button>}
      </div>
    </details>}
    {!configured&&<p>配置本地 V3 模型和 Python 后可运行评价。</p>}
    {scenarios.length>1&&<details className="agent-old-options">
      <summary>{scenarios.length-1} 个旧温度情景</summary>
      {scenarios.slice(0,-1).reverse().map(scenario=><section className="pilot-temperature-history" key={scenario.id}>
        <h5>旧情景 v{scenario.version} · {scenario.area_m2}㎡</h5>
        <p>当时保留约束 v{scenario.protection_version??0}。地图查看会同时显示当前保留区；采用旧范围仍需通过当前约束检查。</p>
        <ScenarioCosts scenario={scenario}/>
        {scenario.result?<TemperatureValues result={scenario.result}/>:<p>该版本未运行评价。</p>}
        <div className="pilot-temperature-actions">
          <button type="button" className="agent-locate" disabled={drawing||Boolean(box)} onClick={()=>preview(scenario.bounds_utm,true)}>查看旧版范围</button>
          <button type="button" className="agent-locate" disabled={busy||drawing||Boolean(box)} onClick={()=>onRestore(scenario.id,current.id)}>以此范围新建版本</button>
          {scenario.result&&<button type="button" className="agent-locate" onClick={()=>onEvidence(scenario.result.run_id)}>查看旧版依据</button>}
        </div>
      </section>)}
    </details>}
    {scenarios.length>1&&<p className="agent-caption">恢复旧范围会创建新版本，按当前目标核价并等待手动评价。原版本及结果保留。</p>}
    {current&&<div className="pilot-temperature-actions">
      <button type="button" className="agent-locate" disabled={busy} onClick={onReport}><DownloadSimple size={14}/>生成带版本的报告</button>
      <button type="button" className="agent-locate" onClick={onDownload}><DownloadSimple size={14}/>导出情景 GeoJSON</button>
    </div>}
    {current?.result&&<p>温差按舍入前的模型值计算，正值表示模型预测较凉。两个预测使用同日参考条件，实际改造效果仍待验证。</p>}
  </section>;
}
