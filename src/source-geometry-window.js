import proj4 from 'proj4';
import { GEOMETRY_SOURCE_CATALOG } from './source-geometry-catalog.js';

const GROUP = GEOMETRY_SOURCE_CATALOG.find(r => r.group_id === 'window_source_connectivity').source_group;
const P = '共享接口/服务链准备/窗口与源连通范围诊断_20261006/';
const D = '共享接口/来源几何与对象三组交接/窗内外显示准备/';
const NS = 'window_source_geometry@sha256:a37f973304bdabe0fa7b0f08318acaebe44045727bf559536d14dcd294b3d99e';
const NODE_NS = 'osm_snapshot@sha256:d83436cd414db196d164fc35990910d6369347c6c47192ed6d79ffcfb2335f78/nodes';
const WAY_NS = 'chengdu_highways_210101@sha256:56f276ba8b8c69e52a0f70ceb7312d7900394da1dff41b5d1598b6fc163b18fb/features';
const UTM = '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs';
const BOUNDS = [412300, 3388900, 412800, 3389400];
const STATE = 'floating_precision_qualified_strict_equals_failed';
const STRICT_CHECK = '87_partitions_geometry_union_equals_original_no_extra_edges';
const ok = (condition, message) => { if (!condition) throw new Error('窗口来源几何：' + message); };
const same = (a, b, message) => ok(a === b, message);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))])) : value);
const equal = (a, b, label) => same(canonical(a), canonical(b), label);
const setEqual = (a, b, label) => ok(a.length === b.length && new Set(a).size === a.length && a.every(k => b.includes(k)), label);
const num = (value, label) => { ok(typeof value === 'string' && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)), label + '须为原数值字符串'); return Number(value); };
const near = (a, b, label, tol = 1e-8) => ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol, label + '数值对应');
const bool = (value, label) => { ok(value === 'True' || value === 'False', label + '须保留True/False字符串'); return value === 'True'; };
const blank = (row, fields) => { for (const field of fields) same(row[field], '', field + '未知空值不可升级'); };
function json(value, label) { try { return JSON.parse(value); } catch { throw new Error('窗口来源几何：' + label + 'JSON单元无效'); } }
function array(value, label) { const a = json(value, label); ok(Array.isArray(a) && new Set(a).size === a.length, label + '完整唯一数组'); return a; }
function line(wkt) {
  const m = /^LINESTRING \(([^()]+)\)$/.exec(wkt); ok(m, '原LineString WKT');
  const coords = m[1].split(',').map(pair => pair.trim().split(/\s+/).map(Number));
  ok(coords.length === 2 && coords.every(c => c.length === 2 && c.every(Number.isFinite)), '原相邻段两个端点'); return coords;
}
function rows(view, name) {
  const path = P + name, spec = GROUP.primary_tables.find(t => t.path === path), table = view.tables?.[path];
  ok(spec && object(table), path + '主表缺失'); equal(table.fields, spec.columns, path + '全部字段与顺序');
  ok(Array.isArray(table.rows) && table.rows.length === spec.rows, path + '全部行');
  if (view.files[path] !== undefined) equal(table, view.files[path], path + '双视图一致');
  const result = table.rows.map(cells => { ok(Array.isArray(cells) && cells.length === spec.columns.length && cells.every(c => typeof c === 'string'), path + '所有原字符串单元'); return Object.fromEntries(spec.columns.map((f, i) => [f, cells[i]])); });
  ok(result.every(r => r[spec.primary_key_columns[0]] !== '') && new Set(result.map(r => r[spec.primary_key_columns[0]])).size === spec.rows, path + '完整唯一主键'); return result;
}
function sourceView(view) {
  ok(object(view) && object(view.files) && object(view.tables) && Array.isArray(view.sources), '完整只读视图');
  setEqual(view.sources.map(s => s.path), GROUP.source_files.map(s => s.path), '22份明确来源');
  for (const s of view.sources) { const e = GROUP.source_files.find(x => x.path === s.path); same(s.sha256, e.sha256, s.path + '冻结SHA'); same(s.bytes, e.bytes, s.path + '字节长度'); if (view.raw?.[s.path]) same(view.raw[s.path].byteLength, e.bytes, s.path + '原字节'); }
  setEqual(Object.keys(view.tables), GROUP.primary_tables.map(s => s.path), '仅8张主表');
  for (const f of GROUP.source_files) if (/\.(md|py)$/i.test(f.path)) ok(typeof view.files[f.path] === 'string', f.path + '原文本');
  if (view.registration) { same(view.registration.group_id, GROUP.group_id, '登记组身份'); equal(view.registration.source_group, GROUP, '登记原组声明'); }
}
function components(edges, nodes, side, expectedCount) {
  const adjacency = new Map();
  for (const e of edges) for (const [a, b] of [[e.from_derived_node_key, e.to_derived_node_key], [e.to_derived_node_key, e.from_derived_node_key]]) { if (!adjacency.has(a)) adjacency.set(a, new Set()); adjacency.get(a).add(b); }
  const visited = new Set(), sets = [];
  for (const start of adjacency.keys()) { if (visited.has(start)) continue; const queue = [start], member = []; visited.add(start); for (let i = 0; i < queue.length; i++) { const key = queue[i]; member.push(key); for (const next of adjacency.get(key)) if (!visited.has(next)) { visited.add(next); queue.push(next); } } sets.push(member); }
  same(sets.length, expectedCount, side + '原引用分量计数');
  const field = side === 'full' ? 'full_partition_component_id' : side + '_component_id';
  const labels = sets.map(keys => { const labels = [...new Set(keys.map(k => nodes.get(k)[field]))]; same(labels.length, 1, side + '分量标签一致'); ok(labels[0] !== '', side + '分量身份'); return labels[0]; });
  same(new Set(labels).size, expectedCount, side + '不同分量不可共标签');
  for (const e of edges) if (side !== 'full') same(e.derived_side_component_id, nodes.get(e.from_derived_node_key)[field], '片段与端点分量');
  for (const n of nodes.values()) same(n[field] !== '', adjacency.has(n.derived_node_key), side + '节点分量覆盖');
  return Object.fromEntries(sets.map((keys, i) => [labels[i], keys]));
}
function display(view, name, sourceName, key, list, type) {
  const fc = view.files[D + name]; ok(object(fc) && fc.type === 'FeatureCollection', name + 'FeatureCollection');
  same(fc.coordinate_crs, 'EPSG:4326', '显示坐标系'); same(fc.measurement_crs, 'EPSG:32648', '量测坐标系'); same(fc.adoption_state, 'source_geometry_review_only', '只读显示状态');
  const map = new Map(list.map(r => [r[key], r])); setEqual(fc.features.map(f => f.id), [...map.keys()], name + '全部原对象');
  const source = GROUP.source_files.find(s => s.path === P + sourceName);
  for (const f of fc.features) {
    const p = f.properties, row = map.get(f.id); ok(f.type === 'Feature' && object(p) && f.geometry?.type === type, name + '原几何类型');
    equal(p.raw_source_row, row, '完整原CSV行/空值'); same(p[key], f.id, '显示完整主键'); same(p.source_table, source.path, '表来源'); same(p.source_table_sha256, source.sha256, '表SHA'); same(p.source_CSV_line_1based, list.indexOf(row) + 2, '原CSV行号');
    same(p.source_geometry_review_state, STATE, '保留严格失败'); same(p.public_walk_or_route_adopted, false, '公共路径不准入'); same(p.source_only, true, '仅来源');
    const utm = type === 'Point' ? [[num(row.x_m, 'x'), num(row.y_m, 'y')]] : line(row.geometry_wkt), shown = type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates;
    same(shown.length, utm.length, '原端点数');
    shown.forEach((coordinate, i) => { ok(Array.isArray(coordinate) && coordinate.length === 2 && coordinate.every(Number.isFinite) && Math.abs(coordinate[0]) <= 180 && Math.abs(coordinate[1]) <= 90, 'WGS坐标'); const back = proj4('EPSG:4326', UTM, coordinate); near(back[0], utm[i][0], '显示回投x', 1e-6); near(back[1], utm[i][1], '显示回投y', 1e-6); });
  }
  return fc;
}

// Saved adjacency and partition consistency only; this creates no new network or route.
export function validateWindowGeometry(view) {
  sourceView(view);
  const inside = rows(view, '窗内派生原段.csv'), outside = rows(view, '窗外来源支撑段.csv'), nodes = rows(view, '派生节点与原身份.csv'), parents = rows(view, '逐原段裁切记录.csv'), boundaries = rows(view, '窗界位置与分量关系.csv'), supports = rows(view, '窗外分量连接支撑.csv'), evidence = rows(view, '跨窗分量共同源节点证据.csv'), ways = rows(view, '逐way保存几何长度核对.csv');
  const nodeMap = new Map(nodes.map(r => [r.derived_node_key, r])), parentMap = new Map(parents.map(r => [r.parent_source_segment_key, r])), all = [...inside, ...outside], edgeMap = new Map(all.map(r => [r.derived_segment_key, r]));
  same(edgeMap.size, 98, '98片段无重复');
  const originals = nodes.filter(n => n.node_kind === 'original_OSM_node_reference'), cuts = nodes.filter(n => n.node_kind === 'derived_boundary_clip_point_not_OSM_node'); same(originals.length, 81, '81原节点'); same(cuts.length, 11, '11非OSM裁切点');
  for (const n of nodes) {
    same(n.derived_namespace, NS, '派生独立命名空间'); same(n.geometry_crs, 'EPSG:32648', '节点量测CRS'); blank(n, ['public_walk_node_verified', 'same_grade_verified']);
    const x = num(n.x_m, '节点x'), y = num(n.y_m, '节点y'), inWindow = x >= BOUNDS[0] && x <= BOUNDS[2] && y >= BOUNDS[1] && y <= BOUNDS[3]; same(bool(n.inside_or_on_context, '节点窗内'), inWindow, '准备窗范围');
    same(bool(n.on_context_boundary_exact, '节点边界'), inWindow && (x === BOUNDS[0] || x === BOUNDS[2] || y === BOUNDS[1] || y === BOUNDS[3]), '边界精确关系');
    const pkeys = array(n.parent_source_segment_keys_json, '节点父段'), params = json(n.clip_only_source_parameters_json, '父段参数'); ok(pkeys.every(k => parentMap.has(k)), '节点父段FK'); setEqual(params.map(p => p.source_segment_key), pkeys, '父段参数关联');
    for (const p of params) ok(Number.isFinite(p.linear_parameter_0_to_1) && p.linear_parameter_0_to_1 >= 0 && p.linear_parameter_0_to_1 <= 1, '原段线性参数');
    if (originals.includes(n)) { ok(/^\d+$/.test(n.source_osm_node_id), '原OSM ID'); same(n.source_node_key, NODE_NS + '/' + n.source_osm_node_id, '原SHA节点身份'); same(n.derived_node_key, NS + '/original_node/' + n.source_osm_node_id, '原节点引用身份'); same(n.boundary_display_label, '', '原节点非裁切标签'); }
    else { blank(n, ['source_node_key', 'source_osm_node_id']); ok(n.derived_node_key.startsWith(NS + '/boundary_clip_point/') && /^B(?:0[1-9]|1[01])$/.test(n.boundary_display_label), '裁切独立身份'); same(n.on_context_boundary_exact, 'True', '裁切边界'); same(pkeys.length, 1, '裁切仅单父段不可凭坐标合并'); }
  }
  setEqual(cuts.map(n => n.boundary_display_label), Array.from({length:11}, (_, i) => 'B' + String(i + 1).padStart(2, '0')), '11边界标签');
  for (const e of all) {
    const parent = parentMap.get(e.parent_source_segment_key), a = nodeMap.get(e.from_derived_node_key), b = nodeMap.get(e.to_derived_node_key); ok(parent && a && b && a !== b, '片段父段/端点完整FK');
    same(e.derived_namespace, NS, '线派生命名空间'); same(e.side, inside.includes(e) ? 'inside' : 'outside', '窗内外表与side'); ok(e.derived_segment_key.startsWith(NS + '/' + e.side + '/'), '片段独立身份'); same(e.geometry_crs, 'EPSG:32648', '线CRS');
    same(e.source_way_key, parent.source_way_key, '父段way'); same(e.source_feature_id, parent.source_feature_id, '父段ID'); same(e.parent_source_segment_index_0based, parent.source_segment_index_0based, '父段原顺序');
    blank(e, ['legal_walk_connection', 'bridge_raw', 'tunnel_raw', 'layer_raw']); same(e.legal_walk_state, 'not_verified', '合法状态'); same(e.route_or_service_run, 'False', '路线未运行'); same(e.source_component_id_before_clip, 'source_component_01', '原来源分量');
    const points = line(e.geometry_wkt); equal(points[0], [num(a.x_m, '端点x'), num(a.y_m, '端点y')], '起端点原坐标'); equal(points[1], [num(b.x_m, '端点x'), num(b.y_m, '端点y')], '终端点原坐标'); near(Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]), num(e.fragment_length_m, '片段长度'), '片段长度');
    const t0 = num(e.source_linear_start_0_to_1, '原参数起'), t1 = num(e.source_linear_end_0_to_1, '原参数终'); ok(t0 >= 0 && t1 <= 1 && t1 > t0, '单原段正参数范围');
    const mid = points[0].map((n, i) => (n + points[1][i]) / 2), contained = points.every(c => c[0] >= BOUNDS[0] && c[0] <= BOUNDS[2] && c[1] >= BOUNDS[1] && c[1] <= BOUNDS[3]); if (e.side === 'inside') ok(contained, '窗内线完整范围'); else ok(!(mid[0] > BOUNDS[0] && mid[0] < BOUNDS[2] && mid[1] > BOUNDS[1] && mid[1] < BOUNDS[3]), '窗外无正窗内长度');
    if (e.source_feature_id === 'w587601045') { same(e.foot_raw, 'yes', 'foot=yes原标签'); same(e.access_raw, 'no', 'access=no冲突保留'); } else blank(e, ['foot_raw', 'access_raw']);
  }
  const comp = {inside:components(inside, nodeMap, 'inside', 2), outside:components(outside, nodeMap, 'outside', 8), full:components(all, nodeMap, 'full', 1)};
  for (const p of parents) {
    same(p.source_way_key, WAY_NS + '/' + p.source_feature_id, '父段完整way'); same(p.parent_source_segment_key, p.source_way_key + '/source_segment/' + p.source_segment_index_0based, '父段身份/顺序');
    const fragments = all.filter(e => e.parent_source_segment_key === p.parent_source_segment_key).sort((a, b) => num(a.source_linear_start_0_to_1, 't') - num(b.source_linear_start_0_to_1, 't')); ok(fragments.length > 0, '每原段有片段'); near(num(fragments[0].source_linear_start_0_to_1, 't0'), 0, '原段起'); near(num(fragments.at(-1).source_linear_end_0_to_1, 't1'), 1, '原段终');
    for (let i = 1; i < fragments.length; i++) { near(num(fragments[i-1].source_linear_end_0_to_1, 't'), num(fragments[i].source_linear_start_0_to_1, 't'), '原参数闭合'); same(fragments[i-1].to_derived_node_key, fragments[i].from_derived_node_key, '单原段引用链'); }
    for (const side of ['inside', 'outside']) { const list = fragments.filter(f => f.side === side); same(num(p[side + '_positive_fragment_count'], '父段数量'), list.length, '父段片段数'); near(num(p[side + '_positive_length_m'], '父段长度'), list.reduce((s, f) => s + num(f.fragment_length_m, '片段长度'), 0), '父段分侧长度'); }
    near(num(p.original_length_m, '原长'), num(p.inside_positive_length_m, '内长') + num(p.outside_positive_length_m, '外长'), '原段长度闭合'); same(p.length_closure_passed, 'True', '数值闭合状态'); ok(num(p.length_closure_abs_error_m, '误差') <= num(p.length_closure_tolerance_m, '容差') && num(p.length_closure_tolerance_m, '容差') === 1e-8, '声明原容差'); same(p.clipped_for_review_only, 'True', '仅裁切审阅'); same(p.planar_intersections_noded, 'False', '不吸附平面交叉');
  }
  for (const b of boundaries) { const n = nodeMap.get(b.boundary_node_key); ok(n && cuts.includes(n), '边界完整FK'); for (const f of ['boundary_display_label','node_kind','source_node_key','source_osm_node_id','x_m','y_m','geometry_crs','parent_source_segment_keys_json','inside_component_id','outside_component_id','full_partition_component_id']) same(b[f], n[f], '边界原身份 ' + f); blank(b, ['public_entrance_id','legal_crossing_verified']); same(b.relation_semantics, 'geometric_window_boundary_only_not_entrance', '非入口'); }
  for (const s of supports) {
    const members = outside.filter(e => e.derived_side_component_id === s.outside_component_id), bs = boundaries.filter(b => b.outside_component_id === s.outside_component_id), touching = [...new Set(bs.map(b => b.inside_component_id))]; same(s.derived_namespace, NS, '窗外支撑命名空间'); same(num(s.outside_fragment_count, '分量片段数'), members.length, '分量完整数'); setEqual(array(s.outside_fragment_keys_json, '分量成员'), members.map(e => e.derived_segment_key), '分量完整成员'); setEqual(array(s.source_way_keys_json, '分量way'), [...new Set(members.map(e => e.source_way_key))], '分量原way'); setEqual(array(s.boundary_node_keys_json, '边界'), bs.map(b => b.boundary_node_key), '分量边界'); setEqual(array(s.boundary_display_labels_json, '标签'), bs.map(b => b.boundary_display_label), '分量标签'); setEqual(array(s.touching_inside_component_ids_json, '内分量'), touching, '相接内分量'); same(num(s.touching_inside_component_count, '内分量数'), touching.length, '内分量数量'); same(bool(s.bridges_different_inside_source_components, '支撑布尔'), touching.length > 1, '来源支撑并非路径'); near(num(s.outside_length_m, '分量长度'), members.reduce((sum, e) => sum + num(e.fragment_length_m, '片段长度'), 0), '分量总来源长度'); blank(s, ['legal_access_verified']); same(s.interpretation, 'held_outside_source_support_not_public_path_or_service_extension', '非服务延伸');
  }
  for (const w of ways) { same(w.source_way_key, WAY_NS + '/' + w.source_feature_id, 'way身份'); same(w.passed, 'True', 'way长度核查'); for (const side of ['inside','outside']) near(num(w['sum_derived_' + side + '_length_m'], 'way分侧长'), all.filter(e => e.side === side && e.source_way_key === w.source_way_key).reduce((s, e) => s + num(e.fragment_length_m, '片段长'), 0), 'way全部分侧长度'); near(num(w.saved_GPKG_full_length_m, 'GPKG全长'), num(w.sum_original_segment_length_m, '原段总长'), 'way全长'); near(num(w.saved_GPKG_inside_length_m, 'GPKG内长'), num(w.sum_derived_inside_length_m, '内长'), 'way内长'); near(num(w.saved_GPKG_outside_length_m, 'GPKG外长'), num(w.sum_derived_outside_length_m, '外长'), 'way外长'); }
  setEqual(ways.map(w => w.source_way_key), [...new Set(parents.map(p => p.source_way_key))], '17way全部集合');
  const bridge = evidence[0], bridgeNode = nodeMap.get(bridge.original_node_reference_key); ok(bridgeNode && originals.includes(bridgeNode), '共同原节点FK'); for (const f of ['source_node_key','source_osm_node_id','x_m','y_m','geometry_crs','inside_or_on_context','outside_component_id']) same(bridge[f], bridgeNode[f], '共同原节点原字段'); same(bridge.source_osm_node_id, '3538911123', '共同原ID'); same(bridge.inside_or_on_context, 'False', '共同原节点窗外'); near(num(bridge.source_point_distance_to_context_m, '窗外间距'), BOUNDS[1] - num(bridge.y_m, 'y'), '南窗外3.84米'); same(bridge.evidence_kind, 'explicit_original_node_adjacency_not_shortest_route', '非最短路径'); blank(bridge, ['public_walk_or_grade_certified']);
  const direct = json(bridge.direct_original_fragment_evidence_json, '共同原节点直接证据'); setEqual(direct.map(e => e.boundary_display_label), ['B05','B06'], 'B05/B06直接证据'); for (const d of direct) { const e = edgeMap.get(d.outside_fragment_key), b = boundaries.find(b => b.boundary_node_key === d.boundary_node_key); ok(e && b && [e.from_derived_node_key,e.to_derived_node_key].includes(bridge.original_node_reference_key) && [e.from_derived_node_key,e.to_derived_node_key].includes(b.boundary_node_key), '共同原节点实际原引用'); for (const f of ['parent_source_segment_key','source_way_key']) same(d[f], e[f], '直接证据来源'); same(d.inside_component_id, b.inside_component_id, '直接证据内分量'); near(d.fragment_length_m, num(e.fragment_length_m, '长度'), '直接证据长'); }
  const audit = view.files[P + '独立范围核查.json'], first = view.files[P + '独立范围核查_首次精确等价失败.json'], manifest = view.files[P + '窗口与源连通范围核查.json']; ok(object(audit) && object(first) && object(manifest), '原核查记录'); same(audit.geometry_review_state, STATE, '数值限定状态'); same(audit.all_passed, false, '严格失败不可变通过'); same(first.all_passed, false, '首次失败保留'); same(audit.numerical_and_identity_checks_passed, true, '数值及身份限定'); same(Object.keys(audit.checks).length, 22, '22严格核查'); equal(Object.entries(audit.checks).filter(([, v]) => v === false).map(([k]) => k), [STRICT_CHECK], '唯一保留严格失败'); equal(audit.failures, [{check:STRICT_CHECK}], '原失败清单'); equal(audit.actual_component_counts, {inside:2,outside:8,full:1}, '原核查分量');
  same(audit.per_original_segment_numeric_checks.length, 87, '逐87原段核查'); setEqual(audit.per_original_segment_numeric_checks.map(r => r.source_segment_key), [...parentMap.keys()], '87核查原身份'); const failed = audit.per_original_segment_numeric_checks.filter(r => r.full_partition_geometry_equals_original === false); same(failed.length, 11, '11原段严格失败'); equal(audit.strict_exact_geometry_failures, failed, '完整严格失败原记录'); for (const r of audit.per_original_segment_numeric_checks) { ok(typeof r.full_partition_geometry_equals_original === 'boolean', '严格结果布尔'); for (const f of ['inside_union_length_error_m','outside_union_length_error_m','fragment_length_closure_error_m','partition_original_Hausdorff_distance_m']) ok(Number.isFinite(r[f]) && r[f] >= 0 && r[f] <= 1e-8, '原数值限定'); }
  equal(manifest.context.bounds, BOUNDS, '500米正方准备窗'); same(manifest.context.area_m2, 250000, '准备窗面积'); same(manifest.summary.public_walk_network_certified, null, '公共网络未知'); same(manifest.summary.routes_OD_or_service_computed, false, '不运行');
  const insideFC = display(view, '窗内来源片段_WGS84.geojson', '窗内派生原段.csv', 'derived_segment_key', inside, 'LineString'), outsideFC = display(view, '窗外来源片段_WGS84.geojson', '窗外来源支撑段.csv', 'derived_segment_key', outside, 'LineString'), nodeFC = display(view, '原节点及裁切点_WGS84.geojson', '派生节点与原身份.csv', 'derived_node_key', nodes, 'Point');
  const by = (list, key, extra = () => ({})) => Object.fromEntries(list.map(r => [r[key], {row:r,...extra(r)}]));
  return {summary:{group_id:GROUP.group_id,source_claims:GROUP.source_claims,counts:{inside_fragments:45,outside_fragments:53,original_nodes:81,boundary_cuts:11,parent_segments:87,ways:17,components:{inside:2,outside:8,full:1}},component_members:comp,geometry_review_state:STATE,strict_checks:{passed:21,failed:1,strict_failed_parent_segments:11},strict_audit:audit,first_failure:first,bridge_original_node:bridge,branch_component_length_is_route_distance:false,operation_gates:{prediction:false,physical_cooling:false,routing_or_OD:false,service:false,equity:false,minimum_area:false,recommendation:false}},displayCollections:{insideFragments:insideFC,outsideFragments:outsideFC,originalNodes:{...nodeFC,features:nodeFC.features.filter(f => nodeMap.get(f.id).node_kind === 'original_OSM_node_reference')},boundaryCuts:{...nodeFC,features:nodeFC.features.filter(f => nodeMap.get(f.id).node_kind === 'derived_boundary_clip_point_not_OSM_node')}},selectionLookup:{segments:by(all,'derived_segment_key',r => ({parent:parentMap.get(r.parent_source_segment_key),from:nodeMap.get(r.from_derived_node_key),to:nodeMap.get(r.to_derived_node_key)})),nodes:by(nodes,'derived_node_key',r => ({segments:all.filter(e => e.from_derived_node_key === r.derived_node_key || e.to_derived_node_key === r.derived_node_key)})),boundaries:by(boundaries,'boundary_node_key'),parentSegments:by(parents,'parent_source_segment_key',r => ({fragments:all.filter(e => e.parent_source_segment_key === r.parent_source_segment_key)})),outsideComponents:by(supports,'outside_component_id'),ways:by(ways,'source_way_key',r => ({fragments:all.filter(e => e.source_way_key === r.source_way_key)})),bridgeEvidence:by(evidence,'original_node_reference_key')}};
}
