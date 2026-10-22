/**
 * Synchronous, read-only weather representation review. No I/O or execution.
 * The envelope verifier authenticates original manifest/source/archive bytes.
 * Embedded annual ZIP/member and historical proof identities remain references;
 * this module does not open that ZIP, re-run a producer or create engine forcing.
 */
const PREFIX = '共享接口/微观试验准备/天气跨格式试核_20261006/';
const CSV = PREFIX + '07月19日跨格式逐小时对照.csv';
const README = PREFIX + 'README.md';
const PRODUCER = PREFIX + '跨格式来源与实际核查.json';
const AUDIT = PREFIX + '独立天气跨格式核查.json';
const PATHS = [CSV, README, PREFIX + '核对跨格式天气.py', AUDIT, PREFIX + '独立核查天气跨格式.py', PRODUCER];
const SCENARIO = 'CD_SHUANGLIU_562940_TMYx_2011_2025_M07_D19_source2021_candidate_v1';
const FIELDS = ['weather_scenario_id', 'epw_record_1based', 'epw_text_line_1based', 'wea_text_line_1based', 'clm_text_line_1based', 'rain_text_line_1based', 'literal_epw_year', 'month', 'day', 'epw_hour', 'epw_minute', 'wea_decimal_standard_hour', 'wea_source_clock_label', 'normalized_real_timestamp', 'epw_dry_bulb_C', 'clm_dry_bulb_tenths_C', 'epw_wind_m_s', 'clm_wind_tenths_m_s', 'epw_direction_deg', 'clm_direction_deg', 'epw_relative_humidity_percent', 'clm_relative_humidity_percent', 'epw_direct_Wh_m2', 'wea_direct_irradiance_W_m2', 'clm_direct_intensity_W_m2', 'epw_diffuse_Wh_m2', 'wea_diffuse_irradiance_W_m2', 'clm_diffuse_W_m2', 'epw_liquid_depth_mm', 'epw_accumulation_duration_hr', 'producer_rain_rate_m_hr', 'rain_rate_minus_depth_div_1000_numeric', 'project_admission', 'temporal_semantic_status', 'rainfall_semantic_status'];
const NON_NUMERIC = new Set(['weather_scenario_id', 'wea_source_clock_label', 'normalized_real_timestamp', 'project_admission', 'temporal_semantic_status', 'rainfall_semantic_status']);
const RELATIONS = ['wea_month_day', 'wea_half_hour_label', 'wea_direct_numeric', 'wea_diffuse_numeric', 'clm_month_day_hour_order', 'clm_direct_numeric', 'clm_diffuse_numeric', 'clm_temperature_tenths', 'clm_wind_tenths', 'clm_direction', 'clm_relative_humidity'];
const WEATHER_GATES = ['weather_adopted_as_driver', 'physical_run_ready', 'physical_results_available', 'thermal_comfort_available', 'local_representativeness_accepted', 'source_2020_synchrony_accepted'];
const OPERATION_GATES = Object.freeze({ prediction: false, physical_simulation: false, service_evaluation: false, fairness_evaluation: false, candidate_generation: false, ranking: false });
const POSITIVE_RECORDS = [4781, 4782, 4783, 4784, 4785, 4786, 4787, 4788, 4789, 4790, 4791, 4792, 4794, 4798, 4799, 4800];
const OLD_README_SHA = '610350cba52b6c0d75bc9bbb83078f4c915dd0e405bca7659d9cc6045c2c1096';
const CURRENT_README_SHA = '42134d453f8abf69614de87c38711857d0dd28662c355b0aaa97980c7fc0e7f5';
const UNITS = Object.freeze({
  epw_direct_diffuse: 'Wh/m2', wea_direct_diffuse: 'W/m2_irradiance', clm_direct_diffuse: 'W/m2_per_producer_header',
  clm_temperature_wind: 'tenths_C_and_tenths_m_per_s_per_producer_header', rain: 'm/hr_per_producer_header_missing_can_be_encoded_as_zero', new_conversion_to_physical_driver: false,
});
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('天气来源语义核查：' + message); };
const expect = (actual, expected, label) => { if (actual !== expected) fail(label + '不符合原来源或未采用边界。'); };
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : isObject(value) ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const same = (actual, expected, label) => { if (canonical(actual) !== canonical(expected)) fail(label + '身份/单位/时标或集合不一致。'); };
function object(value, label) { if (!isObject(value)) fail(label + '必须为原对象。'); return value; }
function set(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length || new Set(actual).size !== expected.length || !expected.every(value => actual.includes(value))) fail(label + '缺失、重复或包含未知项。');
}
function finiteTree(value, depth = 0) {
  if (depth > 100 || typeof value === 'number' && !Number.isFinite(value)) fail('来源JSON含非有限数值或过深结构。');
  if (Array.isArray(value)) value.forEach(item => finiteTree(item, depth + 1));
  else if (isObject(value)) Object.values(value).forEach(item => finiteTree(item, depth + 1));
}
function number(value, label) {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) fail(label + '必须为原有限数值字符串，空值不能补0。');
  return Number(value);
}
function close(actual, expected, label, tolerance = 1e-10) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) fail(label + '与原字段尺度/数值对应不一致。');
}
function identity(value, label, member = false) {
  object(value, label);
  if (typeof value[member ? 'member' : 'path'] !== 'string' || !value[member ? 'member' : 'path'] || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) fail(label + '缺少完整路径/成员、字节和SHA身份。');
}
function gates(value, label) {
  object(value, label); set(Object.keys(value), WEATHER_GATES, label);
  for (const key of WEATHER_GATES) expect(value[key], false, label + '.' + key);
}
function falseFields(value, fields, label) {
  object(value, label); for (const field of fields) expect(value[field], false, label + '.' + field);
}
function readSources(view) {
  object(view, 'view'); object(view.files, 'files');
  set(view.sources?.map(source => source?.path), PATHS, '本组显式六源');
  set(Object.keys(view.files), PATHS, '本组解码六文件');
  const result = new Map();
  for (const source of view.sources) {
    identity(source, source.path); expect(source.role, 'source_preparation_read_only', '来源角色');
    result.set(source.path, source);
    const expectedKind = source.path === CSV ? 'csv' : source.path.endsWith('.json') ? 'json' : source.path.endsWith('.py') ? 'py' : 'md';
    expect(source.file_kind, expectedKind, '文件种类');
    if (['md', 'py'].includes(expectedKind) && typeof view.files[source.path] !== 'string') fail('说明与复现脚本必须保留原文本，不执行或转成对象。');
  }
  return result;
}

export function validateWeatherSource(view) {
  const sources = readSources(view);
  const producer = object(view.files[PRODUCER], '跨格式来源核查'), audit = object(view.files[AUDIT], '独立天气核查');
  finiteTree(producer); finiteTree(audit);
  expect(producer.schema_version, 'weather_cross_format_source_alignment.v1', '来源核查版本');
  expect(producer.weather_scenario_id, SCENARIO, '天气独立情景身份');
  expect(producer.artifact_scope, 'held_source_representation_alignment_only', '来源核查范围');
  expect(producer.annual_records_per_format, 8760, '各格式年度条数'); expect(producer.selected_day_records, 24, '所选日条数');
  expect(producer.annual_exact_alignment_checks, 8760 * RELATIONS.length, '全年11类对应数');
  same(producer.annual_mismatches_by_relation, Object.fromEntries(RELATIONS.map(key => [key, 0])), '原全年差异表');
  expect(producer.protected_inputs_unchanged, true, '原保护件字节稳定声明'); expect(producer.output_readback_exact, true, '原CSV回读');
  falseFields(producer, ['rain_division_by_zero_performed', 'original_candidate_fields_overwritten'], '来源生成边界');
  same(producer.unit_scope, UNITS, '辐射/十分之一标度/降水原单位');
  const time = object(producer.time_scope, '时间范围');
  expect(time.wea_labels, 'producer_file_half_hour_standard_time_labels', 'WEA标签意义');
  expect(time.wea_label_relation_to_epw_hour, 'epw_hour_minus_0.5_observed_for_all_8760_records', '标签对应');
  falseFields(time, ['EPW_minute30_producer_convention_resolved', 'state_fields_assumed_hourly_means', 'WEA_has_source_year', 'CLM_header_year_is_July_EPW_source_year'], '时间未采用项');
  expect(time.accepted_accumulation_interval_hours, null, '接受累计时长'); expect(time.normalized_real_timestamp, null, '真实时间戳');
  gates(producer.gates, '来源六项科学门控'); gates(audit.gates, '独立证明六项科学门控');
  expect(audit.schema_version, 'independent-weather-cross-format-audit.v1', '独立证明版本');
  expect(audit.independence?.production_module_imported_or_executed, false, '独立证明未调用生产模块');
  expect(audit.independence?.software_and_data_proof_stage, 'cross_format_source_representation_only', '独立证明层级');
  expect(audit.all_passed, true, '原独立证明通过');
  const checkNames = ['four_member_raw_bytes_match_recorded_SHA256', 'all_four_formats_8760_records', '365_day_calendar_and_24_hour_blocks_independent_of_literal_year', '11_relations_96360_checks_no_mismatches', 'annual_failure_counts_match_production_proof', 'all_24_saved_rows_all_35_columns_and_source_line_numbers_exact', 'original_24_EPW_columns_match_held_source', 'selected_24_duration_zero_and_16_positive_depth_retained', 'RAIN_numeric_difference_exactly_1e_minus_10', 'CLM_tenths_and_radiation_units_are_header_evidence', 'RAIN_missing_zero_warning_is_preserved', 'distinct_radiation_units_preserved_no_driver_conversion', 'real_time_and_accepted_accumulation_interval_still_null', 'Minute30_and_state_meaning_not_accepted', 'all_six_scientific_gates_remain_closed', 'original_weather_mapping_not_adopted', 'all_33_original_unknowns_still_null_and_run_entry_closed', 'protected_original_inputs_match_production_hashes', 'all_protected_and_production_bytes_unchanged', 'saved_CSV_hash_matches_production_proof'];
  set(Object.keys(object(audit.checks, '独立20项检查')), checkNames, '独立检查身份');
  for (const key of checkNames) expect(audit.checks[key], true, '原独立检查.' + key);
  expect(audit.annual_relation_checks, 96360, '独立全年对应计数'); same(audit.annual_relation_mismatches, producer.annual_mismatches_by_relation, '独立/生产差异表');
  expect(audit.selected_rows, 24, '独立所选行数'); expect(audit.saved_fields_per_row, 35, '独立完整字段'); expect(audit.selected_field_comparisons, 840, '保存值比较数');
  same(audit.source_rows, { EPW_record_range: [4777, 4800], EPW_text_line_range: [4785, 4808], WEA_text_line_range: [4783, 4806], CLM_text_line_range: [4989, 5012], RAIN_text_line_range: [4778, 4801] }, '五种记录/行号范围');
  same(audit.members, producer.source_member_identities, '四成员源身份');
  set(Object.keys(object(producer.source_member_identities, '四成员')), ['epw', 'wea', 'clm', 'rain'], '四格式身份');
  for (const [format, member] of Object.entries(producer.source_member_identities)) { identity(member, format, true); if (!member.member.endsWith('.' + format)) fail('格式与成员扩展名不一致。'); }
  const headers = object(producer.source_headers, '原头信息');
  if (!Array.isArray(headers.epw) || headers.epw.length !== 8 || !Array.isArray(headers.wea) || headers.wea.length !== 6 || !Array.isArray(headers.clm) || headers.clm.length !== 12) fail('四格式头信息缺失。');
  if (!headers.epw[5].includes('Jul=2021') || !/^\s*2016,/.test(headers.clm[10])) fail('CLM字面2016与EPW七月2021必须分别保留。');
  for (const [index, unit] of [[3, '(W/m**2)'], [4, '(Tenths DEG.C)'], [5, '(W/m**2)'], [6, '(Tenths m/s)'], [8, '(Percent)']]) if (!headers.clm[index].includes(unit)) fail('CLM头原单位/标度变化。');
  expect(headers.rain, ' Rainfall (m/hr) - 0 if hour has missing value', 'RAIN零值缺失警示');
  const boundaries = object(audit.time_and_evidence_boundaries, '独立时标与证据边界');
  same(boundaries.EPW_source_minute_distribution, { '30': 8760 }, 'EPW原分钟');
  expect(boundaries.CLM_header_year_literal, '2016', 'CLM原字面年'); same(boundaries.selected_EPW_year_literals, ['2021'], 'EPW所选源年');
  falseFields(boundaries, ['WEA_source_year_present', 'four_independent_weather_observation_sources', 'common_ZIP_formats_add_independent_meteorology_evidence', 'WEA_half_hour_labels_certify_EPW_state_time'], '同源/时标解释');
  expect(boundaries.normalized_real_site_time, null, '独立真实场地时间');
  for (const key of ['local_representativeness', 'named_engine_interpolation_and_accumulation_semantics', 'warmup_sequence']) expect(boundaries[key], 'pending', '独立待核.' + key);
  same(audit.source_nonadoption_literals, { saved_cross_format_CSV_project_admission: ['candidate_not_adopted'], original_weather_mapping_project_admission: 'not_accepted_as_solver_forcing', original_physical_preparation_state: 'preparation_saved_not_frozen_not_solver_ready', original_unknown_value_count: 33, original_unknown_value_accepted_count: 0 }, '原天气/33接受值的未采用状态');
  const precipitation = object(audit.precipitation, '降水证据');
  expect(precipitation.annual_RAIN_zero_count, 6645, '全年RAIN零值数量');
  falseFields(precipitation, ['zero_certified_no_rain', 'divide_by_accumulation_duration_performed', 'accumulation_duration_repaired_or_inferred'], '降水未解决项');

  const table = object(view.files[CSV], '完整逐小时CSV'), metadata = sources.get(CSV);
  same(table.fields, FIELDS, '原35字段及顺序'); same(metadata.columns, FIELDS, '清单CSV字段');
  expect(metadata.row_count, 24, '清单CSV行数'); expect(metadata.column_count, 35, '清单CSV列数'); same(metadata.primary_key_columns, ['weather_scenario_id', 'epw_record_1based'], '行复合键');
  expect(metadata.primary_keys_unique, true, '清单主键唯一');
  expect(metadata.raw_empty_cell_policy, 'preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted', '原空项策略');
  if (!Array.isArray(table.rows) || table.rows.length !== 24) fail('必须保留完整24小时。');
  const seen = new Set(), hourly = [], positive = []; let zeroRain = 0, maxRainDifference = 0;
  for (const cells of table.rows) {
    if (!Array.isArray(cells) || cells.length !== 35 || !cells.every(cell => typeof cell === 'string')) fail('24×35单元必须保持原字符串/空字符串。');
    const raw = Object.fromEntries(FIELDS.map((field, index) => [field, cells[index]]));
    expect(raw.weather_scenario_id, SCENARIO, '逐小时情景');
    const typed = Object.fromEntries(FIELDS.filter(field => !NON_NUMERIC.has(field)).map(field => [field, number(raw[field], field)]));
    const record = typed.epw_record_1based, hour = record - 4776;
    if (!Number.isInteger(record) || record < 4777 || record > 4800 || seen.has(record)) fail('EPW4777—4800完整行键缺失或重复。');
    seen.add(record);
    for (const [field, value] of Object.entries({ epw_text_line_1based: record + 8, wea_text_line_1based: record + 6, clm_text_line_1based: record + 212, rain_text_line_1based: record + 1, literal_epw_year: 2021, month: 7, day: 19, epw_hour: hour, epw_minute: 30 })) expect(typed[field], value, '原记录与行号.' + field);
    close(typed.wea_decimal_standard_hour, hour - 0.5, '源WEA半小时标签');
    expect(raw.wea_source_clock_label, '07-19 ' + String(hour - 1).padStart(2, '0') + ':30', '源时钟标签');
    expect(raw.normalized_real_timestamp, '', '真实时间戳必须为空字符串'); typed.normalized_real_timestamp = null;
    expect(raw.project_admission, 'candidate_not_adopted', '逐小时采用状态');
    expect(raw.temporal_semantic_status, 'cross_format_labels_aligned_engine_and_producer_convention_pending', '逐小时时标状态');
    expect(raw.rainfall_semantic_status, 'producer_rate_available_epw_accumulation_duration_unresolved', '逐小时降水状态');
    close(typed.clm_dry_bulb_tenths_C, typed.epw_dry_bulb_C * 10, 'CLM十分之一气温'); close(typed.clm_wind_tenths_m_s, typed.epw_wind_m_s * 10, 'CLM十分之一风速');
    close(typed.clm_direction_deg, typed.epw_direction_deg, '风向原数值'); close(typed.clm_relative_humidity_percent, typed.epw_relative_humidity_percent, '湿度原数值');
    for (const band of ['direct', 'diffuse']) {
      close(typed['wea_' + band + '_irradiance_W_m2'], typed['epw_' + band + '_Wh_m2'], '辐射数值对应但保留不同单位');
      close(typed['clm_' + band + (band === 'direct' ? '_intensity_W_m2' : '_W_m2')], typed['epw_' + band + '_Wh_m2'], 'CLM辐射数值对应');
    }
    for (const field of ['epw_wind_m_s', 'epw_direct_Wh_m2', 'epw_diffuse_Wh_m2', 'epw_liquid_depth_mm', 'producer_rain_rate_m_hr']) if (typed[field] < 0) fail('所选字段不允许负值：' + field);
    if (typed.epw_relative_humidity_percent < 0 || typed.epw_relative_humidity_percent > 100 || typed.epw_direction_deg < 0 || typed.epw_direction_deg > 360) fail('原湿度/风向超出字段范围。');
    expect(typed.epw_accumulation_duration_hr, 0, '原累计时长0不得修复或用作除数');
    if (typed.epw_liquid_depth_mm > 0) positive.push(record);
    if (typed.producer_rain_rate_m_hr === 0) zeroRain++;
    const difference = typed.producer_rain_rate_m_hr - typed.epw_liquid_depth_mm / 1000;
    close(typed.rain_rate_minus_depth_div_1000_numeric, difference, '已保存RAIN数值差', 1e-16);
    maxRainDifference = Math.max(maxRainDifference, Math.abs(typed.rain_rate_minus_depth_div_1000_numeric));
    hourly.push({
      key: SCENARIO + '|' + record, label: '源WEA ' + raw.wea_source_clock_label, raw, typed,
      display: { time_label: raw.wea_source_clock_label + '（来源标签）', air_temperature: raw.epw_dry_bulb_C + ' ℃', wind_speed: raw.epw_wind_m_s + ' m/s', precipitation_depth: raw.epw_liquid_depth_mm + ' mm', accumulation_duration: raw.epw_accumulation_duration_hr + ' h（含义待核）', admission: '独立典型情景候选，未采用' },
      source_bindings: Object.fromEntries(['epw', 'wea', 'clm', 'rain'].map(format => [format, { ...producer.source_member_identities[format], text_line_1based: typed[format + '_text_line_1based'], ...(format === 'epw' ? { record_1based: record } : {}) }])),
    });
  }
  set([...seen], Array.from({ length: 24 }, (_, index) => 4777 + index), '完整EPW行键');
  same(positive.sort((a, b) => a - b), POSITIVE_RECORDS, '16正深度且0时长记录');
  expect(zeroRain, 8, '所选RAIN零条数'); close(maxRainDifference, 1e-10, '已保存RAIN最大数值差', 1e-16);
  expect(producer.selected_EPW_duration_zero_count, 24, '来源0时长数量'); expect(producer.selected_depth_positive_with_zero_duration, 16, '来源正深度数量');
  close(number(producer.selected_rain_rate_numeric_max_abs_difference_from_depth_div_1000, '来源RAIN差'), maxRainDifference, '来源RAIN数值差', 1e-16);
  expect(precipitation.selected_duration_zero_count, 24, '独立0时长数量'); expect(precipitation.positive_depth_zero_duration_count, 16, '独立正深度数量');
  same(precipitation.positive_depth_zero_duration_EPW_record_ids, POSITIVE_RECORDS, '独立正降水记录键'); expect(precipitation.selected_RAIN_zero_count, zeroRain, '独立RAIN零条数');
  close(number(precipitation.numeric_RAIN_minus_depth_div_1000_max_abs, '独立RAIN差'), maxRainDifference, '独立数值差', 1e-16);

  const output = object(producer.output_csv, '原CSV输出身份'); identity(output, '原CSV输出');
  if (!output.path.endsWith('/' + CSV)) fail('CSV源路径不对应本组成果。');
  expect(output.bytes, metadata.bytes, 'CSV源字节'); expect(output.sha256, metadata.sha256, 'CSV源SHA');
  const before = producer.protected_inputs_before, after = producer.protected_inputs_after;
  if (!Array.isArray(before) || before.length !== 7) fail('原7保护来源引用缺失。'); same(after, before, '生产前后保护件');
  for (const reference of before) identity(reference, '原保护来源');
  if (new Set(before.map(reference => reference.path)).size !== 7) fail('原保护来源重复。');
  const zip = before.find(reference => reference.path.endsWith('.zip') && reference.path.includes('TMYx.2011-2025'));
  if (!zip) fail('外部天气ZIP源引用缺失。');
  expect(audit.source_ZIP?.path, zip.path, '独立ZIP引用'); expect(audit.source_ZIP?.sha256, zip.sha256, '独立ZIP源SHA');
  if (!Array.isArray(audit.protected_files) || audit.protected_files.length !== 11 || new Set(audit.protected_files.map(reference => reference.path)).size !== 11) fail('独立11保护件历史记录不完整。');
  let embeddedMatches = 0; const documentationChanges = [];
  for (const reference of audit.protected_files) {
    if (!isObject(reference) || typeof reference.path !== 'string' || !/^[a-f0-9]{64}$/.test(reference.sha256_before ?? '')) fail('独立保护件身份无效。');
    expect(reference.sha256_after, reference.sha256_before, '原独立读取前后SHA');
    const protectedReference = before.find(item => item.path === reference.path);
    if (protectedReference) expect(reference.sha256_before, protectedReference.sha256, '生产/独立外部引用');
    const current = [...sources.values()].find(source => reference.path.endsWith('/' + source.path));
    if (!current) { if (!protectedReference) fail('独立保护件引用不在原7外部与4本组来源中。'); continue; }
    if (current.path === README) {
      expect(reference.sha256_before, OLD_README_SHA, '旧独立审计README'); expect(current.sha256, CURRENT_README_SHA, '当前README版本');
      documentationChanges.push({ path: README, audit_sha256_before: reference.sha256_before, audit_sha256_after: reference.sha256_after, current_sha256: current.sha256, current_bytes: current.bytes, reason: 'root_appended_independent_audit_and_annual_RAIN_zero_boundary_after_historical_audit', old_audit_rewritten: false, source_data_or_scientific_adoption_changed: false });
    } else { expect(reference.sha256_before, current.sha256, '本组成果与原独立SHA'); embeddedMatches++; }
  }
  expect(embeddedMatches, 3, '历史保护表本组未变的三来源'); expect(documentationChanges.length, 1, '唯一历史说明差异');
  for (const row of hourly) row.source_zip_reference = { path: zip.path, sha256: zip.sha256, embedded_in_this_six_file_group: false };
  hourly.sort((a, b) => a.typed.epw_record_1based - b.typed.epw_record_1based);
  return {
    group_id: 'weather-cross-format', title: '天气表示与引擎输入待核项', status: 'read_only_source_representation_review',
    summary: '双流站典型年独立情景候选：24小时四格式对应可审阅；真实时间、累计时段、具名引擎和场地代表性尚未采用。',
    counts: { explicit_files: 6, hourly_rows: 24, fields_per_row: 35, source_field_comparisons: 840, annual_records_per_format: 8760, annual_relation_checks: 96360, duration_zero_rows: 24, positive_depth_with_zero_duration_rows: 16, annual_RAIN_zero_rows: 6645 },
    hourly_rows: hourly, fields: [...FIELDS], units: { ...UNITS }, operation_gates: { ...OPERATION_GATES }, scientific_gates: { ...producer.gates },
    time_scope: { ...time }, source_paths: [...PATHS], scientific_adoption: 'not_adopted', original_unknown_accepted_count: 0,
    source_audit: { producer: structuredClone(producer), independent: structuredClone(audit), external_references_opened_by_platform: false, annual_ZIP_or_members_embedded_in_group: false },
    documentation_version_changes: documentationChanges,
    interpretation_limits: ['EPW七月源年2021、CLM头2016和WEA无源年分列，制作日期不作观测日期。', 'WEA 00:30—23:30是源标签；EPW Minute30不认证状态时刻或小时均值，真实时间24项保持空。', 'EPW Wh/m²与WEA/CLM W/m²及十分之一温度/风速标度保留，数值相等不认证累计区间。', '24条累计时长0和16条正深度保留；全年6645个RAIN零可能为缺失，不认证无雨、不除以0、不生成forcing。', '全年96360对应与840保存值比较是上游来源表示核查；四格式同包，不增加独立观测。', '旧审计覆盖当时README；当前说明变化单列保留。年度ZIP、正式计划和冻结包只保留引用，未随本组六件原件交付。'],
  };
}
