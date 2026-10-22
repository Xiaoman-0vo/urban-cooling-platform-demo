/**
 * Pure semantic review of the frozen micro source-overlay group.
 * Original bytes/SHA, archive members and CRC are checked by the envelope layer.
 * Native geometry proofs are retained as source claims, not re-run here. In
 * particular, this module never calculates area/length from display lon/lat,
 * reads a referenced native source, executes a producer or adopts an action.
 */
const PREFIX = '共享接口/微观试验准备/研究范围来源叠合_20261006/';
const MICRO_SHA = '6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4';
const ROAD_SHA = 'b5eb188e54ca04cf7d3c12ce54c35acfccde842e33edef3c18e4690bb9d479aa';
const MICRO = 'micro_scene@sha256:' + MICRO_SHA + '/';
const ROAD = 'micro_roads@sha256:' + ROAD_SHA + '/';
const AREA_TOLERANCE = 1e-6;
const LINE_TOLERANCE = 1e-7;
const OLD_README_SHA = '2a6dc919c5beb7686d732eac5f9798ca9cb083686043a445c0bb07f6d6df7c9a';
const FILES = [
  ['README.md', 6713, 'f4316011f9bb37234b1c758b12daf10c41e34b3f6c1b2d318968f75e2f760951'],
  ['build_source_scope_overlay.py', 40613, 'e024ca6cd28301a7de2d6c4153076427c785968a85a240a835a5b2a5bd2d3381'],
  ['分区与源对象正面积关系.csv', 8360, '52478e3b638004efd4af1a9e18fac0b95db2621642ce958c3528eb75c9a11783'],
  ['分区闭合与来源.csv', 8486, 'd968ffbe4138c9d7cbb3d964197dfc7fdebb1b13c0170e5f0b1150f2c235ba5e'],
  ['来源叠合分区_UTM48N.gpkg', 151552, 'aaf47c47ed9518c9ee1efbef3417439dc60ae1cc76631915abca9b157ed55846'],
  ['来源叠合分区_WGS84.geojson', 46162, '2daeab7a514e09d9e3114b32116a587abceb53e8f5532181ff7cd0754cf3a43d'],
  ['核心来源闭合与线性支持.png', 689842, '83eaf73639f488a3a0d5ac7d78733bbebfeca774dd349eb66987c9fd62a257ad'],
  ['核心来源闭合与线性支持.svg', 504071, '432f68f2370711865cf3616558fef5d2585132e95d3ad5e14c959912af82cb62'],
  ['核心来源闭合与线性支持_灰度审阅.png', 336085, 'bf68cadf12707a493c4f5580e097d6da20aaecc5dec95aef5b44cda7c4535e2a'],
  ['核查记录.json', 34806, 'd32f3d031dca48f60510af640bcd143cd437e4080af391b23a0f1226cb644eab'],
  ['根独立几何回读核查.json', 11087, '7219d18ec86f2ec921b26e6423b159bc878b249f4200b16f79bd545ba5c4be83'],
  ['源对象几何审阅.csv', 31720, '5181a72c25d4481ebecc3a28258ac8d530fcf59c2b231c7e1e1038f501730eb0'],
  ['研究动作提案_未采用.json', 1249, '9c1952f9c117b2bf5717c2ffe8a52f2d7b9b608ec9a03a1dd5e2cc6682e53b66'],
  ['跨层正面积交叠关系.csv', 671, 'fa4d8ed44ac9924b018237fe587797c2dd5aa26bdf61cf672a2acdba9f9fb10b'],
  ['道路分区线支持.csv', 2679, '84a30ccc85038a6e983651e43928117beefdf88b1a0f8716289a47ab07b0a38e'],
  ['道路分区线支持_WGS84.geojson', 8647, 'dec3c006f38d577b9b42208713c47b111b676de4d0869b445c9f5e43e3be666d'],
];
const CELL_FIELDS = ['cell_id', 'source_category', 'source_category_label', 'area_m2', 'source_keys_json', 'layer_keys_json', 'native_geometry_sha256', 'research_action_adopted', 'accepted_ground_or_road_surface', 'implementation_permission'];
const RELATION_FIELDS = ['cell_id', 'source_key', 'layer', 'area_m2', 'assignment_type'];
const SOURCE_FIELDS = ['source_key', 'layer', 'object_id', 'fid', 'source_geometry_type', 'source_valid', 'source_exact_normalized_wkb_sha256', 'core_support_relation', 'accepted_retention_rule', 'accepted_exclusion_rule', 'accepted_physical_surface', 'implementation_permission'];
const OVERLAP_FIELDS = ['first_source_key', 'second_source_key', 'overlap_area_m2', 'interpretation', 'accepted_physical_cause', 'accepted_use_or_action'];
const ROAD_FIELDS = ['source_key', 'source_layer', 'source_object_id', 'cell_id', 'source_category', 'line_support_length_m', 'line_has_area_m2', 'road_width_accepted_m', 'road_area_allocated_m2', 'research_day_snapshot_adopted', 'implementation_permission'];
const BUILDING_IDS = '151730 151738 151742 151747 151753 151754 151757 151758 153114 153115 153116 153117 153118 153119 153120 153121 153122 153123 153124 153125 153126 153127 153128 153129 153130 153131 154314 154315 154316 154317 154318 154319 154320 154321 154322 154324 154325 154326 154327 154328 155682 155683 155684 155685 155686 155687 155688 155689 155691 155693 155694 155695 155696'.split(' ');
const WAY_IDS = 'w100288826 w100288828 w100288832 w114412855 w116486217 w453873884 w587600580 w587601045 w665501095 w710790280 w710790281 w711177603 w711177604 w711177605 w711177606 w711177607 w711177615'.split(' ');
const POSITIVE_BUILDINGS = ['153124', '154319', '154320', '154322', '154324'];
const POSITIVE_WAYS = ['w100288826', 'w453873884', 'w711177606'];
const LAYER_COUNTS = Object.freeze({ core: 1, buildings_uncut: 53, vegetation_core: 3, surface_review_core: 5, overlap_review_core: 3, source_classes_context: 33, roads_2020: 17, roads_2021: 17 });
const CATEGORY_AREAS = Object.freeze({ roof_and_hard_class: 3585.2066476846894, roof_and_vegetation_class: 167.60753857181282, vegetation_without_roof: 1821.3924614281873, hard_review_without_roof: 4425.7933523153115, other_or_unassigned_source_support: 0 });
const CATEGORY_LABELS = Object.freeze({ roof_and_hard_class: '屋顶来源投影 ∩ 硬类分类', roof_and_vegetation_class: '屋顶来源投影 ∩ 植被分类（待解释）', vegetation_without_roof: '植被分类 ∖ 屋顶来源投影', hard_review_without_roof: '硬类分类 ∖ 屋顶来源投影（复核）' });
const CELL_SPECS = [
  ['roof_and_hard_class', 195.8914791423658, ['buildings_uncut/153124', 'source_classes_context/17']],
  ['hard_review_without_roof', 3816.042980640875, ['surface_review_core/H1', 'source_classes_context/17']],
  ['vegetation_without_roof', 854.1294644008201, ['buildings_uncut/154324', 'vegetation_core/c4_min0/2', 'overlap_review_core/O2', 'source_classes_context/27']],
  ['roof_and_hard_class', 811.2835065018575, ['buildings_uncut/154324', 'surface_review_core/H3', 'source_classes_context/17']],
  ['hard_review_without_roof', 4.8794808147166515, ['surface_review_core/H5', 'source_classes_context/17']],
  ['roof_and_vegetation_class', 166.73700297263292, ['buildings_uncut/154324', 'vegetation_core/c4_min0/1', 'overlap_review_core/O3', 'source_classes_context/27']],
  ['vegetation_without_roof', 955.2629970273671, ['vegetation_core/c4_min0/1', 'source_classes_context/27']],
  ['roof_and_vegetation_class', 0.8506722392663747, ['buildings_uncut/154324', 'vegetation_core/c4_min0/2', 'overlap_review_core/O2', 'source_classes_context/27']],
  ['hard_review_without_roof', 20.2906406813945, ['surface_review_core/H3', 'source_classes_context/17']],
  ['roof_and_hard_class', 144.87325268837142, ['buildings_uncut/154320', 'source_classes_context/17']],
  ['roof_and_vegetation_class', 0.019863359913529895, ['buildings_uncut/154324', 'vegetation_core/c4_min0/2', 'overlap_review_core/O1', 'source_classes_context/27']],
  ['roof_and_hard_class', 245.81526668041857, ['buildings_uncut/154319', 'source_classes_context/17']],
  ['roof_and_hard_class', 2187.343142671676, ['buildings_uncut/154322', 'source_classes_context/17']],
  ['hard_review_without_roof', 573.7136008282238, ['surface_review_core/H2', 'source_classes_context/17']],
  ['hard_review_without_roof', 10.866649350101216, ['surface_review_core/H4', 'source_classes_context/17']],
  ['vegetation_without_roof', 12, ['vegetation_core/c4_min0/3', 'source_classes_context/27']],
];
const CELL_IDS = CELL_SPECS.map((_, index) => 'S' + String(index + 1).padStart(3, '0'));
const SMALL_RELATIONS = [
  ['S003', MICRO + 'buildings_uncut/154324'],
  ['S003', MICRO + 'overlap_review_core/O2'],
  ['S004', MICRO + 'surface_review_core/H3'],
].map(([cell, source]) => cell + '|' + source);
const ROAD_SPECS = [
  ['w100288826', 'S002', 94.74476379558433], ['w100288826', 'S003', 8.40014334731939],
  ['w453873884', 'S002', 43.02587755551611], ['w453873884', 'S004', 15.572918566337698],
  ['w453873884', 'S007', 20.023925959253095], ['w711177606', 'S007', 8.368341629189635],
];
const OPERATION_GATES = Object.freeze({ prediction: false, physical_simulation: false, service_evaluation: false, fairness_evaluation: false, candidate_generation: false, ranking: false });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('微观来源叠合语义核查：' + message); };
const expect = (actual, expected, label) => { if (actual !== expected) fail(label + '与原来源身份或未采用边界不一致。'); };
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : object(value) ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const same = (actual, expected, label) => { if (canonical(actual) !== canonical(expected)) fail(label + '必须保留完整原结构/字段值。'); };
function obj(value, label) { if (!object(value)) fail(label + '必须为原对象。'); return value; }
function set(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length || new Set(actual).size !== expected.length || !expected.every(item => actual.includes(item))) fail(label + '缺失、重复或含未知身份。');
}
function finiteTree(value, depth = 0) {
  if (depth > 100 || typeof value === 'number' && !Number.isFinite(value)) fail('原JSON含非有限数值或过深结构。');
  if (Array.isArray(value)) value.forEach(item => finiteTree(item, depth + 1));
  else if (object(value)) Object.values(value).forEach(item => finiteTree(item, depth + 1));
}
function number(value, label) {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) fail(label + '须为原有限数值字符串；空项不能置零。');
  return Number(value);
}
function close(actual, expected, label, tolerance = AREA_TOLERANCE) {
  if (typeof actual !== 'number' || typeof expected !== 'number' || !Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) fail(label + '与保存的原生投影测量值不对应。');
}
function hash(value, label) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(label + '缺少原SHA256身份。'); }
function blanks(row, fields, label) { for (const field of fields) expect(row[field], '', label + '.' + field); }
function falseFields(value, fields, label) { obj(value, label); for (const field of fields) expect(value[field], false, label + '.' + field); }
function parseArray(value, label) {
  if (typeof value !== 'string') fail(label + '必须保留原JSON数组字符串。');
  let parsed; try { parsed = JSON.parse(value); } catch { fail(label + '不是原数组。'); }
  if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string')) fail(label + '必须为字符串数组。');
  return parsed;
}
function sourceMetadata(view) {
  obj(view, 'view'); obj(view.files, 'files');
  set(view.sources?.map(source => source?.path), FILES.map(([name]) => PREFIX + name), '16件显式原件');
  const sources = new Map();
  for (const [name, bytes, sha] of FILES) {
    const path = PREFIX + name, source = obj(view.sources.find(item => item.path === path), path);
    expect(source.bytes, bytes, name + '原字节数'); expect(source.sha256, sha, name + '原字节SHA');
    if ('file_kind' in source) expect(source.file_kind, name.split('.').pop(), name + '原类型');
    if ('role' in source) expect(source.role, 'source_preparation_read_only', name + '来源层级');
    sources.set(path, source);
  }
  const textNames = FILES.filter(([name]) => !/\.(png|svg|gpkg)$/.test(name)).map(([name]) => PREFIX + name);
  set(Object.keys(view.files), textNames, '12件可解析原文；图件与GPKG只用清单元数据');
  for (const path of textNames) finiteTree(view.files[path]);
  for (const name of ['README.md', 'build_source_scope_overlay.py']) if (typeof view.files[PREFIX + name] !== 'string' || !view.files[PREFIX + name]) fail(name + '须为未执行原文本。');
  return sources;
}
function table(view, sources, name, fields, count, keyFields) {
  const path = PREFIX + name, input = obj(view.files[path], name), meta = sources.get(path);
  same(input.fields, fields, name + '全部字段及顺序');
  if (!Array.isArray(input.rows) || input.rows.length !== count) fail(name + '须保留完整原行。');
  if ('columns' in meta) same(meta.columns, fields, name + '清单字段');
  if ('row_count' in meta) expect(meta.row_count, count, name + '清单行数');
  if ('column_count' in meta) expect(meta.column_count, fields.length, name + '清单列数');
  if ('primary_key_columns' in meta) same(meta.primary_key_columns, keyFields, name + '完整复合键');
  if ('primary_keys_unique' in meta) expect(meta.primary_keys_unique, true, name + '原键唯一');
  if ('raw_empty_cell_policy' in meta) expect(meta.raw_empty_cell_policy, 'preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted', name + '空项策略');
  const rows = input.rows.map(cells => {
    if (!Array.isArray(cells) || cells.length !== fields.length || !cells.every(cell => typeof cell === 'string')) fail(name + '全部单元须保持原字符串，包括空项。');
    return Object.fromEntries(fields.map((field, index) => [field, cells[index]]));
  });
  const keys = rows.map(row => keyFields.map(field => row[field]).join('|'));
  if (new Set(keys).size !== count) fail(name + '完整复合键重复。');
  return rows;
}
function sourceKeys() {
  const keys = [MICRO + 'core/E4125_N33891'];
  for (const id of BUILDING_IDS) keys.push(MICRO + 'buildings_uncut/' + id);
  for (let i = 1; i <= 3; i++) keys.push(MICRO + 'vegetation_core/c4_min0/' + i, MICRO + 'overlap_review_core/O' + i);
  for (let i = 1; i <= 5; i++) keys.push(MICRO + 'surface_review_core/H' + i);
  for (let i = 1; i <= 33; i++) keys.push(MICRO + 'source_classes_context/' + i);
  for (const year of [2020, 2021]) for (const id of WAY_IDS) keys.push(ROAD + 'roads_' + year + '/' + year + '年初/' + id);
  return keys;
}
function reviewSources(rows, producer) {
  set(rows.map(row => row.source_key), sourceKeys(), '132个版本/层/实际ID限定源键');
  const lookup = Object.create(null), layerCounts = {}, fidKeys = [];
  for (const row of rows) {
    const road = row.layer.startsWith('roads_'), expectedPrefix = road ? ROAD : MICRO;
    expect(row.source_key, expectedPrefix + row.layer + '/' + row.object_id, '源哈希/图层/variant/local ID命名空间');
    expect(row.source_geometry_type, row.layer === 'buildings_uncut' ? 'MultiPolygon' : road ? 'LineString' : 'Polygon', '完整来源几何类型');
    expect(row.source_valid, 'True', '保存源几何有效声明');
    hash(row.source_exact_normalized_wkb_sha256, '原归一化WKB哈希');
    const fid = number(row.fid, '原源FID'); if (!Number.isSafeInteger(fid) || fid < 1) fail('源FID不是原正整数。');
    fidKeys.push(row.layer + '|' + row.fid);
    const positive = row.layer === 'buildings_uncut' ? POSITIVE_BUILDINGS.includes(row.object_id) : row.layer === 'source_classes_context' ? ['17', '27'].includes(row.object_id) : road ? POSITIVE_WAYS.includes(row.object_id.split('/').pop()) : true;
    expect(row.core_support_relation, positive ? road ? 'line_or_boundary_touch' : 'positive_area' : 'outside_core', '核心支持关系');
    blanks(row, ['accepted_retention_rule', 'accepted_exclusion_rule', 'accepted_physical_surface', 'implementation_permission'], '源对象未接纳');
    layerCounts[row.layer] = (layerCounts[row.layer] || 0) + 1; lookup[row.source_key] = row;
  }
  if (new Set(fidKeys).size !== 132) fail('同层FID重复。');
  same(layerCounts, LAYER_COUNTS, '八层来源组成（不含六受体）'); same(producer.source_layer_counts, layerCounts, '原核查源层组成');
  expect(producer.source_objects_in_geometry_review, 132, '原源对象总数'); expect(producer.core_source_buildings_positive_area, 5, '核心相交建筑源对象数');
  return lookup;
}
function position(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(item => typeof item === 'number' && Number.isFinite(item)) || value[0] < -180 || value[0] > 180 || value[1] < -90 || value[1] > 90) fail('显示坐标须为有限WGS84经度/纬度，不能把UTM坐标作经纬度。');
}
function line(value, ring = false) {
  if (!Array.isArray(value) || value.length < (ring ? 4 : 2)) fail('显示线或面环缺少原坐标。');
  value.forEach(position);
  if (ring && canonical(value[0]) !== canonical(value.at(-1))) fail('来源面环未闭合。');
  if (new Set(value.slice(0, ring ? -1 : undefined).map(canonical)).size < (ring ? 3 : 2)) fail('显示几何退化。');
}
function collection(value, rows, fields, keyFields, numericFields, blankFields, label, allowedTypes) {
  obj(value, label);
  set(Object.keys(value), ['type', 'analysis_crs', 'coordinate_crs', 'area_and_length_units', 'adoption_state', 'features'], label + '原顶层字段');
  expect(value.type, 'FeatureCollection', label + '集合类型'); expect(value.analysis_crs, 'EPSG:32648', label + '原生分析CRS');
  expect(value.coordinate_crs, 'EPSG:4326 longitude_latitude', label + '显示CRS');
  expect(value.area_and_length_units, 'm2 and m measured in native EPSG:32648 before coordinate conversion', label + '量纲与测量来源');
  expect(value.adoption_state, 'pending_research_decision', label + '未采用状态');
  if (!Array.isArray(value.features) || value.features.length !== rows.length) fail(label + '须保留全部原要素。');
  const rowMap = new Map(rows.map(row => [keyFields.map(field => row[field]).join('|'), row])), featureKeys = [], geometryCounts = {};
  for (const feature of value.features) {
    obj(feature, label + '要素'); expect(feature.type, 'Feature', label + '要素类型');
    set(Object.keys(feature), ['type', 'geometry', 'properties'], label + '原要素字段');
    const properties = obj(feature.properties, label + '完整properties'); set(Object.keys(properties), fields, label + '全部源properties');
    const key = keyFields.map(field => properties[field]).join('|'), row = rowMap.get(key); if (!row) fail(label + 'properties完整复合键不能匹配CSV。');
    featureKeys.push(key);
    for (const field of fields) expect(properties[field], blankFields.includes(field) ? null : numericFields.includes(field) ? number(row[field], field) : row[field], label + '.' + field);
    const geometry = obj(feature.geometry, label + '几何'); set(Object.keys(geometry), ['type', 'coordinates'], label + '原几何字段');
    if (!allowedTypes.includes(geometry.type)) fail(label + '原面/线几何类型改变。');
    if (geometry.type === 'Polygon') {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) fail('来源面缺少环。');
      geometry.coordinates.forEach(ring => line(ring, true));
    } else if (geometry.type === 'LineString') line(geometry.coordinates);
    else if (geometry.type === 'MultiLineString') {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) fail('多线缺少路径。'); geometry.coordinates.forEach(path => line(path));
    }
    geometryCounts[geometry.type] = (geometryCounts[geometry.type] || 0) + 1;
  }
  set(featureKeys, [...rowMap.keys()], label + '全部显示/CSV键对应');
  return geometryCounts;
}
function proposals(value, producer) {
  obj(value, 'R1—R4原动作提案');
  set(Object.keys(value), ['state', 'accepted_design_scope', 'accepted_implementation_permissions', 'source_partition_is_modifiable_space', 'proposals'], '动作提案原字段');
  expect(value.state, 'pending_research_decision_not_adopted', '研究动作未采用');
  expect(value.accepted_design_scope, null, '设计范围未接纳'); expect(value.accepted_implementation_permissions, null, '实施权限未接纳');
  expect(value.source_partition_is_modifiable_space, false, '分区不自动成为可改空间');
  set(value.proposals?.map(item => item?.proposal_id), ['R1', 'R2', 'R3', 'R4'], '完整四动作提案');
  const extra = { R1: 'physical_background_accepted', R2: 'action_domain', R3: 'physical_cause', R4: 'implementation_authority' };
  for (const item of value.proposals) {
    set(Object.keys(item), ['proposal_id', 'proposal', 'adopted', extra[item.proposal_id]], item.proposal_id + '未采用字段');
    if (typeof item.proposal !== 'string' || !item.proposal) fail('原提案正文缺失。');
    expect(item.adopted, null, item.proposal_id + '动作未采用'); expect(item[extra[item.proposal_id]], null, item.proposal_id + '接受值未形成');
  }
  same(producer.action_adoption, value, '独立提案与原生产核查的完整动作对象');
}
function recordedProofs(producer, audit, sources, overlaps, roads) {
  expect(producer.artifact_kind, 'source_overlay_review_not_physical_feasible_space', '来源证据种类'); expect(producer.site_id, 'E4125_N33891', '来源样例');
  if (typeof producer.created_at !== 'string' || !Number.isFinite(Date.parse(producer.created_at))) fail('原创建时间缺失。');
  expect(producer.CRS?.analysis, 'EPSG:32648', '原证明分析CRS'); expect(producer.CRS?.GeoJSON_display, 'EPSG:4326 longitude_latitude', '原证明显示CRS');
  same(producer.tolerances, { area_m2: AREA_TOLERANCE, line_m: LINE_TOLERANCE, display_roundtrip_m: 1e-5, purpose: 'numerical auditing only; no physical precision claim', precision_grid_or_snapping_used: false, geometry_repaired_or_simplified: false, small_positive_source_polygons_dropped: false }, '数值审计容差与未删片约束');
  if (!Array.isArray(producer.sources) || producer.sources.length !== 11) fail('原11读取/保护来源记录缺失。');
  set(producer.sources.map(source => source.source_id), ['micro_scene', 'roads', 'pilot_manifest', 'existing_pixel_and_geometry_proof', 'existing_geometry_review', 'existing_pilot_builder_read_only', 'old_admission_evidence', 'original_33_slots', 'formal_micro_plan_protected', 'frozen_manifest', 'frozen_zip'], '原来源链身份');
  for (const source of producer.sources) {
    if (typeof source.path !== 'string' || !source.path) fail('原引用来源路径缺失。');
    hash(source.sha256_before, '原读取前SHA'); expect(source.sha256_after, source.sha256_before, '原读取前后SHA'); expect(source.unchanged_during_read, true, '原读取源稳定');
  }
  expect(producer.sources.find(source => source.source_id === 'micro_scene').sha256_before, MICRO_SHA, '源场地版本');
  expect(producer.sources.find(source => source.source_id === 'roads').sha256_before, ROAD_SHA, '源道路版本');
  expect(producer.sources.find(source => source.source_id === 'original_33_slots').sha256_before, 'b45c33ebf2abc770f9aa0ee10f15e1baca63fa0f5136a88a9aff3885ba4ec599', '原33槽版本引用');
  expect(producer.partition_cell_count, 16, '生产证明16分区'); close(producer.core_area_m2, 10000, '原核心面积');
  close(producer.area_closure_error_m2, 0, '原闭合误差'); close(producer.missing_or_outside_partition_area_m2, 0, '原来源缺口/越界');
  same(producer.exact_source_duplicate_groups, [], '没有原源键的严格重复组');
  if (!Array.isArray(producer.checks) || producer.checks.length !== 82 || new Set(producer.checks.map(item => item.check)).size !== 82 || producer.checks.some(item => typeof item.check !== 'string' || !item.check || item.passed !== true)) fail('原82项核查身份或状态不完整。');
  expect(producer.check_count, 82, '原检查计数'); same(producer.failed_checks, [], '原失败记录');
  const acceptance = obj(producer.physical_acceptance, '原物理接受状态');
  expect(acceptance.original_unknown_fields, 33, '原未知槽引用计数'); expect(acceptance.original_acceptances_written, 0, '未新增原接受值');
  for (const field of ['accepted_ground', 'accepted_road_faces', 'accepted_vegetation_input', 'accepted_feasible_space']) expect(acceptance[field], null, '原物理接受.' + field);
  falseFields(acceptance, ['physical_run_entry_ready', 'macro_final_Y_read', '14_frozen_package_modified'], '原物理入口与保护状态'); expect(acceptance.simulations, 0, '原仿真次数');
  expect(producer.existing_work_reuse?.old_area_values_are_regression_checks_not_new_findings, true, '旧面积仅回归对应'); expect(producer.existing_work_reuse?.old_scripts_or_plots_rerun, false, '未重跑旧研究');
  const lineProof = obj(producer.road_line_support, '原线性支持证明');
  expect(lineProof.source_lines_in_core, 6, '分期源线计数'); expect(lineProof.line_cell_relations, 12, '完整线面支持记录');
  falseFields(lineProof, ['road_faces_created', 'road_width_imputed'], '没有道路面或猜宽');
  expect(lineProof.allocated_road_area_m2, null, '原未分配道路面积'); expect(lineProof.snapshot_adopted_for_research_day, null, '研究日道路快照未采用');
  expect(lineProof.boundary_shared_support_not_summed_as_independent_length, true, '共有边界不累计独立长度');
  const roadSourceKeys = [...new Set(roads.map(row => row.source_key))]; set(lineProof.source_line_totals?.map(item => item.source_key), roadSourceKeys, '完整六分期线总量键');
  for (const item of lineProof.source_line_totals) {
    const sum = roads.filter(row => row.source_key === item.source_key).reduce((total, row) => total + number(row.line_support_length_m, '原线支持长度'), 0);
    close(item.summed_support_lengths_m, sum, '原挂接长度和', LINE_TOLERANCE);
    close(item.core_source_line_length_m, item.partition_union_line_length_m, '原线/保存线并集长度', LINE_TOLERANCE);
    close(item.actual_original_arc_support_m, item.expected_original_arc_support_m, '原弧长支持', LINE_TOLERANCE);
    close(item.shared_boundary_support_multiplicity_m, item.summed_support_lengths_m - item.partition_union_line_length_m, '原sum/union差', LINE_TOLERANCE);
    close(item.native_Hausdorff_distance_m, 0, '原Hausdorff诊断', LINE_TOLERANCE); expect(item.geometry_snapped_or_buffered, false, '原线未吸附/缓冲');
    // Nonzero strict symmetric-difference diagnostics are retained, never turned
    // into a newly inferred road gap or forced to zero by this reviewer.
    if (typeof item.strict_symmetric_difference_length_diagnostic_m !== 'number' || item.strict_symmetric_difference_length_diagnostic_m < 0) fail('严格对称差诊断缺失。');
  }
  const overlapProof = producer.cross_layer_positive_overlap_relations;
  set(overlapProof?.map(row => row.first_source_key + '|' + row.second_source_key), overlaps.map(row => row.first_source_key + '|' + row.second_source_key), '原交叠证明完整源对');
  for (const row of overlaps) {
    const proof = overlapProof.find(item => item.first_source_key === row.first_source_key && item.second_source_key === row.second_source_key);
    set(Object.keys(proof), OVERLAP_FIELDS, '原交叠证明字段');
    for (const field of OVERLAP_FIELDS) expect(proof[field], field.startsWith('accepted_') ? null : field === 'overlap_area_m2' ? number(row[field], field) : row[field], '交叠原表/证明.' + field);
  }
  const outputNames = FILES.filter(([name]) => !['核查记录.json', '根独立几何回读核查.json'].includes(name)).map(([name]) => name);
  set(producer.outputs?.map(output => output.path?.split('/').pop()), outputNames, '历史生产14输出身份');
  for (const output of producer.outputs) {
    const name = output.path.split('/').pop();
    expect(output.sha256, name === 'README.md' ? OLD_README_SHA : sources.get(PREFIX + name).sha256, '生产历史输出SHA（README历史版本分列）');
  }
  falseFields(producer.format_only_followup, ['geometry_recomputed', 'data_values_changed'], '原格式补正');
  expect(producer.map_style_and_accessibility?.small_geometry_removed, false, '图件未删小面'); expect(producer.map_style_and_accessibility?.map_ready_for_publication, false, '图件未发表准入');
  const readback = obj(producer.final_saved_artifact_readback, '原保存回读');
  same(readback.CSV_counts, { '分区闭合与来源.csv': 16, '源对象几何审阅.csv': 132, '道路分区线支持.csv': 12, '跨层正面积交叠关系.csv': 2 }, '原回读表计数'); same(readback.GeoJSON_counts, [16, 12], '原回读显示计数');
  expect(readback.partition_unknown_acceptances_blank, true, '原分区接受值为空'); expect(readback.original_33_still_all_null, true, '原33槽空值声明'); expect(readback.new_physical_acceptances, 0, '原新增物理接受值为零');
  expect(audit.auditor, 'root_independent_saved_geometry_readback', '独立几何回读身份'); expect(audit.status, 'pass_source_geometry_only', '独立证明只接受来源几何');
  expect(audit.producer_script_called, false, '独立回读未执行producer'); expect(audit.inputs_and_outputs_before_after_unchanged, true, '独立回读前后稳定');
  expect(audit.native_CRS, 'EPSG:32648', '独立分析CRS'); expect(audit.saved_partition_faces, 16, '独立16面'); expect(audit.saved_road_line_supports, 12, '独立12线'); expect(audit.saved_source_objects, 132, '独立132源');
  close(audit.core_area_m2, 10000, '独立核心面积'); close(audit.pairwise_overlap_area_m2, 0, '独立面重复'); close(audit.core_coverage_symmetric_difference_m2, 0, '独立覆盖');
  expect(audit.source_keys_and_csv_nulls_match, true, '独立源键/原空值'); expect(audit.numerical_tolerances_do_not_establish_physical_accuracy, true, '容差不确立物理精度');
  expect(audit.accepted_research_action, null, '独立动作未接受'); expect(audit.accepted_feasible_surface, null, '独立可改地面未接受'); expect(audit.simulation_or_recommendation_verified, false, '独立未验仿真/推荐');
  if (!Array.isArray(audit.read_identities) || audit.read_identities.length !== 22 || new Set(audit.read_identities.map(item => item.path)).size !== 22) fail('独立22条原引用身份不完整。');
  for (const identity of audit.read_identities) {
    if (typeof identity.path !== 'string' || !Number.isSafeInteger(identity.bytes) || identity.bytes <= 0) fail('独立引用字节/路径缺失。'); hash(identity.sha256, '独立原引用SHA');
    const known = [...sources.values()].find(source => identity.path.endsWith('/' + source.path));
    if (known) { expect(identity.sha256, known.sha256, '独立已纳入原件SHA'); expect(identity.bytes, known.bytes, '独立已纳入原件bytes'); }
  }
  set(audit.category_reconstruction?.map(item => item.category), Object.keys(CATEGORY_AREAS), '独立五类重构引用');
  for (const item of audit.category_reconstruction) {
    close(item.saved_area_m2, CATEGORY_AREAS[item.category], '独立保存类别面积'); close(item.reconstructed_area_m2, item.saved_area_m2, '独立原重构面积对应');
  }
  set(audit.six_snapshot_line_source_reconstructions?.map(item => item.source_key), roadSourceKeys, '独立六分期完整源键');
  for (const item of audit.six_snapshot_line_source_reconstructions) {
    expect(item.snapshot_scoped_object_id, item.source_key.slice(item.source_key.indexOf('/roads_') + 12), '独立快照限定ID');
    close(item.source_length_m, item.saved_union_length_m, '独立原线支持长度', LINE_TOLERANCE); close(item.hausdorff_distance_m, 0, '独立原线坐标对应', LINE_TOLERANCE);
    expect(item.road_area_is_zero_line_support, true, '独立零面积线语义');
  }
  set(audit.WGS84_geometry_roundtrip?.map(item => item.file.split('/').pop()), ['来源叠合分区_WGS84.geojson', '道路分区线支持_WGS84.geojson'], '独立两个显示回转引用');
  for (const item of audit.WGS84_geometry_roundtrip) if (typeof item.max_distance_m !== 'number' || item.max_distance_m < 0 || item.max_distance_m > 1e-5) fail('原显示回转数值审计记录不完整。');
}

/** Returns fresh lookup containers and the unchanged original display objects. */
export function validateOverlaySource(view) {
  const sources = sourceMetadata(view), producer = obj(view.files[PREFIX + '核查记录.json'], '原生产证明'), audit = obj(view.files[PREFIX + '根独立几何回读核查.json'], '原独立证明');
  const cells = table(view, sources, '分区闭合与来源.csv', CELL_FIELDS, 16, ['cell_id']);
  const relations = table(view, sources, '分区与源对象正面积关系.csv', RELATION_FIELDS, 41, ['cell_id', 'source_key']);
  const sourceObjects = reviewSources(table(view, sources, '源对象几何审阅.csv', SOURCE_FIELDS, 132, ['source_key']), producer);
  const overlaps = table(view, sources, '跨层正面积交叠关系.csv', OVERLAP_FIELDS, 2, ['first_source_key', 'second_source_key']);
  const roads = table(view, sources, '道路分区线支持.csv', ROAD_FIELDS, 12, ['source_key', 'cell_id']);
  set(cells.map(row => row.cell_id), CELL_IDS, '16互斥分区完整ID');
  const cellMap = Object.fromEntries(cells.map(row => [row.cell_id, row])), categoryAreas = Object.fromEntries(Object.keys(CATEGORY_AREAS).map(key => [key, 0]));
  for (const row of cells) {
    const [category, area, suffixes] = CELL_SPECS[CELL_IDS.indexOf(row.cell_id)];
    expect(row.source_category, category, row.cell_id + '原类别'); expect(row.source_category_label, CATEGORY_LABELS[category], row.cell_id + '原类别标签');
    close(number(row.area_m2, row.cell_id + '面积m2'), area, row.cell_id + '保存面积'); categoryAreas[category] += number(row.area_m2, '原面积');
    set(parseArray(row.source_keys_json, '原全源键数组'), suffixes.map(suffix => MICRO + suffix), row.cell_id + '全部正面积源键（含小量级）');
    set(parseArray(row.layer_keys_json, '原源层数组'), [...new Set(suffixes.map(suffix => suffix.split('/')[0]))], row.cell_id + '全部源层');
    hash(row.native_geometry_sha256, '原生分区几何SHA'); blanks(row, ['research_action_adopted', 'accepted_ground_or_road_surface', 'implementation_permission'], row.cell_id + '未接纳字段');
  }
  for (const category of Object.keys(CATEGORY_AREAS)) {
    close(categoryAreas[category], CATEGORY_AREAS[category], '完整类别量值.' + category); close(producer.category_area_m2?.[category], categoryAreas[category], '原生产类别量值.' + category);
  }
  set(Object.keys(obj(producer.category_area_m2, '原类别面积')), Object.keys(CATEGORY_AREAS), '完整五类面积');
  close(Object.values(categoryAreas).reduce((total, area) => total + area, 0), 10000, '完整16面保存测量值闭合');
  const expectedRelations = CELL_SPECS.flatMap(([, , suffixes], index) => suffixes.map(suffix => CELL_IDS[index] + '|' + MICRO + suffix));
  set(relations.map(row => row.cell_id + '|' + row.source_key), expectedRelations, '完整41条分区/来源关系');
  const smallRelations = [];
  for (const row of relations) {
    const source = sourceObjects[row.source_key], cell = cellMap[row.cell_id]; if (!source || !cell) fail('关系表完整主外键断开。');
    expect(row.layer, source.layer, '关系源层'); expect(row.assignment_type, 'positive_source_geometry_overlap_not_physical_use', '来源覆盖不推定物理使用');
    const area = number(row.area_m2, '来源关系面积m2'); if (area <= 0) fail('正面积关系不可删除、归零或改为负值。');
    if (area < AREA_TOLERANCE) smallRelations.push(row);
    else close(area, number(cell.area_m2, '分区面积m2'), '实质来源与分区保存面积对应');
  }
  set(smallRelations.map(row => row.cell_id + '|' + row.source_key), SMALL_RELATIONS, '全部三条小量级正关系保留');
  const expectedOverlapKeys = [1, 2].map(id => MICRO + 'buildings_uncut/154324|' + MICRO + 'vegetation_core/c4_min0/' + id);
  set(overlaps.map(row => row.first_source_key + '|' + row.second_source_key), expectedOverlapKeys, '完整两条跨层源对');
  for (const row of overlaps) {
    if (!sourceObjects[row.first_source_key] || !sourceObjects[row.second_source_key]) fail('交叠主外键断开。');
    expect(row.interpretation, 'unresolved_roof_vegetation_projection', '屋顶/植被冲突未解释'); blanks(row, ['accepted_physical_cause', 'accepted_use_or_action'], '交叠接受值');
    close(number(row.overlap_area_m2, '交叠面积m2'), row.second_source_key.endsWith('/1') ? 166.73700297263295 : 0.8705355993678839, '保存源对交叠面积');
  }
  close(overlaps.reduce((total, row) => total + number(row.overlap_area_m2, '交叠面积'), 0), CATEGORY_AREAS.roof_and_vegetation_class, '两条源对合计167.60753857181282m2');
  const roadMap = Object.create(null), expectedRoadKeys = [];
  for (const year of [2020, 2021]) for (const [way, cell] of ROAD_SPECS) expectedRoadKeys.push(ROAD + 'roads_' + year + '/' + year + '年初/' + way + '|' + cell);
  set(roads.map(row => row.source_key + '|' + row.cell_id), expectedRoadKeys, '两期各六挂接/完整十二复合键');
  for (const row of roads) {
    const source = sourceObjects[row.source_key], cell = cellMap[row.cell_id]; if (!source || !cell) fail('线支持主外键断开。');
    expect(row.source_layer, source.layer, '原道路快照图层'); expect(row.source_object_id, source.object_id, '快照限定way ID'); expect(row.source_category, cell.source_category, '线支持对应分区类别');
    const spec = ROAD_SPECS.find(([way, id]) => source.object_id.endsWith('/' + way) && id === row.cell_id);
    close(number(row.line_support_length_m, '原线长度m'), spec[2], '原保存分区线长度', LINE_TOLERANCE);
    expect(number(row.line_has_area_m2, '原线面积m2'), 0, '真零面积线（不能补道路面）');
    blanks(row, ['road_width_accepted_m', 'road_area_allocated_m2', 'research_day_snapshot_adopted', 'implementation_permission'], '原线支持接受值'); roadMap[row.source_key + '|' + row.cell_id] = row;
  }
  proposals(view.files[PREFIX + '研究动作提案_未采用.json'], producer);
  recordedProofs(producer, audit, sources, overlaps, roads);
  const faces = view.files[PREFIX + '来源叠合分区_WGS84.geojson'], roadCollection = view.files[PREFIX + '道路分区线支持_WGS84.geojson'];
  same(collection(faces, cells, CELL_FIELDS, ['cell_id'], ['area_m2'], ['research_action_adopted', 'accepted_ground_or_road_surface', 'implementation_permission'], '原面GeoJSON', ['Polygon']), { Polygon: 16 }, '16个原显示面');
  same(collection(roadCollection, roads, ROAD_FIELDS, ['source_key', 'cell_id'], ['line_support_length_m', 'line_has_area_m2'], ['road_width_accepted_m', 'road_area_allocated_m2', 'research_day_snapshot_adopted', 'implementation_permission'], '原道路GeoJSON', ['LineString', 'MultiLineString']), { LineString: 8, MultiLineString: 4 }, '原八单线/四多线');
  const cellLookup = Object.create(null);
  for (const cell of cells) {
    const cellRelations = relations.filter(row => row.cell_id === cell.cell_id), keys = cellRelations.map(row => row.source_key);
    cellLookup[cell.cell_id] = {
      cell, relations: cellRelations,
      smallMagnitudeRelations: cellRelations.filter(row => number(row.area_m2, '原关系面积') < AREA_TOLERANCE).map(relation => ({ relation, numerical_tolerance_m2: AREA_TOLERANCE, numerical_only: true, physical_precision_claim: false })),
      sourceObjects: keys.map(key => sourceObjects[key]),
      overlaps: overlaps.filter(row => keys.includes(row.first_source_key) && keys.includes(row.second_source_key)),
      overlap_scope: 'cross_layer_source_pair_not_new_cell_area', roads: roads.filter(row => row.cell_id === cell.cell_id),
    };
  }
  return {
    summary: {
      group_id: 'micro-source-overlay', site_id: 'E4125_N33891', review_scope: 'saved_source_geometry_and_full_table_semantics_only',
      counts: { partition_cells: 16, cell_source_relations: 41, source_objects: 132, cross_layer_overlap_relations: 2, road_partition_supports: 12, numerical_small_positive_relations_retained: 3, snapshot_qualified_road_sources_in_core: 6, distinct_core_way_ids: 3, receptors_in_this_group: 0 },
      layer_counts: { ...LAYER_COUNTS }, category_area_m2: { ...categoryAreas }, core_area_m2: 10000,
      roof_vegetation_overlap_area_m2: CATEGORY_AREAS.roof_and_vegetation_class,
      units: { area: 'm2', length: 'm', native_analysis_crs: 'EPSG:32648', display_crs: 'EPSG:4326 longitude_latitude', lonlat_area_or_length_recomputed: false },
      numerical_tolerances: { area_m2: AREA_TOLERANCE, line_m: LINE_TOLERANCE, establish_physical_accuracy: false },
      identity_scope: { complete_source_keys: 'source_SHA256/layer/variant_if_present/actual_local_ID', old_object_count: 104, current_source_count: 132, count_relationship: '104 - 6 receptors + 1 core + 33 source_classes = 132; never 104 + 132', vegetation_source_component_id: 17696, vegetation_variant: 'c4_min0', three_clips_are_independent_parks: false, snapshots_are_independent_physical_roads: false },
      historical_producer_readback: { original_output_count: 14, matching_current_hash_count: 13, historical_readme_sha256: OLD_README_SHA, current_readme_sha256: sources.get(PREFIX + 'README.md').sha256, readme_history_rewritten: false, current_group_source_count: 16, proofs_added_to_intake: ['核查记录.json', '根独立几何回读核查.json'], geometry_proofs_reexecuted: false },
      acceptance: { research_actions_adopted: false, accepted_design_scope: null, accepted_implementation_permissions: null, accepted_ground_or_road_surface: null, original_unknown_slots: 33, original_unknown_slots_status: 'source_bound_claim_all_null_not_re_read_here', physical_entry_ready: false, physical_results: 0, recommendation_verified: false },
      scientific_action_gates: { ...OPERATION_GATES },
      source_proof_scope: { original_producer_checks: 82, root_independent_status: audit.status, native_geometry_computation_repeated: false, referenced_large_sources_read: false, final_Y_read: false, model_or_research_executed: false },
    },
    displayCollections: { cells: faces, roads: roadCollection },
    selectionLookup: { cells: cellLookup, sourceObjects, overlaps, roads: roadMap },
  };
}
