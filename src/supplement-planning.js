/**
 * Pure semantic checks of two explicitly supplied compact planning snapshots.
 * No I/O, source-path traversal, model execution, inferred responses or mutation.
 * The caller must verify original bytes/hashes and exact decoded source fields.
 * Embedded upstream hashes are references, never proof of opening those files.
 */
const DESCRIPTION_DIR = '共享接口/规划描述底稿/';
const DEVELOPMENT_DIR = '共享接口/规划开发增补/';
const DESCRIPTION_PATHS = ['README.md', '现状指标描述统计.csv', '描述范围与适用状态核查.json', '现状绿色组织与建成背景.png'].map(name => DESCRIPTION_DIR + name);
const DEVELOPMENT_PATHS = ['说明与边界.md', '开发增补来源绑定.json', '配置开发误差_紧凑.csv', '配对增量_紧凑.csv'].map(name => DEVELOPMENT_DIR + name);
const METRICS = ['G02', 'G03', 'C01', 'C03', 'C06', 'B02'];
const ROLES = { inside_full: 5871, boundary_intersect: 344, outer_context: 352 };
const ACCEPTED = { inside_full: 5440, boundary_intersect: 259, outer_context: 300 };
const NO_GREEN = { inside_full: 578, boundary_intersect: 71, outer_context: 50 };
const ROOF_MISSING = { inside_full: 103, boundary_intersect: 32, outer_context: 13 };
const DESCRIPTION_FIELDS = ['scope_role', 'scope_label', 'field', 'current_definition_name', 'display_name', 'unit_raw', 'family', 'variant', 'denominator_all_role_nodes', 'finite_numeric_n', 'finite_pct_of_all', 'numeric_null_n', 'structural_inapplicable_null_n', 'source_unknown_or_unspecified_null_n', 'nonfinite_nonnull_n', 'observed_zero_n', 'observed_zero_pct_of_all', 'native_state_field', 'native_state_counts_json', 'min', 'p05', 'p25', 'median', 'p75', 'p95', 'max', 'mean', 'sample_sd_ddof1', 'quantile_method', 'summary_denominator', 'proxy_input_accepted_n_of_role', 'filtered_on_proxy_input_accepted', 'source_column', 'upstream_source_path_reference_only', 'definition_note', 'input_version', 'source_X_sha256', 'generated_at_Asia_Shanghai'];
const CONFIG_FIELDS = ['stage', 'scope', 'axis', 'level', 'width', 'aggregation', 'configuration', 'MAE_C_mean', 'MAE_C_sample_SD', 'RMSE_C_mean', 'RMSE_C_sample_SD', 'R2_mean', 'R2_sample_SD', 'spatial_folds', 'seed_metrics_per_fold', 'source_id', 'source_data_row', 'source_sha256', 'source_bytes'];
const DELTA_FIELDS = ['delta_MAE_C', 'delta_RMSE_C', 'delta_R2', 'relative_delta_MAE', 'Yscale_delta_MAE'];
const PAIR_FIELDS = ['stage', 'scope', 'axis', 'level', 'width', 'aggregation', 'contrast', 'baseline_configuration', 'candidate_configuration', ...DELTA_FIELDS.flatMap(name => ['mean', 'sample_SD', 'defined_folds', 'positive_folds'].map(suffix => name + '_' + suffix)), 'spatial_folds', 'seed_metrics_per_fold', 'source_id', 'source_data_row', 'source_sha256', 'source_bytes'];
const DROPS = ['DROP_Q', 'DROP_C', 'DROP_BUILDING_INTENSITY', 'DROP_BUILDING_LAYOUT', 'DROP_HEIGHT_SUMMARY'];
const CR_PAIRS = { CR_joint: ['C0_R0', 'C1_R1'], C_given_R: ['C0_R1', 'C1_R1'], C_without_R: ['C0_R0', 'C1_R0'], R_given_C: ['C1_R0', 'C1_R1'], R_without_C: ['C0_R0', 'C0_R1'] };
const SCIENTIFIC_GATES = ['planning_response_validated', 'physical_cooling_validated', 'causal_effect_validated', 'pedestrian_temperature_validated', 'thermal_comfort_validated', 'actual_access_service_validated', 'equity_application_validated', 'joint_decision_gain_validated', 'macro_target_adjustment_available', 'minimum_new_green_area_available', 'final_test_evaluated', 'application_ready'];
const OPERATION_GATES = Object.freeze({ prediction: false, physical_simulation: false, service_evaluation: false, fairness_evaluation: false, candidate_generation: false, ranking: false });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('规划资料语义核查：' + message); };
const requireValue = (actual, expected, label) => { if (actual !== expected) fail(label + '不符合来源口径。'); };
const text = (value, label) => { if (typeof value !== 'string' || !value.trim()) fail(label + '缺失。'); return value; };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : isObject(value) ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const same = (actual, expected, label) => { if (canonical(actual) !== canonical(expected)) fail(label + '身份或口径不一致。'); };
const sameSet = (actual, expected, label) => {
  if (!Array.isArray(actual) || actual.length !== expected.length || new Set(actual).size !== expected.length || !expected.every(value => actual.includes(value))) fail(label + '集合缺项、重复或含未知项。');
};
const close = (actual, expected, label) => {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > 1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected))) fail(label + '交叉计数或有符号均值不一致。');
};
function number(value, label) {
  // Empty CSV cells are never coerced to zero. Keep the supplied strings intact.
  if (typeof value !== 'string' || !value.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) fail(label + '必须是原有限数值字符串，空项不能补零。');
  return Number(value);
}
function count(value, label) {
  const result = number(value, label);
  if (!Number.isSafeInteger(result) || result < 0) fail(label + '必须是非负整数计数。');
  return result;
}
function keys(value, expected, label) {
  if (!isObject(value)) fail(label + '缺少对象。');
  sameSet(Object.keys(value), expected, label);
}
function sourceIdentity(value, label) {
  if (!isObject(value) || typeof value.path !== 'string' || !value.path || !hash(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes <= 0) fail(label + '缺少完整路径、SHA256或字节身份。');
}
function matchSource(actual, expected, label) {
  sourceIdentity(actual, label); sourceIdentity(expected, label);
  for (const key of ['path', 'bytes', 'sha256']) requireValue(actual[key], expected[key], label + '.' + key);
}
function viewSources(view, paths) {
  if (!isObject(view) || !isObject(view.files) || !Array.isArray(view.sources)) fail('缺少已验证的view.files或view.sources。');
  const result = new Map();
  for (const path of paths) {
    const matches = view.sources.filter(source => source?.path === path);
    if (matches.length !== 1) fail('显式成果路径缺失或重复：' + path);
    sourceIdentity(matches[0], path); text(matches[0].mime_type, path + ' MIME');
    result.set(path, matches[0]);
  }
  return result;
}
function outputIdentity(record, source, label) {
  sourceIdentity(record, label);
  // Retain original absolute provenance while matching the portable relative key.
  if (!record.path.endsWith('/' + source.path)) fail(label + '路径不对应显式成果。');
  requireValue(record.bytes, source.bytes, label + '字节数');
  requireValue(record.sha256, source.sha256, label + 'SHA256');
}
function json(view, path) {
  if (!isObject(view.files[path])) fail('缺少已解码JSON：' + path);
  return view.files[path];
}
function csv(view, path, fields, rowCount) {
  const table = view.files[path];
  if (!isObject(table) || !Array.isArray(table.rows)) fail('缺少原字符串CSV：' + path);
  sameSet(table.fields, fields, path + '完整字段');
  requireValue(table.rows.length, rowCount, path + '行数');
  return table.rows.map((row, index) => {
    if (!Array.isArray(row) || row.length !== fields.length || !row.every(cell => typeof cell === 'string')) fail(path + '第' + (index + 1) + '行必须保留完整原字符串及空字符串。');
    return Object.fromEntries(table.fields.map((field, position) => [field, row[position]]));
  });
}
function falseFields(value, expected, label) {
  if (!isObject(value)) fail(label + '缺失。');
  for (const key of expected) requireValue(value[key], false, label + '.' + key);
}

export function validatePlanningSourceDescription(view) {
  const sources = viewSources(view, DESCRIPTION_PATHS);
  const report = json(view, DESCRIPTION_PATHS[2]);
  const rows = csv(view, DESCRIPTION_PATHS[1], DESCRIPTION_FIELDS, 18);
  requireValue(report.version, 'descriptive_X_snapshot_v1', '描述版本');
  requireValue(report.status, 'descriptive_X_snapshot_saved_readback_and_visual_review_completed', '描述状态');
  requireValue(report.input_version, 'proxy_v1', '描述输入版本');
  requireValue(report.variant, 'c4_min0', '描述口径');
  requireValue(report.connectivity, 4, '连通规则');
  requireValue(report.minimum_source_area_m2, 0, '最小源斑块面积');
  falseFields(report, ['source_epoch_synchronous_2020_verified', 'physical_causal_intervention_verified'], '描述科学边界');
  falseFields(report.reads_contract, ['Y_or_labels_read', 'development_or_final_prediction_table_read', 'weights_read', 'training_or_inference_run', 'new_spatial_hypothesis_statistics_run', 'filter_by_temperature_error_or_partition', 'original_plans_modified', 'frozen_nine_grid_or_14_member_bundle_modified'], '描述读取范围');
  requireValue(report.source_hashes_unchanged, true, '描述来源稳定性');
  requireValue(report.upstream_files_referenced_only_not_newly_verified, true, '上游仅作引用');
  keys(report.sources, ['X', 'whitelist', 'definitions', 'input_manifest', 'domain_definition'], '描述五个上游引用');
  keys(report.sources_after, Object.keys(report.sources), '描述读取后引用');
  for (const id of Object.keys(report.sources)) matchSource(report.sources_after[id], report.sources[id], '上游引用' + id);
  for (const path of [DESCRIPTION_PATHS[0], DESCRIPTION_PATHS[1], DESCRIPTION_PATHS[3]]) outputIdentity(report.output_records?.[path.slice(DESCRIPTION_DIR.length)], sources.get(path), '描述输出' + path);

  const contract = report.statistical_contract;
  sameSet(contract?.metrics, METRICS, '描述指标');
  sameSet(contract?.roles, Object.keys(ROLES), '来源角色');
  requireValue(contract.summary_rows, 18, '描述摘要行数');
  requireValue(contract.complete_denominator, 'all nodes of each role; not input-accepted subset', '完整分母');
  requireValue(contract.quantile_denominator, 'finite numeric values of each variable and role independently', '逐指标有限值分母');
  requireValue(contract.nulls_not_imputed, true, '描述缺项保留');
  requireValue(contract.zeros_preserved, true, '描述真零保留');
  requireValue(contract.quantile_method, 'linear interpolation', '分位方法');
  requireValue(contract.sd, 'sample; ddof=1', '描述标准差');
  requireValue(contract.unit_C06, 'm/m²; divide genuine boundary length by10000m²', '边缘密度单位');
  requireValue(contract.ratio_C03_denominator, 'vegetation area, not whole cell area', '最大片份额分母');
  falseFields(contract, ['B02_native_missing_state_available', 'temperature_relation_effect_size_or_threshold_computed'], '描述统计边界');
  requireValue(report.geometry?.crs, 'EPSG:32648', '描述原投影');
  requireValue(report.geometry.cell_size_m, 100, '描述格宽');
  close(report.geometry.main_whole_square_area_km2, ROLES.inside_full * 10000 / 1e6, '描述整格面积');
  requireValue(report.geometry.center_match_does_not_validate_source_registration, true, '中心一致不认证配准');
  same(report.checks?.role_counts_actual, ROLES, '描述角色计数');
  for (const [key, value] of Object.entries(report.checks ?? {})) if (typeof value === 'boolean') requireValue(value, true, '原描述检查' + key);
  requireValue(report.checks?.center_e_max_abs_error_m, 0, '东西中心偏差');
  requireValue(report.checks?.center_n_max_abs_error_m, 0, '南北中心偏差');
  same(report.checks?.nonfinite_not_null_count, Object.fromEntries(METRICS.map(field => [field, 0])), '非有限值计数');
  keys(report.field_definitions_and_mapping, METRICS, '描述字段映射');
  keys(report.role_counts_and_state_checks, Object.keys(ROLES), '角色状态核查');

  const definitions = {
    G02: ['比例0—1', 'Q', 'G02', null, 'G02=(A_2+A_3)/D_i'],
    G03: ['比例0—1', 'Q', 'G03', null, 'G03=A_2/D_i'],
    C01: ['个', 'C', 'C01', null, 'C01=N_i=格内按指定4/8规则重新识别的正面积连通组分数'],
    C03: ['比例0—1', 'C', 'C03__value', 'C03__state', 'C03=max_k(a_ik)/A_g；A_g>0时定义；内部最大连片面积=10000·G02·C03'],
    C06: ['米/平方米', 'C', 'C06', null, 'T_Gi=(∂G_full∩Ω_i的已知真实边段)∩closure(G_full∩interior(Ω_i))；L_Gi=length(T_Gi)；C06=L_Gi/D_i'],
    B02: ['比例0—1', 'H', 'B02_observed_union_ratio_diagnostic', null, 'B02=A_B/D_i=|∪_{j∈J_i}P_ij|/10000'],
  };
  const indexed = new Map();
  for (const row of rows) {
    const identity = row.scope_role + ':' + row.field;
    if (!(row.scope_role in ROLES) || !METRICS.includes(row.field) || indexed.has(identity)) fail('描述角色×指标身份未知或重复：' + identity);
    indexed.set(identity, row);
    const n = ROLES[row.scope_role], definition = report.field_definitions_and_mapping[row.field];
    const [unit, family, column, state, formula] = definitions[row.field];
    requireValue(definition.unit, unit, identity + '原单位');
    requireValue(definition.source_column, column, identity + '来源列');
    requireValue(definition.state_companion, state, identity + '伴随状态');
    requireValue(definition.formula, formula, identity + '指标定义');
    for (const [field, value] of Object.entries({ unit_raw: unit, family, source_column: column, native_state_field: state ?? '', current_definition_name: definition.name, display_name: definition.display_name, definition_note: definition.note, upstream_source_path_reference_only: definition.source_path_reference_only, input_version: report.input_version, variant: report.variant, source_X_sha256: report.sources.X.sha256, generated_at_Asia_Shanghai: report.generated_at_Asia_Shanghai, filtered_on_proxy_input_accepted: 'False', quantile_method: 'linear interpolation', summary_denominator: 'finite_numeric_n; each variable separately; no common-complete-row filter' })) requireValue(row[field], value, identity + '.' + field);
    requireValue(count(row.denominator_all_role_nodes, identity), n, identity + '全角色分母');
    requireValue(count(row.proxy_input_accepted_n_of_role, identity), ACCEPTED[row.scope_role], identity + '准入背景计数');
    const finite = count(row.finite_numeric_n, identity), missing = count(row.numeric_null_n, identity), na = count(row.structural_inapplicable_null_n, identity), unknown = count(row.source_unknown_or_unspecified_null_n, identity), nonfinite = count(row.nonfinite_nonnull_n, identity), zero = count(row.observed_zero_n, identity);
    requireValue(finite + missing + nonfinite, n, identity + '数值总账');
    requireValue(na + unknown, missing, identity + '空项角色总账');
    requireValue(nonfinite, 0, identity + '非有限值');
    if (zero > finite) fail(identity + '真零不能超过有限值分母。');
    close(number(row.finite_pct_of_all, identity), finite / n * 100, identity + '有限百分比');
    close(number(row.observed_zero_pct_of_all, identity), zero / n * 100, identity + '真零百分比');
    let states;
    try { states = JSON.parse(row.native_state_counts_json); } catch { fail(identity + '原伴随状态JSON无效。'); }
    if (row.field === 'C03') {
      requireValue(missing, NO_GREEN[row.scope_role], identity + '无绿不适用计数');
      requireValue(na, missing, identity + '结构不适用'); requireValue(unknown, 0, identity + '资料未知'); requireValue(zero, 0, identity + '不适用不能填真零');
      same(states, { defined: finite, inapplicable_no_green: missing }, identity + '原生C03状态');
    } else {
      same(states, {}, identity + '没有原生伴随状态'); requireValue(na, 0, identity + '结构不适用');
      requireValue(missing, row.field === 'B02' ? ROOF_MISSING[row.scope_role] : 0, identity + '资料缺值');
      requireValue(unknown, missing, identity + '资料未知');
    }
    const ordered = ['min', 'p05', 'p25', 'median', 'p75', 'p95', 'max'].map(field => number(row[field], identity + '.' + field));
    if (ordered[0] < 0 || ordered.some((value, index) => index > 0 && value < ordered[index - 1])) fail(identity + '范围或分位次序无效。');
    const mean = number(row.mean, identity), sd = number(row.sample_sd_ddof1, identity);
    if (mean < ordered[0] || mean > ordered.at(-1) || sd < 0) fail(identity + '均值或样本SD超出合法范围。');
    if (unit === '比例0—1' && ordered.at(-1) > 1) fail(identity + '原比例不能变成百分数。');
    if (row.field === 'C03' && ordered[0] <= 0) fail(identity + '有绿最大片份额必须为正。');
    if (row.field === 'C01' && (!Number.isInteger(ordered[0]) || !Number.isInteger(ordered.at(-1)))) fail(identity + '片数范围必须是整数。');
  }
  for (const [role, n] of Object.entries(ROLES)) {
    for (const field of METRICS) if (!indexed.has(role + ':' + field)) fail('描述完整角色×指标集合缺项。');
    const at = field => indexed.get(role + ':' + field), check = report.role_counts_and_state_checks[role];
    requireValue(check.node_n, n, role + 'JSON节点总数'); requireValue(check.proxy_input_accepted_n, ACCEPTED[role], role + 'JSON准入背景');
    same(check.C03_native_state_counts, { defined: n - NO_GREEN[role], inapplicable_no_green: NO_GREEN[role] }, role + 'JSON无绿状态');
    requireValue(check.B02_numeric_missing_n, ROOF_MISSING[role], role + 'JSON屋顶缺项');
    const diagnostic = check.B02_missing_R01_diagnostic_state_counts;
    keys(diagnostic, ['source_unknown_no_observed_roof', 'structural_na_no_green'], role + 'R01辅助诊断');
    close(Object.values(diagnostic).reduce((sum, value) => sum + value, 0), ROOF_MISSING[role], role + 'R01诊断总数');
    requireValue(check.B02_missing_state_interpretation, 'B02 has no native companion; R01 is a different construct and cannot classify B02 as structurally inapplicable. All B02 nulls remain source_unknown_or_unspecified.', role + '屋顶缺项解释');
    requireValue(count(at('G02').observed_zero_n, role), NO_GREEN[role], role + '植被真零');
    requireValue(at('C01').observed_zero_n, at('G02').observed_zero_n, role + '片数零与无绿');
    if (count(at('G03').observed_zero_n, role) < NO_GREEN[role] || count(at('C06').observed_zero_n, role) < NO_GREEN[role]) fail(role + '树灌或真实边缘零值不能少于无绿格。');
    for (const field of ['min', 'p05', 'p25', 'median', 'p75', 'p95', 'max', 'mean']) if (number(at('G03')[field], role) > number(at('G02')[field], role) + 1e-10) fail(role + '树灌份额不能大于总植被份额。');
  }
  const style = report.map_style;
  sameSet(style?.panels, ['G02', 'C01', 'C03', 'B02'], '四幅原图指标');
  requireValue(style.context_roles_outline_only, true, '外围仅轮廓');
  requireValue(style.class_thresholds_are_not_planning_thresholds, true, '分级不为规划阈值');
  for (const field of ['G02', 'C03', 'B02']) {
    const mapping = style.ratio_mapping?.[field];
    same(mapping?.fixed_percent_breaks, [0, 20, 40, 60, 80, 100], field + '仅图面百分比色阶');
    const finite = count(indexed.get('inside_full:' + field).finite_numeric_n, field);
    requireValue(mapping.finite_n, finite, field + '图面有限值');
    if (!Array.isArray(mapping.bin_counts_main_finite) || mapping.bin_counts_main_finite.length !== 5 || !mapping.bin_counts_main_finite.every(value => Number.isSafeInteger(value) && value >= 0)) fail(field + '图面五级计数无效。');
    requireValue(mapping.bin_counts_main_finite.reduce((sum, value) => sum + value, 0), finite, field + '图面分母');
  }
  requireValue(report.readback?.CSV_rows, 18, '原回读行数'); requireValue(report.readback.CSV_columns, 38, '原回读列数');
  requireValue(report.readback.CSV_accounting_passed, true, '原计数回读');
  requireValue(report.readback.visual_review?.full_map_all_CVD_accessibility_certification, false, '不升级整图无障碍认证');
  return {
    kind: 'planning_source_description', title: '来源内现状空间描述', status: 'read_only_semantic_review',
    source_paths: [...DESCRIPTION_PATHS], counts: { rows: 18, metrics: 6, roles: { ...ROLES }, nodes: 6567, main_no_green: 578, main_C03_finite: 5293, main_B02_missing: 103 },
    units: { G02: '比例0—1', G03: '比例0—1', C01: '个', C03: '比例0—1（植被面积分母）', C06: '米/平方米', B02: '比例0—1（屋顶投影代理）' },
    source_status: report.status, input_version: report.input_version, variant: report.variant, operation_gates: { ...OPERATION_GATES },
    interpretation_limits: ['仅为proxy_v1/c4_min0来源内现状描述；不认证同期2020现状或高密度资格。', '各指标分别使用有限值分母，未按温度、误差或代理输入准入筛选。', 'C03无绿结构不适用、B02资料未知和真实0分开保留；C06的0不等于全部无绿。', '原单位保留；静态图的百分比色阶不构成规划阈值、热点、温度关系或效应量。', '上游路径和哈希为冻结引用，本平台未重新核验原始栅格或建筑源面。'],
  };
}

export function validatePlanningDevelopment(view) {
  const sources = viewSources(view, DEVELOPMENT_PATHS);
  const binding = json(view, DEVELOPMENT_PATHS[1]);
  const configurations = csv(view, DEVELOPMENT_PATHS[2], CONFIG_FIELDS, 80);
  const pairs = csv(view, DEVELOPMENT_PATHS[3], PAIR_FIELDS, 70);
  requireValue(binding.schema_version, 'planning_development_supplement_v1', '开发增补版本');
  requireValue(binding.status, 'source_bound_development_supplement_only', '开发增补状态');
  requireValue(binding.artifact_validation, 'source_binding_schema_and_signed_copy_checked', '源技术核验');
  requireValue(binding.scientific_admission, 'development_evidence_only', '开发科学准入');
  requireValue(binding.valid, true, '原绑定有效性');
  keys(binding.scientific_gates, SCIENTIFIC_GATES, '开发科学门控'); falseFields(binding.scientific_gates, SCIENTIFIC_GATES, '开发科学门控');
  requireValue(binding.read_scope?.explicit_source_count, 8, '八个显式引用');
  falseFields(binding.read_scope, ['manifest_references_followed', 'full_predictions_read', 'original_target_Y_read', 'final_test_Y_read', 'model_weights_read', 'research_reexecuted'], '开发读取边界');
  requireValue(binding.source_read_before_after_stable, true, '开发来源稳定性'); requireValue(binding.output_bytes_roundtrip_verified, true, '开发原字节回读');
  const sourceIds = ['strata_manifest', 'strata_proof', 'strata_config', 'strata_pair', 'cr_manifest', 'cr_proof', 'cr_config', 'cr_pair'];
  keys(binding.sources, sourceIds, '八个开发来源引用');
  for (const id of sourceIds) sourceIdentity(binding.sources[id], id);
  if (new Set(sourceIds.map(id => binding.sources[id].path)).size !== 8) fail('开发八源路径必须独立且唯一。');
  same(binding.historical_index_relation?.unchanged_historical_range, { registered_sources: 8, development_MAE_rows: 26 }, '历史登记范围');
  requireValue(binding.historical_index_relation?.read_or_rewritten_by_this_generator, false, '历史登记不覆盖');
  keys(binding.stages, ['strata', 'cr'], '开发阶段');
  for (const [stage, configN, pairN, proofN, trained, reused, status] of [
    ['strata', 72, 60, 14832, 864, 0, 'marginal_stratum_group_training_development_complete_final_test_locked'],
    ['cr', 8, 10, 3824, 0, 96, 'existing_runs_CR_conditional_analysis_complete_final_test_locked'],
  ]) {
    const record = binding.stages[stage];
    matchSource(record.manifest, binding.sources[stage + '_manifest'], stage + ' manifest引用');
    matchSource(record.independent_proof, binding.sources[stage + '_proof'], stage + '证明引用');
    for (const [key, value] of Object.entries({ status, configuration_summary_rows: configN, paired_summary_rows: pairN, proof_checks: proofN, proof_failures: 0, proof_check_identities_unique: true, proof_roundtrip_verified: true, final_test_Y_explicit_false: true, models_newly_trained_in_source_stage: trained, models_reused_in_source_stage: reused, supplement_models_trained_or_reopened: 0 })) requireValue(record[key], value, stage + '.' + key);
    requireValue(record.counts?.development, 1941, stage + '开发总体');
    requireValue(record.counts?.[stage === 'strata' ? 'final_test_locked' : 'final_locked'], 596, stage + '锁定最终格');
  }
  const contract = binding.comparison_contract;
  if (!isObject(contract)) fail('开发比较合同缺失。');
  sameSet(contract.strata_conditions?.map(item => item.axis + ':' + item.level), ['G02:low', 'G02:middle', 'G02:high', 'B02:low', 'B02:middle', 'B02:high'], '六个边际条件');
  sameSet(contract.overall_groups, ['gatv2', 'uniform'], '两种聚合组');
  const contractValues = {
    strata_axis_relation: 'Two separate marginal stratifications of the same development population; six conditions are not independent datasets and not a trained joint 3x3 grid.',
    overall_group_relation: 'gatv2 and uniform are separately summarized model aggregation groups on the same development data, not independent population samples.',
    no_pooling_between_conditions_and_overall: true,
    error_unit: 'degree_Celsius_of_observed_LST_prediction_error_not_site_temperature_or_cooling', R2_and_normalized_metrics_unit: 'dimensionless',
    positive_error_increment: 'MAE/RMSE(baseline)-MAE/RMSE(candidate); positive means lower candidate development error only', positive_R2_increment: 'R2(candidate)-R2(baseline)',
    strata_pairs: 'baseline=DROP group; candidate=FULL; values copied with original signed direction',
    uncertainty: 'Three scalar seed metrics averaged within each fold; four spatial folds have equal weight; sample SD is not CI or a significance test; seeds are not independent spatial samples.',
    defined_fold_count_CR: '4 from manifest seed_average_rows=32 / 8 configurations and the bound proof uncertainty statement; CR CSV has no separate defined-fold column.',
    normalized_denominators_strata: 'same-seed FULL MAE and bin-train Y population SD; their means are copied, not recomputed from mean denominators',
    normalized_metrics_CR: 'not reported by source; corresponding CSV cells remain empty, no zero fill', signed_negative_values_allowed: true,
    negative_C_increment_inference: 'Finite negative increments do not establish that configuration has no physical role or no planning value.',
    strata_early_stopping_and_budget: 'Validation used for early stopping; cross-bin effective gradient budgets not identical; bin/global descriptive comparisons are not independent planning responses.',
    cr_source_boundary: 'D M00 has no historical saved initial signature; source-compatible signatures reconstructed by compatibility audit, not historical initial snapshots.',
    cr_roles_and_interaction: 'C/R source roles not fully separated; conditional prediction-error contrasts are not validated response interaction or causal effects.',
    inductive_or_final_test_claim: false, planning_response_temperature_comfort_access_equity_values: null,
  };
  for (const [key, value] of Object.entries(contractValues)) requireValue(contract[key], value, '比较合同.' + key);
  same(contract.cr_pairs, Object.fromEntries(Object.entries(CR_PAIRS).map(([name, [baseline, candidate]]) => [name, { baseline, candidate }])), 'C/R五种配对合同');
  const expectedConfig = [], expectedPairs = [];
  const identity = (row, name) => JSON.stringify([row.stage, row.scope, row.axis, row.level, row.width, row.aggregation, row[name]]);
  for (const axis of ['G02', 'B02']) for (const level of ['low', 'middle', 'high']) for (const aggregation of ['gatv2', 'uniform']) {
    const group = { stage: 'strata', scope: 'marginal_condition', axis, level, width: '32', aggregation };
    for (const configuration of ['FULL', ...DROPS]) expectedConfig.push(identity({ ...group, configuration }, 'configuration'));
    for (const contrast of DROPS) expectedPairs.push(identity({ ...group, contrast }, 'contrast'));
  }
  for (const aggregation of ['gatv2', 'uniform']) {
    const group = { stage: 'cr', scope: 'overall_development', axis: '', level: '', width: '32', aggregation };
    for (const configuration of ['C0_R0', 'C0_R1', 'C1_R0', 'C1_R1']) expectedConfig.push(identity({ ...group, configuration }, 'configuration'));
    for (const contrast of Object.keys(CR_PAIRS)) expectedPairs.push(identity({ ...group, contrast }, 'contrast'));
  }
  sameSet(configurations.map(row => identity(row, 'configuration')), expectedConfig, '完整80配置复合身份');
  sameSet(pairs.map(row => identity(row, 'contrast')), expectedPairs, '完整70配对复合身份');
  const traces = new Map();
  const rowTrace = (row, kind) => {
    requireValue(row.width, '32', '模型宽度（不是米）'); requireValue(row.spatial_folds, '4', '空间折数'); requireValue(row.seed_metrics_per_fold, '3', '折内种子数');
    const id = row.stage + '_' + kind, source = binding.sources[id];
    requireValue(row.source_id, id, '行来源角色'); requireValue(row.source_sha256, source.sha256, '行上游SHA256');
    requireValue(count(row.source_bytes, id), source.bytes, '行上游字节数');
    const dataRow = count(row.source_data_row, id);
    const seen = traces.get(id) ?? new Set(); if (dataRow === 0 || seen.has(dataRow)) fail('来源数据行序号重复或不是一基序号：' + id);
    seen.add(dataRow); traces.set(id, seen);
  };
  for (const [path, rows, kind, ids] of [[DEVELOPMENT_PATHS[2], configurations, 'config', ['strata_config', 'cr_config']], [DEVELOPMENT_PATHS[3], pairs, 'pair', ['strata_pair', 'cr_pair']]]) {
    const output = binding.outputs?.[path.slice(DEVELOPMENT_DIR.length)];
    outputIdentity(output, sources.get(path), '开发输出' + path); requireValue(output.rows, rows.length, '开发输出行数'); requireValue(output.values_copied_without_rescoring, true, '原数值未重算');
    keys(output.source_bindings, ids, '输出上游链');
    for (const id of ids) matchSource(output.source_bindings[id], binding.sources[id], '输出来源' + id);
    for (const row of rows) rowTrace(row, kind);
  }
  for (const [id, size] of [['strata_config', 72], ['cr_config', 8], ['strata_pair', 60], ['cr_pair', 10]]) {
    const seen = traces.get(id); if (!seen || seen.size !== size || Array.from({ length: size }, (_, i) => i + 1).some(value => !seen.has(value))) fail(id + '完整来源数据行集合缺失。');
  }
  const configIndex = new Map(configurations.map(row => [identity(row, 'configuration'), row]));
  for (const row of configurations) {
    for (const metric of ['MAE_C', 'RMSE_C', 'R2']) {
      const mean = number(row[metric + '_mean'], metric), sd = number(row[metric + '_sample_SD'], metric + '四折SD');
      if (sd < 0 || (metric !== 'R2' && mean < 0) || (metric === 'R2' && mean > 1 + 1e-10)) fail('配置原误差或四折样本SD无效。');
    }
  }
  let negativeC = 0;
  for (const row of pairs) {
    const [baselineName, candidateName] = row.stage === 'strata' ? [row.contrast, 'FULL'] : CR_PAIRS[row.contrast];
    requireValue(row.baseline_configuration, baselineName, '配对基线'); requireValue(row.candidate_configuration, candidateName, '配对候选');
    const baseline = configIndex.get(identity({ ...row, configuration: baselineName }, 'configuration'));
    const candidate = configIndex.get(identity({ ...row, configuration: candidateName }, 'configuration'));
    if (!baseline || !candidate) fail('配对缺少同阶段、条件、宽度和聚合的配置。');
    for (const metric of DELTA_FIELDS) {
      const names = ['mean', 'sample_SD', 'defined_folds', 'positive_folds'].map(suffix => metric + '_' + suffix);
      if (row.stage === 'cr' && ['relative_delta_MAE', 'Yscale_delta_MAE'].includes(metric)) {
        for (const name of names) requireValue(row[name], '', 'C/R未报告归一化项'); continue;
      }
      const mean = number(row[names[0]], metric), sd = number(row[names[1]], metric + '四折SD'), defined = count(row[names[2]], metric), positive = count(row[names[3]], metric);
      requireValue(defined, 4, metric + '有定义空间折');
      if (sd < 0 || positive > defined || mean < 0 && positive === defined || mean > 0 && positive === 0) fail(metric + '四折SD或有符号折数不一致。');
    }
    for (const metric of ['MAE_C', 'RMSE_C', 'R2']) {
      const baselineMean = number(baseline[metric + '_mean'], metric), candidateMean = number(candidate[metric + '_mean'], metric);
      close(number(row['delta_' + metric + '_mean'], metric), metric === 'R2' ? candidateMean - baselineMean : baselineMean - candidateMean, '配对' + row.contrast + '的有符号' + metric);
    }
    if (row.stage === 'strata' && row.contrast === 'DROP_C' && number(row.delta_MAE_C_mean, 'C增量') < 0) negativeC++;
  }
  requireValue(negativeC, 12, '十二个C条件负号保留');
  same(binding.descriptive_readback, { configuration_rows: 80, paired_rows: 70, strata_C_conditions: 12, strata_C_MAE_means_negative: 12, not_a_new_significance_test: true }, '原描述回读');
  return {
    kind: 'planning_development', title: '规划开发误差与有符号配对信息', status: 'read_only_semantic_review', source_paths: [...DEVELOPMENT_PATHS],
    counts: { configuration_rows: 80, paired_rows: 70, strata_configuration_rows: 72, strata_pair_rows: 60, cr_configuration_rows: 8, cr_pair_rows: 10, referenced_sources: 8, spatial_folds: 4, scalar_seeds_per_fold: 3, model_width: 32, negative_C_conditions: 12, historical_sources: 8, historical_MAE_rows: 26 },
    units: { MAE_RMSE_and_deltas: '℃，观测LST预测误差', R2_and_normalized_metrics: '无量纲', width: '模型维度，不是米', sample_SD: '四空间折样本SD，不是CI或显著性检验' },
    source_status: binding.status, scientific_admission: binding.scientific_admission, scientific_gates: { ...binding.scientific_gates }, operation_gates: { ...OPERATION_GATES },
    interpretation_limits: ['六条件是同一开发总体的边际分档，分档和C/R总体分别显示；不混池或视为独立样本。', '正增量只表示候选开发预测误差更低；负号保留，不代表配置无物理或规划价值。', '三个种子先折内平均，四空间折等权汇总；SD不是CI，种子不是独立空间样本。', '分档归一化值原样保留；C/R空项不填0，不用均值分母重算归一化指标。', '上游证明是冻结引用，本平台未重验权重；最终596格保持锁定。', '历史8来源/26误差登记与本增补并列；不生成温度、物理降温、响应量级、改造候选或排名。'],
  };
}
