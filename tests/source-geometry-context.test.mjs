import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GEOMETRY_SOURCE_CATALOG, GEOMETRY_SOURCE_ALIASES, GEOMETRY_SOURCE_MANIFEST } from '../src/source-geometry-catalog.js';
import { parseSupplementCsv } from '../src/supplement-state.js';
import { parseStrictPreparationJson } from '../src/preparation-state.js';
import { validateWindowGeometry } from '../src/source-geometry-window.js';
import { validateSourceMarks } from '../src/source-geometry-marks.js';

const root = new URL('../../', import.meta.url);
const P = '共享接口/服务链准备/窗口与源连通范围诊断_20261006/';
const M = '共享接口/服务链准备/入口与开放空间来源标记_20261006/';
const D = '共享接口/来源几何与对象三组交接/窗内外显示准备/';
const sha = b => createHash('sha256').update(b).digest('hex');
const before = new Map();
function fixture(group) {
  const registration = structuredClone(GEOMETRY_SOURCE_CATALOG.find(r => r.group_id === group)), sources = registration.source_group.source_files, raw = {}, files = {}, tables = {};
  for (const source of sources) {
    const bytes = readFileSync(new URL(source.path, root)); before.set(source.path, sha(bytes));
    assert.equal(bytes.length, source.bytes); assert.equal(sha(bytes), source.sha256); raw[source.path] = new Uint8Array(bytes);
    if (/\.(json|geojson)$/.test(source.path)) files[source.path] = parseStrictPreparationJson(bytes.toString('utf8'));
    else if (source.path.endsWith('.csv')) files[source.path] = parseSupplementCsv(bytes.toString('utf8'));
    else if (/\.(md|py)$/.test(source.path)) files[source.path] = bytes.toString('utf8');
    if (registration.source_group.primary_tables.some(t => t.path === source.path)) tables[source.path] = files[source.path];
  }
  return {registration,sources,raw,files,tables};
}
const windowSource = fixture('window_source_connectivity'), markSource = fixture('OSM_source_marks');
const copy = structuredClone;
function cell(view, path, field, value, row = 0) { const t = view.tables[path], i = t.fields.indexOf(field); assert.ok(i >= 0); t.rows[row][i] = value; }

test('GC01 原43件明确来源与清单SHA、CSV BOM原字节、当前11主表完整保留', () => {
  const bytes = readFileSync(new URL(GEOMETRY_SOURCE_MANIFEST.path, root)); assert.equal(bytes.length, GEOMETRY_SOURCE_MANIFEST.bytes); assert.equal(sha(bytes), GEOMETRY_SOURCE_MANIFEST.sha256);
  assert.equal(before.size, 43);
  let bomCount = 0;
  for (const v of [windowSource, markSource]) for (const s of v.sources) if (s.path.endsWith('.csv')) { const b = v.raw[s.path]; assert.deepEqual([...b.subarray(0,3)], [239,187,191]); bomCount++; assert.equal(v.files[s.path].fields[0].startsWith('\uFEFF'), false); }
  assert.equal(bomCount, 12); assert.equal(Object.keys(windowSource.tables).length, 8); assert.equal(Object.keys(markSource.tables).length, 3);
});

test('GC02 窗口真实8表与190原显示要素，全FK/原参数链/分量/全部CSV行几何保真且输入不变', () => {
  const snapshot = copy(windowSource), v = validateWindowGeometry(windowSource); assert.deepEqual(windowSource, snapshot);
  assert.deepEqual(v.summary.counts, {inside_fragments:45,outside_fragments:53,original_nodes:81,boundary_cuts:11,parent_segments:87,ways:17,components:{inside:2,outside:8,full:1}});
  assert.equal(Object.keys(v.selectionLookup.segments).length, 98); assert.equal(Object.keys(v.selectionLookup.nodes).length, 92);
  for (const [key,count] of Object.entries({insideFragments:45,outsideFragments:53,originalNodes:81,boundaryCuts:11})) assert.equal(v.displayCollections[key].features.length, count);
  assert.strictEqual(v.displayCollections.insideFragments, windowSource.files[D + '窗内来源片段_WGS84.geojson']);
  for (const f of v.displayCollections.boundaryCuts.features) { assert.equal(f.properties.source_osm_node_id, null); assert.equal(f.properties.raw_source_row.source_node_key, ''); assert.equal(f.properties.raw_source_row.source_osm_node_id, ''); }
  assert.ok(Object.values(v.summary.operation_gates).every(x => x === false));
});

test('GC03 严格21/22、11父段失败与首次失败仍合法只读接纳；B05/B06共同原节点在南窗外3.84米且672米仅分支总长', () => {
  const v = validateWindowGeometry(windowSource), bridge = v.summary.bridge_original_node;
  assert.deepEqual(v.summary.strict_checks, {passed:21,failed:1,strict_failed_parent_segments:11}); assert.equal(v.summary.strict_audit.all_passed, false); assert.equal(v.summary.first_failure.all_passed, false);
  assert.equal(bridge.source_osm_node_id, '3538911123'); assert.equal(bridge.inside_or_on_context, 'False'); assert.equal(Number(bridge.source_point_distance_to_context_m).toFixed(2), '3.84');
  const support = v.selectionLookup.outsideComponents.outside_component_03.row; assert.equal(support.outside_length_m, '672.0242134200864'); assert.equal(v.summary.branch_component_length_is_route_distance, false);
  assert.deepEqual(JSON.parse(bridge.direct_original_fragment_evidence_json).map(e => e.boundary_display_label), ['B05','B06']);
});

test('GC04 原节点、裁切点和父段FK错位必须拒绝；不按裸ID或坐标合并', () => {
  let v = copy(windowSource); cell(v,P+'窗内派生原段.csv','from_derived_node_key','3538911123'); assert.throws(() => validateWindowGeometry(v), /FK/);
  v = copy(windowSource); cell(v,P+'派生节点与原身份.csv','source_osm_node_id','0'); assert.throws(() => validateWindowGeometry(v), /未知空值/);
  v = copy(windowSource); cell(v,P+'窗内派生原段.csv','parent_source_segment_key','foreign/source_segment/0'); assert.throws(() => validateWindowGeometry(v), /FK/);
});

test('GC05 窗界点/窗内片段/显示坐标边界不可漂移或伪装入口', () => {
  let v = copy(windowSource); cell(v,P+'派生节点与原身份.csv','y_m','3389400.01'); assert.throws(() => validateWindowGeometry(v), /范围|边界/);
  v = copy(windowSource); cell(v,P+'窗界位置与分量关系.csv','public_entrance_id','B01'); assert.throws(() => validateWindowGeometry(v), /未知空值/);
  v = copy(windowSource); v.files[D+'窗内来源片段_WGS84.geojson'].features[0].geometry.coordinates[0][0] += 0.0001; assert.throws(() => validateWindowGeometry(v), /回投/);
});

test('GC06 全图1分量不能替代窗内2；False与unknown不可补零/接受；foot=yes access=no并存', () => {
  let v = copy(windowSource); cell(v,P+'派生节点与原身份.csv','inside_component_id','inside_component_01', v.tables[P+'派生节点与原身份.csv'].rows.findIndex(r => r[v.tables[P+'派生节点与原身份.csv'].fields.indexOf('inside_component_id')] === 'inside_component_02')); assert.throws(() => validateWindowGeometry(v), /分量/);
  for (const [field,value] of [['route_or_service_run','True'],['bridge_raw','0'],['legal_walk_connection','False']]) { v = copy(windowSource); cell(v,P+'窗内派生原段.csv',field,value); assert.throws(() => validateWindowGeometry(v)); }
  v = copy(windowSource); const t = v.tables[P+'窗内派生原段.csv']; const index = t.rows.findIndex(r => r[t.fields.indexOf('source_feature_id')] === 'w587601045'); cell(v,P+'窗内派生原段.csv','access_raw','yes',index); assert.throws(() => validateWindowGeometry(v), /冲突/);
});

test('GC07 数值容差与严格失败不可改为全通过、删首失败或静默减少11失败', () => {
  for (const change of [v => v.files[P+'独立范围核查.json'].all_passed = true, v => v.files[P+'独立范围核查_首次精确等价失败.json'].all_passed = true, v => v.files[P+'独立范围核查.json'].strict_exact_geometry_failures.pop()]) { const v = copy(windowSource); change(v); assert.throws(() => validateWindowGeometry(v), /严格|首次/); }
});

test('GC08 标记真实5表示4对象/窗内4表示3对象与9关系完整，只显示原GeoJSON，历史4件不进入主表', () => {
  const snapshot = copy(markSource), v = validateSourceMarks(markSource); assert.deepEqual(markSource, snapshot);
  assert.deepEqual(v.summary.counts, {source_geometry_representations:5,unique_source_objects:4,context_display_representations:4,context_unique_objects:3,exact_existing_node_matches:2,point_park_projection_relations:9,retained_unaccepted_schema_files:4});
  assert.strictEqual(v.displayCollections.sourceMarks, markSource.files[M+'准备窗内来源标记_WGS84.geojson']); assert.equal(v.displayCollections.sourceMarks.features.length, 4);
  assert.deepEqual(v.displayCollections.sourceMarks.features.map(f => f.geometry.type).sort(), ['LineString','MultiPolygon','Point','Point']); assert.equal(Object.keys(v.selectionLookup.objects).length, 4); assert.equal(v.summary.all_nine_subjects_outside_park_projection, true);
  assert.ok(Object.values(v.summary.operation_gates).every(x => x === false));
});

test('GC09 同公园way线面双表示共一对象，拆为两个公园、重复表示或历史表混入拒绝', () => {
  let v = copy(markSource); cell(v,M+'入口与开放空间来源标记.csv','source_object_key','fake-second-park',4); assert.throws(() => validateSourceMarks(v), /FK/);
  v = copy(markSource); v.tables[M+'入口与开放空间来源标记.csv'].rows[4][0] = v.tables[M+'入口与开放空间来源标记.csv'].rows[3][0]; assert.throws(() => validateSourceMarks(v), /主键/);
  v = copy(markSource); v.tables[M+'初始未接受字段版本/入口与开放空间来源标记.csv'] = v.files[M+'初始未接受字段版本/入口与开放空间来源标记.csv']; assert.throws(() => validateSourceMarks(v), /历史/);
});

test('GC10 最后编辑Unix与正确UTC须分列，快照2021年初不替换最后编辑，raw_tags JSON原字符串保留', () => {
  const result = validateSourceMarks(markSource), row = Object.values(result.selectionLookup.marks)[0].row; assert.equal(row.object_last_edit_raw_unix_seconds, '1564976546'); assert.equal(row.object_last_edit_utc, '2019-08-05T03:42:26+00:00'); assert.equal(result.summary.source_snapshot_utc, '2021-01-01T21:42:03Z');
  let v = copy(markSource); cell(v,M+'入口与开放空间来源标记.csv','object_last_edit_utc','1564976546'); assert.throws(() => validateSourceMarks(v), /UTC/);
  v = copy(markSource); cell(v,M+'入口与开放空间来源标记.csv','object_last_edit_utc','2021-01-01T21:42:03+00:00'); assert.throws(() => validateSourceMarks(v), /UTC/);
});

test('GC11 两个exact81来源节点与各自完整原way必须保留，不能按坐标或裸OSM编号联结', () => {
  let v = copy(markSource); cell(v,M+'入口与开放空间来源标记.csv','existing81_source_node_key','5612731872',1); assert.throws(() => validateSourceMarks(v), /身份/);
  v = copy(markSource); cell(v,M+'入口与开放空间来源标记.csv','existing_source_way_ids_json','["w100288828"]',1); assert.throws(() => validateSourceMarks(v), /集合/);
});

test('GC12 六受体跨组映射只用冻结审阅full SHA-layer-ID alias，裸ID/同ID其他资产/伪alias拒绝', () => {
  const review = parseStrictPreparationJson(readFileSync(new URL('共享接口/来源几何与对象三组交接/55534ca2095418c3/独立接入审阅.json',root),'utf8')); assert.deepEqual(GEOMETRY_SOURCE_ALIASES, review.cross_group_receiver_key_alias_evidence);
  const v = validateSourceMarks(markSource); assert.equal(Object.keys(v.selectionLookup.receptors).length, 6); assert.deepEqual(Object.values(v.selectionLookup.aliases), GEOMETRY_SOURCE_ALIASES);
  for (const key of ['H1', GEOMETRY_SOURCE_ALIASES[0].source_mark_relation_subject_key.replace('6e852b','000000')]) { const bad = copy(markSource); cell(bad,M+'源标记及候选受体与开放空间投影关系.csv','subject_key',key,3); assert.throws(() => validateSourceMarks(bad), /身份|裸ID/); }
  const bad = copy(markSource); bad.registration.adapter_receipt.receiver_key_aliases[0].SVF_receptor_key = 'H1'; assert.throws(() => validateSourceMarks(bad), /别名/);
});

test('GC13 3源点6受体面外显式False、合法/路线/服务未知空值与GeoJSON null不可补0或准入', () => {
  for (const [field,value] of [['source_point_covered_by_area_projection','True'],['source_point_covered_by_area_projection','false'],['route_distance_m','0'],['legal_connection','True'],['service_value','0']]) { const bad = copy(markSource); cell(bad,M+'源标记及候选受体与开放空间投影关系.csv',field,value); assert.throws(() => validateSourceMarks(bad)); }
  const bad = copy(markSource); bad.files[M+'准备窗内来源标记_WGS84.geojson'].features[0].properties.actual_entrance_role = 0; assert.throws(() => validateSourceMarks(bad), /空值/);
});

test('GC14 原geometry/所有properties/readback来源SHA和准入声明不可伪造', () => {
  let v = copy(markSource); v.files[M+'准备窗内来源标记_WGS84.geojson'].features[2].geometry.coordinates[0][0] += 0.001; assert.throws(() => validateSourceMarks(v), /几何/);
  v = copy(markSource); v.sources[0].sha256 = '0'.repeat(64); assert.throws(() => validateSourceMarks(v), /SHA/);
  v = copy(markSource); v.files[M+'来源提取与回读.json'].graph_attachment_or_destination_adopted = true; assert.throws(() => validateSourceMarks(v), /准入/);
});

test('GC15 所有43原件读取前后SHA保持，无原件写回，无生产器/模型/网络或浏览器执行', () => {
  for (const [path, hash] of before) assert.equal(sha(readFileSync(new URL(path, root))), hash, path);
});
