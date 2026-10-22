/**
 * Pure semantic checks for the frozen candidate resource and modifiable-space
 * evidence packages. No file/network/model access, mutation or scientific run.
 * The envelope verifier must independently authenticate the original bytes;
 * an object serialization is never used as evidence of an original file SHA.
 */
const FAIR = '共享接口/公平性输入准备/';
const RESOURCE = `${FAIR}资源支持试核/`;
const SENSITIVITY = `${FAIR}窗口敏感性试核/`;
const MICRO = '共享接口/微观试验准备/';
const SUPPORT = `${RESOURCE}六住宅植被资源支持候选.csv`;
const OVERLAP = `${RESOURCE}候选窗口重叠.csv`;
const RESOURCE_AUDIT = `${RESOURCE}资源支持核查.json`;
const READBACK = `${RESOURCE}保存回读核查.json`;
const CHANGE = `${SENSITIVITY}六对象窗口变化.csv`;
const ORDER = `${SENSITIVITY}候选份额顺序变化.csv`;
const SENSITIVITY_AUDIT = `${SENSITIVITY}窗口敏感性核查.json`;
const EVIDENCE = `${MICRO}可改空间接纳证据表_20261006.csv`;
const SOURCE_VERSIONS = `${MICRO}可改空间来源存在与版本_20261006.csv`;
const MODIFIABLE_AUDIT = `${MICRO}可改空间来源与对象证据_20261006.json`;

export const CANDIDATE_RESOURCE_SOURCE_PATHS = Object.freeze([
  SUPPORT, OVERLAP, `${RESOURCE}资源支持说明.md`, RESOURCE_AUDIT, READBACK,
  CHANGE, ORDER, `${SENSITIVITY}窗口敏感性说明.md`, SENSITIVITY_AUDIT,
]);
export const MODIFIABLE_EVIDENCE_SOURCE_PATHS = Object.freeze([
  EVIDENCE, `${MICRO}可改空间接纳证据表_20261006.md`, SOURCE_VERSIONS, MODIFIABLE_AUDIT,
]);

const IDS = [146753, 146756, 146758, 146765, 146768, 147927].map(n => `cmab_v7_chengdu_source_row_${n}`);
const FIDS = [20836, 20839, 20841, 20848, 20851, 21366];
const RADII = [75, 150, 300];
const TRANSITIONS = [[75, 150], [150, 300], [75, 300]];
const DENOMINATORS = {75:17671.01513143494, 150:70684.06052574464, 300:282736.24210299255};
const SUPPORT_SHA = '0d93ad325814bdabd077375cdd1795cc8576c3f5ee1efa415a17dfcadced085e';
const UB_SHA = '1799ed4a381549bb13dd3f591448165daa729ab0d89fc14fb17d37e8efcab8cb';
const CMAB_SHA = '4ca06c5125fb180759cf20b3956641597353f424ca20d410c8f8a98c68175f58';
const AREA_TOLERANCE = 1e-5;
const RATIO_TOLERANCE = 1e-10;
const GATES = Object.freeze({prediction:false,physical_simulation:false,service_evaluation:false,
  fairness_evaluation:false,candidate_generation:false,ranking:false});
const SUPPORT_FIELDS = ('candidate_object_id source_fid source_layer publisher_function_label unit_status resource_window_status candidate_radius_m resource_period_status building_period_status resource_area_unit fraction_unit center_definition center_easting_m center_northing_m centroid_inside_source_face analysis_crs denominator_definition denominator_window_area_m2 theoretical_circle_area_m2 polygon_vs_circle_relative_deficit native_positive_area_pixel_count water_class0_area_m2 impervious_class1_area_m2 tree_shrub_class2_area_m2 grass_class3_area_m2 farmland_class4_area_m2 valid_class_area_m2 nodata_area_m2 unrecognized_label_area_m2 outside_raster_area_m2 total_unknown_support_area_m2 area_closure_error_m2 classification_support_complete green_2_3_area_m2 whole_window_green_2_3_fraction whole_window_tree_shrub_fraction whole_window_grass_fraction window_area_outside_500m_preparation_m2 population_denominator public_access actual_occupancy service_role T_P_U integration scientific_status ub_sha256 cmab_gpkg_sha256').split(' ');
const OVERLAP_FIELDS = 'candidate_radius_m left_candidate_id right_candidate_id positive_geometric_overlap_area_m2 shared_positive_native_pixel_count overlap_status may_sum_resource_areas_by_objects'.split(' ');
const CHANGE_FIELDS = 'candidate_object_id centroid_inside_source_face green_share_75m_percent green_share_150m_percent green_share_300m_percent max_minus_min_percentage_points change_75_to_300_percentage_points primary_unit_and_radius_adopted fairness_or_service_priority source_sha256'.split(' ');
const ORDER_FIELDS = 'radius_before_m radius_after_m left_candidate_id right_candidate_id share_difference_before_percentage_points share_difference_after_percentage_points strict_order_reversed exact_tie_before exact_tie_after independent_samples fairness_or_service_priority source_sha256'.split(' ');
const EVIDENCE_FIELDS = 'evidence_id topic source_ids source_support source_can_establish source_does_not_establish research_design_scope_needed physical_evidence_needed implementation_or_use_permission_needed accepted_field accepted_value accepted_as_modifiable_space status'.split(' ');
const VERSION_FIELDS = 'source_id path role exists bytes previous_reference_sha256 sha256_before sha256_after matches_previous_reference unchanged_during_this_read'.split(' ');

function fail(message) { throw new Error(`补充候选证据：${message}`); }
function expect(actual, expected, label) { if (actual !== expected) fail(`${label}不符合原候选合同`); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}必须为对象`);
  return value;
}
function finite(value, label, nonnegative = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (nonnegative && value < 0)) fail(`${label}必须为有限${nonnegative?'非负':''}数`);
  return value;
}
function numeric(text, label, nonnegative = true) {
  if (typeof text !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) fail(`${label}不是原数值字符串`);
  return finite(Number(text), label, nonnegative);
}
function near(actual, expected, tolerance, label) {
  finite(actual, label); finite(expected, label);
  if (Math.abs(actual - expected) > tolerance) fail(`${label}与原口径或关联表不一致`);
}
function hash(value, label) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label}SHA256无效`); }
function date(value, label) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(`${label}时间无效`); }
function exactSet(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length || new Set(actual).size !== actual.length || actual.some(x => !expected.includes(x))) fail(`${label}身份集缺失、重复或有额外成员`);
}
function nullAt(value, fields, label) {
  object(value, label);
  for (const field of fields) expect(value[field], null, `${label}.${field}`);
}
function rejectNonfinite(value, label) {
  if (typeof value === 'number') finite(value, label);
  else if (Array.isArray(value)) value.forEach((v,i) => rejectNonfinite(v, `${label}[${i}]`));
  else if (value && typeof value === 'object') for (const [key,v] of Object.entries(value)) rejectNonfinite(v, `${label}.${key}`);
}
function sourceIndex(view, required) {
  object(view, 'view'); object(view.files, 'view.files');
  if (!Array.isArray(view.sources)) fail('view.sources必须为数组');
  const sources = new Map();
  for (const s of view.sources) {
    object(s, '来源');
    if (typeof s.path !== 'string' || s.path.startsWith('/') || s.path.includes('\\') || s.path.split('/').some(p => !p || p === '.' || p === '..') || sources.has(s.path)) fail('来源必须有唯一根相对安全路径');
    if (!Number.isSafeInteger(s.bytes) || s.bytes <= 0) fail('来源bytes无效');
    hash(s.sha256, s.path);
    if (typeof s.mime_type !== 'string' || !s.mime_type) fail('来源mime_type缺失');
    sources.set(s.path, s);
  }
  for (const path of required) {
    if (!sources.has(path) || !Object.hasOwn(view.files, path)) fail(`缺少白名单原件${path}`);
    if (path.endsWith('.md') && (typeof view.files[path] !== 'string' || !view.files[path])) fail(`${path}须保留原文`);
  }
  return sources;
}
function csv(view, path, fields, count) {
  const table = object(view.files[path], path);
  exactSet(table.fields, fields, `${path}字段`);
  if (!Array.isArray(table.rows) || table.rows.length !== count) fail(`${path}行数不完整`);
  return table.rows.map((cells, index) => {
    if (!Array.isArray(cells) || cells.length !== table.fields.length || cells.some(c => typeof c !== 'string')) fail(`${path}第${index+1}行须为完整原字符串单元`);
    return Object.fromEntries(table.fields.map((field,i) => [field,cells[i]]));
  });
}
function keyed(rows, key, expected, label) {
  exactSet(rows.map(key), expected, label);
  return new Map(rows.map(row => [key(row), row]));
}
function bindOutput(sources, output, path) {
  object(output, `${path}源输出引用`);
  const current = sources.get(path);
  if (typeof output.path !== 'string' || !output.path.endsWith(`/${path}`)) fail(`${path}原输出路径错位`);
  expect(output.bytes, current.bytes, `${path}引用bytes`);
  expect(output.sha256, current.sha256, `${path}引用SHA`);
}
function pythonCell(value) {
  if (value === null) return '';
  if (value === true) return 'True';
  if (value === false) return 'False';
  return String(value);
}
function pairs() {
  return IDS.flatMap((left,i) => IDS.slice(i+1).map(right => [left,right]));
}

/** Validate all four candidate tables and their source boundaries; return a new summary. */
export function validateCandidateResource(view) {
  const sources = sourceIndex(view, CANDIDATE_RESOURCE_SOURCE_PATHS);
  const audit = object(view.files[RESOURCE_AUDIT], '资源核查');
  const sensitivity = object(view.files[SENSITIVITY_AUDIT], '敏感性核查');
  const readback = object(view.files[READBACK], '保存回读核查');
  [audit,sensitivity,readback].forEach(v => rejectNonfinite(v, '核查记录'));
  date(audit.checked_at_Asia_Shanghai, '资源核查'); date(sensitivity.checked_at, '敏感性核查');
  expect(audit.scope, 'six_registered_source_faces_only_native_vegetation_classification_support', '资源核查范围');
  expect(audit.integration, 'not_adapted', '上游软件状态');
  expect(audit.scientific_status, 'unvalidated_candidate_resource_support', '资源科学状态');
  expect(audit.primary_unit_adopted, false, '主对象采用');
  expect(audit.population_or_equity_or_thermal_or_accessibility_computed, false, '资源应用计算');
  expect(audit.spatial_registration_accuracy, 'not_independently_validated', '空间配准边界');
  expect(audit.quality_zero_semantics, 'unknown_not_used_for_grouping_or_need', 'Quality零语义');
  const method = object(audit.method, '资源方法');
  exactSet(method.radii_m, RADII, '候选半径');
  const methodExpected = {radii_status:'sensitivity_support_candidates_no_empirical_service_standard', buffer_quad_segs:128,
    center:'complete_source_face_area_centroid', native_pixel_selection:'strict_positive_area_polygon_intersection_not_pixel_center_selection',
    classification_reassignment:false,resampling:false,area_units:'square_metres_in_EPSG32648_not_geodesic_area',
    numerator_candidate:'publisher_classes_2_plus_3_farmland_4_kept_separate',denominator:'whole_buffer_polygon_all_surfaces',
    incomplete_denominator_behavior:'whole_window_fractions_null_if_nodata_unknown_or_outside_support',population_opened_or_assigned_or_summed:false,
    prep_500m_used_as_resource_boundary:false,source_to_window_pixel_ids:'zero_based_row_col_of_full_city_grid',
    overlap_interpretation:'repeated_pixel_support_is_not_additional_independent_green_area',numeric_tolerance_m2:AREA_TOLERANCE};
  for (const [k,v] of Object.entries(methodExpected)) expect(method[k],v,`资源方法.${k}`);
  const native = object(audit.ub_native_grid, '原生网格');
  expect(native.crs,'EPSG:32648','源CRS'); expect(native.pixel_area_m2,9,'源像元面积'); expect(native.nodata,15,'源NoData');
  expect(audit.building_date,'chengdu_object_observation_date_unverified_no_same_date_claim','建筑时点');
  exactSet(audit.class_evidence?.source_image_dates_city_level,['2020-07-27','2020-07-28'],'分类城市级日期');
  expect(audit.class_evidence?.per_pixel_acquisition_date,null,'逐像元时点');
  expect(audit.class_evidence?.no_new_classification_or_field_validation,true,'分类未升级实测验证');
  for (const [key,value] of Object.entries({0:'water',1:'impervious',2:'tree_canopy_shrub_combined',3:'grass_sparse_vegetation_combined',4:'farmland'})) expect(audit.publisher_classes?.[key],value,`原分类语义${key}`);
  const originalSources = object(audit.sources, '资源源链');
  for (const [key,sha] of [['complete_city_ub_classification',UB_SHA],['complete_cmab_geometry_gpkg',CMAB_SHA],['candidate_csv','6e5ca8d220a42ecd6e3610ed2893c5adafdcbf9e25661c326e8388db1269c5dc']]) {
    const s=object(originalSources[key],key);
    expect(s.sha256_before,sha,`${key}原来源SHA`); expect(s.sha256_after,sha,`${key}来源后SHA`); expect(s.unchanged,true,`${key}来源稳定`);
  }
  if (!Array.isArray(audit.outputs)) fail('资源原输出登记缺失');
  for (const path of [SUPPORT,OVERLAP]) {
    const matches=audit.outputs.filter(o => typeof o.path==='string' && o.path.endsWith(`/${path}`));
    expect(matches.length,1,`${path}原输出唯一身份`); bindOutput(sources,matches[0],path);
  }
  expect(sources.get(SUPPORT).sha256,SUPPORT_SHA,'18行来源版本');
  bindOutput(sources,sensitivity.source,SUPPORT);
  for (const path of [CHANGE,ORDER]) bindOutput(sources,sensitivity.outputs?.[path.split('/').at(-1)],path);
  const objects=keyed(audit.objects || [],o=>o.candidate_object_id,IDS,'六完整源对象');
  IDS.forEach((id,i) => {
    const o=objects.get(id);
    expect(o.fid,FIDS[i],`${id}源fid`); expect(o.publisher_label,'Residence',`${id}发布标签`);
    expect(o.centroid_inside_source_face,id!==IDS[2],`${id}面积质心面内状态`);
    expect(o.source_indices?.length,1,`${id}来源索引数量`); expect(o.source_indices[0],Number(id.split('_').at(-1)),`${id}来源索引`);
    finite(o.centroid_easting_m,`${id}中心E`);finite(o.centroid_northing_m,`${id}中心N`);
  });
  expect(audit.centroid_inside_source_face_count,5,'面内质心数量');
  expect(audit.output_schema?.full_window_denominator_m2,'complete_candidate_buffer_geometry_not_population_or_accessible_land','原分母字段定义');
  expect(audit.output_schema?.unsupported_field_null_meaning,'unknown_or_not_adopted_never_zero','原空值语义');
  const overlaps=keyed(audit.overlap_by_radius || [],r=>r.radius_m,RADII,'三半径共享支持回执');
  for (const radius of RADII) {
    const r=overlaps.get(radius); expect(r.sum_areas_or_shares_across_objects_allowed,false,'共享支持禁止相加');
    finite(r.geometric_union_area_m2,'原联合面积',true);
    near(r.six_window_area_sum_m2_not_unique_resource,DENOMINATORS[radius]*6,AREA_TOLERANCE,'六窗口重复面积');
    near(r.area_counted_more_than_once_m2,r.six_window_area_sum_m2_not_unique_resource-r.geometric_union_area_m2,AREA_TOLERANCE,'重复计入面积定义');
  }
  const rows=csv(view,SUPPORT,SUPPORT_FIELDS,18);
  const support=keyed(rows,r=>`${r.candidate_object_id}|${r.candidate_radius_m}`,IDS.flatMap(id=>RADII.map(r=>`${id}|${r}`)),'18行完整复合键');
  let outsideCount=0;
  for (const row of rows) {
    const id=row.candidate_object_id,o=objects.get(id),radius=numeric(row.candidate_radius_m,'窗口半径');
    const constants={source_fid:String(o.fid),source_layer:'source_window_objects_uncut',publisher_function_label:'Residence',unit_status:'candidate_unit_not_adopted',
      resource_window_status:'candidate_radius_not_adopted',resource_period_status:'2020_07_27_28_city_level_no_pixel_date',building_period_status:'unknown_not_claimed_same_date',
      resource_area_unit:'m2_projected_EPSG32648',fraction_unit:'dimensionless_0_to_1',center_definition:'area_centroid_of_complete_native_cmab_face_not_entrance',
      centroid_inside_source_face:pythonCell(o.centroid_inside_source_face),analysis_crs:'EPSG:32648',denominator_definition:'entire_candidate_buffer_polygon_including_water_and_impervious',
      integration:'not_adapted',scientific_status:'unvalidated_candidate_resource_support',ub_sha256:UB_SHA,cmab_gpkg_sha256:CMAB_SHA};
    for (const [k,v] of Object.entries(constants)) expect(row[k],v,`${id}.${k}`);
    for (const k of ['population_denominator','public_access','actual_occupancy','service_role','T_P_U']) expect(row[k],'',`${id}未知字段${k}`);
    near(numeric(row.center_easting_m,'中心E',false),o.centroid_easting_m,RATIO_TOLERANCE,'面积质心E');
    near(numeric(row.center_northing_m,'中心N',false),o.centroid_northing_m,RATIO_TOLERANCE,'面积质心N');
    const denom=numeric(row.denominator_window_area_m2,'完整窗口面积');
    near(denom,DENOMINATORS[radius],AREA_TOLERANCE,'完整窗口多边形分母');
    near(numeric(row.theoretical_circle_area_m2,'理论圆面积'),Math.PI*radius*radius,AREA_TOLERANCE,'理论圆面积');
    near(numeric(row.polygon_vs_circle_relative_deficit,'离散圆差'),1-denom/(Math.PI*radius*radius),RATIO_TOLERANCE,'多边形/理论圆差');
    const classAreas=[0,1,2,3,4].map(c=>numeric(row[['water','impervious','tree_shrub','grass','farmland'][c]+`_class${c}_area_m2`],'原分类面积'));
    const unknown=['nodata_area_m2','unrecognized_label_area_m2','outside_raster_area_m2'].map(k=>numeric(row[k],k));
    const unknownSum=unknown.reduce((a,b)=>a+b,0),valid=classAreas.reduce((a,b)=>a+b,0),green=classAreas[2]+classAreas[3];
    near(numeric(row.valid_class_area_m2,'有效分类面积'),valid,AREA_TOLERANCE,'0—4类面积合计');
    near(numeric(row.total_unknown_support_area_m2,'未知支持面积'),unknownSum,AREA_TOLERANCE,'未知支持面积合计');
    near(valid+unknownSum,denom,AREA_TOLERANCE,'面积闭合');
    near(numeric(row.green_2_3_area_m2,'绿色2+3面积'),green,AREA_TOLERANCE,'2+3分子');
    if (numeric(row.area_closure_error_m2,'闭合误差')>AREA_TOLERANCE) fail('面积闭合误差超原容差');
    const pixelCount=numeric(row.native_positive_area_pixel_count,'像元数');
    if (!Number.isSafeInteger(pixelCount) || pixelCount<=0) fail('原生支持像元计数无效');
    expect(row.classification_support_complete,'True','本批完整分类支持');
    expect(unknownSum,0,'本批无未知支持');
    for (const [k,n] of [['whole_window_green_2_3_fraction',green],['whole_window_tree_shrub_fraction',classAreas[2]],['whole_window_grass_fraction',classAreas[3]]]) {
      const ratio=numeric(row[k],k); if (ratio>1) fail('分类比例超过1'); near(ratio,n/denom,RATIO_TOLERANCE,'完整窗口比例');
    }
    const outside=numeric(row.window_area_outside_500m_preparation_m2,'超500准备范围支持');
    if (outside>denom+AREA_TOLERANCE) fail('超500面积超过完整分母'); if (outside>0) outsideCount++;
  }
  expect(outsideCount,16,'超500m窗口数');
  const overlapRows=csv(view,OVERLAP,OVERLAP_FIELDS,45);
  keyed(overlapRows,r=>`${r.candidate_radius_m}|${r.left_candidate_id}|${r.right_candidate_id}`,RADII.flatMap(r=>pairs().map(([a,b])=>`${r}|${a}|${b}`)),'45几何重叠复合键');
  for (const r of overlapRows) {
    const area=numeric(r.positive_geometric_overlap_area_m2,'几何重叠m²');
    if (area>DENOMINATORS[r.candidate_radius_m]+AREA_TOLERANCE) fail('重叠面积超过窗口');
    const count=numeric(r.shared_positive_native_pixel_count,'共享像元计数'); if (!Number.isSafeInteger(count)) fail('共享像元非整数');
    expect(r.overlap_status,'shared_source_support_not_independent_observations','几何重叠解释'); expect(r.may_sum_resource_areas_by_objects,'False','禁止跨对象相加');
  }
  const changes=csv(view,CHANGE,CHANGE_FIELDS,6);
  keyed(changes,r=>r.candidate_object_id,IDS,'六变化对象键');
  for (const r of changes) {
    const q=RADII.map(radius=>numeric(support.get(`${r.candidate_object_id}|${radius}`).whole_window_green_2_3_fraction,'原份额')*100);
    RADII.forEach((radius,i)=>near(numeric(r[`green_share_${radius}m_percent`],'窗口百分数'),q[i],RATIO_TOLERANCE,'百分数与原支持关联'));
    near(numeric(r.max_minus_min_percentage_points,'三窗口幅度'),Math.max(...q)-Math.min(...q),RATIO_TOLERANCE,'幅度百分点');
    near(numeric(r.change_75_to_300_percentage_points,'75→300变化',false),q[2]-q[0],RATIO_TOLERANCE,'变化百分点');
    expect(r.centroid_inside_source_face,pythonCell(objects.get(r.candidate_object_id).centroid_inside_source_face),'变化表原质心状态');
    expect(r.primary_unit_and_radius_adopted,'False','主对象/半径未采用'); expect(r.fairness_or_service_priority,'','未知优先级'); expect(r.source_sha256,SUPPORT_SHA,'变化源SHA');
  }
  const orderRows=csv(view,ORDER,ORDER_FIELDS,45);
  keyed(orderRows,r=>`${r.radius_before_m}|${r.radius_after_m}|${r.left_candidate_id}|${r.right_candidate_id}`,TRANSITIONS.flatMap(([a,b])=>pairs().map(([l,r])=>`${a}|${b}|${l}|${r}`)),'45排序诊断复合键');
  const reversalCounts={'75_to_150':0,'150_to_300':0,'75_to_300':0};
  for (const r of orderRows) {
    const difference=radius=>(numeric(support.get(`${r.left_candidate_id}|${radius}`).whole_window_green_2_3_fraction,'左份额')-numeric(support.get(`${r.right_candidate_id}|${radius}`).whole_window_green_2_3_fraction,'右份额'))*100;
    const before=difference(r.radius_before_m),after=difference(r.radius_after_m);
    near(numeric(r.share_difference_before_percentage_points,'前差值',false),before,RATIO_TOLERANCE,'前差值百分点');
    near(numeric(r.share_difference_after_percentage_points,'后差值',false),after,RATIO_TOLERANCE,'后差值百分点');
    expect(r.strict_order_reversed,pythonCell(before*after<0),'严格反转标记'); expect(r.exact_tie_before,pythonCell(before===0),'前精确相等'); expect(r.exact_tie_after,pythonCell(after===0),'后精确相等');
    if (before*after<0) reversalCounts[`${r.radius_before_m}_to_${r.radius_after_m}`]++;
    expect(r.independent_samples,'False','排序不是独立样本');expect(r.fairness_or_service_priority,'','排序不能升级优先级');expect(r.source_sha256,SUPPORT_SHA,'排序来源SHA');
  }
  expect(sensitivity.scope,'descriptive_sensitivity_of_existing_candidate_definitions_only','敏感性范围');
  for (const key of ['primary_unit_adopted','primary_radius_adopted','population_allocated','resident_equity_computed','thermal_comfort_or_network_access_computed','new_independent_observations','significance_test_performed','window_areas_or_population_summed','planning_or_intervention_priority_assigned','formal_direction_plan_modified']) expect(sensitivity[key],false,`敏感性.${key}`);
  expect(sensitivity.source_rows,18,'敏感性原行数'); expect(sensitivity.source_objects,6,'敏感性原对象数');expect(sensitivity.pairs_per_transition,15,'每转换来源对数');
  exactSet(sensitivity.candidate_radii_m,RADII,'敏感性候选半径');
  for (const [key,count] of Object.entries(reversalCounts)) expect(sensitivity.strict_pair_order_changes?.[key],count,`反转回执${key}`);
  for (const [key,count] of Object.entries({'75_to_150':4,'150_to_300':8,'75_to_300':6})) expect(reversalCounts[key],count,'本批严格反转数');
  expect(sensitivity.resource_denominator,'whole_candidate_window_including_water_and_impervious','敏感性分母');
  expect(sensitivity.resource_numerator,'publisher_class2_tree_shrub_plus_class3_grass_sparse_vegetation','敏感性分子');
  expect(sensitivity.source_unchanged,true,'敏感性输入稳定'); expect(sensitivity.saved_csv_bytes_read_back,true,'原CSV回读');
  const accounting=object(audit.accounting,'原分类支持统计');
  for (const [key,count] of Object.entries({candidate_source_faces:6,summary_rows:18,radii:3,pair_overlap_rows:45,complete_windows:18,incomplete_windows:0,windows_extending_outside_preparation_500m:16})) expect(accounting[key],count,`支持计数${key}`);
  for (const [key,count] of Object.entries({summary_rows_read_back:18,unique_summary_keys:18,detail_rows_read_back:251617,unique_detail_keys:251617,unique_native_pixels:72040})) expect(readback[key],count,`回读${key}`);
  for (const key of ['native_source_direct_1x1_samples_pass','all_unknown_and_population_fields_still_empty','all_18_complete_native_classification_support','source_sha256_readback_matches','no_nonfinite_output_numbers']) expect(readback[key],true,`原回读声明${key}`);
  expect(readback.scope,'support_verification_not_field_or_fairness_validation','原回读科学边界');
  for (const path of [SUPPORT,OVERLAP]) expect(readback.deterministic_rerun?.sha256?.[path.split('/').at(-1)],sources.get(path).sha256,'原保存表SHA绑定');
  return {counts:{source_objects:6,resource_rows:18,geometric_overlap_rows:45,window_change_rows:6,order_diagnostic_rows:45,windows_outside_500m:16},
    candidate_object_ids:[...IDS],radii_m:[...RADII],geometry_status:'geometry_not_included',centroid_outside_source_face_ids:[IDS[2]],
    source_state:{integration:audit.integration,scientific_status:audit.scientific_status,primary_unit_adopted:false,primary_radius_adopted:false},
    strict_pair_order_changes:{...reversalCounts},source_support_sha256:SUPPORT_SHA,operation_gates:{...GATES}};
}

const SOURCE_IDS = ('micro_plan pilot_manifest micro_scene working_building_obj native_class_raster saved_input_proof runtime_check parameter_gaps weather_empty_table observation_empty_table candidate_position_csv fragment_identity road_source_scene GF2_check shared_case shared_receptor_register service_preparation comparison_contract upstream_buildings upstream_core_green_fragments upstream_representative_selection upstream_UBGG original_33_slots pilot_description road_attribute_review road_review_proof vegetation_identity_review road_working_geojson_200101 road_original_pbf_200101 road_working_geojson_210101 road_original_pbf_210101 weather_map weather_24_csv weather_note terrain_window_review terrain_COG terrain_pixel_csv terrain_receptor_csv terrain_note held_tmy_zip terrain_independent_audit terrain_source_receipt held_nasadem_zip walking_source_review walking_source_csv walking_source_note frozen_14_manifest frozen_14_zip').split(' ');
const UNKNOWN_SLOTS = ('confirmed_site_and_epoch synchronous_weather evaluation_date_and_time_window warmup_duration physical_road_polygons ground_elevation ground_vegetation_boundary legally_modifiable_space_mask ownership_and_permission individual_tree_positions_crown_height_leaf_structure wall_roof_paving_material_parameters soil_profile_initial_moisture_irrigation physical_solver_id_and_version solver_grid_and_time_step solver_domain_and_boundary_conditions validated_receiver_support_weights accepted_receiver_height_m calibration_dataset_and_parameter_set independent_validation_dataset cross_site_validation pairwise_input_and_numerical_error physical_model_discrepancy_error same_input_target_vector match_descriptor_set_version match_tolerances match_target_vector feasible_sample_size generation_and_search_budget practical_thermal_equivalence_margin_C pairwise_uncertainty_method_and_coverage decision_target_and_loss independent_layout_weather_split UTCI_input_completeness_and_method').split(' ');
const EVIDENCE_ACCEPTED_FIELDS = {M01:'confirmed_site_and_epoch',M02:'legally_modifiable_space_mask',M03:'fixed_physical_background_accepted',
  M04_H1:'legally_modifiable_space_mask',M04_H2:'legally_modifiable_space_mask',M04_H3:'legally_modifiable_space_mask',M04_H4:'legally_modifiable_space_mask',M04_H5:'legally_modifiable_space_mask',
  M05:'ground_vegetation_boundary',M06_1:'ground_vegetation_boundary',M06_2:'ground_vegetation_boundary',M06_3:'ground_vegetation_boundary',
  M07_roads_2020:'physical_road_polygons',M07_roads_2021:'physical_road_polygons',M08:'ownership_and_permission',M09:'same_input_target_vector',
  M10:'soil_profile_initial_moisture_irrigation',M11:'ground_elevation',M12:'accepted_receiver_height_m',M13:'synchronous_weather',M14:'physical_solver_id_and_version'};
const BUILDING_IDS = '151730 151738 151742 151747 151753 151754 151757 151758 153114 153115 153116 153117 153118 153119 153120 153121 153122 153123 153124 153125 153126 153127 153128 153129 153130 153131 154314 154315 154316 154317 154318 154319 154320 154321 154322 154324 154325 154326 154327 154328 155682 155683 155684 155685 155686 155687 155688 155689 155691 155693 155694 155695 155696'.split(' ');
const ROAD_IDS = 'w100288826 w100288828 w100288832 w114412855 w116486217 w453873884 w587600580 w587601045 w665501095 w710790280 w710790281 w711177603 w711177604 w711177605 w711177606 w711177607 w711177615'.split(' ');
const OBJECT_LAYERS = {buildings_uncut:['micro_scene','merged_id',BUILDING_IDS],vegetation_core:['micro_scene','local_id',['1','2','3']],
  surface_review_core:['micro_scene','review_id',['H1','H2','H3','H4','H5']],overlap_review_core:['micro_scene','review_id',['O1','O2','O3']],
  receptor_candidates:['micro_scene','receptor_id',['V1','V2','V3','H1','H2','H3']],roads_2020:['road_source_scene','rr_source_feature_id',ROAD_IDS],roads_2021:['road_source_scene','rr_source_feature_id',ROAD_IDS]};
const OLD_SERVICE_SHA = '0830d7035c6f0dec9796b4894ca48683688e74093a28b179945cc0a70e6a28c9';
const NEW_SERVICE_SHA = '06c802c405bfc9373e8e028c84a87c9e13c27d4b541e6f37adb69e63076d3e3d';

/** Validate evidence/source/object joins and each named unknown slot; return a new summary. */
export function validateModifiableEvidence(view) {
  sourceIndex(view,MODIFIABLE_EVIDENCE_SOURCE_PATHS);
  const audit=object(view.files[MODIFIABLE_AUDIT],'可改空间证据'); rejectNonfinite(audit,'可改空间证据');
  expect(audit.schema_version,'1.0','原证据schema'); expect(audit.artifact_kind,'source_backed_modifiable_space_admission_evidence_not_feasible_mask','证据类型'); expect(audit.site_id,'E4125_N33891','工作场景身份');
  date(audit.created_at,'原证据'); date(audit.source_audit_interval?.started_at,'源核查开始');date(audit.source_audit_interval?.ended_at,'源核查结束');
  expect(audit.source_audit_interval?.claims_limited_to_this_interval,true,'读取时段边界');
  const current=object(audit.current_admission_state,'接受槽');
  exactSet(Object.keys(object(current.original_unknown_values,'原33槽')),UNKNOWN_SLOTS,'原33槽完整路径');
  nullAt(current.original_unknown_values,UNKNOWN_SLOTS,'原33槽');
  for (const key of ['original_accepted_field_count','new_acceptances_written']) expect(current[key],0,`接受计数${key}`);
  nullAt(current,['research_design_modification_mask','implementation_permission_mask','accepted_physical_ground_or_road_faces','accepted_vegetation_inventory_or_same_input_target','accepted_receiver_support','accepted_weather_forcing'],'接受状态');
  expect(current.physical_run_entry_ready,false,'物理运行门控');
  for (const key of ['source_presence_or_classification_is_permission','research_design_scope_is_real_world_permission','width_or_highway_label_is_actual_road_face','classified_vegetation_projection_is_ground_input','held_DEM_is_true_ground_or_OBJ_Z0','foot_or_access_tag_is_modification_permission']) expect(audit.admission_semantics?.[key],false,`权限边界${key}`);
  expect(audit.admission_semantics?.hypothetical_research_scope_allowed_only_after_explicit_definition_and_label,true,'假设研究边界');
  expect(audit.admission_semantics?.unknown_csv_representation,'blank cell; numeric zero does not replace unknown','未知CSV语义');
  for (const key of ['new_geometry_calculations','new_candidate_layouts','new_weather_extractions','new_DEM_pixel_extractions','new_physical_runs','data_downloads']) expect(audit.read_scope?.[key],0,`原执行范围${key}`);
  for (const key of ['solver_rescanned_or_run','macro_final_Y_or_models_read','research_plans_modified','original_33_slots_modified','frozen_14_modified','city_repository_global_absence_claim']) expect(audit.read_scope?.[key],false,`原执行边界${key}`);
  const sourceRows=csv(view,SOURCE_VERSIONS,VERSION_FIELDS,48);
  const sources=keyed(audit.sources || [],s=>s.source_id,SOURCE_IDS,'48源键');
  keyed(sourceRows,s=>s.source_id,SOURCE_IDS,'48源版本CSV键');
  for (const row of sourceRows) {
    const source=sources.get(row.source_id);
    for (const field of VERSION_FIELDS) expect(row[field],pythonCell(source[field]),`${row.source_id}源版本字段${field}`);
    expect(source.exists,true,`${source.source_id}源存在声明`);expect(source.unchanged_during_this_read,true,`${source.source_id}读取前后稳定`);
    if (!Number.isSafeInteger(source.bytes) || source.bytes<=0) fail('48源记录bytes无效');
    hash(source.sha256_before,'原源前SHA');hash(source.sha256_after,'原源后SHA');expect(source.sha256_before,source.sha256_after,'原源前后SHA');
    expect(source.mtime_ns_before,source.mtime_ns_after,'原记录修改时间稳定');
    if (source.previous_reference_sha256===null) expect(source.matches_previous_reference,null,'未引用旧版');
    else {hash(source.previous_reference_sha256,'源旧版SHA');expect(source.matches_previous_reference,source.previous_reference_sha256===source.sha256_before,'源旧版匹配声明');}
  }
  const service=sources.get('service_preparation');expect(service.previous_reference_sha256,OLD_SERVICE_SHA,'service旧引用');expect(service.sha256_before,NEW_SERVICE_SHA,'service现版本');expect(service.matches_previous_reference,false,'service漂移保留');
  if (!Array.isArray(audit.previous_reference_drift) || audit.previous_reference_drift.length!==1) fail('来源漂移清单必须保留唯一service差异');
  const drift=audit.previous_reference_drift[0];expect(drift.source_id,'service_preparation','漂移身份');expect(drift.previous_sha256,OLD_SERVICE_SHA,'漂移旧SHA');expect(drift.current_sha256,NEW_SERVICE_SHA,'漂移新SHA');
  const evidenceRows=csv(view,EVIDENCE,EVIDENCE_FIELDS,21), evidenceIds=Object.keys(EVIDENCE_ACCEPTED_FIELDS);
  keyed(evidenceRows,r=>r.evidence_id,evidenceIds,'21CSV证据键');
  const evidence=keyed(audit.evidence_rows || [],r=>r.evidence_id,evidenceIds,'21JSON证据键');
  for (const row of evidenceRows) {
    const original=evidence.get(row.evidence_id);
    if (!Array.isArray(original.source_ids) || !original.source_ids.length || new Set(original.source_ids).size!==original.source_ids.length || original.source_ids.some(id=>!sources.has(id))) fail('证据来源关联无效');
    for (const field of EVIDENCE_FIELDS) expect(row[field],field==='source_ids'?original.source_ids.join(';'):pythonCell(original[field]),`${row.evidence_id}.${field}`);
    expect(original.accepted_field,EVIDENCE_ACCEPTED_FIELDS[row.evidence_id],'逐证据原接受字段');
    nullAt(original,['accepted_value','accepted_as_modifiable_space'],`证据${row.evidence_id}`);
    expect(original.status,'source_review_complete_admission_unknown','接纳仍未知');
    for (const field of ['source_can_establish','source_does_not_establish','research_design_scope_needed','physical_evidence_needed','implementation_or_use_permission_needed']) if (typeof original[field]!=='string' || !original[field]) fail('证据的设计/物理/权限边界缺失');
  }
  const expectedObjectKeys=[];
  for (const [layer,[sourceId,,ids]] of Object.entries(OBJECT_LAYERS)) {
    const prefix=layer.startsWith('roads_')?'micro_roads':'micro_scene';
    const snapshot=layer==='roads_2020'?'/2020年初':layer==='roads_2021'?'/2021年初':'';
    expectedObjectKeys.push(...ids.map(id=>`${prefix}@sha256:${sources.get(sourceId).sha256_before}/${layer}${snapshot}/${id}`));
  }
  const objects=keyed(audit.source_objects || [],o=>o.object_key,expectedObjectKeys,'104源版本对象键');
  for (const o of objects.values()) {
    const [sourceId,idField,ids]=OBJECT_LAYERS[o.layer] || [];
    expect(o.source_id,sourceId,'对象来源关联');expect(o.id_field,idField,'对象原身份字段');if (!ids?.includes(o.object_id)) fail('对象层内身份缺失');
    const attrs=object(o.source_attribute_record,'完整原对象属性'); expect(String(attrs[idField]),o.object_id,'属性身份关联');
    expect(o.accepted_modification_permission,null,'对象实施权限未知');
    if (o.layer.startsWith('roads_')) {
      nullAt(o,['accepted_road_face','accepted_public_walkability'],'道路接受值');
      expect(attrs.rr_snapshot_label,o.layer==='roads_2020'?'2020年初':'2021年初','两期道路分列');
      expect(attrs.rr_snapshot_code,o.layer==='roads_2020'?'200101':'210101','道路期次代码');
      if (attrs.rr_intersects_core===1) expect(attrs.width,null,'核心道路宽度缺失');
      if (o.object_id==='w587601045') {expect(attrs.foot,'yes','来源foot标签');expect(attrs.access,'no','来源access标签');}
    } else {
      nullAt(o,['accepted_physical_surface','accepted_plantability'],'对象物理接受值');
      if (o.layer==='surface_review_core') {expect(attrs.road_mask_status,'missing','硬类道路面缺失');expect(attrs.plantability_status,'unverified','硬类可种植未知');}
      if (o.layer==='vegetation_core') {expect(attrs.source_component_ids,'17696','三裁片同源组件');expect(attrs.ground_vs_canopy_status,'unknown_tree_shrub_vs_ground','地面冠层未知');}
      if (o.layer==='receptor_candidates') {expect(attrs.position_and_height_confirmed,0,'受体未确认');expect(attrs.proposed_air_height_m,1.5,'受体拟议高度');expect(attrs.measurement_status,'not_collected','受体无实测');}
    }
  }
  const sameInput=object(audit.same_input_definition_from_existing_preparation,'同投入定义');
  nullAt(sameInput,['numeric_target_vector','permitted_strategy_categories'],'同投入未冻结');
  expect(sameInput.held_classified_projection_area_m2,1989,'既有分类投影面积');expect(sameInput.held_classified_projection_used_as_confirmed_ground_input,false,'分类投影不是地面投入');
  expect(sameInput.same_tree_count_alone_sufficient,false,'株数不替代同投入');expect(sameInput.crown_union_projection_forced_equal_by_default,false,'冠层并集不强制同投入');
  exactSet((sameInput.terms || []).map(t=>t.quantity_id),['A_ground_green','vegetation_inventory','leaf_area_or_LAD_profile','crown_geometry_per_object','soil_initial_state_and_irrigation','nonvegetation_surface_transition'],'六投入定义');
  sameInput.terms.forEach(t=>expect(t.numeric_target,null,`投入目标${t.quantity_id}`));
  const weather=object(audit.latest_weather_use_boundary,'天气边界');expect(weather.literal_source_year,2021,'天气原标签年');expect(weather.not_synchronous_observation_for,'2020-07-19','天气非同期');expect(weather.raw_labels_preserved,true,'天气标签保留');
  for (const key of ['all_selected_records_certified_station_observed','per_field_flag_position_map_verified','minute_30_producer_specific_convention_verified','solver_specific_temporal_interpolation_validated','accepted_as_solver_forcing']) expect(weather.latest_saved_producer_time_followup?.[key],false,`天气未验收${key}`);
  const walking=object(audit.latest_04_walking_summary_from_saved_review,'04来源边界');expect(walking['2021_positive_length_source_lines'],17,'04历史源线数');expect(walking.highway_walk_class_candidates,6,'04步行候选数');
  nullAt(walking,['certified_public_walk_edges','certified_network_connectivity'],'04未知');expect(walking.route_or_od_computed,false,'04未算OD');expect(walking.service_computed,false,'04未算服务');
  expect(audit.receiver_identity_readback?.accepted_height_or_ground,null,'受体地面高度未知');expect(audit.receiver_identity_readback?.shared_keys_coordinates_match,true,'原受体源键回读');
  exactSet(audit.receiver_identity_readback?.six_ids,['H1','H2','H3','V1','V2','V3'],'六受体回读身份');
  expect(audit.next_single_dependency?.current_ready_to_generate_layouts,false,'候选生成未开放');
  exactSet(audit.next_single_dependency?.required_fields,['scope_id','version','CRS','research_design_boundary','retained_or_excluded_space','allowed_action_and_source_object','accepted_or_hypothetical_physical_basis','implementation_permission_evidence_or_null','conflict_and_unknown_policy'],'设计/权限冻结必需字段');
  const validation=object(audit.validation,'原核查计数');
  for (const [key,n] of Object.entries({source_count:48,source_files_exist_count:48,source_before_after_unchanged_count:48,evidence_row_count:21,traced_source_object_count:104,original_unknown_fields:33})) expect(validation[key],n,`原核查${key}`);
  for (const key of ['all_original_unknown_values_null','all_admission_values_null','source_identity_attributes_verified_without_geometry_recalculation']) expect(validation[key],true,`原核查声明${key}`);
  expect(validation.native_running_work_repeated,false,'未重复原方向运行');
  for (const [layer,[,,ids]] of Object.entries(OBJECT_LAYERS)) expect(validation.trace_counts?.[layer],ids.length,`原来源层计数${layer}`);
  return {site_id:audit.site_id,counts:{evidence_rows:21,source_records:48,source_objects:104,unknown_acceptance_slots:33,accepted_fields:0},
    source_ids:[...SOURCE_IDS],object_keys:[...objects.keys()],geometry_status:'geometry_not_included',
    source_state:{status:'source_review_complete_admission_unknown',research_design_modification_mask:null,implementation_permission_mask:null,physical_run_entry_ready:false},
    service_reference_versions:{previous_sha256:OLD_SERVICE_SHA,current_sha256:NEW_SERVICE_SHA},operation_gates:{...GATES}};
}
