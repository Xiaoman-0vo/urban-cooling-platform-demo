import React from 'react';
import {ArrowRight, DownloadSimple} from '@phosphor-icons/react';
import {readOnlyResearchActionGates} from './research-state.js';

const STAGE_NAMES = {
  one_hop_development: '一跳邻域开发',
  configuration_sources: '配置来源四版本',
  full_group_ablations: '完整参照组别消融',
};
const ACTION_NAMES = {
  validated_new_site_prediction: '新场地可靠预测',
  physical_cooling: '物理降温模拟',
  comfort_accessibility: '热舒适服务',
  actual_use: '实际使用结果',
  equity_results: '公平结果',
  minimum_area_search: '最少新增面积搜索',
  optimal_recommendation: '可靠方案推荐',
};
const dateLabel = value => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

/** Display project-wide development evidence without binding errors to a site. */
export default function ResearchEvidence({registrations, currentRegistration, error, mode = 'summary', onOpen, onAdopt, onExportJson}) {
  const latest = registrations.at(-1);
  const alreadyRegistered = currentRegistration && registrations.some(item => item.registration_id === currentRegistration.registration_id);
  if (!latest) return <section className="research-evidence" aria-label="科研状态登记">
    <h3>科研开发证据</h3>
    <p className="muted">这份工程尚未保存科研状态登记。场地资料与来源版本按原包保留。</p>
    {error && <p className="evidence-note">当前登记暂不可接纳：{error}</p>}
    {currentRegistration && <button className="secondary full" onClick={onAdopt}>接纳当前科研登记</button>}
  </section>;

  const index = latest.index;
  const rows = index.development_metric_records;
  const gates = readOnlyResearchActionGates();
  return <section className="research-evidence" aria-label="科研状态登记">
    <h3>科研开发进度</h3>
    {error && <p className="evidence-note">当前登记暂不可接纳：{error} 以下保留已保存的历史登记。</p>}
    <p className="muted">开发证据已保存 · 最终与应用验证待完成</p>
    <div className="research-stage-list">{index.stages.map(stage => <details key={stage.stage_id}>
      <summary><span>{STAGE_NAMES[stage.stage_id] || stage.stage_id}</span><strong>{stage.counts.runs} 次</strong></summary>
      <dl><dt>上游版本</dt><dd>{stage.upstream_version}</dd><dt>上游完成时间</dt><dd>{dateLabel(stage.assembly_or_training_completed_utc)}</dd><dt>已保存的技术核验</dt><dd>{stage.technical_receipt_passed ? '通过（索引中的来源声明）' : '尚未通过'}</dd><dt>研究阶段</dt><dd>验证用于早停与配置比较，最终测试未执行</dd><dt>最终留出</dt><dd>{stage.counts.final_test_locked_targets} 格仍锁定</dd><dt>新场地推理</dt><dd>尚未形成可用的应用验证</dd></dl>
    </details>)}</div>
    <p className="evidence-note">登记 {dateLabel(index.checked_at)} · {index.sources.length} 项新来源引用 · {rows.length} 条开发误差记录。项目开发记录与当前位置分别保存。</p>
    <p className="evidence-note">当前细配置 C 的联合增量尚无稳定正向证据。开发 MAE 的 ℃ 表示模型误差，不是位置温度、降温值或人体舒适结果。</p>
    {mode === 'summary' && <button className="secondary full" onClick={onOpen}>查看科研开发证据 <ArrowRight size={18}/></button>}
    {mode === 'full' && <>
      <h3>已保存的开发误差</h3>
      <p className="muted">现状单景遥感 LST 产品代理研究；这里按原记录展示，不生成场地温度图，也不排列最佳方案。</p>
      {index.stages.map(stage => {
        const stageRows = rows.filter(row => row.stage_id === stage.stage_id);
        return stageRows.length > 0 && <details className="research-metrics" key={stage.stage_id}>
          <summary>{STAGE_NAMES[stage.stage_id] || stage.stage_id} · {stageRows.length} 条</summary>
          <table><caption>开发 MAE · ℃，来源记录值</caption><thead><tr><th>聚合</th><th>配置</th><th>误差</th></tr></thead><tbody>{stageRows.map(row => <tr key={`${row.aggregation}:${row.configuration}:${row.width}:${row.metric}`}><td>{row.aggregation}</td><td>{row.configuration}<small>模型宽度 {row.width} · {row.source_id}</small></td><td>{row.value.toFixed(6)}</td></tr>)}</tbody></table>
        </details>;
      })}
      <h3>仍缺的验证</h3>
      <ul className="research-missing"><li>研究选择冻结后的最终测试与适用性核查</li><li>新场地现状预测的应用验证</li><li>未建方案的物理效应、服务与公平证据</li><li>独立面积搜索和推荐流程的验收</li></ul>
      <div className="research-gates" aria-label="科研应用条件">{Object.entries(gates).map(([key, enabled]) => <div key={key}><span>{ACTION_NAMES[key] || key}</span><strong>{enabled ? '可执行' : '条件待补'}</strong></div>)}</div>
      <p className="evidence-note">本轮只接纳元数据与开发汇总。没有加载模型权重、读取最终标签或执行研究推理。</p>
      <button className="secondary full" onClick={onExportJson}>导出项目 JSON <DownloadSimple size={18}/></button>
    </>}
    {(mode === 'sources' || mode === 'full') && <>
      <h3>独立科研登记与来源版本</h3>
      <p className="muted">索引与所列元数据已核对哈希；本平台未加载或重新核验模型权重。历史场景清单继续独立保留。</p>
      <div className="source-list">{registrations.map(registration => <details key={registration.registration_id}>
        <summary>科研索引 · {dateLabel(registration.index.checked_at)}<small>{registration.index.sources.length} 来源 · {registration.index.development_metric_records.length} 误差记录</small></summary>
        <dl><dt>索引源文件</dt><dd>{registration.source_index.path}</dd><dt>索引 SHA256</dt><dd>{registration.source_index.sha256}</dd><dt>平台接纳时间</dt><dd>{dateLabel(registration.adapter_receipt.registered_at)}</dd><dt>原索引的适配声明</dt><dd>{registration.index.platform_adapter_status}</dd><dt>本平台记录</dt><dd>只读资料接入；科学应用条件保持待补</dd></dl>
        {registration.index.sources.map(source => <details className="research-source" key={source.source_id}><summary>{source.source_id} · {source.role}</summary><p>{source.path}</p><dl><dt>来源 SHA256</dt><dd>{source.sha256}</dd><dt>文件字节</dt><dd>{source.bytes}</dd></dl></details>)}
      </details>)}</div>
    </>}
    {currentRegistration && !alreadyRegistered && <button className="secondary full" onClick={onAdopt}>追加当前科研登记</button>}
  </section>;
}
