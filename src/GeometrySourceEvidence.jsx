import React, {useEffect, useMemo, useState} from 'react';
import {geometrySourceArchiveBytes, geometrySourceManifestBytes} from './source-geometry-state.js';

export const GEOMETRY_GROUP_NAMES = {building_geometry_svf:'建筑几何与天空可视',window_source_connectivity:'窗口与来源连通',OSM_source_marks:'来源标记与开放空间'};
const EMPTY = {type:'FeatureCollection',features:[]};
export const EMPTY_GEOMETRY_REVIEW = Object.freeze(Object.fromEntries(['geometry_buildings','geometry_receptors','geometry_inside_fragments','geometry_outside_fragments','geometry_original_nodes','geometry_boundary_cuts','geometry_mark_areas','geometry_mark_lines','geometry_mark_points'].map(key=>[key,EMPTY])));
const LEVELS = ['360','720','1440','2880'];
const fc = features => ({type:'FeatureCollection',features});
const rawOf = value => value?.raw || value?.row || value;
const ownValues = value => Object.values(value || {});
const display = value => value === '' ? '空项（原字符串）' : value === null ? 'null（未采用 / 未知）' : value === undefined ? '本字段不适用' : typeof value === 'object' ? JSON.stringify(value) : String(value);
function RawFields({value}) {return <dl className="geometry-raw-fields">{Object.entries(value || {}).map(([key,cell])=><React.Fragment key={key}><dt>{key}</dt><dd>{display(cell)}</dd></React.Fragment>)}</dl>;}
function decorated(collection,group,kind,fields) {return {...(collection || EMPTY),features:(collection?.features || []).map(feature=>({ ...feature,properties:{...feature.properties,__geometry_group:group,__geometry_kind:kind,...fields(feature)}}))};}
function buildingOptions(view,options={}) {
  const receptors=view?.selectionLookup?.receptors || {};
  const receptorKey=receptors[options.receptorKey]?options.receptorKey:Object.keys(receptors)[0];
  const samplingN=LEVELS.includes(String(options.samplingN))?String(options.samplingN):'2880';
  const directionIndex=Math.max(0,Math.min(Number(samplingN)-1,Number.isInteger(Number(options.directionIndex))?Number(options.directionIndex):0));
  return {receptorKey,samplingN,directionIndex:String(directionIndex)};
}

/** UI-only copies: source geometries and source attributes remain unchanged. */
export function geometryReviewCollectionsFor(view,options={},reference=null) {
  if(!view) return EMPTY_GEOMETRY_REVIEW;
  const group=view.registration.group_id, layers=view.displayCollections, lookup=view.selectionLookup;
  if(group==='building_geometry_svf') {
    const chosen=buildingOptions(view,options), direction=lookup.directions[chosen.receptorKey+'|'+chosen.samplingN+'|'+chosen.directionIndex];
    const buildings=new Set(direction?.contributing_building_keys || []);
    if(reference?.group_id===group && reference.kind==='buildings')buildings.add(reference.key);
    if(reference?.group_id===group && reference.kind==='parts' && lookup.parts[reference.key])buildings.add(lookup.parts[reference.key].source_object_key);
    const receptorKeys=new Map(ownValues(lookup.receptors).map(item=>[item.display_feature,item.key]));
    return {...EMPTY_GEOMETRY_REVIEW,
      geometry_buildings:decorated(layers.buildings,group,'buildings',f=>({__geometry_key:f.properties.source_object_key,__geometry_selected:buildings.has(f.properties.source_object_key)})),
      geometry_receptors:decorated(layers.receptors,group,'receptors',f=>{const key=receptorKeys.get(f);const raw=lookup.svf[key+'|'+chosen.samplingN]?.raw;return {__geometry_key:key,__geometry_selected:key===chosen.receptorKey,__geometry_svf:raw?.horizontal_building_SVF===''||raw?.horizontal_building_SVF==null?null:Number(raw.horizontal_building_SVF)};}),
    };
  }
  if(group==='window_source_connectivity') {
    const scope=['inside','outside','full'].includes(options.windowScope)?options.windowScope:'inside';
    const selected=new Set();
    if(reference?.group_id===group) {
      if(reference.kind==='segments')selected.add(reference.key);
      for(const row of lookup[reference.kind]?.[reference.key]?.fragments || lookup[reference.kind]?.[reference.key]?.segments || [])selected.add(row.derived_segment_key);
    }
    const lineLayer=collection=>decorated(collection,group,'segments',f=>({__geometry_key:f.properties.derived_segment_key,__geometry_selected:selected.has(f.properties.derived_segment_key),__geometry_component:scope==='full'?'full_partition_component_01':f.properties.raw_source_row?.derived_side_component_id}));
    const nodeLayer=(collection,kind)=>decorated(fc(collection.features.filter(f=>scope==='full'||Boolean(f.properties.raw_source_row?.[scope+'_component_id']))),group,kind,f=>({__geometry_key:f.properties.derived_node_key,__geometry_selected:reference?.key===f.properties.derived_node_key,__geometry_component:scope==='full'?'full_partition_component_01':f.properties.raw_source_row?.[scope+'_component_id']}));
    return {...EMPTY_GEOMETRY_REVIEW,
      geometry_inside_fragments:scope==='outside'?EMPTY:lineLayer(layers.insideFragments,'inside'),
      geometry_outside_fragments:scope==='inside'?EMPTY:lineLayer(layers.outsideFragments,'outside'),
      geometry_original_nodes:nodeLayer(layers.originalNodes,'nodes'),geometry_boundary_cuts:nodeLayer(layers.boundaryCuts,'boundaries'),
    };
  }
  const selectedObject=reference?.kind==='objects'?reference.key:lookup.marks[reference?.key]?.row.source_object_key;
  const marks=layers.sourceMarks.features;
  const marksLayer=features=>decorated(fc(features),group,'marks',f=>({__geometry_key:f.properties.source_mark_key,__geometry_selected:f.properties.source_mark_key===reference?.key||f.properties.source_object_key===selectedObject}));
  return {...EMPTY_GEOMETRY_REVIEW,geometry_mark_areas:marksLayer(marks.filter(f=>['Polygon','MultiPolygon'].includes(f.geometry.type))),geometry_mark_lines:marksLayer(marks.filter(f=>['LineString','MultiLineString'].includes(f.geometry.type))),geometry_mark_points:marksLayer(marks.filter(f=>f.geometry.type==='Point'))};
}

/** Full namespace keys only. A missing source geometry never substitutes the research scene. */
export function geometryLocationFor(view,reference,options={}) {
  if(!view || reference?.group_id!==view.registration.group_id)return null;
  const group=reference.group_id, lookup=view.selectionLookup, layers=view.displayCollections;
  let features=[],nextOptions=options;
  if(reference.kind==='group')features=Object.values(geometryReviewCollectionsFor(view,options)).flatMap(c=>c.features);
  else if(group==='building_geometry_svf') {
    if(['receptors','svf','directions'].includes(reference.kind)) {
      const value=lookup[reference.kind]?.[reference.key], receptorKey=reference.kind==='receptors'?reference.key:value?.raw.receptor_key;
      const receptor=lookup.receptors[receptorKey];if(receptor)features.push(receptor.display_feature);
      if(reference.kind==='directions' && value)features.push(...value.contributing_building_keys.map(key=>lookup.buildings[key].display_feature));
    } else if(reference.kind==='buildings') {const item=lookup.buildings[reference.key];if(item)features=[item.display_feature];}
    else if(reference.kind==='parts') {const item=lookup.parts[reference.key];if(item)features=[lookup.buildings[item.source_object_key].display_feature];}
  } else if(group==='window_source_connectivity') {
    const entry=lookup[reference.kind]?.[reference.key];
    if(reference.kind!=='group')nextOptions={...options,windowScope:reference.kind==='segments'?entry?.row.side:reference.kind==='outsideComponents'?'outside':['nodes','boundaries'].includes(reference.kind)&&entry?.row[(options.windowScope || 'inside')+'_component_id']?options.windowScope || 'inside':'full'};
    if(['nodes','boundaries'].includes(reference.kind))features=[...layers.originalNodes.features,...layers.boundaryCuts.features].filter(f=>f.properties.derived_node_key===reference.key);
    else {const entry=lookup[reference.kind]?.[reference.key],keys=new Set(reference.kind==='segments'?[reference.key]:(entry?.fragments || entry?.segments || []).map(r=>r.derived_segment_key));
      if(reference.kind==='outsideComponents'&&entry)for(const key of JSON.parse(entry.row.outside_fragment_keys_json))keys.add(key);
      if(reference.kind==='bridgeEvidence'&&entry) {for(const evidence of JSON.parse(entry.row.direct_original_fragment_evidence_json))keys.add(evidence.outside_fragment_key);features.push(...layers.originalNodes.features.filter(f=>f.properties.derived_node_key===entry.row.original_node_reference_key));}
      features.push(...[...layers.insideFragments.features,...layers.outsideFragments.features].filter(f=>keys.has(f.properties.derived_segment_key)));}
  } else {
    if(reference.kind==='marks')features=layers.sourceMarks.features.filter(f=>f.properties.source_mark_key===reference.key);
    if(reference.kind==='objects')features=layers.sourceMarks.features.filter(f=>f.properties.source_object_key===reference.key);
    if(reference.kind==='relations'||reference.kind==='receptors') {const row=lookup[reference.kind]?.[reference.key]?.row;features=layers.sourceMarks.features.filter(f=>f.properties.source_mark_key===row?.subject_key||f.properties.source_object_key===row?.area_source_object_key);}
  }
  return features.length?{collection:fc([...new Set(features)]),reference,options:nextOptions}:null;
}
function referenceFromRow(group,row) {
  if(group==='building_geometry_svf') {
    if(row.direction_index_0based!==undefined)return {group_id:group,kind:'directions',key:row.receptor_key+'|'+row.sampling_N+'|'+row.direction_index_0based};
    if(row.sampling_N!==undefined)return {group_id:group,kind:'svf',key:row.receptor_key+'|'+row.sampling_N};
    if(row.source_part_key)return {group_id:group,kind:'parts',key:row.source_part_key};
    if(row.receptor_key)return {group_id:group,kind:'receptors',key:row.receptor_key};
    if(row.coarse_N)return {group_id:group,kind:'refinement',key:row.receptor_id+'|'+row.coarse_N+'|'+row.fine_N};
  } else if(group==='window_source_connectivity') {
    for(const [field,kind] of [['boundary_node_key','boundaries'],['derived_segment_key','segments'],['derived_node_key','nodes'],['parent_source_segment_key','parentSegments'],['source_way_key','ways'],['original_node_reference_key','bridgeEvidence'],['outside_component_id','outsideComponents']])if(row[field])return {group_id:group,kind,key:row[field]};
  } else {
    for(const [field,kind] of [['relation_key','relations'],['source_mark_key','marks'],['source_object_key','objects']])if(row[field])return {group_id:group,kind,key:row[field]};
  }
  return null;
}
function optionsFromRow(group,row,options) {return group==='building_geometry_svf'&&row.receptor_key?{...options,receptorKey:row.receptor_key,...(row.sampling_N?{samplingN:row.sampling_N}:{}),...(row.direction_index_0based!==undefined?{directionIndex:row.direction_index_0based}:{})}:options;}

export function GeometryRecords({path,table,view,options,onLocate,onSelectReference,historical=false}) {
  const direction=table.fields.includes('direction_index_0based'),pageSize=direction?100:50;
  const [page,setPage]=useState(0),[query,setQuery]=useState(''),[receptor,setReceptor]=useState(''),[level,setLevel]=useState(''),[index,setIndex]=useState('');
  const filtered=useMemo(()=>{const ri=table.fields.indexOf('receptor_key'),ni=table.fields.indexOf('sampling_N'),di=table.fields.indexOf('direction_index_0based');return table.rows.filter(row=>(!query||row.some(cell=>cell.includes(query)))&&(!receptor||row[ri]===receptor)&&(!level||row[ni]===level)&&(!index||row[di]===index));},[table,query,receptor,level,index]);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize)),active=Math.min(page,pages-1),group=view.registration.group_id;
  const locateRow=row=>{const ref=referenceFromRow(group,row),target=geometryLocationFor(view,ref,optionsFromRow(group,row,options));if(ref)onSelectReference?.(ref);if(target)onLocate(target.collection,target.reference,target.options);};
  return <div className="geometry-records" data-geometry-table={path} data-row-count={table.rows.length} data-field-count={table.fields.length} data-filtered-count={filtered.length} data-page-size={pageSize} data-page={active+1}>
    <label>查找原键或字段内容<input aria-label={'查找 '+path.split('/').at(-1)} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
    {direction&&<div className="geometry-filters"><label>候选点<select aria-label="方向表候选点" value={receptor} onChange={e=>{setReceptor(e.target.value);setPage(0);}}><option value="">全部六点</option>{ownValues(view.selectionLookup.receptors).map(item=><option value={item.key} key={item.key}>{item.raw.receptor_id}</option>)}</select></label><label>采样级别<select aria-label="方向表采样级别" value={level} onChange={e=>{setLevel(e.target.value);setPage(0);}}><option value="">全部四档</option>{LEVELS.map(n=><option key={n}>{n}</option>)}</select></label><label>原方向序号<input aria-label="方向表原方向序号" type="number" min="0" max="2879" value={index} onChange={e=>{setIndex(e.target.value);setPage(0);}}/></label></div>}
    <p className="evidence-note">完整 {table.rows.length.toLocaleString('zh-CN')} 条 × {table.fields.length} 原字段；匹配 {filtered.length.toLocaleString('zh-CN')} 条；每页 {pageSize} 条。原字符串、空项、True / False与真零保留。</p>
    <div className="geometry-table-scroll"><table><thead><tr>{table.fields.map(field=><th scope="col" key={field}>{field}</th>)}<th scope="col">{historical?'未接受历史（只读）':'来源定位 / 联查'}</th></tr></thead><tbody>{filtered.slice(active*pageSize,(active+1)*pageSize).map((cells,i)=>{const row=Object.fromEntries(table.fields.map((field,j)=>[field,cells[j]])),ref=historical?null:referenceFromRow(group,row),target=geometryLocationFor(view,ref,optionsFromRow(group,row,options));return <tr key={active*pageSize+i} data-source-row={table.rows.indexOf(cells)+2}>{cells.map((cell,j)=><td key={j}>{cell===''?<span className="missing-cell">空项</span>:cell}</td>)}<td>{target?<button className="text-button" onClick={()=>locateRow(row)}>定位来源并联查</button>:ref?<button className="text-button" onClick={()=>onSelectReference?.(ref)}>查看关联原记录</button>:<span className="missing-cell">{historical?'历史原字段，不联查当前地图':'本表无独立显示几何'}</span>}</td></tr>;})}</tbody></table></div>
    <div className="geometry-pager"><button disabled={!active} onClick={()=>setPage(active-1)}>上一页</button><label>页<input aria-label={'页码 '+path.split('/').at(-1)} type="number" min="1" max={pages} value={active+1} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=pages)setPage(n-1);}}/></label><span>{active+1} / {pages}</span><button disabled={active+1===pages} onClick={()=>setPage(active+1)}>下一页</button></div>
  </div>;
}
export function GeometryLegend({group,options={}}) {
  if(group==='building_geometry_svf')return <div className="geometry-legend" aria-label="建筑几何SVF固定图例"><p>水平建筑几何SVF · 固定 0–1 连续色阶</p><div className="svf-ramp"/><div className="svf-ramp-labels"><span>0</span><span>0.5</span><span>1</span></div><p>采样 {options.samplingN || '2880'}；灰色为缺失。颜色不评价优劣，也不表示温度、舒适度或物理SVF准入。</p><span><i style={{background:'#85a7b8'}}/>完整来源建筑</span><span><i style={{background:'#f1b756'}}/>所选方向最大遮挡贡献 / 所选建筑</span><small>原米制量测 EPSG:32648；地图显示 EPSG:4326。工作地面 Z=0，受体 Z=1.5 m，建筑高度为工作代理。</small></div>;
  if(group==='window_source_connectivity')return <div className="geometry-legend" aria-label="窗口来源范围图例"><p>{options.windowScope==='outside'?'窗外来源支持 · 8分量':options.windowScope==='full'?'完整保存范围 · 1分量':'窗内来源 · 2分量'}</p><span><i style={{background:'#81b9e8'}}/>分量颜色仅区分原分组</span><span><i className="geometry-cut-symbol"/>空心圆：派生窗界切点，非原OSM节点或入口</span><small>实线为窗内保存片段；虚线为窗外支持。范围切换只查看原分组，不创建步行网络、路线或OD。</small></div>;
  if(group==='OSM_source_marks')return <div className="geometry-legend" aria-label="来源标记图例"><p>来源标签与公园投影 · 角色未采用</p><span><i style={{background:'#c4afd9'}}/>同一公园way的线 / 面两种表示</span><span><i style={{background:'#e7bd83'}}/>两个源标签点，非已认证入口</span><small>窗内4表示对应3唯一对象；5全表表示对应4唯一对象。没有entrance标签不表示现实没有入口。</small></div>;
  return null;
}
function locateReference(view,ref,options,onLocate,onSelectReference) {const target=geometryLocationFor(view,ref,options);onSelectReference?.(ref);if(target)onLocate(target.collection,target.reference,target.options);}
function BuildingExplorer({view,options,onOptions,onLocate,onSelectReference}) {
  const chosen=buildingOptions(view,options),lookup=view.selectionLookup,svf=lookup.svf[chosen.receptorKey+'|'+chosen.samplingN],key=chosen.receptorKey+'|'+chosen.samplingN+'|'+chosen.directionIndex,direction=lookup.directions[key];
  const update=next=>onOptions({...options,...chosen,...next});
  return <section className="geometry-explorer" aria-label="六点四档方向审阅"><h3>六个候选点、四档采样与逐方向贡献</h3><div className="geometry-filters"><label>候选点<select aria-label="SVF候选点" value={chosen.receptorKey} onChange={e=>update({receptorKey:e.target.value})}>{ownValues(lookup.receptors).map(r=><option value={r.key} key={r.key}>{r.raw.receptor_id}</option>)}</select></label><label>采样方向数<select aria-label="SVF采样方向数" value={chosen.samplingN} onChange={e=>update({samplingN:e.target.value,directionIndex:'0'})}>{LEVELS.map(n=><option key={n}>{n}</option>)}</select></label><label>原方向序号<input aria-label="SVF原方向序号" type="number" min="0" max={Number(chosen.samplingN)-1} value={chosen.directionIndex} onChange={e=>{if(e.target.value!=='')update({directionIndex:e.target.value});}}/></label></div>
    <div className="geometry-values"><p>水平余弦权重 SVF <strong>{svf?.raw.horizontal_building_SVF}</strong></p><p>无权天空立体角诊断 <strong>{svf?.raw.unweighted_sky_solid_angle_fraction_diagnostic}</strong></p><p>无地平线上建筑方向比例 <strong>{svf?.raw.no_above_horizon_building_direction_fraction_diagnostic}</strong></p></div>
    <p className="evidence-note">三种量分别保留，后两项为诊断。方位沿UTM格网北顺时针取区间中点；不是现场真北校准。已接受受体高度、物理SVF与场景采用仍为空。</p>
    <button className="text-button" onClick={()=>locateReference(view,{group_id:view.registration.group_id,kind:'directions',key},chosen,onLocate,onSelectReference)}>定位所选方向的来源支持</button>
    <details><summary>所选SVF完整15原字段</summary><RawFields value={svf?.raw}/></details><details open><summary>所选方向完整20原字段 · {direction?.raw.azimuth_deg_grid_north_clockwise}°</summary><RawFields value={direction?.raw}/></details>
    <h4>最大遮挡贡献来源（含并列）</h4>{direction?.contributing_part_keys.length?direction.contributing_part_keys.map(partKey=>{const part=lookup.parts[partKey],b=lookup.buildings[part.source_object_key];return <div className="geometry-contributor" key={partKey}><p className="source-path">{partKey}</p><button className="text-button" onClick={()=>locateReference(view,{group_id:view.registration.group_id,kind:'parts',key:partKey},chosen,onLocate,onSelectReference)}>联查来源部件</button><button className="text-button" onClick={()=>locateReference(view,{group_id:view.registration.group_id,kind:'buildings',key:b.key},chosen,onLocate,onSelectReference)}>定位完整来源建筑</button></div>;}):<p className="evidence-note">此原方向没有地平线上建筑胜出；原空winner、角度0及cos²=1分别保留，没有补入建筑ID。</p>}
    <details><summary>已知边界与原独立检查</summary><RawFields value={view.summary.work_conditions}/><pre>{JSON.stringify(view.summary.known_failures,null,2)}</pre><p>原解析边界15例中14通过，精确角点1例失败仍保留；311项保存值独立回读不认证物理场景。加密差异有符号，仅比较来源数值，不当误差界或物理收敛。</p></details>
  </section>;
}
function WindowExplorer({view,options,onOptions,onLocate,onSelectReference}) {
  const scope=options.windowScope || 'inside',lookup=view.selectionLookup;
  const landmarks=[...ownValues(lookup.boundaries).filter(v=>['B05','B06'].includes(v.row.boundary_display_label || v.row.boundary_label || v.row.display_label)),...ownValues(lookup.nodes).filter(v=>v.row.source_osm_node_id==='3538911123')];
  // Display labels vary by table; the verified GeoJSON is the authoritative saved display binding.
  for(const f of view.displayCollections.boundaryCuts.features.filter(f=>['B05','B06'].includes(f.properties.boundary_display_label)))if(!landmarks.some(v=>v.row.boundary_node_key===f.properties.derived_node_key))landmarks.push(lookup.boundaries[f.properties.derived_node_key]);
  return <section className="geometry-explorer" aria-label="窗口三种范围审阅"><h3>同一保存范围，分别查看窗内、完整与窗外支持</h3><div className="geometry-scope-controls">{[['inside','窗内 · 2分量'],['full','完整 · 1分量'],['outside','窗外支持 · 8分量']].map(([value,label])=><button key={value} aria-pressed={scope===value} onClick={()=>onOptions({...options,windowScope:value})}>{label}</button>)}</div><p className="evidence-note">45窗内片段、53窗外片段、87原父段、81原节点和11窗界切点分别保留。完整显示由原保存分区片段构成，切点不作入口、不补原节点、不修复拓扑。</p>
    <h4>跨窗支撑示例</h4>{landmarks.filter(Boolean).map(v=>{const row=v.row,key=row.boundary_node_key || row.derived_node_key,ref={group_id:view.registration.group_id,kind:row.boundary_node_key?'boundaries':'nodes',key};return <button className="text-button" key={key} onClick={()=>locateReference(view,ref,{...options,windowScope:'full'},onLocate,onSelectReference)}>定位 {row.source_osm_node_id || row.boundary_display_label || row.boundary_label || view.displayCollections.boundaryCuts.features.find(f=>f.properties.derived_node_key===key)?.properties.boundary_display_label || key}</button>;})}
    <p>3538911123在原窗外约3.841 m。原672.024 m是分支来源分量总长，不是路线距离；没有据此证明公共步行连通。</p><details><summary>严格等值失败、完整分量与原诊断</summary><pre>{JSON.stringify({counts:view.summary.counts,component_members:view.summary.component_members,geometry_review_state:view.summary.geometry_review_state,strict_checks:view.summary.strict_checks,strict_audit:view.summary.strict_audit,first_failure:view.summary.first_failure,bridge_original_node:view.summary.bridge_original_node},null,2)}</pre><p>原严格检查21/22通过、11父段strict-equals失败，状态保留为浮点精度有条件诊断，未洗成全通过。</p></details>
  </section>;
}
function MarksExplorer({view,onLocate,onSelectReference,options}) {return <section className="geometry-explorer" aria-label="来源标记表示与身份审阅"><h3>标签表示、唯一源对象与候选关系</h3><p>窗内4个几何表示 / 3个唯一对象；完整主表5个表示 / 4个唯一对象。公园way的线和面来自同一对象，不累计为两处公园。</p>{ownValues(view.selectionLookup.objects).map(item=><details key={item.row.source_object_key}><summary>源 {item.row.object_type} {item.row.object_id} · {item.representations.length}种表示</summary><RawFields value={item.row}/><button className="text-button" onClick={()=>locateReference(view,{group_id:view.registration.group_id,kind:'objects',key:item.row.source_object_key},options,onLocate,onSelectReference)}>查看此唯一对象的全部窗内表示</button></details>)}<p className="evidence-note">两个标签点与原81节点精确匹配；这仅证明来源身份一致。9条源点 / 候选受体与公园的原平面关系均在投影外；角色、合法进入、路线与服务仍为空。</p><details><summary>六条显式SHA / layer / ID别名证据</summary><pre>{JSON.stringify(view.aliases || view.summary.receiver_key_aliases,null,2)}</pre><p>只沿此冻结别名关联完整源键，不以H1等裸ID跨表联结。</p></details><details><summary>来源版本与独立核查（含首次未接受记录）</summary><pre>{JSON.stringify(view.summary,null,2)}</pre></details></section>;}
function SelectedGeometry({view,reference,options,onLocate,onSelectReference}) {
  if(!reference || reference.group_id!==view.registration.group_id)return null;
  const value=view.selectionLookup[reference.kind]?.[reference.key];if(!value)return <p className="evidence-note">本组没有此完整源键的原记录，未用当前场景替代。</p>;
  const raw=rawOf(value),target=geometryLocationFor(view,reference,options),parts=value.part_keys?.map(key=>view.selectionLookup.parts[key].raw),directions=value.direction_keys;
  return <section className="geometry-selection" aria-label="所选来源几何对象"><h3>所选来源的完整原身份与关系</h3><p className="source-path">{reference.key}</p>{target&&<button className="text-button" onClick={()=>onLocate(target.collection,reference,target.options)}>定位所选来源支持</button>}<RawFields value={value.display_feature?.properties || raw}/>{value.display_feature&&value.raw&&<details><summary>对应CSV完整原字段</summary><RawFields value={value.raw}/></details>}{value.display_feature&&<details><summary>原几何全部坐标</summary><pre>{JSON.stringify(value.display_feature.geometry,null,2)}</pre></details>}
    {parts&&<details><summary>此来源建筑的 {parts.length} 个原部件（完整19字段）</summary>{parts.map(part=><details key={part.source_part_key}><summary>{part.source_part_key}</summary><RawFields value={part}/><button className="text-button" onClick={()=>locateReference(view,{group_id:view.registration.group_id,kind:'parts',key:part.source_part_key},options,onLocate,onSelectReference)}>联查此部件</button></details>)}</details>}
    {directions&&<p className="evidence-note">关联 {directions.length} 条原方向。完整方向记录在主表分页 / 完整源键筛选中可读，不在所选面板重复展开32,400条。</p>}
    {value.direction_keys_by_sampling&&<p>关联四档方向数：{Object.entries(value.direction_keys_by_sampling).map(([n,keys])=>`${n}: ${keys.length}`).join('；')}。四档SVF在上方候选点审阅中分别可读。</p>}
    {view.registration.group_id!=='building_geometry_svf'&&<details><summary>关联原行与完整关系</summary><pre>{JSON.stringify(value,null,2)}</pre></details>}
  </section>;
}
function download(bytes,name,type) {if(!bytes)throw new Error('此原件字节尚未通过核验。');const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name.split('/').at(-1);a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const MIME={csv:'text/csv;charset=utf-8',json:'application/json',geojson:'application/geo+json',md:'text/markdown;charset=utf-8',py:'text/plain;charset=utf-8',txt:'text/plain;charset=utf-8',png:'image/png',svg:'image/svg+xml',gpkg:'application/geopackage+sqlite3',obj:'text/plain;charset=utf-8'};
function GeometrySourceFile({source,view,options,onLocate,onSelectReference,onDownload}) {
  const [open,setOpen]=useState(false),original=view.files[source.path],primary=view.tables[source.path],kind=source.format || source.path.split('.').at(-1);
  return <details className="geometry-source-file" data-geometry-source={source.path} data-source-role={source.role} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{source.path.split('/').at(-1)}<small>{source.bytes.toLocaleString('zh-CN')} bytes · {kind}{primary?' · 主表':''}</small></summary>{open&&<><p className="source-path">{source.path}</p><RawFields value={source}/><button className="text-button" onClick={()=>onDownload(view.raw[source.path],source.path,MIME[kind] || 'application/octet-stream')}>下载原字节副本</button>{kind==='csv'?<GeometryRecords path={source.path} table={original} view={view} options={options} onLocate={onLocate} onSelectReference={onSelectReference} historical={source.role==='retained_unaccepted_schema_history'}/>:['json','geojson'].includes(kind)?<pre>{JSON.stringify(original,null,2)}</pre>:['md','txt','obj'].includes(kind)?<pre>{original}</pre>:kind==='py'?<p className="evidence-note">原程序仅供下载审阅。本平台未执行程序或追读外部来源。</p>:<p className="evidence-note">二进制 / 图像原件完整字节可下载，不以显示预览替代原件哈希。</p>}</>}</details>;
}

export default function GeometrySourceEvidence({registrations=[],views={},currentRegistrations=[],currentViews={},error='',mode='summary',busy=false,onAdopt,onOpen,onExportJson,onShowGroup,onHideMap,onLocate,onError,onOptions,onSelectReference,reviewGroup='',selectedReference=null,options={}}) {
  const [selected,setSelected]=useState(()=>selectedReference?.group_id || reviewGroup || registrations[0]?.group_id || currentRegistrations[0]?.group_id || 'building_geometry_svf');
  useEffect(()=>{if(selectedReference?.group_id)setSelected(selectedReference.group_id);else if(reviewGroup)setSelected(reviewGroup);},[reviewGroup,selectedReference]);
  const adopted=new Set(registrations.map(r=>r.registration_id)),pending=currentRegistrations.some(r=>!adopted.has(r.registration_id));
  const registration=registrations.find(r=>r.group_id===selected)||currentRegistrations.find(r=>r.group_id===selected);
  const view=registration&&(views[selected]?.registration.registration_id===registration.registration_id?views[selected]:currentViews[selected]?.registration.registration_id===registration.registration_id?currentViews[selected]:null);
  const checkedDownload=(bytes,name,type)=>{try{download(bytes,name,type);}catch(failure){onError?.(failure.message);}};
  const history=view?.sources.filter(s=>s.role==='retained_unaccepted_schema_history') || [],current=view?.sources.filter(s=>s.role!=='retained_unaccepted_schema_history') || [];
  return <section className="geometry-evidence"><h3>来源几何与对象审阅</h3><p>{registrations.length} / 3组已接纳。72个原件（其中4件未接受历史）、16张主表与32,834条主记录分别保留。</p>{error&&<p role="alert" className="evidence-note">当前几何来源未接纳：{error}</p>}{pending&&<button className="secondary full" disabled={busy||!!error} onClick={onAdopt}>接纳三组来源几何与对象</button>}
    {mode==='summary'?<><p className="evidence-note">建筑几何能说明什么、窗外来源支持如何相连、标签点是否真实入口，分别沿原保存值审阅；物理与服务应用未开放。</p><button className="text-button" onClick={onOpen}>审阅三组几何与完整原件</button></>:<>
      <div className="geometry-tabs" aria-label="来源几何分组">{Object.entries(GEOMETRY_GROUP_NAMES).map(([id,title])=><button key={id} aria-pressed={selected===id} disabled={!registrations.some(r=>r.group_id===id)&&!currentRegistrations.some(r=>r.group_id===id)} onClick={()=>setSelected(id)}>{title}</button>)}</div>
      {view?<><h3>{selected==='building_geometry_svf'?'固定建筑背景能说明哪些几何天空可视条件？':selected==='window_source_connectivity'?'窗内隔开的来源，是否在完整保存范围共享原节点？':'原标签是否足以认定真实入口与公共开放空间？'}</h3><p className="evidence-note">{adopted.has(registration.registration_id)?'本工程已接纳只读来源副本。':'当前为已核验的待接纳副本，尚未写入工程。'}来源固定为E4125_N33891，与当前场景、31件来源准备及旧登记独立。</p>
        <div className="geometry-map-actions"><button className="secondary" aria-pressed={reviewGroup===selected} onClick={()=>onShowGroup(selected)}>查看来源几何地图</button>{reviewGroup&&<button className="text-button" onClick={onHideMap}>关闭来源几何地图</button>}</div>{reviewGroup===selected&&<GeometryLegend group={selected} options={options}/>}
        {selected==='building_geometry_svf'?<BuildingExplorer view={view} options={options} onOptions={onOptions} onLocate={onLocate} onSelectReference={onSelectReference}/>:selected==='window_source_connectivity'?<WindowExplorer view={view} options={options} onOptions={onOptions} onLocate={onLocate} onSelectReference={onSelectReference}/>:<MarksExplorer view={view} options={options} onLocate={onLocate} onSelectReference={onSelectReference}/>}
        <SelectedGeometry view={view} reference={selectedReference} options={options} onLocate={onLocate} onSelectReference={onSelectReference}/>
        <h3>本组完整原件与原字段</h3><p className="evidence-note">{view.sources.length} 件完整原件；{Object.keys(view.tables).length} 张当前主表，共 {Object.values(view.tables).reduce((n,t)=>n+t.rows.length,0).toLocaleString('zh-CN')} 条。主表可查全部字段、逐页跳转；程序仅下载，不执行。</p><div className="geometry-source-list">{current.map(source=><GeometrySourceFile key={source.path} source={source} view={view} options={options} onLocate={onLocate} onSelectReference={onSelectReference} onDownload={checkedDownload}/>)}</div>
        {!!history.length&&<section className="geometry-history" aria-label="未接受历史版本"><h3>4件未接受历史字段版本（独立保留）</h3><p>历史原件可读与下载；不会混入当前主表、地图、通过计数或采用状态。</p>{history.map(source=><GeometrySourceFile key={source.path} source={source} view={view} options={options} onLocate={onLocate} onSelectReference={onSelectReference} onDownload={checkedDownload}/>)}</section>}
        <div className="geometry-downloads"><button className="text-button" disabled={busy} onClick={()=>{try{checkedDownload(geometrySourceArchiveBytes(registration),selected+'_完整来源.zip','application/zip');}catch(failure){onError?.(failure.message);}}}>下载本组完整来源ZIP</button><button className="text-button" disabled={busy} onClick={()=>{try{checkedDownload(geometrySourceManifestBytes(registration),'来源几何与对象三组接入清单_20261006.json','application/json');}catch(failure){onError?.(failure.message);}}}>下载72件原接入清单</button></div>
        <details><summary>原组声明与独立软件接入回执</summary><RawFields value={{schema_version:registration.schema_version,registration_id:registration.registration_id,group_id:registration.group_id,archive:registration.archive,manifest_source:registration.manifest_source,source_group:registration.source_group,adapter_receipt:registration.adapter_receipt}}/><pre>{JSON.stringify(view.summary,null,2)}</pre></details>
      </>:<p className="empty-note">本组尚未完成原字节、成员与语义核验；现有工程与科学状态保留。</p>}
      <p className="evidence-note">来源几何审阅不会改写场景、受体、温度或研究状态。新场地预测、物理仿真、实际服务、公平性、候选生成、排序、最少面积搜索与规划响应仍未开放。</p><button className="secondary full" disabled={busy} onClick={onExportJson}>导出工程JSON</button>
    </>}
  </section>;
}
