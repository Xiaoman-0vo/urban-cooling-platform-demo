import proj4 from 'proj4';
import { GEOMETRY_SOURCE_CATALOG } from './source-geometry-catalog.js';
import { canonicalSupplement } from './supplement-state.js';
import { parseStrictPreparationJson } from './preparation-state.js';

// Pure checks of saved values and source relationships. No ray intersection,
// producer execution, physical model, external-source read or admission occurs.
const GROUP = structuredClone(GEOMETRY_SOURCE_CATALOG.find(item => item.group_id === 'building_geometry_svf').source_group);
const PREFIX = '共享接口/微观试验准备/建筑几何天空可视核查_20261006/';
const DISPLAY_PREFIX = '共享接口/来源几何与对象三组交接/建筑显示准备/';
const SHA = '6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4';
const IDS = ['H1', 'H2', 'H3', 'V1', 'V2', 'V3'];
const LEVELS = [360, 720, 1440, 2880];
const PATHS = { parts: PREFIX + 'OBJ与来源对象部件关联.csv', receptors: PREFIX + '六候选受体坐标关联.csv', svf: PREFIX + '六点建筑几何SVF_四级采样.csv', directions: PREFIX + '六点逐方位遮挡与来源.csv', refinement: PREFIX + '方向加密差异.csv' };
const GATES = Object.freeze({ new_site_prediction: false, physical_simulation: false, thermal_comfort: false, routing_or_OD: false, actual_access_or_use_service: false, fairness: false, minimum_green_area: false, candidate_generation: false, ranking: false });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('建筑来源几何核对：' + message); };
const same = (actual, expected, label) => { if (canonicalSupplement(actual) !== canonicalSupplement(expected)) fail(label + '与冻结来源或未采用边界不一致。'); };
const expect = (actual, expected, label) => { if (actual !== expected) fail(label + '与来源含义不一致。'); };
function number(value, label) {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) fail(label + '必须保持有限原数值字符串，空项不能补零。');
  return Number(value);
}
function integer(value, label) { const n = number(value, label); if (!Number.isSafeInteger(n) || n < 0) fail(label + '必须为原非负整数。'); return n; }
function close(actual, expected, label, tolerance = 1e-10) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) fail(label + '与保存字段数值关系不一致。');
}
function blank(row, keys, label) { for (const key of keys) expect(row[key], '', label + '.' + key); }
function unique(values, count, label) { if (values.length !== count || new Set(values).size !== count) fail(label + '完整集合缺失或重复。'); }
function jsonArray(text, label) {
  if (typeof text !== 'string') fail(label + '必须为原JSON编码字符串。');
  let value; try { value = parseStrictPreparationJson(text); } catch { fail(label + 'JSON编码无效。'); }
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string') || new Set(value).size !== value.length) fail(label + '必须为原唯一字符串键数组。');
  return value;
}
function table(view, name) {
  const path = PATHS[name], metadata = GROUP.primary_tables.find(item => item.path === path), value = view.files[path];
  if (!object(value) || !Array.isArray(value.rows)) fail(name + '原表缺失。');
  same(value.fields, metadata.columns, name + '完整字段及顺序'); expect(value.rows.length, metadata.rows, name + '完整行数');
  const seen = new Set();
  return value.rows.map(cells => {
    if (!Array.isArray(cells) || cells.length !== value.fields.length || !cells.every(cell => typeof cell === 'string')) fail(name + '全部原单元必须为字符串。');
    const row = Object.fromEntries(value.fields.map((field, index) => [field, cells[index]]));
    const key = JSON.stringify(metadata.primary_key_columns.map(field => row[field]));
    if (metadata.primary_key_columns.some(field => row[field] === '') || seen.has(key)) fail(name + '复合键空缺或重复。');
    seen.add(key); return row;
  });
}
function sourceView(view) {
  if (!object(view) || !object(view.files)) fail('原文件视图无效。');
  same(view.sources, GROUP.source_files, '29件来源元数据');
  const decoded = GROUP.source_files.filter(source => ['csv', 'json', 'geojson', 'md', 'py', 'txt'].includes(source.format)).map(source => source.path);
  same(Object.keys(view.files).sort(), decoded.sort(), '完整可解析文件集');
  for (const source of GROUP.source_files) if (['md', 'py', 'txt'].includes(source.format) && typeof view.files[source.path] !== 'string') fail('脚本/说明必须为原文本，不能执行或替换。');
}

export function validateBuildingGeometry(view) {
  sourceView(view);
  const data = Object.fromEntries(Object.keys(PATHS).map(name => [name, table(view, name)]));
  const contract = view.files[PREFIX + '坐标与水平面SVF契约.json'];
  const schema = view.files[PREFIX + '交付schema.json'];
  const source = view.files[PREFIX + '来源与生产核查.json'];
  const audit = view.files[PREFIX + '独立回读核查.json'];
  const cases = view.files[PREFIX + '解析与边界小例结果.json'];
  const delivery = view.files[PREFIX + '交付文件清单.json'];
  const displayProof = view.files[DISPLAY_PREFIX + '建筑显示准备及回读.json'];
  expect(schema.asset_source_sha256, SHA, '共同原资产SHA'); expect(schema.CRS_analysis, 'EPSG:32648', '原分析CRS'); expect(schema.GeoJSON_display_CRS, 'EPSG:4326', '显示CRS'); expect(schema.no_source_admission_changes, true, '未改变原接受项');
  expect(contract.coordinate_reference_system, 'EPSG:32648', '工作坐标'); expect(contract.analysis_horizontal_units, 'm', '工作水平单位');
  same(contract.OBJ_local_origin_UTM_E_N_m, [412500, 3389100], '局地左下角原点');
  expect(contract.work_ground_z_m, 0, '平坦工作基底'); expect(contract.work_receptor_z_m, 1.5, '拟议受体工作高度');
  expect(contract.ground_z_is_unverified_preview_assumption, true, '基底仍为未验证假设'); expect(contract.receiver_height_is_proposed_not_accepted, true, '受体未接受');
  same(contract.sampling_N_predeclared, LEVELS, '固定四级采样');
  expect(contract.azimuth, 'UTM grid north=0; clockwise; unit direction=(sin(phi),cos(phi)); not true-north or sun/weather directions', '格网北方位');
  expect(contract.sampling_rule, 'phi_j=2*pi*(j+0.5)/N, j=0..N-1; fixed midpoint uniform azimuth', '中点采样规则');
  expect(contract.discrete_SVF, 'mean_j cos(beta(phi_j))^2; dimensionless 0..1', '水平面余弦权重SVF');
  expect(contract.unweighted_solid_angle_fraction, 'mean_j(1-sin(beta)); retained separately, never labelled SVF', '无权重诊断不冒充SVF');
  expect(contract.no_hit_direction_fraction, 'mean(beta==0); separate diagnostic, never labelled SVF', '无遮挡比例独立');
  for (const key of ['exterior_source_completeness_certified', 'vegetation_included', 'true_ground_or_DSM_used', 'thermal_or_service_outputs_generated']) expect(contract[key], false, '未完成.' + key);
  for (const key of ['physical_scene_adopted', 'accepted_receiver_height_m', 'accepted_physical_SVF']) expect(contract[key], null, '契约空采用项.' + key);
  for (const key of ['physical_solver_executed', 'physical_accuracy_validated', 'outside_domain_obstructions_certified', 'formal_plan_or_original_33_changed']) expect(source[key], false, '原生产边界.' + key);
  same(source.counts, { source_buildings: 53, full_source_parts: 54, receptors: 6, direction_rows: 32400, summary_rows: 24, sampling_difference_rows: 18 }, '生产原计数');
  expect(source.full_source_objects_cross_500m_selection_boundary, 8, '跨窗完整建筑');
  expect(delivery.independent_check_count, 311, '独立回读计数'); expect(delivery.independent_failed_checks, 0, '独立回读失败数');
  expect(delivery.all_direction_rows, 32400, '全部方向保存行'); expect(delivery.independently_recomputed_source_rays, 4320, '上游独立射线范围');
  expect(delivery.analytical_case_total, 15, '小例总数'); expect(delivery.analytical_case_passed, 14, '小例通过数'); expect(delivery.analytical_boundary_failures_retained, 1, '保留角点失败');
  for (const key of ['physical_solver_executed', 'old_31_file_package_modified_by_this_task', 'original_14_frozen_package_modified_by_this_task']) expect(delivery[key], false, '原交付边界.' + key);
  expect(delivery.original_33_unknowns_filled, 0, '原33项未补');
  for (const key of ['accepted_receiver_height_m', 'accepted_physical_SVF', 'physical_scene_adopted', 'exterior_obstruction_completeness_accepted', 'ground_elevation_accepted', 'vegetation_inputs_accepted', 'MRT', 'air_temperature', 'UTCI', 'cooling_effect', 'service_value']) expect(delivery[key], null, '原交付空项.' + key);
  expect(audit.check_count, 311, '独立311项'); expect(audit.all_stored_direction_rows_read, 32400, '上游独立全表读取'); expect(audit.independently_recomputed_source_rays, 4320, '独立720级射线数量');
  if (!Array.isArray(audit.checks) || audit.checks.length !== 311 || new Set(audit.checks.map(item => item.name)).size !== 311 || audit.checks.some(item => item.passed !== true)) fail('独立311项原检查状态必须完整保留。');
  same(audit.failed_checks, [], '独立失败表'); expect(audit.winning_building_ID_mismatches, 0, '独立贡献ID差异');
  expect(cases.test_count, 15, '解析小例数量');
  if (!Array.isArray(cases.tests) || cases.tests.length !== 15 || cases.tests.filter(item => item.passed === true).length !== 14 || cases.tests.filter(item => item.passed === false).length !== 1) fail('小例14通过/1失败须分开。');
  const failure = cases.tests.find(item => item.passed === false);
  expect(failure.name, 'exact_corner_tangent_entry_m_float_boundary_diagnostic', '确切角点失败身份');
  for (const key of ['actual', 'absolute_error']) expect(failure[key], null, '失败未知.' + key);
  expect(failure.actual_nonfinite, true, '原非有限角点诊断'); expect(failure.required_for_nonboundary_tests, false, '边界诊断不变成普通通过');
  same(cases.failed_tests, [failure], '角点失败表'); same(cases.failed_required_tests, [], '普通必需小例失败表'); same(audit.known_exact_tangent_diagnostic_failure, [failure], '独立角点失败沿用');

  const buildings = view.files[DISPLAY_PREFIX + '完整来源建筑_WGS84.geojson'], receptors = view.files[PREFIX + '六候选受体_几何SVF.geojson'];
  if (buildings.type !== 'FeatureCollection' || buildings.features.length !== 53 || receptors.type !== 'FeatureCollection' || receptors.features.length !== 6) fail('53完整建筑与六点显示对象缺失。');
  expect(buildings.coordinate_crs, 'EPSG:4326', '建筑显示CRS'); expect(buildings.measurement_crs, 'EPSG:32648', '建筑原测量CRS');
  expect(buildings.adoption_state, 'source_building_footprints_working_height_not_adopted_physical_scene', '建筑未采用');
  expect(receptors.crs?.properties?.name, 'urn:ogc:def:crs:OGC:1.3:CRS84', '六点经纬显示CRS');
  const lookup = { buildings: Object.create(null), parts: Object.create(null), receptors: Object.create(null), directions: Object.create(null), svf: Object.create(null), refinement: Object.create(null) };
  const sourceGpkg = GROUP.source_files.find(item => item.path === PREFIX + '建筑源与候选受体_几何核查.gpkg');
  for (const feature of buildings.features) {
    const p = feature.properties, original = p.source_properties, key = SHA + '/buildings_uncut/' + original.merged_id;
    expect(feature.id, key, '建筑完整显示ID'); expect(p.source_object_key, key, '建筑源键');
    if (lookup.buildings[key] || feature.geometry.type !== 'MultiPolygon') fail('建筑源键重复或完整MultiPolygon被替换。');
    expect(p.source_GPKG, sourceGpkg.path, '建筑显示来源GPKG'); expect(p.source_GPKG_sha256, sourceGpkg.sha256, '建筑显示GPKG源SHA'); expect(p.source_GPKG_layer, 'source_buildings_uncut', '建筑原层');
    expect(p.source_geometry_crs, 'EPSG:32648', '建筑原几何CRS'); expect(p.display_geometry_crs, 'EPSG:4326', '建筑显示几何CRS');
    expect(p.height_is_working_proxy, true, '工作高度身份'); expect(p.ground_elevation_or_physical_scene_adopted, false, '建筑基底与场景未采用'); expect(p.source_only, true, '仅来源显示');
    if (!Number.isFinite(original.Height_effective_working_m) || original.Height_effective_working_m <= 0) fail('原工作Height有限正值缺失。');
    same(Object.keys(original).sort(), Object.keys(view.files[PREFIX + '来源字段与单位核查.json'].buildings_uncut.field_audit).sort(), '完整建筑原属性');
    lookup.buildings[key] = { key, display_feature: feature, part_keys: [], direction_keys: [] };
  }
  let vertices = 0, triangles = 0;
  for (const row of data.parts) {
    const key = row.source_part_key, building = lookup.buildings[row.source_object_key], index = integer(row.part_index, '源部件序号');
    if (!building || index < 1) fail('54部件对应的完整建筑外键缺失。');
    expect(row.source_object_key, SHA + '/buildings_uncut/' + row.merged_id, '部件源SHA/层/ID'); expect(key, row.source_object_key + '/part/' + index, '源部件完整键');
    expect(row.OBJ_object, 'building_' + row.merged_id + '_part_' + index, 'OBJ对象原关联');
    expect(row.all_edges_incidence_two, 'True', '原闭合边检查'); expect(row.source_consistency_passed, 'True', '原OBJ来源一致性');
    close(number(row.OBJ_min_z_m, 'OBJ基底'), 0, 'OBJ平坦基底', 1e-10);
    close(number(row.working_top_z_m, '来源工作顶高'), building.display_feature.properties.source_properties.Height_effective_working_m, '工作Height关联', 1e-10);
    close(number(row.OBJ_max_z_m, 'OBJ顶高'), number(row.working_top_z_m, '工作顶高'), '保存OBJ顶高', 1e-8);
    if (number(row.max_XY_association_error_m, '原XY差') > 1e-8 || number(row.max_Z_base_or_top_error_m, '原Z差') > 1e-8) fail('原部件来源关联差超过保存核查范围。');
    close(number(row.source_prism_volume_m3, '来源柱体量'), number(row.source_full_part_area_m2, '原完整面面积') * number(row.working_top_z_m, '顶高'), '柱体工作体量', 1e-5);
    close(number(row.OBJ_signed_volume_m3, 'OBJ工作体量'), number(row.source_prism_volume_m3, '来源工作体量'), '工作体量一致性', Math.max(1e-5, number(row.source_prism_volume_m3, '工作体量') * 1e-8));
    vertices += integer(row.vertex_count, '顶点数'); triangles += integer(row.triangle_count, '三角面数');
    building.part_keys.push(key); lookup.parts[key] = { key, raw: row, source_object_key: row.source_object_key, direction_keys: [] };
  }
  expect(vertices, 10540, '来源OBJ顶点数量'); expect(triangles, 20880, '来源OBJ三角面数量');
  for (const building of Object.values(lookup.buildings)) if (!building.part_keys.length) fail('来源建筑未关联部件。');
  unique(Object.keys(lookup.parts), 54, '54部件'); unique(Object.keys(lookup.buildings), 53, '53来源建筑');
  for (const row of data.receptors) {
    if (!IDS.includes(row.receptor_id)) fail('六受体原ID未知。');
    const key = SHA + '/receptor_candidates/' + row.receptor_id; expect(row.receptor_key, key, '六受体完整SHA/层/ID'); expect(row.grid_id, 'E4125_N33891', '受体原格');
    const feature = receptors.features.find(item => item.properties.receptor_id === row.receptor_id);
    if (!feature || feature.geometry.type !== 'Point') fail('已核验资产内受体显示关联缺失。');
    const p = feature.properties;
    close(number(row.OBJ_local_X_m, '局地X'), number(row.UTM_E_m, 'UTM东') - 412500, '核心左下角X', 1e-8);
    close(number(row.OBJ_local_Y_m, '局地Y'), number(row.UTM_N_m, 'UTM北') - 3389100, '核心左下角Y', 1e-8);
    for (const field of ['UTM_E_m', 'UTM_N_m', 'OBJ_local_X_m', 'OBJ_local_Y_m', 'work_z_m']) close(number(row[field], '受体原坐标'), p[field], 'CSV/GJ坐标.' + field, 1e-8);
    const lonlat = proj4('EPSG:32648', 'EPSG:4326', [number(row.UTM_E_m, 'E'), number(row.UTM_N_m, 'N')]);
    close(lonlat[0], feature.geometry.coordinates[0], '来源点经度显示', 1e-10); close(lonlat[1], feature.geometry.coordinates[1], '来源点纬度显示', 1e-10);
    expect(number(row.work_z_m, '受体工作Z'), 1.5, '受体工作高度'); expect(number(row.source_proposed_air_height_m, '拟议原高度'), 1.5, '拟议原高度');
    expect(row.position_and_height_confirmed, 'False', '受体尚未确认'); expect(p.position_and_height_confirmed, false, '显示点未确认');
    expect(row.inside_source_core, 'True', '核心内'); expect(row.outside_all_source_buildings, 'True', '来源建筑外');
    blank(row, ['accepted_receiver_height_m', 'accepted_ground_elevation_m', 'physical_scene_adopted'], '受体空接受值');
    for (const field of ['accepted_receiver_height_m', 'accepted_physical_SVF', 'physical_scene_adopted']) expect(p[field], null, '显示点空采用项.' + field);
    lookup.receptors[key] = { key, raw: row, display_feature: feature, svf_keys: [], direction_keys_by_sampling: Object.fromEntries(LEVELS.map(n => [String(n), []])) };
  }
  unique(Object.keys(lookup.receptors), 6, '六完整受体');
  const aggregates = new Map();
  for (const row of data.directions) {
    const receptor = lookup.receptors[row.receptor_key], n = integer(row.sampling_N, '方向采样N'), index = integer(row.direction_index_0based, '方向原索引');
    if (!receptor || !LEVELS.includes(n) || index >= n) fail('方向受体外键或完整采样索引无效。');
    expect(row.receptor_id, receptor.raw.receptor_id, '方向受体ID'); expect(number(row.work_receiver_z_m, '方向工作Z'), 1.5, '方向拟议高度');
    const key = row.receptor_key + '|' + row.sampling_N + '|' + row.direction_index_0based, phi = number(row.azimuth_deg_grid_north_clockwise, '格网北方位'), beta = number(row.horizon_elevation_rad, '地平线弧度'), deg = number(row.horizon_elevation_deg, '地平线度数'), integrand = number(row.horizontal_SVF_integrand_cos2, '保存积分量');
    close(phi, (index + 0.5) * 360 / n, '完整中点方位', 1e-10); close(deg, beta * 180 / Math.PI, '保存角度单位', 1e-10);
    if (beta < 0 || beta >= Math.PI / 2 || integrand < 0 || integrand > 1) fail('地平线或积分量范围无效。');
    close(integrand, Math.cos(beta) ** 2, '保存余弦平方权重', 1e-14);
    const ties = jsonArray(row.all_tied_max_source_part_keys_json, '贡献部件键JSON'), intersected = integer(row.intersected_source_part_count, '原交集部件数');
    if (intersected > 54 || ties.some(part => !lookup.parts[part]) || ties.length > intersected) fail('贡献部件外键或原计数无效。');
    const ray = number(row.ray_length_beyond_all_source_bounds_m, '原有限射线长度'); if (ray <= 0) fail('原射线长度缺失。');
    if (row.winning_source_part_key === '') {
      blank(row, ['winning_building_merged_id', 'winning_source_object_key', 'winning_source_part_key', 'winning_part_index', 'winning_entry_distance_m', 'winning_work_top_z_m', 'winning_entry_UTM_E_m', 'winning_entry_UTM_N_m'], '无上方贡献对象');
      expect(beta, 0, '无贡献地平线0'); expect(integrand, 1, '无贡献积分量1'); same(ties, [], '空贡献不生成ID0');
    } else {
      const part = lookup.parts[row.winning_source_part_key], distance = number(row.winning_entry_distance_m, '保存贡献入口距离');
      if (!part || distance <= 0 || distance > ray || !ties.includes(row.winning_source_part_key)) fail('胜出部件FK/距离/并列最大来源无效。');
      expect(row.winning_source_object_key, part.raw.source_object_key, '贡献建筑全键'); expect(row.winning_building_merged_id, part.raw.merged_id, '贡献原建筑ID'); expect(row.winning_part_index, part.raw.part_index, '贡献原部件序号');
      close(number(row.winning_work_top_z_m, '贡献工作顶高'), number(part.raw.working_top_z_m, '部件顶高'), '贡献来源工作高度', 1e-10);
      close(beta, Math.atan2(Math.max(number(row.winning_work_top_z_m, '顶高') - 1.5, 0), distance), '保存地平线关系', 1e-12);
      const radians = phi * Math.PI / 180;
      close(number(row.winning_entry_UTM_E_m, '原贡献E'), number(receptor.raw.UTM_E_m, '受体E') + distance * Math.sin(radians), '保存入口E关系', 1e-8);
      close(number(row.winning_entry_UTM_N_m, '原贡献N'), number(receptor.raw.UTM_N_m, '受体N') + distance * Math.cos(radians), '保存入口N关系', 1e-8);
    }
    const buildingKeys = [...new Set(ties.map(part => lookup.parts[part].source_object_key))];
    lookup.directions[key] = { key, raw: row, contributing_part_keys: ties, contributing_building_keys: buildingKeys };
    receptor.direction_keys_by_sampling[row.sampling_N].push(key);
    for (const part of ties) lookup.parts[part].direction_keys.push(key);
    for (const building of buildingKeys) lookup.buildings[building].direction_keys.push(key);
    const aggregateKey = row.receptor_key + '|' + row.sampling_N;
    if (!aggregates.has(aggregateKey)) aggregates.set(aggregateKey, { count: 0, cosine: 0, solid: 0, zero: 0, max: 0, elevation: 0 });
    const a = aggregates.get(aggregateKey); a.count++; a.cosine += integrand; a.solid += 1 - Math.sin(beta); a.zero += beta === 0 ? 1 : 0; a.max = Math.max(a.max, deg); a.elevation += deg;
  }
  unique(Object.keys(lookup.directions), 32400, '32,400完整方向');
  for (const receptor of Object.values(lookup.receptors)) for (const n of LEVELS) {
    const keys = receptor.direction_keys_by_sampling[String(n)]; expect(keys.length, n, '每受体每级完整方向数');
    unique(keys.map(key => integer(lookup.directions[key].raw.direction_index_0based, '原索引')), n, '完整索引集合');
  }
  for (const row of data.svf) {
    const receptor = lookup.receptors[row.receptor_key], n = integer(row.sampling_N, 'SVF级别'), key = row.receptor_key + '|' + row.sampling_N, a = aggregates.get(key);
    if (!receptor || !LEVELS.includes(n) || !a || a.count !== n) fail('SVF/完整方向对应缺失。');
    expect(row.receptor_id, receptor.raw.receptor_id, 'SVF受体ID'); close(number(row.azimuth_step_deg, '采样步长'), 360 / n, '角度步长');
    close(number(row.horizontal_building_SVF, '水平面SVF'), a.cosine / n, '保存水平面SVF聚合', 1e-12);
    close(number(row.unweighted_sky_solid_angle_fraction_diagnostic, '无权重比例'), a.solid / n, '独立无权重诊断', 1e-12);
    close(number(row.no_above_horizon_building_direction_fraction_diagnostic, '无遮挡比例'), a.zero / n, '独立无遮挡比例', 1e-12);
    close(number(row.max_horizon_elevation_deg, '最大角'), a.max, '保存最大角', 1e-10); close(number(row.mean_horizon_elevation_deg_diagnostic, '平均角'), a.elevation / n, '保存平均角', 1e-10);
    expect(row.source_building_object_count, '53', 'SVF来源建筑数'); expect(row.source_building_part_count, '54', 'SVF来源部件数'); expect(number(row.work_receiver_z_m, 'SVF工作高度'), 1.5, 'SVF拟议高度');
    blank(row, ['accepted_receiver_height_m', 'accepted_physical_SVF', 'physical_scene_adopted'], 'SVF空接受值');
    lookup.svf[key] = { key, raw: row, direction_keys: receptor.direction_keys_by_sampling[row.sampling_N] }; receptor.svf_keys.push(key);
    if (n === 2880) close(number(row.horizontal_building_SVF, '2880级SVF'), receptor.display_feature.properties.horizontal_building_SVF_2880, '显示点SVF', 1e-12);
  }
  unique(Object.keys(lookup.svf), 24, '24完整受体级别');
  for (const row of data.refinement) {
    const coarse = integer(row.coarse_N, '粗N'), fine = integer(row.fine_N, '细N'), receptorKey = SHA + '/receptor_candidates/' + row.receptor_id;
    if (!IDS.includes(row.receptor_id) || !LEVELS.includes(coarse) || fine !== coarse * 2 || !LEVELS.includes(fine)) fail('18条加密配对集合错误。');
    const c = lookup.svf[receptorKey + '|' + coarse], f = lookup.svf[receptorKey + '|' + fine];
    close(number(row.coarse_SVF, '原粗SVF'), number(c.raw.horizontal_building_SVF, '来源粗SVF'), '加密粗来源'); close(number(row.fine_SVF, '原细SVF'), number(f.raw.horizontal_building_SVF, '来源细SVF'), '加密细来源');
    const delta = number(row.fine_SVF, '细') - number(row.coarse_SVF, '粗'); close(number(row.signed_fine_minus_coarse, '保留有符号差'), delta, '保留加密负号', 1e-12); close(number(row.absolute_difference, '绝对差'), Math.abs(delta), '保存绝对差', 1e-12);
    expect(row.a_posteriori_sampling_difference_not_error_bound, 'True', '采样差不冒充误差界'); expect(row.domain_or_physical_accuracy_converged, 'False', '未认证域或物理收敛');
    const key = row.receptor_id + '|' + row.coarse_N + '|' + row.fine_N; lookup.refinement[key] = { key, raw: row };
  }
  for (const row of audit.independent_SVF_values) {
    if (!IDS.includes(row.receptor_id)) fail('原独立720级受体未知。');
    const value = lookup.svf[SHA + '/receptor_candidates/' + row.receptor_id + '|720'].raw;
    close(row.readback_SVF_720, number(value.horizontal_building_SVF, '保存720级'), '独立保存值', 1e-12); close(row.independent_SVF_720, row.readback_SVF_720, '上游独立值范围', 1e-10); expect(row.independent_direction_count, 720, '原独立方向范围');
  }
  unique(audit.independent_SVF_values.map(row => row.receptor_id), 6, '原独立六点720级');
  for (const name of ['本组重执行前数值指纹.json', '本组重复数值一致核查.json']) {
    const value = view.files[PREFIX + name];
    for (const path of Object.values(PATHS)) {
      const basename = path.slice(PREFIX.length), expectedSha = GROUP.source_files.find(item => item.path === path).sha256;
      if (name.includes('前数值')) expect(value[basename], expectedSha, '原重执行前数值指纹');
      else { expect(value.files[basename].sha256_before, expectedSha, '历史数值前SHA'); expect(value.files[basename].sha256_after, expectedSha, '历史数值后SHA'); }
    }
    if (name.includes('一致')) expect(value.all_five_CSV_bytes_identical, true, '历史五表字节一致');
  }
  for (const reference of source.source_files_read_before_after) {
    expect(reference.sha256_after, reference.sha256_before, '原来源历史前后SHA'); expect(reference.unchanged_during_this_read, true, '历史读取字节未变');
    const checked = audit.source_files_read_before_after.find(item => item.path === reference.path);
    if (!checked) fail('独立历史来源读取引用缺失。'); expect(checked.sha256_before, reference.sha256_before, '历史跨证明SHA'); expect(checked.sha256_after, reference.sha256_after, '历史独立后SHA');
  }
  expect(displayProof.features, 53, '显示来源建筑计数'); expect(displayProof.source_GPKG_sha256, sourceGpkg.sha256, '显示回读源SHA');
  expect(displayProof.output_sha256, GROUP.source_files.find(item => item.path === DISPLAY_PREFIX + '完整来源建筑_WGS84.geojson').sha256, '显示成果SHA');
  for (const key of ['source_object_keys_match_all_OBJ_parts', 'all_original_source_properties_preserved']) expect(displayProof[key], true, '原显示回读.' + key);
  for (const key of ['geometry_simplified_repaired_or_window_clipped', 'height_ground_time_or_physics_certified', 'original_GPKG_changed']) expect(displayProof[key], false, '显示未升级.' + key);
  return {
    summary: {
      group_id: 'building_geometry_svf', site_id: 'E4125_N33891', title: GROUP.title,
      counts: { source_files: 29, primary_tables: 5, primary_rows: 32502, buildings: 53, parts: 54, receptors: 6, svf_rows: 24, direction_rows: 32400, refinement_rows: 18, crossing_window_full_buildings: 8 },
      units: { horizontal_building_SVF: 'dimensionless 0..1', horizon_rad: 'radian', horizon_deg: 'degree', working_geometry: 'metres in EPSG:32648; source Height is a working proxy', display: 'EPSG:4326 longitude_latitude' },
      work_conditions: { flat_work_ground_z_m: 0, proposed_receiver_z_m: 1.5, local_origin_UTM_E_N_m: [412500, 3389100], azimuth: 'UTM_grid_north_clockwise_midpoint', sampling_N: [...LEVELS], accepted_receiver_height_m: null, accepted_physical_SVF: null, physical_scene_adopted: null },
      svf_color_domain: [0, 1], SVF_interpretation: 'fixed_source_building_geometry_horizontal_cosine_weight_not_thermal_comfort_or_good_bad',
      known_failures: { analytical_cases: 15, analytical_passed: 14, exact_corner_failures: structuredClone(cases.failed_tests), independent_readback_checks: 311, independent_readback_failed: 0, platform_rays_recomputed: 0, source_independent_recomputed_720_rays: 4320 },
      source_audits: { producer_status: source.status, independent_scope: audit.independent_method, not_validated: [...audit.not_validated], historical_source_references_preserved: true, external_sources_opened_by_platform: false },
      geometry_simplified_or_clipped_by_platform: false, accepted_unknowns_filled: 0, application_gates: { ...GATES },
    },
    displayCollections: { buildings, receptors }, selectionLookup: lookup,
  };
}
