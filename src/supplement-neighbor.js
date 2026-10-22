const PREFIX = '共享接口/本格与周边描述/';
const PRIMARY_COUNT = 5871;
const NEIGHBOR_COUNT = 8;
const STATUS = 'source_descriptive_comparison_only';
const METRICS = ['G02', 'G03', 'C01', 'C03', 'C06', 'B02'];
const UNITS = {
  G02: 'share_0_1', G03: 'share_0_1', C01: 'local_fragment_count',
  C03: 'share_of_local_vegetation_0_1', C06: 'metres_per_square_metre',
  B02: 'roof_projection_share_0_1',
};
const NAMES = {
  primary: '本格与八邻格逐格对照.csv', support: '六指标对照支持与差异.csv',
  cases: '共同案例与极值示例.csv', manifest: '本格周边描述核查.json',
  map: '制图来源与样式核查.json', audit: '独立核查.json', reproduction: '复现与接纳检查.json',
};
const REQUIRED_SOURCES = [
  'README.md', NAMES.primary, NAMES.support, NAMES.cases, NAMES.manifest,
  NAMES.map, '本格与周边比例差异.png', '本格与周边比例差异.svg',
  '差值色阶近似色觉检查.png', NAMES.audit, NAMES.reproduction,
];
const ALLOWED_SOURCES = new Set(REQUIRED_SOURCES.map((name) => PREFIX + name));
const BASE_FIELDS = [
  'node_index', 'grid_id', 'e_cell', 'n_cell', 'center_e_m', 'center_n_m',
  'role', 'variant', 'neighbor_definition', 'neighbor_count', 'neighbor_grid_ids',
  'neighbor_role_counts', 'proxy_input_accepted_source', 'scientific_status',
];
const SUFFIXES = [
  'focal_raw', 'focal_state', 'neighbor_valid_count', 'neighbor_undefined_count',
  'neighbor_mean_complete8', 'focal_minus_neighbor', 'comparison_status',
];
const PRIMARY_FIELDS = [...BASE_FIELDS, ...METRICS.flatMap((metric) => SUFFIXES.map((suffix) => metric + '_' + suffix))];
const SUPPORT_FIELDS = [
  'field', 'original_unit', 'primary_rows', 'paired_defined_rows', 'focal_undefined_rows',
  'neighbor_support_incomplete_rows', 'focal_above_neighbor_rows', 'equal_rows',
  'focal_below_neighbor_rows', 'delta_min_original_unit', 'delta_max_original_unit',
  'independent_spatial_samples', 'heat_relation_calculated',
];
const SCIENCE_FALSE = [
  'undefined_values_filled_zero', 'shared_neighborhoods_independent',
  'source_epoch_synchronous_2020_verified', 'source_accuracy_verified_by_this_comparison',
  'temperature_targets_or_model_weights_read', 'models_fitted_or_predictions_run',
  'heat_relation_calculated', 'causal_or_physical_cooling_calculated',
  'planning_threshold_or_optimal_layout_adopted', 'resident_equity_service_or_priority_calculated',
  'source_and_formal_plan_modified',
];
const EXPECTED_SUPPORT = {
  G02: [5871, 0, 0, 2511, 16, 3344], G03: [5871, 0, 0, 2506, 16, 3349],
  C01: [5871, 0, 0, 2496, 253, 3122], C03: [3402, 578, 2379, 1878, 3, 1521],
  C06: [5871, 0, 0, 2770, 17, 3084], B02: [5231, 103, 610, 2688, 0, 2543],
};
const COUNT_KEYS = [
  'paired_defined_rows', 'focal_undefined_rows', 'neighbor_support_incomplete_rows',
  'focal_above_neighbor_rows', 'equal_rows', 'focal_below_neighbor_rows',
];
const EXPECTED_CASES = [
  ['existing_shared_pilot', 'E4125_N33891'],
  ['largest_positive_green_difference_illustration', 'E4130_N33889'],
  ['largest_negative_green_difference_illustration', 'E4069_N33923'],
];

function requireCondition(condition, message) {
  if (!condition) throw new Error('本格与周边描述：' + message);
}
function plainObject(value, name) {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value), name + '必须为对象');
  return value;
}
function sameArray(actual, expected, name) {
  requireCondition(Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]), name + '与来源合同不一致');
}
function integer(raw, name, maximum = Number.MAX_SAFE_INTEGER) {
  requireCondition(typeof raw === 'string' && /^(0|[1-9]\d*)$/.test(raw), name + '必须为原整数字符串');
  const value = Number(raw);
  requireCondition(Number.isSafeInteger(value) && value <= maximum, name + '超出合法范围');
  return value;
}
// Exact decimal arithmetic verifies saved CSV values, without rounding or changing them.
function decimal(raw, name) {
  requireCondition(typeof raw === 'string', name + '必须保留原字符串');
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  requireCondition(match && raw.length <= 120 && Number.isFinite(Number(raw)), name + '不是有限十进制数');
  const exponent = Number(match[4] || 0);
  let scale = (match[3] || '').length - exponent;
  requireCondition(Number.isSafeInteger(scale) && Math.abs(scale) <= 100, name + '精度/指数超出保存合同');
  let coefficient = BigInt(match[2] + (match[3] || '')) * (match[1] === '-' ? -1n : 1n);
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  return { coefficient, scale };
}
function align(left, right) {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * 10n ** BigInt(scale - left.scale),
    right.coefficient * 10n ** BigInt(scale - right.scale), scale,
  ];
}
function compare(left, right) {
  const [a, b] = align(left, right);
  return a < b ? -1 : a > b ? 1 : 0;
}
function add(left, right) {
  const [a, b, scale] = align(left, right);
  return { coefficient: a + b, scale };
}
function subtract(left, right) {
  const [a, b, scale] = align(left, right);
  return { coefficient: a - b, scale };
}
const ZERO = decimal('0', 'zero');
const ONE = decimal('1', 'one');
function metricNumber(raw, metric, name, kind = 'focal') {
  const value = decimal(raw, name);
  if (kind !== 'delta') {
    requireCondition(compare(value, ZERO) >= 0, name + '不得为负');
    if (['G02', 'G03', 'C03', 'B02'].includes(metric)) requireCondition(compare(value, ONE) <= 0, name + '比例超出0—1');
    if (metric === 'C01' && kind === 'focal') requireCondition(value.coefficient % 10n ** BigInt(value.scale) === 0n, name + '本格片数必须为整数');
  } else if (['G02', 'G03', 'C03', 'B02'].includes(metric)) {
    requireCondition(compare(value, decimal('-1', name)) >= 0 && compare(value, ONE) <= 0, name + '比例差超出−1—1');
  }
  return value;
}
function csv(view, name, fields, count) {
  const table = plainObject(view.files[PREFIX + name], name);
  sameArray(table.fields, fields, name + '字段');
  requireCondition(Array.isArray(table.rows) && table.rows.length === count, name + '记录数不一致');
  return table.rows.map((row, index) => {
    requireCondition(Array.isArray(row) && row.length === fields.length && row.every((cell) => typeof cell === 'string'),
      name + '第' + (index + 1) + '行必须保留全部原字符串/空字符串');
    return Object.fromEntries(fields.map((field, column) => [field, row[column]]));
  });
}
function sourceMap(view) {
  plainObject(view, 'view'); plainObject(view.files, 'files');
  requireCondition(Array.isArray(view.sources), 'sources必须为数组');
  const sources = new Map();
  for (const source of view.sources) {
    plainObject(source, 'source');
    requireCondition(ALLOWED_SOURCES.has(source.path) && !sources.has(source.path), '来源路径不在白名单或重复');
    requireCondition(Number.isSafeInteger(source.bytes) && source.bytes > 0
      && typeof source.sha256 === 'string' && /^[a-f0-9]{64}$/.test(source.sha256)
      && typeof source.mime_type === 'string' && source.mime_type.length > 0, '来源bytes/SHA/MIME缺失或错误');
    sources.set(source.path, source);
  }
  for (const name of REQUIRED_SOURCES) requireCondition(sources.has(PREFIX + name), '缺少来源' + name);
  const expectedFiles = [NAMES.primary, NAMES.support, NAMES.cases, NAMES.manifest, NAMES.map, NAMES.audit, NAMES.reproduction];
  if (Object.hasOwn(view.files, PREFIX + 'README.md')) {
    requireCondition(typeof view.files[PREFIX + 'README.md'] === 'string', 'README必须保留原字符串');
    expectedFiles.push('README.md');
  }
  sameArray(Object.keys(view.files).sort(), expectedFiles.map((name) => PREFIX + name).sort(), '解析文件白名单');
  return sources;
}
function sourceReference(reference, sources, expectedName) {
  plainObject(reference, '来源引用');
  const source = sources.get(PREFIX + expectedName);
  requireCondition(typeof reference.path === 'string' && (reference.path === source.path
    || reference.path.endsWith('/' + source.path)), expectedName + '引用路径不一致');
  requireCondition(reference.bytes === source.bytes && reference.sha256 === source.sha256, expectedName + '引用bytes/SHA不一致');
}
function assertSummary(summary, metric, stats, csvStrings) {
  plainObject(summary, metric + '支持汇总');
  requireCondition(summary.field === metric && summary.original_unit === UNITS[metric], metric + '指标/单位不一致');
  const readCount = (key) => csvStrings ? integer(summary[key], metric + key) : summary[key];
  requireCondition(readCount('primary_rows') === PRIMARY_COUNT, metric + '主位置数不一致');
  for (const [index, key] of COUNT_KEYS.entries()) {
    requireCondition(readCount(key) === stats[key] && stats[key] === EXPECTED_SUPPORT[metric][index], metric + key + '与逐格值不一致');
  }
  for (const [key, actual] of [['delta_min_original_unit', stats.min], ['delta_max_original_unit', stats.max]]) {
    requireCondition(compare(decimal(summary[key], metric + key), actual) === 0, metric + '极差不一致');
  }
  requireCondition(summary.independent_spatial_samples === (csvStrings ? 'False' : false)
    && summary.heat_relation_calculated === (csvStrings ? 'False' : false), metric + '不得升级独立样本/热关系状态');
}
function inspectManifest(manifest, sources) {
  plainObject(manifest, '核查JSON');
  requireCondition(manifest.schema === 'focal_eight_neighbor_X_description_v1'
    && manifest.primary_rows === PRIMARY_COUNT && manifest.source_nodes === 6567
    && manifest.stored_edges_including_self === 58215 && manifest.self_loops_excluded === 6567,
    '核查schema或来源框架不一致');
  sameArray(manifest.fields, METRICS, '核查六指标');
  for (const metric of METRICS) requireCondition(manifest.units?.[metric] === UNITS[metric], metric + '核查单位错误');
  requireCondition(manifest.crs === 'EPSG:32648' && manifest.grid_size_m === 100
    && manifest.source_role_scope === 'inside_full_all_5871_not_supervision_filtered'
    && manifest.neighbor_definition === 'stored_queen8_excluding_focal_all_eight_required'
    && manifest.mean_rule === 'equal_weight_mean_of_eight_defined_source_cell_values; not_pooled_patch_geometry',
    '对象/尺度/八邻定义不一致');
  requireCondition(manifest.sources_unchanged === true && manifest.saved_csv_roundtrip_verified === true, '来源/回读声明缺失');
  for (const key of SCIENCE_FALSE) requireCondition(manifest[key] === false, key + '必须保留false');
  plainObject(manifest.sources, '原来源引用');
  sameArray(Object.keys(manifest.sources).sort(), ['X', 'edges', 'nodes', 'whitelist'], '原来源键');
  for (const reference of Object.values(manifest.sources)) {
    requireCondition(typeof reference.path === 'string' && Number.isSafeInteger(reference.bytes)
      && reference.bytes > 0 && /^[a-f0-9]{64}$/.test(reference.sha256), '原来源元数据错误');
  }
  requireCondition(Array.isArray(manifest.outputs) && manifest.outputs.length === 3, 'CSV来源输出缺失');
  [NAMES.primary, NAMES.support, NAMES.cases].forEach((name, index) => sourceReference(manifest.outputs[index], sources, name));
}
function inspectMap(map, sources, stats, records, manifest) {
  plainObject(map, '制图核查');
  requireCondition(map.scope === 'source_description_map_only'
    && map.units === 'percentage_points_not_relative_percent_or_temperature'
    && map.maps_same_extent_and_bins === true && map.zero_and_missing_separate === true
    && map.input_hashes_unchanged === true && map.temperature_or_model_read === false
    && map.visual_inspection_performed_by_this_script === false, '制图来源/单位/科学边界错误');
  requireCondition(Array.isArray(map.inputs) && map.inputs.length === 3, '制图输入引用缺失');
  sourceReference(map.inputs[0], sources, NAMES.primary); sourceReference(map.inputs[1], sources, NAMES.cases);
  const mapNodes = map.inputs[2]; const declaredNodes = manifest.sources.nodes;
  requireCondition(mapNodes.path === declaredNodes.path && mapNodes.bytes === declaredNodes.bytes
    && mapNodes.sha256 === declaredNodes.sha256, '制图节点来源与原声明不一致');
  const images = ['本格与周边比例差异.png', '本格与周边比例差异.svg', '差值色阶近似色觉检查.png'];
  requireCondition(Array.isArray(map.outputs) && map.outputs.length === images.length, '制图输出缺失');
  images.forEach((name, index) => sourceReference(map.outputs[index], sources, name));
  requireCondition(Array.isArray(map.classification) && map.classification.length === 2, '制图指标错误');
  for (const [index, metric] of ['G02', 'B02'].entries()) {
    const entry = map.classification[index];
    requireCondition(entry.field === metric && entry.paired_defined === stats[metric].paired_defined_rows
      && entry.undefined_comparison === PRIMARY_COUNT - stats[metric].paired_defined_rows
      && entry.zero_exact_count === stats[metric].equal_rows, metric + '制图支持计数错误');
    const bins = [-100, -40, -20, -5, 5, 20, 40, 100];
    sameArray(entry.fixed_bins_percentage_points, bins, metric + '显示分界');
    const histogram = Array(7).fill(0);
    for (const record of records) {
      const raw = record.row[metric + '_focal_minus_neighbor'];
      if (raw === '') continue;
      const value = Number(raw) * 100;
      const bin = bins.slice(1).findIndex((upper, binIndex) => value < upper || (binIndex === 6 && value <= upper));
      requireCondition(bin >= 0 && value >= bins[0], metric + '图示差值越界');
      histogram[bin]++;
    }
    sameArray(entry.fixed_bin_histogram, histogram, metric + '色阶计数');
    for (const [key, value] of [['min_percentage_points', stats[metric].min], ['max_percentage_points', stats[metric].max]]) {
      const expected = Number(value.coefficient) / 10 ** value.scale * 100;
      requireCondition(typeof entry[key] === 'number' && Number.isFinite(entry[key])
        && Math.abs(entry[key] - expected) < 1e-9, metric + '图示极值错误');
    }
  }
  if (map.root_visual_inspection) requireCondition(map.root_visual_inspection.full_map_accessibility_certified === false,
    '局部色标检查不得升级整图可访问性认证');
}
function inspectAudit(audit, sources, manifest, stats) {
  if (!sources.has(PREFIX + NAMES.audit)) return { state: 'not_registered', checked_by_this_module: false };
  plainObject(audit, '独立核查');
  requireCondition(audit.status === 'pass_with_upstream_numeric_precision_note' && Array.isArray(audit.blocking_findings)
    && audit.blocking_findings.length === 0 && audit.scope === 'independent_X_only_coordinate_reconstruction_all_primary_locations'
    && Number.isFinite(Date.parse(audit.checked_at_Asia_Shanghai)), '独立审核状态/范围错误');
  const method = plainObject(audit.method, '独立方法');
  for (const key of ['stored_edges_read_by_auditor', 'producer_imported_or_run', 'raw_raster_or_geometry_read',
    'Y_temperature_targets_model_weights_predictions_read', 'filter_by_proxy_input_accepted']) {
    requireCondition(method[key] === false, '独立审核范围升级：' + key);
  }
  const accounting = plainObject(audit.accounting, '独立核查计数');
  for (const [key, value] of Object.entries({
    source_X_nodes: 6567, source_coordinate_nodes: 6567, primary_rows: PRIMARY_COUNT,
    all_primary_neighbor_sets_verified: PRIMARY_COUNT, neighbor_memberships: PRIMARY_COUNT * NEIGHBOR_COUNT,
    focal_raw_snapshot_values_checked: PRIMARY_COUNT * METRICS.length,
    mean_or_blank_checks: PRIMARY_COUNT * METRICS.length, delta_or_blank_checks: PRIMARY_COUNT * METRICS.length,
  })) requireCondition(accounting[key] === value, '独立审核计数不一致：' + key);
  requireCondition(accounting.proxy_input_accepted_counts_retained?.True === 5440
    && accounting.proxy_input_accepted_counts_retained?.False === 431, '独立审核不得筛除未准入本格');
  const bindings = [
    ['producer_manifest', NAMES.manifest], ['saved_5871', NAMES.primary],
    ['saved_six_summary', NAMES.support], ['saved_three_examples', NAMES.cases],
  ];
  for (const [key, name] of bindings) {
    const entry = plainObject(audit.inputs?.[key], '审核输入' + key);
    sourceReference({ ...entry, sha256: entry.sha256_before }, sources, name);
    requireCondition(entry.unchanged === true && entry.sha256_after === entry.sha256_before, key + '审核前后来源改变');
  }
  for (const [key, sourceName] of [['X_snapshot', 'X'], ['node_coordinates', 'nodes'], ['whitelist', 'whitelist']]) {
    const entry = plainObject(audit.inputs?.[key], key);
    const declared = manifest.sources[sourceName];
    requireCondition(entry.path === declared.path && entry.bytes === declared.bytes
      && entry.sha256_before === declared.sha256 && entry.sha256_after === declared.sha256
      && entry.unchanged === true, key + '与描述声明原源不一致');
  }
  for (const key of SCIENCE_FALSE) requireCondition(audit.scientific_flags_checked?.[key] === false, '审核科学状态升级：' + key);
  requireCondition(audit.source_formal_plan_product_modified === false, '审核改写来源或计划');
  requireCondition(Array.isArray(audit.support_summary_independently_recomputed)
    && audit.support_summary_independently_recomputed.length === METRICS.length, '独立支持汇总缺失');
  for (const [index, metric] of METRICS.entries()) assertSummary(audit.support_summary_independently_recomputed[index], metric, stats[metric], false);
  return {
    state: audit.status, source_path: PREFIX + NAMES.audit, checked_at: audit.checked_at_Asia_Shanghai,
    source_bound_report: true, checked_by_this_module: false,
    scope: audit.scope, nonblocking_findings: audit.nonblocking_findings,
  };
}
function inspectReproduction(report, sources) {
  plainObject(report, '复现与接纳检查');
  requireCondition(report.scope === 'actual_temp_directory_reproduction_canonical_outputs_unchanged'
    && report.primary_rows === PRIMARY_COUNT && report.actual_admission_tests_passed === 7
    && report.admission_test_scope === 'support_missingness_true_zero_state_conflict_invalid_share_self_exclusion_edge_identity'
    && report.temperature_or_weights_read === false && report.source_files_changed === false
    && report.canonical_manifest_rewritten === false && report.temporary_outputs_removed === true,
    '源端复现范围/接纳检查声明不一致');
  requireCondition(Array.isArray(report.CSV_reproduction) && report.CSV_reproduction.length === 3, '复现CSV记录缺失');
  for (const [index, name] of [NAMES.primary, NAMES.support, NAMES.cases].entries()) {
    const entry = report.CSV_reproduction[index]; const original = sources.get(PREFIX + name);
    requireCondition(entry.file === name && entry.identical === true && entry.canonical_sha256 === original.sha256
      && entry.reproduced_sha256 === original.sha256, '复现CSV原字节身份不一致：' + name);
  }
  return {
    source_path: PREFIX + NAMES.reproduction, scope: report.scope,
    source_report_bound: true, reproduced_by_this_module: false,
    actual_source_admission_tests_passed: report.actual_admission_tests_passed,
    original_fields_retained_in_view: true,
  };
}

/**
 * Validate frozen, source-only focal/eight-neighbor description semantics.
 * All CSV cells and input objects stay unchanged. The registration layer must
 * independently verify original file bytes/SHA; this pure function does no I/O.
 * Arithmetic is exact for all differences and means whose eight focal source
 * values occur in the 5871-row view. Boundary/context values are not fabricated:
 * their full-source arithmetic is attributed only to a hash-bound audit report.
 * Complexity: O(primary rows × six metrics × eight neighbors), with O(rows) memory.
 *
 * @param {{sources: Array<{path:string,bytes:number,sha256:string,mime_type:string}>, files:Object}} view
 * @returns {Object} Source-only semantic summary, with closed application gates.
 * @throws {Error} When identities, support, arithmetic, source binding or states disagree.
 */
export function validateFocalNeighborDescription(view) {
  const sources = sourceMap(view);
  const manifest = view.files[PREFIX + NAMES.manifest];
  inspectManifest(manifest, sources);
  const rows = csv(view, NAMES.primary, PRIMARY_FIELDS, PRIMARY_COUNT);
  const supportRows = csv(view, NAMES.support, SUPPORT_FIELDS, METRICS.length);
  const examples = csv(view, NAMES.cases, ['case_selection', ...PRIMARY_FIELDS], EXPECTED_CASES.length);
  const records = []; const byGrid = new Map(); const nodeIndices = new Set();
  const proxyCounts = { True: 0, False: 0 };
  const stats = Object.fromEntries(METRICS.map((metric) => [metric, {
    primary_rows: PRIMARY_COUNT, paired_defined_rows: 0, focal_undefined_rows: 0,
    neighbor_support_incomplete_rows: 0, focal_above_neighbor_rows: 0, equal_rows: 0,
    focal_below_neighbor_rows: 0, undefined_overlap_rows: 0, direct_complete8_mean_checks: 0,
    context_mean_rows: 0, min: null, max: null,
  }]));
  for (const row of rows) {
    const e = integer(row.e_cell, 'e_cell'); const n = integer(row.n_cell, 'n_cell');
    const id = 'E' + e + '_N' + n; const index = integer(row.node_index, id + 'node_index', 6566);
    requireCondition(row.grid_id === id && !byGrid.has(id) && !nodeIndices.has(index), '网格键/源索引重复或不一致：' + id);
    requireCondition(compare(decimal(row.center_e_m, id + 'center_e_m'), decimal(String(e * 100 + 50), id)) === 0
      && compare(decimal(row.center_n_m, id + 'center_n_m'), decimal(String(n * 100 + 50), id)) === 0, '源中心坐标不一致：' + id);
    requireCondition(row.role === 'inside_full' && row.variant === 'c4_min0'
      && row.neighbor_definition === 'queen8_excluding_focal' && row.scientific_status === STATUS
      && integer(row.neighbor_count, id + 'neighbor_count') === NEIGHBOR_COUNT, '本格来源角色/状态/邻域定义错误：' + id);
    requireCondition(Object.hasOwn(proxyCounts, row.proxy_input_accepted_source), '整行代理准入必须保留True/False原字符串');
    proxyCounts[row.proxy_input_accepted_source]++;
    const expected = [];
    for (let dn = -1; dn <= 1; dn++) for (let de = -1; de <= 1; de++) {
      if (de !== 0 || dn !== 0) expected.push('E' + (e + de) + '_N' + (n + dn));
    }
    const neighborIds = row.neighbor_grid_ids.split('|');
    sameArray(neighborIds, expected, id + '八邻ID（排除本格）');
    let roles;
    try { roles = JSON.parse(row.neighbor_role_counts); } catch { throw new Error('本格与周边描述：邻格角色JSON错误：' + id); }
    plainObject(roles, id + 'neighbor_role_counts');
    requireCondition(Object.keys(roles).every((role) => ['inside_full', 'boundary_intersect', 'outer_context'].includes(role))
      && Object.values(roles).every((count) => Number.isSafeInteger(count) && count > 0)
      && Object.values(roles).reduce((sum, count) => sum + count, 0) === NEIGHBOR_COUNT, id + '邻格角色计数错误');
    const metrics = {};
    for (const metric of METRICS) {
      const tag = id + '/' + metric;
      const focalRaw = row[metric + '_focal_raw']; const focalState = row[metric + '_focal_state'];
      const missing = focalRaw === '';
      requireCondition(focalState === (missing
        ? metric === 'C03' ? 'inapplicable_no_green' : metric === 'B02' ? 'source_missing_reason_not_resolved' : null
        : 'defined'), tag + '空值/结构不适用/未知状态错误');
      const focal = missing ? null : metricNumber(focalRaw, metric, tag);
      const valid = integer(row[metric + '_neighbor_valid_count'], tag + 'valid_count', NEIGHBOR_COUNT);
      const undefinedCount = integer(row[metric + '_neighbor_undefined_count'], tag + 'undefined_count', NEIGHBOR_COUNT);
      requireCondition(valid + undefinedCount === NEIGHBOR_COUNT, tag + '支持必须为固定八格');
      const complete = valid === NEIGHBOR_COUNT;
      const meanRaw = row[metric + '_neighbor_mean_complete8']; const deltaRaw = row[metric + '_focal_minus_neighbor'];
      requireCondition((meanRaw !== '') === complete && (deltaRaw !== '') === (complete && !missing), tag + '不得补0或使用剩余邻格均值');
      const mean = complete ? metricNumber(meanRaw, metric, tag + 'mean', 'mean') : null;
      const delta = complete && !missing ? metricNumber(deltaRaw, metric, tag + 'delta', 'delta') : null;
      const status = missing ? 'focal_undefined' : complete ? 'paired_defined' : 'neighbor_support_incomplete';
      requireCondition(row[metric + '_comparison_status'] === status, tag + '对照状态不一致');
      const metricStats = stats[metric];
      if (missing) metricStats.focal_undefined_rows++;
      if (!complete) metricStats.neighbor_support_incomplete_rows++;
      if (missing && !complete) metricStats.undefined_overlap_rows++;
      if (delta) {
        requireCondition(compare(delta, subtract(focal, mean)) === 0, tag + '差值不是本格减完整八邻均值');
        metricStats.paired_defined_rows++;
        const sign = compare(delta, ZERO);
        metricStats[sign > 0 ? 'focal_above_neighbor_rows' : sign < 0 ? 'focal_below_neighbor_rows' : 'equal_rows']++;
        if (metricStats.min === null || compare(delta, metricStats.min) < 0) metricStats.min = delta;
        if (metricStats.max === null || compare(delta, metricStats.max) > 0) metricStats.max = delta;
      }
      metrics[metric] = { focal, mean, delta, valid, undefinedCount };
    }
    requireCondition((metrics.C03.focal === null) === (compare(metrics.G02.focal, ZERO) === 0), id + 'C03无绿结构不适用不得填0');
    requireCondition(compare(metrics.G03.focal, metrics.G02.focal) <= 0, id + '树灌合类比例超过全植被');
    const record = { row, neighborIds, roles, metrics };
    records.push(record); byGrid.set(id, record); nodeIndices.add(index);
  }
  requireCondition(proxyCounts.True === 5440 && proxyCounts.False === 431, '不得筛除或升级整行代理输入未准入的431格');
  let allPrimaryNeighborRows = 0;
  for (const record of records) {
    const known = record.neighborIds.map((id) => byGrid.get(id)).filter(Boolean);
    requireCondition((record.roles.inside_full || 0) === known.length, record.row.grid_id + '邻格角色与主位置键集合不一致');
    if (known.length === NEIGHBOR_COUNT) allPrimaryNeighborRows++;
    for (const metric of METRICS) {
      const data = record.metrics[metric]; const label = record.row.grid_id + '/' + metric;
      const values = known.map((neighbor) => neighbor.metrics[metric].focal);
      const knownDefined = values.filter((value) => value !== null);
      const knownMissing = values.length - knownDefined.length;
      requireCondition(data.valid >= knownDefined.length && data.undefinedCount >= knownMissing, label + '邻格支持与已知源值不一致');
      if (known.length === NEIGHBOR_COUNT) {
        requireCondition(data.valid === knownDefined.length && data.undefinedCount === knownMissing, label + '八格支持计数错误');
        if (data.mean) {
          const sum = knownDefined.reduce(add, ZERO);
          requireCondition(compare({ coefficient: data.mean.coefficient * 8n, scale: data.mean.scale }, sum) === 0,
            label + '均值不等于八个原值的等权均值');
          stats[metric].direct_complete8_mean_checks++;
        }
      } else if (data.mean) stats[metric].context_mean_rows++;
    }
  }
  requireCondition(Array.isArray(manifest.support_summary) && manifest.support_summary.length === METRICS.length, '六指标核查汇总缺失');
  for (const [index, metric] of METRICS.entries()) {
    assertSummary(supportRows[index], metric, stats[metric], true);
    assertSummary(manifest.support_summary[index], metric, stats[metric], false);
  }
  for (const [index, [selection, gridId]] of EXPECTED_CASES.entries()) {
    const example = examples[index]; const original = byGrid.get(gridId);
    requireCondition(example.case_selection === selection && example.grid_id === gridId && original, '案例身份/选择规则错误');
    for (const field of PRIMARY_FIELDS) requireCondition(example[field] === original.row[field], '案例原字符串与逐格行不一致：' + gridId + '/' + field);
  }
  const pilot = byGrid.get('E4125_N33891').row;
  requireCondition(pilot.G02_focal_raw === '0.1989' && pilot.G02_neighbor_mean_complete8 === '0.6550'
    && pilot.G02_focal_minus_neighbor === '-0.4561' && pilot.B02_comparison_status === 'neighbor_support_incomplete'
    && pilot.B02_neighbor_mean_complete8 === '' && pilot.B02_focal_minus_neighbor === '', '共同案例数量或屋顶支持错误');
  const negative = byGrid.get(EXPECTED_CASES[2][1]).row;
  requireCondition(negative.proxy_input_accepted_source === 'False', '极值案例不得升级整行输入准入');
  requireCondition(compare(byGrid.get(EXPECTED_CASES[1][1]).metrics.G02.delta, stats.G02.max) === 0
    && compare(byGrid.get(EXPECTED_CASES[2][1]).metrics.G02.delta, stats.G02.min) === 0, '极值案例选择不符合来源差值');
  inspectMap(view.files[PREFIX + NAMES.map], sources, stats, records, manifest);
  const audit = inspectAudit(view.files[PREFIX + NAMES.audit], sources, manifest, stats);
  const reproduction = inspectReproduction(view.files[PREFIX + NAMES.reproduction], sources);
  return {
    scientific_status: STATUS, primary_rows: PRIMARY_COUNT, metrics: METRICS.slice(),
    research_namespace: 'macro:proxy_v1:c4_min0:EPSG32648:100m',
    source_paths: REQUIRED_SOURCES.map((name) => PREFIX + name),
    source_identity: {
      product_version: 'proxy_v1', variant: 'c4_min0',
      manifest: { ...sources.get(PREFIX + NAMES.manifest) },
      original_source_references: Object.fromEntries(Object.entries(manifest.sources).map(([key, value]) => [key, { ...value }])),
      same_grid_id_automatically_merges_historical_scene_or_preparation: false,
    },
    support_rows: supportRows.length, example_rows: examples.length,
    neighbor_definition: manifest.neighbor_definition, crs: manifest.crs, grid_size_m: manifest.grid_size_m,
    proxy_input_accepted_counts_retained: proxyCounts, primary_keys_unique: true,
    neighbor_sets_checked: PRIMARY_COUNT, neighbor_memberships: PRIMARY_COUNT * NEIGHBOR_COUNT,
    support: Object.fromEntries(METRICS.map((metric) => [metric, {
      original_unit: UNITS[metric], paired_defined_rows: stats[metric].paired_defined_rows,
      focal_undefined_rows: stats[metric].focal_undefined_rows,
      neighbor_support_incomplete_rows: stats[metric].neighbor_support_incomplete_rows,
      undefined_overlap_rows: stats[metric].undefined_overlap_rows,
      undefined_comparison_rows: PRIMARY_COUNT - stats[metric].paired_defined_rows,
      direct_complete8_mean_checks: stats[metric].direct_complete8_mean_checks,
      context_mean_rows: stats[metric].context_mean_rows,
    }])),
    arithmetic_verification: {
      difference_or_blank_checks: PRIMARY_COUNT * METRICS.length, all_primary_neighbor_rows: allPrimaryNeighborRows,
      method: 'exact_decimal_saved_value_contract_checks_not_new_research',
      external_context_values_in_view: false, full_source_audit: audit,
      source_reproduction_report: reproduction,
      source_bytes_verified_by_this_function: false,
    },
    shared_case: {
      grid_id: pilot.grid_id, G02_focal_share_raw: pilot.G02_focal_raw,
      G02_neighbor_share_raw: pilot.G02_neighbor_mean_complete8, G02_difference_share_raw: pilot.G02_focal_minus_neighbor,
      focal_percent: 19.89, neighbor_percent: 65.5, difference_percentage_points: -45.61,
      B02_neighbor_mean: null, B02_difference: null, B02_status: pilot.B02_comparison_status,
    },
    scientific_limits: [
      '来源描述；比例差以百分点表示，不是相对百分比、温度关系、冷却或服务。',
      'C03无绿结构不适用与B02来源未知分别保持空；两类缺项重叠不能相加。',
      '邻域共享对象不是独立空间样本；局部片数与最大本格片段份额均值不等于合并邻域量。',
      '极值仅为说明案例，不是典型分组、优先改造对象或已验证受体。',
      'proxy_v1/c4_min0异期代理；同期与来源精度未认证，网格不认证真实街区或高密度资格。',
    ],
    operation_gates: {
      validated_new_site_prediction: false, physical_cooling: false, comfort_accessibility: false,
      actual_use: false, equity_results: false, minimum_area_search: false, optimal_recommendation: false,
    },
  };
}
