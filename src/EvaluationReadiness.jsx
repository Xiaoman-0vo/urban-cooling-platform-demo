import React from 'react';
import {evaluationReadiness} from './evaluation-readiness.js';

export default function EvaluationReadiness({decision}){
  const state=evaluationReadiness(decision);
  return <section className="evaluation-readiness" aria-label="评价适用性与待核事项">
    <header><strong>这些结果能支持什么判断？</strong><span>历史情景参考</span></header>
    <p className="evaluation-readiness-title">{state.title}</p><p>{state.detail}</p>
    <dl><div><dt>模型温差能否区分本轮候选</dt><dd>{state.model_delta_distinguishable===null?'暂不能比较':state.model_delta_distinguishable?'输出数值有差异':'当前输出精度下不能区分'}</dd></div>
      <div><dt>按降温效果排序或实施</dt><dd>证据不足，需独立复核</dd></div></dl>
    <details><summary>查看模型限制与下一步核查</summary><ul>{state.limitations.map((item,index)=><li key={index}>{typeof item==='string'?item:item.detail||item.label}</li>)}</ul>
      <strong>下一步</strong><ul>{state.next_steps.map((item,index)=><li key={index}>{typeof item==='string'?item:item.detail||item.label}</li>)}</ul></details>
  </section>;
}
