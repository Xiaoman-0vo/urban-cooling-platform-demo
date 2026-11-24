import React from 'react';
import {CheckCircle,Info,Play,WarningCircle} from '@phosphor-icons/react';
import EvaluationReadiness from './EvaluationReadiness.jsx';

const fmt=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2});
export default function CandidateDecision({decision,busy,configured,onEvaluate,onReport,onEvidence}){
  if(!decision.rows.length)return null;
  const ready=decision.comparable,stale=decision.status==='stale';
  return <section className="candidate-decision" aria-label="本轮候选比较">
    <header><div><small>02 / 评价与比较</small><h4>先看结果，再选方案</h4></div>
      <button className="decision-evaluate" type="button" disabled={busy||!configured||stale||ready}
        onClick={()=>onEvaluate({search_id:decision.search_id})}><Play size={15} weight="fill"/>{busy&&decision.status==='running'?'正在评价…':ready?'本轮已有可比结果':decision.completed?'重试候选评价':'评价本轮全部候选'}</button>
    </header>
    {!configured&&<p className="decision-model-note">温度模型暂不可用，仍可比较空间与费用。</p>}
    <div className="decision-verdict" data-state={decision.status} role="status">
      {decision.status==='no_improvement'?<WarningCircle size={22}/>:ready?<CheckCircle size={22}/>:<Info size={22}/>}
      <div><strong>{decision.title}</strong><p>{decision.detail}</p></div>
    </div>
    <div className="decision-table-wrap"><table className="decision-table"><thead><tr><th>比较对象</th><th>面积</th><th>新增费用</th><th>模型温差</th></tr></thead><tbody>
      <tr className="decision-baseline"><th>现状参考<small>不新增改造</small></th><td>—</td><td>0 元</td>
        <td>{decision.baseline?'0.000℃':decision.status==='incomparable'?'无统一比较':'待评价'}<small>{decision.baseline?`模型基线 ${decision.baseline.baseline_lst_c.toFixed(3)}℃`:decision.status==='incomparable'?'保留各候选原始结果':'先取得模型基线'}</small></td></tr>
      {decision.rows.map(row=><tr key={row.id}><th>{row.label}<small>{row.strategies.join(' / ')}</small></th>
        <td>{fmt.format(row.area_m2)}㎡</td><td>{fmt.format(row.cost_rmb)} 元</td>
        <td className={row.temperature?.predicted_delta_lst_c<0?'decision-warming':''}>{row.temperature?`${row.temperature.predicted_delta_lst_c.toFixed(3)}℃`:row.evaluationStatus==='failed'?'评价失败':row.evaluationStatus==='running'?'评价中':'未评价'}
          <small>{row.temperature?`情景 ${row.temperature.scenario_lst_c.toFixed(3)}℃`:'等待有效结果'}</small>
          {row.temperature&&<small>{row.temperature.predicted_delta_lst_c<0?'模型未显示降温':row.temperature.predicted_delta_lst_c===0?'模型无变化':'模型预测较凉'}</small>}</td></tr>)}
    </tbody></table></div>
    {decision.tradeoff&&<p className="decision-tradeoff">从{decision.tradeoff.from}到{decision.tradeoff.to}：多改造 <b>{fmt.format(decision.tradeoff.extra_area_m2)}㎡</b>，多投入 <b>{fmt.format(decision.tradeoff.extra_cost_rmb)} 元</b>。
      {decision.comparable&&Math.abs(decision.tradeoff.delta_difference_c)<0.001?' 本次记录精度下，模型温差几乎相同。':''}</p>}
    <EvaluationReadiness decision={decision}/>
    <footer><span>温差＝模型基线−情景预测，按舍入前值计算；负值表示模型预测升温。指定历史情景，费用不含养护。</span>
      <div>{decision.completed>0&&<button type="button" disabled={busy} onClick={onReport}>生成本轮比较报告</button>}
        {decision.evaluation_run_id&&<button type="button" onClick={()=>onEvidence?.(decision.evaluation_run_id)}>查看运行依据</button>}</div>
    </footer>
  </section>;
}
