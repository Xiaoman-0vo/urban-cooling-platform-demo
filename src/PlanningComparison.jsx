import React,{useState} from 'react';
import {compareTemperatureVersions} from './planning-workflow.js';

const fmt=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3});
const value=(number,unit)=>number==null?'未记录':`${fmt.format(number)}${unit}`;

export default function PlanningComparison({scenarios,rows}) {
  const [leftId,setLeft]=useState(''),[rightId,setRight]=useState('');
  const left=rows.find(row=>row.id===leftId)||rows.at(-2)||rows[0];
  const right=rows.find(row=>row.id===rightId)||rows.at(-1);
  const comparison=compareTemperatureVersions(scenarios,left?.id,right?.id);
  if(!rows.length)return <div className="workflow-empty"><strong>从第一版改造方案开始</strong><p>保存候选或地图范围后，即可查看面积与假设费用。温度结果由你手动运行后记录。</p></div>;
  return <section className="workflow-comparison" aria-label="选择版本对照">
    <div className="workflow-comparison-cards">{[[left,setLeft,'参照版本'],[right,setRight,'对照版本']].map(([row,set,label])=><article key={label}>
      <label>{label}<select aria-label={label} value={row.id} onChange={event=>set(event.target.value)}>{rows.map(item=><option key={item.id} value={item.id}>情景 v{item.version}{item.is_current?' · 当前':''}</option>)}</select></label>
      <dl><div><dt>改造面积</dt><dd>{value(row.area_m2,'㎡')}</dd></div><div><dt>假设建设费</dt><dd>{value(row.cost_rmb,'元')}</dd></div><div><dt>模型温差</dt><dd>{row.delta_lst_c==null?'未运行':value(row.delta_lst_c,'℃')}</dd></div></dl>
      <p className={row.constraints.status==='failed'?'workflow-warning':''}>{row.constraints.label}</p>
    </article>)}</div>
    <p className="workflow-comparison-status">{rows.length===1?'当前只有一个情景版本；保存修改后可进行版本对照。':comparison.reason}
      {rows.length>1&&left.id!==right.id&&comparison.comparable&&<> · 对照版相对参照版的模型温差变化 {value(comparison.deltaDifference,'℃')}</>}</p>
    <p className="workflow-caption">模型温差＝基线减情景预测；负值表示模型预测升温。费用为用户单价假设，不含养护。</p>
  </section>;
}
