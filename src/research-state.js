export const RESEARCH_REGISTRATION_SCHEMA = '0.1.read-only-research-registration';
export const RESEARCH_INDEX_SCHEMA = 'coordination-evidence-index-v0.1';
export const RESEARCH_INDEX_PATH = '共享接口/当前成果状态索引.json';

// Application permission is independent of both imported metadata and technical checks.
export const READ_ONLY_RESEARCH_ACTION_GATES = Object.freeze({
  validated_new_site_prediction:false,
  physical_cooling:false,
  comfort_accessibility:false,
  actual_use:false,
  equity_results:false,
  minimum_area_search:false,
  optimal_recommendation:false,
});

export function readOnlyResearchActionGates() {
  return {...READ_ONLY_RESEARCH_ACTION_GATES};
}

export function readOnlyResearchActionEnabled() {
  return false;
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const isHash = value => typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value);
const isPositiveInteger = value => Number.isSafeInteger(value) && value > 0;
const hasDate = value => hasText(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const validRelativePath = value => hasText(value) && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some(part => !part || part === '.' || part === '..');
const INDEX_SCOPE = 'selected_manifest_receipt_summary_binding_not_all_model_weight_reverification';
const VERIFICATION_SCOPE = 'index_and_selected_metadata_bytes_not_all_weights_or_inference';
const SCIENTIFIC_SCOPE = 'development_validation_used_for_stopping_and_comparison';
const INTERPRETATION_LIMITS = [
  'development_MAE_is_model_error_not_site_temperature_or_cooling',
  'technical_receipt_pass_is_not_final_test_or_application_validation',
  'finite_unstable_or_negative_C_increment_does_not_prove_no_physical_role',
];
const STAGE_IDS = new Set(['one_hop_development','configuration_sources','full_group_ablations']);
const AXIS_STATES = {
  file_acceptance:'readable_verified_index',
  science_validation:'development_evidence_not_application_validated',
  integration:'local_read_only_registration',
  execution:'metadata_registered_no_model_execution',
};

function uniqueRecords(records,key,label) {
  if (!Array.isArray(records) || records.length === 0) throw new Error(label + '必须为非空列表。');
  const result = new Map();
  for (const record of records) {
    if (!isRecord(record) || !hasText(record[key])) throw new Error(label + '缺少' + key + '身份。');
    if (result.has(record[key])) throw new Error(label + '存在重复身份：' + record[key] + '。');
    result.set(record[key],record);
  }
  return result;
}

function requireFalse(record,key,label) {
  if (record[key] !== false) throw new Error(label + '的' + key + '必须明确为false；只读登记不能开放科研应用。');
}

function validateOperationGates(gates,label) {
  if (!isRecord(gates)) throw new Error(label + '缺少只读操作门控。');
  for (const key of Object.keys(READ_ONLY_RESEARCH_ACTION_GATES)) requireFalse(gates,key,label);
  for (const [key,value] of Object.entries(gates)) {
    if (value !== false) throw new Error(label + '存在已开放或无效的操作门控：' + key + '。');
  }
}

function validateCounts(counts) {
  if (!isRecord(counts) || Object.keys(counts).length === 0) throw new Error('科研阶段的开发计数结构无效。');
  for (const value of Object.values(counts)) {
    if (isRecord(value)) validateCounts(value);
    else if (!Number.isSafeInteger(value) || value < 0) throw new Error('科研阶段的开发计数必须为有限非负整数。');
  }
}

function validateResearchIndex(index) {
  if (!isRecord(index) || index.schema_version !== RESEARCH_INDEX_SCHEMA || index.project_id !== 'nsfc_dense_block_cooling' || !hasDate(index.checked_at)) throw new Error('科研索引身份、版本或核查时间无效。');
  const sources = uniqueRecords(index.sources,'source_id','科研来源');
  const sourcePaths = new Set(), sourceRoles = new Set();
  for (const source of sources.values()) {
    if (!validRelativePath(source.path) || !hasText(source.role) || !isHash(source.sha256) || !isPositiveInteger(source.bytes)) throw new Error('科研来源' + source.source_id + '缺少有效路径、角色、SHA256或字节记录。');
    if (sourcePaths.has(source.path) || sourceRoles.has(source.role)) throw new Error('科研来源存在重复路径或角色身份。');
    sourcePaths.add(source.path); sourceRoles.add(source.role);
  }
  const stages = uniqueRecords(index.stages,'stage_id','科研阶段');
  for (const stage of stages.values()) {
    if (!STAGE_IDS.has(stage.stage_id) || !hasText(stage.upstream_version) || !hasText(stage.upstream_status) || !hasDate(stage.assembly_or_training_completed_utc)) throw new Error('科研阶段身份、上游版本或完成时间无效。');
    if (stage.scientific_scope !== SCIENTIFIC_SCOPE) throw new Error('科研阶段必须保留开发比较的科学范围。');
    requireFalse(stage,'final_test_evaluated','科研阶段');
    requireFalse(stage,'usable_for_deployment_inference','科研阶段');
    if (typeof stage.technical_receipt_passed !== 'boolean' || !isPositiveInteger(stage.declared_technical_check_count)) throw new Error('科研阶段技术核验声明无效。');
    if (stage.receipt_binding_matches_indexed_manifest !== true) throw new Error('科研阶段回执与索引清单的绑定必须明确为true。');
    const manifest = sources.get(stage.manifest_source_id), receipt = sources.get(stage.technical_receipt_source_id);
    if (!manifest || manifest.role !== stage.stage_id + '_manifest' || !receipt || receipt.role !== stage.stage_id + '_independent_technical_receipt') throw new Error('科研阶段的来源关联或角色不一致。');
    if (!isRecord(stage.counts) || !['runs','metrics','predictions','folds','development_targets','final_test_locked_targets','semantic_channels'].every(key=>isPositiveInteger(stage.counts[key]))) throw new Error('科研阶段缺少有效开发数量与最终锁定数量。');
    validateCounts(stage.counts);
  }
  if (!Array.isArray(index.development_metric_records) || index.development_metric_records.length === 0) throw new Error('科研索引缺少开发误差记录列表。');
  const recordIds = new Set();
  for (const record of index.development_metric_records) {
    if (!isRecord(record) || !stages.has(record.stage_id) || !['gatv2','uniform'].includes(record.aggregation) || !hasText(record.configuration) || !isPositiveInteger(record.width)) throw new Error('开发误差记录身份、阶段或聚合配置无效。');
    const identity = JSON.stringify([record.stage_id,record.aggregation,record.configuration,record.width,record.metric]);
    if (recordIds.has(identity)) throw new Error('开发误差记录存在重复复合身份。');
    recordIds.add(identity);
    if (record.metric !== 'development_MAE' || record.unit !== 'degC' || record.interpretation !== 'model_error_not_temperature_or_cooling_value') throw new Error('开发误差的指标、单位或解释不一致；℃仅表示模型误差。');
    if (record.construct !== 'model_prediction_error' || record.evaluation_split !== 'development_validation' || record.compatible_with_scene_temperature_results !== false) throw new Error('开发误差必须保留模型误差构念与开发验证集，不可写入场景温度结果。');
    if (!Number.isFinite(record.value) || record.value < 0) throw new Error('开发误差必须为有限且非负的原始数值。');
    const source = sources.get(record.source_id);
    if (!source || source.role !== record.stage_id + '_development_MAE_summary') throw new Error('开发误差与汇总来源的阶段关联不一致。');
  }
  if (index.root_scope !== INDEX_SCOPE || index.platform_adapter_status !== 'not_adapted_by_this_index_builder') throw new Error('科研索引必须保留原核查范围与原适配声明。');
  if (!Array.isArray(index.interpretation_limits) || index.interpretation_limits.length !== INTERPRETATION_LIMITS.length || new Set(index.interpretation_limits).size !== INTERPRETATION_LIMITS.length || !INTERPRETATION_LIMITS.every(limit=>index.interpretation_limits.includes(limit))) throw new Error('科研索引必须保留模型误差、技术验证及物理作用的三项解释边界。');
  if (index.metadata_index_valid !== true || index.source_hashes_unchanged_during_index_build !== true || !Array.isArray(index.errors) || index.errors.length !== 0) throw new Error('科研索引来源元数据尚未完成有效核查。');
  for (const key of ['model_weights_loaded','locked_test_labels_read','new_training_or_prediction_performed','scientific_deployment_validated']) requireFalse(index,key,'科研索引');
  const readiness = index.evidence_readiness_and_operation_gates;
  if (!isRecord(readiness) || typeof readiness.reference_inputs_available !== 'boolean' || typeof readiness.saved_development_evidence_available !== 'boolean') throw new Error('科研索引缺少证据准备状态与只读操作门控。');
  const applicationGates = Object.fromEntries(Object.entries(readiness).filter(([key])=>!['reference_inputs_available','saved_development_evidence_available'].includes(key)));
  validateOperationGates(applicationGates,'科研索引');
  if (!Array.isArray(index.historical_snapshots_preserved) || !index.historical_snapshots_preserved.every(validRelativePath) || new Set(index.historical_snapshots_preserved).size !== index.historical_snapshots_preserved.length) throw new Error('科研索引历史快照路径登记无效。');
  return index;
}

export function validateResearchRegistration(value) {
  if (!isRecord(value) || value.schema_version !== RESEARCH_REGISTRATION_SCHEMA) throw new Error('科研登记不是受支持的只读登记版本。');
  const source = value.source_index;
  if (!isRecord(source) || source.path !== RESEARCH_INDEX_PATH || !isHash(source.sha256) || !isPositiveInteger(source.bytes) || value.registration_id !== 'coordination-index:' + source.sha256) throw new Error('科研登记身份与原索引路径、SHA256或字节记录不一致。');
  validateResearchIndex(value.index);
  const receipt = value.adapter_receipt;
  if (!isRecord(receipt) || receipt.adapter_version !== '0.1' || !hasDate(receipt.registered_at)) throw new Error('科研登记缺少有效只读适配记录。');
  for (const [axis,state] of Object.entries(AXIS_STATES)) {
    if (!isRecord(receipt[axis]) || receipt[axis].state !== state) throw new Error('科研登记的' + axis + '不符合独立只读状态。');
  }
  const verification = receipt.source_verification;
  if (!isRecord(verification) || verification.verified_source_count !== value.index.sources.length || verification.all_source_hashes_match !== true || verification.source_hashes_unchanged !== true || verification.index_hash_unchanged !== true || verification.scope !== VERIFICATION_SCOPE) throw new Error('科研登记的只读来源核验元数据不完整或不一致。');
  validateOperationGates(receipt.operation_gates,'科研登记');
  // Original-byte SHA256 is provenance, not a hash of this reserialized object.
  // Disk-byte verification is performed by the read-only snapshot adapter.
  return value;
}

export function validateResearchRegistrations(values) {
  if (!Array.isArray(values)) throw new Error('科研登记必须为列表；旧包可不包含此字段。');
  const seen = new Set();
  for (const value of values) {
    validateResearchRegistration(value);
    if (seen.has(value.registration_id)) throw new Error('科研登记存在重复身份。');
    seen.add(value.registration_id);
  }
  return values;
}

export function validateReadOnlySoftwareReceipt(receipt) {
  if (!isRecord(receipt) || receipt.science_validation !== 'not_upgraded' || receipt.research_execution !== 'not_requested') throw new Error('交接包软件操作不得升级科学验证或声明研究执行。');
  for (const key of ['prediction_enabled','physics_enabled','optimal_recommendation_enabled']) requireFalse(receipt,key,'软件操作记录');
  for (const key of Object.keys(READ_ONLY_RESEARCH_ACTION_GATES)) if (Object.hasOwn(receipt,key)) requireFalse(receipt,key,'软件操作记录');
  for (const key of Object.keys(receipt)) if (key.endsWith('_enabled')) requireFalse(receipt,key,'软件操作记录');
  if (Object.hasOwn(receipt,'operation_gates')) validateOperationGates(receipt.operation_gates,'软件操作记录');
  return receipt;
}
