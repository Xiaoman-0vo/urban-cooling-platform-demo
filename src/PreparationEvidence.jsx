import React, {useMemo} from 'react';
import {ArrowRight, DownloadSimple} from '@phosphor-icons/react';

const PATHS = {
  macro: '共享接口/共同试点输入对照/宏观九格现有输入.csv',
  macroReview: '共享接口/共同试点输入对照/宏观九格输入核查.json',
  residences: '共享接口/公平性输入准备/共同试点住宅候选.csv',
  populationReview: '共享接口/公平性输入准备/共同试点对象与人口支持核查.json',
  residenceGeometry: '共享接口/公平性输入准备/共同试点住宅源对象_展示准备.geojson',
  micro: '共享接口/微观试验准备/实际输入与缺项.json',
  weather: '共享接口/微观试验准备/持有气象与地形候选核查.json',
  service: '共享接口/服务链准备/双路径受益与获取接口_草案.json',
};
const GATE_NAMES = {
  prediction: '预测', physical_simulation: '物理模拟', service_evaluation: '服务评价',
  fairness_evaluation: '公平评价', candidate_generation: '候选生成', ranking: '排序',
};
const BRANCH_NAMES = {in_situ_potential: '原位置潜在物理受益', active_acquisition: '主动获取'};
const SCOPE_NAMES = {core_100: '研究核心', macro_neighborhood_300: '宏观邻域', micro_preparation_500: '输入准备窗'};
const FILE_LABELS = {
  [PATHS.macro]: '宏观九格原始输入', [PATHS.macroReview]: '宏观字段与缺项核查',
  [PATHS.residences]: '住宅标签与原生人口格登记', [PATHS.populationReview]: '住宅与人口支持核查',
  [PATHS.residenceGeometry]: '完整住宅源面展示几何',
  '共享接口/公平性输入准备/共同试点住宅几何展示核查.json': '住宅几何展示核查',
  [PATHS.micro]: '微观输入与缺项', [PATHS.weather]: '持有气象与地形候选',
  [PATHS.service]: '受体与双路径占位',
  '共享接口/共同试点输入对照/README.md': '宏观准备说明',
  '共享接口/公平性输入准备/共同试点接纳边界.md': '住宅接纳边界',
  '共享接口/微观试验准备/同投入与指标匹配试验准备_草案.md': '同投入与指标匹配草案',
  '共享接口/微观试验准备/持有输入能补哪些缺项.md': '持有输入与缺项说明',
  '共享接口/服务链准备/README.md': '双路径准备说明',
};
const raw = value => value === null ? 'null（原记录空值）' : value === undefined ? '未提供'
  : value === '' ? '空值（原CSV空单元）' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const count = value => Number.isInteger(value) ? String(value) : '待核';
const dateLabel = value => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short',
  }).format(date) : '时间未提供';
};

/** CSV viewing only: keep cells as original strings, including empty cells. */
function csvRecords(text) {
  if (typeof text !== 'string') return [];
  const rows = []; let row = [], cell = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && ch === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (ch === '\r' || ch === '\n')) {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...records] = rows;
  return headers ? records.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i] ?? '']))) : [];
}

function RawFields({value}) {
  if (!value || typeof value !== 'object') return <p className="muted">{raw(value)}</p>;
  return <div className="preparation-table-wrap"><table className="preparation-table">
    <thead><tr><th scope="col">原字段</th><th scope="col">原值／原单位</th></tr></thead>
    <tbody>{Object.entries(value).map(([key, field]) => <tr key={key}>
      <th scope="row">{key}</th><td>{field !== null && typeof field === 'object'
        ? <details><summary>{Array.isArray(field) ? `${field.length} 条原记录` : '展开原字段'}</summary>
          <pre className="preparation-raw">{JSON.stringify(field, null, 2)}</pre></details> : raw(field)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function RecordDetails({title, records, label}) {
  return <details className="research-metrics preparation-records">
    <summary>{title} · {records.length} 条</summary>
    <p className="evidence-note">按原字段展示，空值与单位保留，不换算或填补。</p>
    {records.map((record, index) => <details className="preparation-record" key={index}>
      <summary>{label(record, index)}</summary><RawFields value={record}/>
    </details>)}
  </details>;
}

function PreparationDetails({view}) {
  const inputs = view.inputs;
  const macro = useMemo(() => csvRecords(inputs[PATHS.macro]), [inputs]);
  const residences = useMemo(() => csvRecords(inputs[PATHS.residences]), [inputs]);
  const macroReview = inputs[PATHS.macroReview];
  const micro = inputs[PATHS.micro];
  const weather = inputs[PATHS.weather];
  const service = inputs[PATHS.service];
  return <div className="preparation-details">
    <RecordDetails title="九格输入与适用状态" records={macro} label={row => `${row.grid_id} · ${row.grid_id === view.manifest.site_id ? '核心' : '邻格'} · 原输入接受 ${row.proxy_input_accepted}`}/>
    <RecordDetails title="原始缺项记录" records={macroReview?.missing_numeric_details ?? []} label={row => `${row.grid_id} · ${row.field}`}/>
    <RecordDetails title="住宅与原生人口格" records={residences} label={row => `来源 ${row.merged_id_raw} · ${row.native_cell_id}`}/>
    <p className="evidence-note">人口原单位 persons_per_native_pixel（人数／原生像元）；表中估计值属于整个人口格，未分配或汇总为建筑人口。住宅展示几何不含人数。</p>
    <details className="research-metrics"><summary>微观接受值 · {Object.keys(micro?.unknown_values ?? {}).length} 项</summary>
      <RawFields value={micro?.unknown_values}/>
    </details>
    <RecordDetails title="微观缺项与原单位" records={micro?.source_gap_rows ?? []} label={row => row.required_evidence}/>
    <RecordDetails title="气象候选原记录" records={weather?.weather_candidates ?? []} label={row => row.source_id === 'tmy_zip' ? '双流典型气象年 · EPW' : 'ERA5-Land 月聚合'}/>
    <RecordDetails title="地形候选原记录" records={weather?.terrain_candidates ?? []} label={() => 'NASADEM 成都预检'}/>
    <RecordDetails title="共同候选受体" records={micro?.shared_receptor_objects ?? []} label={row => `${row.object_id} · 位置、高度及服务角色待核`}/>
    <RecordDetails title="双路径未计算占位" records={service?.results ?? []} label={row => `${row.object_id} · ${BRANCH_NAMES[row.benefit_pathway] ?? row.benefit_pathway} · ${raw(row.value)} · ${raw(row.unit)}`}/>
    <details className="research-metrics"><summary>100／300／500 米支持与未定义求解域</summary>
      {(view.manifest.scope_registry ?? []).map(scope => <details className="preparation-record" key={scope.support_id}>
        <summary>{scope.width_m == null ? '物理求解域 · 未定义' : `${scope.width_m} 米 · ${SCOPE_NAMES[scope.support_id] ?? scope.role}`}</summary><RawFields value={scope}/>
      </details>)}
    </details>
    <details className="research-metrics"><summary>科学运行条件 · 六项保持未开放</summary>
      <div className="research-gates">{Object.entries(GATE_NAMES).map(([key, name]) => <div key={key}><span>{name}</span><strong>false · 条件待补</strong></div>)}</div>
    </details>
  </div>;
}

function Overview({view}) {
  const summary = view.manifest.summary ?? {};
  const inputs = view.inputs;
  const micro = inputs[PATHS.micro];
  const weather = inputs[PATHS.weather];
  const tmy = weather?.weather_candidates?.find(row => row.source_id === 'tmy_zip');
  const julyYears = tmy?.month_source_years?.['7'];
  const missing = (summary.macro_missing_input_grid_ids ?? []).join('、') || '待核';
  const rows = [
    ['宏观九格', `${count(summary.macro_proxy_input_accepted_count)}/${count(summary.macro_grid_count)} 格输入接受`, `${missing} 缺建筑来源及 R 数值；核心输入接受、温度监督未接纳，模型应用尚未认证。`],
    ['住宅来源', `${count(summary.residence_source_candidates)} 个完整 Residence 标签源面`, '全部在500米准备窗内、300米窗外；标签尚未认证实际入住。'],
    ['人口支持', `${count(summary.residence_native_population_cell_ids)} 个原生人口格`, '人数／原生像元，不是建筑人口；展示几何不带人数，无住宅—受体 OD。'],
    ['微观输入', `${count(micro?.unknown_values ? Object.keys(micro.unknown_values).length : undefined)} 项接受值仍为 null`, '同期驱动、地面与植被、材料、求解设置和独立验证仍需补齐。'],
    ['天气与地形', `${count(weather?.weather_candidates?.length)} 类气象、${count(weather?.terrain_candidates?.length)} 类地形候选`, `EPW 7月源年${julyYears?.join('、') ?? '待核'}，为典型年；ERA5为月背景，NASADEM像元及求解输入未验收。`],
    ['受体与服务', `${count(summary.shared_receptor_candidates)} 候选受体／${count(summary.uncomputed_service_branch_records)} 双分支占位`, '热值、路径、停留与人口仍为 null；原位置与公共目的地角色待核。'],
  ];
  return <div className="preparation-table-wrap"><table className="preparation-table preparation-overview">
    <caption>共同试点已有资料与缺项</caption>
    <thead><tr><th scope="col">资料</th><th scope="col">已有</th><th scope="col">还缺什么</th></tr></thead>
    <tbody>{rows.map(([label, held, gap]) => <tr key={label}><th scope="row">{label}</th><td>{held}</td><td>{gap}</td></tr>)}</tbody>
  </table></div>;
}

function Sources({registration, view, adopted}) {
  return <details className="preparation-source-registration">
    <summary>{adopted ? '已保存准备登记' : '当前准备包 · 尚未接纳'}<small>{dateLabel(view?.manifest?.created_at)} · {count(view?.manifest?.entries?.length)} 项源件</small></summary>
    <p>{registration.registration_id}</p>
    <details className="research-source"><summary>包身份、原状态与平台只读回执</summary>
      {/* Archive bytes remain in the project sidecar, not duplicated in the DOM. */}
      <RawFields value={Object.fromEntries(Object.entries(registration).filter(([key]) => key !== 'archive_base64'))}/>
    </details>
    {!view ? <p className="muted">这份历史登记的详情尚未解码，原登记继续保留；不会用当前包代替。</p> : <>
      <details className="research-source"><summary>准备清单原身份与四个状态轴</summary>
        <RawFields value={{package_id: view.manifest.package_id, site_id: view.manifest.site_id,
          schema_version: view.manifest.schema_version, status_axes: view.manifest.status_axes,
          artifact_check_scope: view.manifest.artifact_check_scope,
          source_fingerprint_sha256: view.manifest.source_fingerprint_sha256,
          scientific_action_gates: view.manifest.scientific_action_gates}}/>
      </details>
      <details className="research-source"><summary>新旧来源版本差异</summary>
        <p>旧微观快照继续保留。范围相同不能认证数值口径或同期背景一致。</p>
        <RawFields value={{upstream_snapshot_alignment: view.manifest.upstream_snapshot_alignment,
          copied_source_snapshot_comparisons: view.manifest.copied_source_snapshot_comparisons,
          snapshot_currency_notice: view.manifest.snapshot_currency_notice}}/>
      </details>
      {(view.manifest.entries ?? []).map(entry => <details className="research-source" key={entry.path}>
        <summary>{FILE_LABELS[entry.path] ?? entry.path.split('/').at(-1)}<small>{entry.bytes} 字节</small></summary>
        <dl><dt>原路径</dt><dd>{entry.path}</dd><dt>包内路径</dt><dd>{entry.archive_path}</dd>
          <dt>原件 SHA-256</dt><dd>{entry.sha256}</dd><dt>原件字节</dt><dd>{entry.bytes}</dd></dl>
        <details><summary>查看原内容与单位</summary>
          <pre className="preparation-raw">{typeof view.inputs[entry.path] === 'string'
            ? view.inputs[entry.path] : JSON.stringify(view.inputs[entry.path], null, 2) ?? '该原件尚未解码'}</pre>
        </details>
      </details>)}
    </>}
  </details>;
}

/** Preparation adoption is explicit and site-bound; this component never runs science. */
export default function PreparationEvidence({registrations = [], currentRegistration, currentView,
  views = {}, error, eligible = false, mode = 'summary', onAdopt, onOpen, onExportJson}) {
  const getView = registration => {
    if (!registration) return undefined;
    const view = views[registration.registration_id] ?? (currentRegistration?.registration_id === registration.registration_id ? currentView : undefined);
    return view?.manifest?.package_id === registration.registration_id && view.inputs ? view : undefined;
  };
  const latest = registrations.at(-1);
  const alreadyRegistered = Boolean(currentRegistration && registrations.some(row => row.registration_id === currentRegistration.registration_id));
  const selected = latest ?? currentRegistration;
  const view = getView(selected);
  const adoptable = Boolean(currentRegistration && getView(currentRegistration) && !alreadyRegistered && !error);
  const adopt = () => { if (eligible && adoptable) onAdopt?.(); };
  const sourceRows = [...registrations, ...(!alreadyRegistered && currentRegistration ? [currentRegistration] : [])];
  return <section className="research-evidence preparation-evidence" aria-label="试点准备资料登记">
    <h3>试点准备资料</h3>
    {error && <p className="evidence-note" role="status">当前准备包暂不可接纳：{String(error)}{latest ? '。已保存登记继续保留。' : ''}</p>}
    <p className="muted">{latest ? '准备登记已保存，可浏览原输入与缺项。' : '这份工程尚未接纳试点准备资料。'}</p>
    {!eligible && <p className="evidence-note">这份资料属于 E4125_N33891；当前场地未对应该试点，可查看资料，不能接纳到此场地。</p>}
    {view ? <>
      <p className="evidence-note">资料 {dateLabel(view.manifest.created_at)} · {count(view.manifest.entries?.length)} 项原件</p>
      <Overview view={view}/>
      <p className="evidence-note">现有输入用于规划现状与条件对照，尚无具体配置—LST关联量级；开发 MAE 不作为改造效应。100／300／500米分别为核心、邻域、准备窗，物理求解域未定义。</p>
      {mode === 'summary' && <button type="button" className="secondary full" onClick={() => onOpen?.(selected)}>查看准备资料详情 <ArrowRight size={18}/></button>}
      {mode === 'full' && <PreparationDetails view={view}/>}
    </> : <p className="muted">{latest ? '已保存的准备登记详情尚未就绪，原登记保留。' : '准备资料正在核对；来源、身份与文件完整性确认后可查看。'}</p>}
    {(mode === 'full' || mode === 'sources') && <>
      <h3>来源与版本追溯</h3>
      <div className="source-list">{sourceRows.map(registration => <Sources key={registration.registration_id}
        registration={registration} view={getView(registration)} adopted={registrations.some(row => row.registration_id === registration.registration_id)}/>)}</div>
      {latest && <button type="button" className="secondary full" onClick={onExportJson}>导出工程 JSON <DownloadSimple size={18}/></button>}
    </>}
    {adoptable && <button type="button" className="secondary full" disabled={!eligible} onClick={adopt}>接纳试点准备资料</button>}
  </section>;
}
