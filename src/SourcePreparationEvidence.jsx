import React, {useEffect, useState} from 'react';
import {sourcePreparationArchiveBytes, sourcePreparationManifestBytes} from './source-preparation-state.js';

const GROUPS = {
  'micro-source-overlay': {title: '核心范围与重复面积', question: '同一位置由哪些来源共同覆盖？', count: '16个互斥来源面 · 41条覆盖关系 · 132个源键 · 2条跨层交叠 · 12条零面积道路支持', limit: '来源覆盖闭合10000 m²，未形成可改地面或实施权限。屋顶与植被交叠167.60753857181282 m²仍待解释；3条低于1e−6 m²的正关系完整保留。132个源键与旧104对象不累计，三个植被裁片仍来自同一17696连通组。'},
  'weather-cross-format': {title: '天气表示与待核时标', question: '这些格式能否被当作同一场地驱动？', count: '24小时 · 35个完整字段 · 同包四格式 · 16条正降水深度但累计时长为0', limit: '双流典型年独立情景候选，真实时刻、累计区间、具名引擎和场地代表性尚未采用。四格式对应不增加独立观测；EPW Wh/m²与WEA/CLM W/m²分别保留，RAIN零值可能表示缺失。'},
  'road-source-connectivity': {title: '道路参考与未接纳连接', question: '原来源连接能否支持步行与服务？', count: '2021来源 · 81个原节点 · 87个原相邻段 · 17条原线 · 136条线对关系 · 102条受体关系', limit: '原来源共节点和一源分量不认证公共步行网络。六受体不吸附、不配OD；最小平面间距不等于步行距离。foot=yes与access=no的原例外保留，路由、服务、公平性和推荐均未运行。'},
};
const valueText = value => value === null ? 'null（未知／未采用）' : value === '' ? '空项（原字符串）' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const collection = features => ({type: 'FeatureCollection', features});
const mime = source => source.mime_type || ({png: 'image/png', svg: 'image/svg+xml', gpkg: 'application/geopackage+sqlite3', csv: 'text/csv', geojson: 'application/geo+json', json: 'application/json', md: 'text/markdown', py: 'text/x-python'}[source.file_kind || source.path.split('.').at(-1)] || 'application/octet-stream');
function download(bytes, name, type) {
  if (!(bytes instanceof Uint8Array)) throw new Error('此原件尚未完成字节核验。');
  const url = URL.createObjectURL(new Blob([bytes], {type}));
  const link = document.createElement('a'); link.href = url; link.download = name.split('/').at(-1); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function RawFields({value}) {
  if (!value || typeof value !== 'object') return <pre>{valueText(value)}</pre>;
  return <dl className="source-preparation-fields">{Object.entries(value).map(([field, item]) => <React.Fragment key={field}><dt>{field}</dt><dd>{valueText(item)}</dd></React.Fragment>)}</dl>;
}

function rowLocation(group, summary, row) {
  if (group === 'micro-source-overlay') {
    const faces = summary.displayCollections.cells.features, roads = summary.displayCollections.roads.features;
    if (row.source_key && row.cell_id && 'line_support_length_m' in row) return {collection: collection(roads.filter(f => f.properties.source_key === row.source_key && f.properties.cell_id === row.cell_id)), ref: {group_id: group, kind: 'roads', key: row.source_key + '|' + row.cell_id}};
    if (row.cell_id) return {collection: collection(faces.filter(f => f.properties.cell_id === row.cell_id)), ref: {group_id: group, kind: 'cells', key: row.cell_id}};
    if (row.first_source_key && row.second_source_key) return {collection: collection(faces.filter(f => {const keys = JSON.parse(f.properties.source_keys_json); return keys.includes(row.first_source_key) && keys.includes(row.second_source_key);})), ref: {group_id: group, kind: 'overlaps', key: row.first_source_key + '|' + row.second_source_key}};
    if (row.source_key) return {collection: collection(faces.filter(f => JSON.parse(f.properties.source_keys_json).includes(row.source_key))), ref: {group_id: group, kind: 'sourceObjects', key: row.source_key}};
  }
  if (group === 'road-source-connectivity') {
    const display = summary.display_layers;
    if (row.receptor_key) return {collection: collection(display.receptors.features.filter(f => f.id === row.receptor_key)), ref: {group_id: group, kind: 'receptors', key: row.receptor_key}};
    if (row.node_key) return {collection: collection(display.nodes.features.filter(f => f.id === row.node_key)), ref: {group_id: group, kind: 'nodes', key: row.node_key}};
    if (row.segment_key) return {collection: collection(display.segments.features.filter(f => f.id === row.segment_key)), ref: {group_id: group, kind: 'segments', key: row.segment_key}};
    if (row.source_way_key || row.left_way_key) {
      const keys = [row.source_way_key, row.left_way_key, row.right_way_key].filter(Boolean);
      return {collection: collection(display.segments.features.filter(f => keys.includes(f.properties.source_way_key))), ref: {group_id: group, kind: 'ways', key: keys[0]}};
    }
  }
  return null;
}
function SourceRecords({table, group, summary, onLocate}) {
  const [page, setPage] = useState(0), [query, setQuery] = useState('');
  const rows = query ? table.rows.filter(row => row.some(cell => cell.includes(query))) : table.rows;
  const pages = Math.max(1, Math.ceil(rows.length / 12)), active = Math.min(page, pages - 1);
  return <div className="source-preparation-records">
    <label>查找原编号或字段内容<input aria-label="查找来源准备记录" value={query} onChange={event => {setQuery(event.target.value); setPage(0);}}/></label>
    <p className="evidence-note">完整 {table.rows.length} 条 × {table.fields.length} 字段；当前匹配 {rows.length} 条。空项、真零、False与未采用分别保留。</p>
    <div className="source-preparation-table-scroll"><table><thead><tr>{table.fields.map(field => <th key={field} scope="col">{field}</th>)}{group !== 'weather-cross-format' && <th scope="col">来源定位</th>}</tr></thead><tbody>
      {rows.slice(active * 12, (active + 1) * 12).map((cells, index) => {
        const raw = Object.fromEntries(table.fields.map((field, i) => [field, cells[i]])), target = rowLocation(group, summary, raw);
        return <tr key={active * 12 + index}>{cells.map((cell, i) => <td key={i}>{cell === '' ? <span className="missing-cell">空项</span> : cell}</td>)}{group !== 'weather-cross-format' && <td>{target?.collection.features.length ? <button className="text-button" onClick={() => onLocate(target.collection, target.ref)}>定位来源支持</button> : <span className="missing-cell">本组无对应显示几何</span>}</td>}</tr>;
      })}
    </tbody></table></div>
    <div className="source-preparation-pager"><button disabled={active === 0} onClick={() => setPage(active - 1)}>上一页</button><span>{active + 1} / {pages}</span><button disabled={active + 1 === pages} onClick={() => setPage(active + 1)}>下一页</button></div>
  </div>;
}
export function SourceCoverageLegend({group}) {
  if (group === 'micro-source-overlay') return <div className="source-coverage-legend" aria-label="来源覆盖图例"><p>来源覆盖类别 · 动作未采用</p>{[
    ['#79a7df', '屋顶投影 ∩ 硬类分类'], ['#f2b36d', '屋顶投影 ∩ 植被分类（待解释）'], ['#b2b8e8', '无屋顶投影的植被分类'], ['#aeb8c1', '无屋顶投影的硬类复核'], ['#f2b36d', '道路分区线支持（零面积）'],
  ].map(([color, label]) => <span key={label}><i style={{background: color}}/>{label}</span>)}<small>m² / m沿用EPSG:32648原值；地图显示为EPSG:4326。来源覆盖不表示可改地面或权限。</small></div>;
  if (group === 'road-source-connectivity') return <div className="source-coverage-legend" aria-label="道路来源图例"><p>2021原来源参考 · 非公共步行网络</p><span><i style={{background: '#78b9ec'}}/>原相邻段</span><span><i style={{background: '#c7e9ff'}}/>原节点</span><span><i style={{background: '#f2b36d'}}/>六候选受体（未挂接）</span><small>平面米制来源EPSG:32648；显示为EPSG:4326。原节点与线不吸附、不补边、不认证通行。</small></div>;
  return null;
}
function SelectedSource({group, summary, reference, onLocate}) {
  if (!reference || reference.group_id !== group) return null;
  const lookup = group === 'micro-source-overlay' ? summary.selectionLookup : summary.selection_lookup;
  let value = lookup?.[reference.kind]?.[reference.key];
  if (group === 'micro-source-overlay' && reference.kind === 'overlaps') value = lookup.overlaps.find(row => row.first_source_key + '|' + row.second_source_key === reference.key);
  if (!value) return <p className="evidence-note">所选来源身份未出现在本组已核验记录中，未用当前场地属性替代。</p>;
  const locationRow = group === 'road-source-connectivity' && reference.kind === 'receptors' ? {receptor_key: reference.key}
    : group === 'road-source-connectivity' && reference.kind === 'ways' ? {source_way_key: reference.key}
    : value.cell || value.source_row || value;
  const target = rowLocation(group, summary, locationRow);
  return <section className="source-preparation-selection" aria-label="所选来源对象"><h3>所选来源的完整关系</h3><p className="source-path">{reference.key}</p>{target?.collection.features.length > 0 && <button className="text-button" onClick={() => onLocate(target.collection, reference)}>定位所选来源支持</button>}<details open><summary>原字段、关联与未采用值</summary><RawFields value={value}/></details></section>;
}
function WeatherHours({summary}) {
  return <details className="source-preparation-hours"><summary>逐小时候选 · 24条源标签与四格式出处</summary><p className="evidence-note">下面的时刻是来源标签。真实场地时间仍为空；查看不会生成引擎forcing。</p>{summary.hourly_rows.map(row => <details key={row.key}><summary>{row.display.time_label} · {row.display.air_temperature} · {row.display.wind_speed}</summary><p>{row.display.precipitation_depth}；{row.display.accumulation_duration}</p><h4>完整35字段（原字符串）</h4><RawFields value={row.raw}/><h4>四格式原成员与行号</h4><RawFields value={row.source_bindings}/><RawFields value={row.source_zip_reference}/></details>)}</details>;
}

export default function SourcePreparationEvidence({registrations = [], views = {}, currentRegistrations = [], currentViews = {}, error = '', mode = 'summary', busy = false, onAdopt, onOpen, onExportJson, onShowGroup, onHideMap, onLocate, onError, reviewGroup = '', selectedReference = null}) {
  const [selected, setSelected] = useState(() => selectedReference?.group_id || reviewGroup || registrations[0]?.group_id || currentRegistrations[0]?.group_id || 'micro-source-overlay');
  useEffect(() => {if (selectedReference?.group_id && GROUPS[selectedReference.group_id]) setSelected(selectedReference.group_id); else if (GROUPS[reviewGroup]) setSelected(reviewGroup);}, [reviewGroup, selectedReference]);
  useEffect(() => {if (!registrations.some(item => item.group_id === selected) && !currentRegistrations.some(item => item.group_id === selected)) {const first = registrations[0] || currentRegistrations[0]; if (first) setSelected(first.group_id);}}, [registrations, currentRegistrations, selected]);
  const adoptedIds = new Set(registrations.map(item => item.registration_id));
  const pending = currentRegistrations.some(item => !adoptedIds.has(item.registration_id));
  const registration = registrations.find(item => item.group_id === selected) || currentRegistrations.find(item => item.group_id === selected);
  const view = registration && (views[selected]?.registration?.registration_id === registration.registration_id ? views[selected] : currentViews[selected]?.registration?.registration_id === registration.registration_id ? currentViews[selected] : null);
  const group = GROUPS[selected], summary = view?.summary;
  const downloadChecked = (bytes, name, type) => {try {download(bytes, name, type);} catch (failure) {onError?.(failure.message);}};
  return <section className="source-preparation-evidence"><h3>三组来源准备审阅</h3><p>{registrations.length} / 3组已接纳，可独立随工程保存、JSON和ZIP重开。</p>
    {error && <p role="alert" className="evidence-note">当前来源准备未接纳：{error}</p>}
    {pending && <button className="secondary full" disabled={busy || !!error} onClick={onAdopt}>接纳三组来源准备</button>}
    {mode === 'summary' ? <><p className="evidence-note">核心范围是否重复计面积、天气表示是否被误作驱动、道路来源是否被误作服务网络，分别查看原件与待核边界。</p><button className="text-button" onClick={onOpen}>审阅三组来源与完整原件</button></> : <>
      <div className="source-preparation-tabs" aria-label="来源准备分组">{Object.entries(GROUPS).map(([id, item]) => <button key={id} aria-pressed={selected === id} disabled={!registrations.some(r => r.group_id === id) && !currentRegistrations.some(r => r.group_id === id)} onClick={() => setSelected(id)}>{item.title}</button>)}</div>
      {view ? <>
        <h3>{group.question}</h3><p className="source-preparation-count">{group.count}</p><p className="muted">{group.limit}</p>
        <p className="evidence-note">{adoptedIds.has(registration.registration_id) ? '本工程已接纳只读审阅副本。' : '当前是已核验的待接纳来源副本；尚未写入工程。'}来源样例 E4125_N33891，独立于当前场地层及既有五组成果。</p>
        {(selected !== 'weather-cross-format' || reviewGroup) && <div className="source-preparation-map-actions">{selected !== 'weather-cross-format' && <button className="secondary" aria-pressed={reviewGroup === selected} onClick={() => onShowGroup(selected)}>查看来源地图</button>}{reviewGroup && <button className="text-button" onClick={onHideMap}>关闭来源地图</button>}</div>}
        {reviewGroup === selected && <SourceCoverageLegend group={selected}/>}
        <SelectedSource group={selected} summary={summary} reference={selectedReference} onLocate={onLocate}/>
        {selected === 'weather-cross-format' && <WeatherHours summary={summary}/>}
        {selected === 'road-source-connectivity' && <details><summary>六受体的原最小平面间距（不表示可达性）</summary>{summary.source_planar_minimums.map(row => <details key={row.receptor_key}><summary>{row.receptor_id} · {row.display_distance_m} m</summary><RawFields value={row}/></details>)}<p className="evidence-note">3.98、30.80、27.60、16.97、14.42、7.10 m分别保留。均未用于吸附、步行路由或服务计算。</p></details>}
        <h3>完整原件与原记录</h3><p className="muted">全部原字段、原字符串空项及版本分别保留。下方程序原件仅供下载审阅，不作为可运行研究入口。</p>
        <div className="source-list">{view.sources.map(source => {
          const original = view.files[source.path], kind = source.file_kind || source.path.split('.').at(-1);
          return <details key={source.path}><summary>{source.path.split('/').at(-1)}<small>{source.bytes.toLocaleString('zh-CN')} bytes · {kind}</small></summary><p className="source-path">{source.path}</p><dl><dt>原SHA256</dt><dd>{source.sha256}</dd><dt>原件身份与字段清单</dt><dd>{JSON.stringify(source, null, 2)}</dd></dl>
            <button className="text-button" disabled={busy || !view.raw?.[source.path]} onClick={() => downloadChecked(view.raw[source.path], source.path, mime(source))}>下载原字节副本</button>
            {kind === 'csv' ? <SourceRecords key={source.path} table={original} group={selected} summary={summary} onLocate={onLocate}/> : ['json', 'geojson'].includes(kind) ? <pre>{JSON.stringify(original, null, 2)}</pre> : kind === 'md' ? <pre>{original}</pre> : kind === 'py' ? <p className="evidence-note">原脚本已保留且可下载；本平台未执行它或追读其外部引用。</p> : <p className="evidence-note">本原件以完整字节保留，未在页面执行或替代科研接受值。</p>}
          </details>;
        })}</div>
        <div className="source-preparation-downloads"><button className="text-button" disabled={busy} onClick={() => {try {downloadChecked(sourcePreparationArchiveBytes(registration), selected + '_来源准备.zip', 'application/zip');} catch (failure) {onError?.(failure.message);}}}>下载本组完整来源ZIP</button><button className="text-button" disabled={busy} onClick={() => {try {downloadChecked(sourcePreparationManifestBytes(registration), '来源准备三组接入清单_20261006.json', 'application/json');} catch (failure) {onError?.(failure.message);}}}>下载31件原接入清单</button></div>
        <details><summary>软件审阅范围与独立接入回执</summary><RawFields value={{registration_id: registration.registration_id, schema_version: registration.schema_version, archive: registration.archive, manifest_source: registration.manifest_source, adapter_receipt: registration.adapter_receipt}}/><pre>{JSON.stringify(selected === 'micro-source-overlay' ? summary.summary : {...summary, hourly_rows: undefined, display_layers: undefined, selection_lookup: undefined}, null, 2)}</pre></details>
      </> : <p className="empty-note">当前组尚未完成原件字节与语义核验。已有工程和原科学状态保留。</p>}
      <p className="evidence-note">新场地预测、物理仿真、舒适度、实际服务、公平性、最少面积搜索、候选生成、排序和规划响应均未开放。来源地图不会写回场景或科学属性。</p><button className="secondary full" disabled={busy} onClick={onExportJson}>导出工程JSON</button>
    </>}
  </section>;
}
