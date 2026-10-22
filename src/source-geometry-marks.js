import proj4 from 'proj4';
import { GEOMETRY_SOURCE_CATALOG, GEOMETRY_SOURCE_ALIASES } from './source-geometry-catalog.js';

const GROUP = GEOMETRY_SOURCE_CATALOG.find(r => r.group_id === 'OSM_source_marks').source_group;
const P = '共享接口/服务链准备/入口与开放空间来源标记_20261006/';
const PBF_SHA = 'd83436cd414db196d164fc35990910d6369347c6c47192ed6d79ffcfb2335f78';
const NS = 'OSM2021@sha256:' + PBF_SHA;
const NODE_NS = 'osm_snapshot@sha256:' + PBF_SHA + '/nodes';
const PARK = NS + '/way/116486191';
const UTM = '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs';
const ok = (condition, message) => { if (!condition) throw new Error('来源标记：' + message); };
const same = (a, b, label) => ok(a === b, label);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))])) : value);
const equal = (a, b, label) => same(canonical(a), canonical(b), label);
const setEqual = (a, b, label) => ok(a.length === b.length && new Set(a).size === a.length && a.every(k => b.includes(k)), label);
const num = (value, label) => { ok(typeof value === 'string' && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)), label + '须为原数值字符串'); return Number(value); };
const near = (a, b, label, tol = 1e-6) => ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol, label);
const blank = (row, fields) => { for (const field of fields) same(row[field], '', field + '未知空值不可补0或准入'); };
function json(value, label) { try { return JSON.parse(value); } catch { throw new Error('来源标记：' + label + 'JSON单元无效'); } }
function array(value, label) { const result = json(value, label); ok(Array.isArray(result) && result.every(v => typeof v === 'string') && new Set(result).size === result.length, label + '完整唯一原数组'); return result; }
function table(view, name) {
  const path = P + name, spec = GROUP.primary_tables.find(t => t.path === path), t = view.tables?.[path];
  ok(object(t), name + '主表缺失'); equal(t.fields, spec.columns, name + '所有字段与顺序'); ok(Array.isArray(t.rows) && t.rows.length === spec.rows, name + '完整行');
  if (view.files[path] !== undefined) equal(t, view.files[path], name + '双视图一致');
  const rows = t.rows.map(cells => { ok(Array.isArray(cells) && cells.length === spec.columns.length && cells.every(v => typeof v === 'string'), name + '全部原字符串'); return Object.fromEntries(spec.columns.map((f, i) => [f, cells[i]])); });
  ok(rows.every(r => r[spec.primary_key_columns[0]] !== '') && new Set(rows.map(r => r[spec.primary_key_columns[0]])).size === spec.rows, name + '唯一主键'); return rows;
}
function wktPoints(wkt, type) {
  const prefix = {Point:'POINT', LineString:'LINESTRING', MultiPolygon:'MULTIPOLYGON'}[type]; ok(prefix && wkt.startsWith(prefix + ' ('), '原WKT几何类型');
  const points = wkt.slice(prefix.length).replace(/[()]/g, '').split(',').map(p => p.trim().split(/\s+/).map(Number));
  ok(points.every(p => p.length === 2 && p.every(Number.isFinite)), '原WKT坐标'); return points;
}
function coordinatePairs(coordinates) { return typeof coordinates[0] === 'number' ? [coordinates] : coordinates.flatMap(coordinatePairs); }
function gap(point, ring) {
  return Math.min(...ring.slice(1).map((b, i) => { const a = ring[i], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx*dx + dy*dy))); return Math.hypot(point[0] - a[0] - t*dx, point[1] - a[1] - t*dy); }));
}
function sourceView(view) {
  ok(object(view) && object(view.files) && object(view.tables) && Array.isArray(view.sources), '完整只读视图');
  setEqual(view.sources.map(s => s.path), GROUP.source_files.map(s => s.path), '21明确原件含4历史');
  for (const s of view.sources) { const e = GROUP.source_files.find(x => x.path === s.path); same(s.sha256, e.sha256, s.path + '冻结SHA'); same(s.bytes, e.bytes, s.path + '原字节'); if (view.raw?.[s.path]) same(view.raw[s.path].byteLength, e.bytes, '原字节长度'); }
  setEqual(Object.keys(view.tables), GROUP.primary_tables.map(t => t.path), '仅3当前主表，历史不混入');
  for (const s of GROUP.source_files) if (/\.(md|py)$/i.test(s.path)) ok(typeof view.files[s.path] === 'string', s.path + '原文本');
  if (view.registration) { same(view.registration.group_id, GROUP.group_id, '登记组身份'); equal(view.registration.source_group, GROUP, '原组声明保留'); equal(view.registration.adapter_receipt.receiver_key_aliases, GEOMETRY_SOURCE_ALIASES, '6别名须为冻结审阅原证据'); }
}
const NUMBER_PROPS = new Set(['export_occurrence_0based','source_version','object_last_edit_raw_unix_seconds']);
function display(view, rows) {
  const fc = view.files[P + '准备窗内来源标记_WGS84.geojson']; ok(object(fc) && fc.type === 'FeatureCollection', '原来源标记GeoJSON'); same(fc.coordinate_crs, 'EPSG:4326', '显示CRS'); same(fc.measurement_crs, 'EPSG:32648', '量测CRS'); same(fc.adoption_state, 'source_candidates_not_adopted', '未准入状态');
  const candidates = rows.filter(r => r.context_relation !== 'outside_context'), map = new Map(candidates.map(r => [r.source_mark_key, r])); setEqual(fc.features.map(f => f.id), [...map.keys()], '只4窗内表示，历史/窗外不显示');
  for (const f of fc.features) {
    const row = map.get(f.id); same(f.type, 'Feature', '原Feature'); same(f.geometry.type, row.geometry_type, '原几何类型'); setEqual(Object.keys(f.properties), Object.keys(row), 'GeoJSON所有原属性');
    for (const [k, value] of Object.entries(row)) { const expected = value === '' ? null : NUMBER_PROPS.has(k) ? num(value, k) : k === 'source_geometry_valid' ? value === 'True' : value; same(f.properties[k], expected, '原属性/空值 ' + k); }
    const expected = wktPoints(row.geometry_wkt, row.geometry_type), actual = coordinatePairs(f.geometry.coordinates); same(actual.length, expected.length, '全部原坐标数');
    actual.forEach((c, i) => { ok(c.length === 2 && c.every(Number.isFinite) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90, 'WGS坐标'); const back = proj4('EPSG:4326', UTM, c); near(back[0], expected[i][0], '全部原几何x'); near(back[1], expected[i][1], '全部原几何y'); });
  }
  return fc;
}

// Source tags, unique object representations and saved planar relations only.
export function validateSourceMarks(view) {
  sourceView(view);
  const marks = table(view, '入口与开放空间来源标记.csv'), objects = table(view, '唯一源对象及导出表示.csv'), relations = table(view, '源标记及候选受体与开放空间投影关系.csv');
  const objectMap = new Map(objects.map(r => [r.source_object_key, r])), markMap = new Map(marks.map(r => [r.source_mark_key, r]));
  const expectedIDs = ['2709174920','5612731872','6682523037','116486191']; setEqual(objects.map(r => r.object_id), expectedIDs, '四个原对象ID');
  const exact = {'5612731872':['w100288828','w587600580'],'6682523037':['w100288832']};
  for (const r of marks) {
    const obj = objectMap.get(r.source_object_key); ok(obj, '表示→唯一对象FK'); same(r.source_object_key, NS + '/' + r.object_type + '/' + r.object_id, '完整原SHA对象身份'); same(r.source_mark_key, r.source_object_key + '/' + r.geometry_type, '表示与对象身份分列'); same(r.geometry_crs, 'EPSG:32648', '保存WKT量测CRS'); same(r.source_geometry_valid, 'True', '来源几何有效声明'); same(r.validity_reason, 'Valid Geometry', '原有效性原因');
    ok(/^(0|[1-9]\d*)$/.test(r.object_last_edit_raw_unix_seconds) && /^(0|[1-9]\d*)$/.test(r.source_version), '原Unix整数/版本'); same(Date.parse(r.object_last_edit_utc), num(r.object_last_edit_raw_unix_seconds, 'Unix秒') * 1000, 'UTC必须由原秒正确解释'); ok(/\+00:00$/.test(r.object_last_edit_utc), 'UTC不得误存Unix秒');
    const tags = json(r.raw_tags_json, '原标签'); ok(object(tags), '原标签对象'); same(String(tags['@id']), r.object_id, '原标签ID'); same(String(tags['@type']), r.object_type, '原标签对象类型'); same(String(tags['@version']), r.source_version, '原标签版本'); same(String(tags['@timestamp']), r.object_last_edit_raw_unix_seconds, '原编辑Unix秒');
    for (const field of ['entrance','barrier','crossing','leisure','access','foot','opening_hours']) same(r[field + '_raw'], tags[field] ?? '', '原标签 ' + field);
    array(r.mark_groups_json, '标记组'); blank(r, ['actual_public_destination','actual_entrance_role','legal_public_access','adopted_graph_connection','service_or_thermal_value']);
    for (const f of ['object_type','object_id','source_version','object_last_edit_raw_unix_seconds','object_last_edit_utc','mark_groups_json','raw_tags_json']) same(r[f], obj[f], '同一对象原字段 ' + f);
    if (exact[r.object_id]) { same(r.existing81_source_node_key, NODE_NS + '/' + r.object_id, '完整81来源节点身份'); setEqual(array(r.existing_source_way_ids_json, '原way'), exact[r.object_id], '精确原节点way集合'); same(r.context_relation, 'inside_or_on_context', '两个原节点窗内'); }
    else blank(r, ['existing81_source_node_key','existing_source_way_ids_json']);
    if (r.object_type === 'node') { same(r.geometry_type, 'Point', '原节点几何'); same(r.source_feature_id, 'n' + r.object_id, '原导出节点ID'); same(r.context_relation, r.object_id === '2709174920' ? 'outside_context' : 'inside_or_on_context', '原节点显示范围'); }
    else { same(r.source_object_key, PARK, '唯一parkway'); ok(['LineString','MultiPolygon'].includes(r.geometry_type), '同way线面表示'); same(r.context_relation, r.geometry_type === 'LineString' ? 'positive_length_context' : 'positive_area_context', '原公园窗关系'); }
  }
  setEqual(marks.map(r => r.export_occurrence_0based), ['0','1','2','3','4'], '五表示导出序号');
  for (const r of objects) { const representations = marks.filter(m => m.source_object_key === r.source_object_key); setEqual(array(r.source_feature_keys_json, '对象表示'), representations.map(m => m.source_mark_key), '对象完整表示'); setEqual(array(r.geometry_types_json, '几何类型'), representations.map(m => m.geometry_type), '对象完整类型'); setEqual(array(r.context_relations_json, '范围关系'), representations.map(m => m.context_relation), '对象完整范围'); blank(r, ['actual_destination_or_entrance','legal_public_access']); }
  const subjects = [...marks.filter(m => m.object_type === 'node').map(m => m.source_mark_key), ...GEOMETRY_SOURCE_ALIASES.map(a => a.source_mark_relation_subject_key)]; setEqual(relations.map(r => r.subject_key), subjects, '3来源点＋6完整受体身份，无裸ID合并');
  const aliases = Object.fromEntries(GEOMETRY_SOURCE_ALIASES.map(a => [a.source_mark_relation_subject_key, a])), parkRow = marks.find(m => m.geometry_type === 'MultiPolygon'), ring = wktPoints(parkRow.geometry_wkt, 'MultiPolygon');
  for (const r of relations) {
    same(r.area_source_object_key, PARK, '只一个公园源对象'); same(r.relation_key, r.subject_key + '|' + PARK, '完整关系主键'); same(r.measurement_crs, 'EPSG:32648', '平面关系量测CRS'); same(r.source_point_covered_by_area_projection, 'False', '显式False/所有点在公园投影外'); ok(num(r.source_projection_gap_m, '源面平面间隔') > 0, '窗外正间隔'); near(num(r.source_boundary_distance_m, '边界距'), num(r.source_projection_gap_m, '间隔'), '面外最小间隔与边界距'); same(r.geometry_semantics, 'raw_OSM_open_space_projection_relation_not_public_destination_or_entrance', '仅原平面关系'); blank(r, ['actual_entrance_role','legal_connection','route_distance_m','service_value']);
    if (markMap.has(r.subject_key)) { same(r.subject_type, 'source_tagged_node', '来源点角色'); near(gap(wktPoints(markMap.get(r.subject_key).geometry_wkt, 'Point')[0], ring), num(r.source_projection_gap_m, '间隔'), '原来源点与原公园全部保存坐标间隔'); }
    else { ok(aliases[r.subject_key], '冻结别名身份'); same(r.subject_type, 'candidate_receptor_not_adopted', '候选受体未升级角色'); }
  }
  const audit = view.files[P + '独立来源标记核查.json'], readback = view.files[P + '来源提取与回读.json']; ok(object(audit) && object(readback), '当前核查原件'); same(audit.pass_count, 55, '55通过'); same(audit.fail_count, 0, '0失败'); ok(audit.checks.length === 55 && audit.checks.every(c => c.passed === true), '55完整独立检查'); same(audit.first_attempt.accepted, false, '首次字段调用错误保留未接受'); same(audit.first_attempt.data_modified, false, '首次错误未改源');
  same(readback.source_sha256, PBF_SHA, '原PBF SHA'); same(readback.source_header.header.option.timestamp, '2021-01-01T21:42:03Z', '快照独立于最后编辑期'); same(readback.source_unchanged, true, '原件未改声明'); equal(readback.source_bytes_before, readback.source_bytes_after, '原声明前后SHA');
  for (const [k, expected] of Object.entries({mark_records:5,context_display_features:4,unique_source_objects:4,context_supported_unique_source_objects:3,existing81_node_ID_matches:2,source_node_and_candidate_receptor_area_relations:9,open_space_polygon_source_objects:1})) same(readback[k], expected, '表示/对象/关系数量 ' + k);
  for (const k of ['source_tag_coverage_is_complete_real_entrance_inventory','graph_attachment_or_destination_adopted','route_OD_or_service_calculated','raw_geometry_repaired','raw_source_coordinate_is_field_accuracy_proof']) same(readback[k], false, '未准入边界 ' + k);
  same(readback.unique_object_tag_counts.entrance_tag, 0, '来源无entrance标签不等于现实无入口');
  const history = GROUP.source_files.filter(f => f.role === 'retained_unaccepted_schema_history'); same(history.length, 4, '4件原未接受历史');
  const fc = display(view, marks), by = (list, key, extra = () => ({})) => Object.fromEntries(list.map(r => [r[key], {row:r,...extra(r)}]));
  return {summary:{group_id:GROUP.group_id,source_claims:GROUP.source_claims,counts:{source_geometry_representations:5,unique_source_objects:4,context_display_representations:4,context_unique_objects:3,exact_existing_node_matches:2,point_park_projection_relations:9,retained_unaccepted_schema_files:4},source_snapshot_utc:'2021-01-01T21:42:03Z',independent_audit:audit,source_header:readback.source_header,receiver_key_aliases:GEOMETRY_SOURCE_ALIASES,retained_unaccepted_history:history,all_nine_subjects_outside_park_projection:true,complete_real_entrance_inventory_verified:false,operation_gates:{prediction:false,physical_cooling:false,routing_or_OD:false,service:false,equity:false,minimum_area:false,recommendation:false}},displayCollections:{sourceMarks:fc},selectionLookup:{marks:by(marks,'source_mark_key',r => ({object:objectMap.get(r.source_object_key),relations:relations.filter(x => x.subject_key === r.source_mark_key || x.area_source_object_key === r.source_object_key)})),objects:by(objects,'source_object_key',r => ({representations:marks.filter(m => m.source_object_key === r.source_object_key),relations:relations.filter(x => x.area_source_object_key === r.source_object_key)})),relations:by(relations,'relation_key'),receptors:by(relations.filter(r => aliases[r.subject_key]),'subject_key',r => ({alias:aliases[r.subject_key]})),aliases}};
}
