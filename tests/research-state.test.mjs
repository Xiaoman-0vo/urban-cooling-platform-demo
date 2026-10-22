import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  RESEARCH_INDEX_PATH, RESEARCH_REGISTRATION_SCHEMA, READ_ONLY_RESEARCH_ACTION_GATES,
  readOnlyResearchActionEnabled, readOnlyResearchActionGates,
  validateResearchRegistration, validateResearchRegistrations,
} from '../src/research-state.js';

const snapshot = JSON.parse(readFileSync(new URL('../public/data/research-state.json',import.meta.url),'utf8'));
const copy = value => structuredClone(value);
const changed = mutation => {const value=copy(snapshot); mutation(value); return value;};

test('R01 真实8来源/26误差登记保留完整原索引，SHA绑定原文件字节', () => {
  const bytes = readFileSync(new URL('../../共享接口/当前成果状态索引.json',import.meta.url));
  const original = JSON.parse(bytes.toString('utf8'));
  const before = JSON.stringify(snapshot);
  assert.strictEqual(validateResearchRegistration(snapshot),snapshot);
  assert.equal(snapshot.schema_version,RESEARCH_REGISTRATION_SCHEMA);
  assert.equal(snapshot.source_index.path,RESEARCH_INDEX_PATH);
  assert.equal(snapshot.source_index.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(snapshot.source_index.bytes,bytes.length);
  assert.equal(snapshot.registration_id,'coordination-index:' + snapshot.source_index.sha256);
  assert.deepEqual(snapshot.index,original);
  assert.equal(snapshot.index.sources.length,8);
  assert.equal(snapshot.index.development_metric_records.length,26);
  assert.equal(JSON.stringify(snapshot),before);
  assert.notEqual(createHash('sha256').update(JSON.stringify(snapshot.index)).digest('hex'),snapshot.source_index.sha256);
});

test('R02 技术pass和metadata_index_valid不开放任何应用，返回门控不能污染下一次调用', () => {
  assert.equal(snapshot.index.metadata_index_valid,true);
  assert.ok(snapshot.index.stages.every(stage=>stage.technical_receipt_passed));
  assert.ok(Object.isFrozen(READ_ONLY_RESEARCH_ACTION_GATES));
  const gates = readOnlyResearchActionGates(snapshot);
  assert.equal(Object.keys(gates).length,7);
  assert.ok(Object.values(gates).every(value=>value===false));
  gates.validated_new_site_prediction=true;
  assert.equal(readOnlyResearchActionGates(snapshot).validated_new_site_prediction,false);
  for (const key of [...Object.keys(gates),'unknown_action']) assert.equal(readOnlyResearchActionEnabled(key,snapshot),false);
  const failedCheck = changed(value=>{value.index.stages[0].technical_receipt_passed=false;});
  assert.doesNotThrow(()=>validateResearchRegistration(failedCheck));
  assert.deepEqual(readOnlyResearchActionGates(failedCheck),READ_ONLY_RESEARCH_ACTION_GATES);
});

test('R03 envelope、来源哈希/字节与唯一登记身份不能依靠index_valid补齐', () => {
  for (const mutation of [
    value=>{value.schema_version='foreign';},
    value=>{value.registration_id='coordination-index:'+'0'.repeat(64);},
    value=>{value.source_index.path='../../source.json';},
    value=>{value.source_index.sha256='bad-hash';},
    value=>{value.source_index.bytes=0;},
    value=>{value.source_index.bytes=Infinity;},
    value=>{value.index.schema_version='foreign';},
    value=>{value.index.project_id='other-project';},
    value=>{value.index.checked_at='invalid';},
  ]) assert.throws(()=>validateResearchRegistration(changed(mutation)));
  assert.throws(()=>validateResearchRegistrations([snapshot,copy(snapshot)]),/重复身份/);
  for (const value of [null,{},'registration',undefined]) assert.throws(()=>validateResearchRegistrations(value));
  assert.deepEqual(validateResearchRegistrations([]),[]);
});

test('R04 sources/stages/records唯一身份与来源角色关联完整核验', () => {
  for (const mutation of [
    value=>{value.index.sources[1].source_id=value.index.sources[0].source_id;},
    value=>{value.index.sources[1].path=value.index.sources[0].path;},
    value=>{value.index.sources[1].role=value.index.sources[0].role;},
    value=>{value.index.sources[0].sha256='not-hash';},
    value=>{value.index.sources[0].bytes=-1;},
    value=>{value.index.sources[0].path='/absolute/path';},
    value=>{value.index.stages[1].stage_id=value.index.stages[0].stage_id;},
    value=>{value.index.stages[0].manifest_source_id='source_03';},
    value=>{value.index.stages[0].technical_receipt_source_id='source_01';},
    value=>{value.index.development_metric_records.push(copy(value.index.development_metric_records[0]));},
    value=>{value.index.development_metric_records[0].source_id='source_08';},
    value=>{value.index.development_metric_records[0].stage_id='missing_stage';},
  ]) assert.throws(()=>validateResearchRegistration(changed(mutation)));
});

test('R05 开发误差拒绝温度/降温语义、错误单位、字符串及非有限负值', () => {
  for (const bad of [NaN,Infinity,-Infinity,-0.01,'1.2',null]) {
    assert.throws(()=>validateResearchRegistration(changed(value=>{value.index.development_metric_records[0].value=bad;})),/有限且非负/);
  }
  for (const mutation of [
    value=>{value.index.development_metric_records[0].metric='temperature_improvement_C';},
    value=>{value.index.development_metric_records[0].unit='K';},
    value=>{value.index.development_metric_records[0].interpretation='site_temperature';},
    value=>{value.index.development_metric_records[0].construct='scene_temperature';},
    value=>{delete value.index.development_metric_records[0].construct;},
    value=>{value.index.development_metric_records[0].evaluation_split='final_test';},
    value=>{value.index.development_metric_records[0].evaluation_split='training';},
    value=>{value.index.development_metric_records[0].compatible_with_scene_temperature_results=true;},
    value=>{value.index.development_metric_records[0].compatible_with_scene_temperature_results='false';},
    value=>{delete value.index.development_metric_records[0].compatible_with_scene_temperature_results;},
    value=>{value.index.development_metric_records[0].width='32';},
    value=>{value.index.development_metric_records[0].width=0;},
  ]) assert.throws(()=>validateResearchRegistration(changed(mutation)));
  assert.doesNotThrow(()=>validateResearchRegistration(changed(value=>{value.index.development_metric_records[0].value=0;})));
});

test('R06 开发阶段范围、最终测试锁与新推理边界不得升级', () => {
  for (const mutation of [
    value=>{value.index.stages[0].scientific_scope='final_test_or_application';},
    value=>{value.index.stages[0].final_test_evaluated=true;},
    value=>{delete value.index.stages[0].final_test_evaluated;},
    value=>{value.index.stages[0].usable_for_deployment_inference=true;},
    value=>{value.index.stages[0].counts.final_test_locked_targets=0;},
    value=>{value.index.stages[2].counts.paired_metric_counts.MAE_C.seed_rows=Infinity;},
    value=>{value.index.stages[0].declared_technical_check_count='1952';},
    value=>{value.index.stages[0].receipt_binding_matches_indexed_manifest=false;},
    value=>{value.index.stages[0].receipt_binding_matches_indexed_manifest='true';},
    value=>{delete value.index.stages[0].receipt_binding_matches_indexed_manifest;},
    value=>{delete value.index.stages[0].assembly_or_training_completed_utc;},
    value=>{value.index.stages[0].assembly_or_training_completed_utc='invalid';},
    value=>{value.index.root_scope='all_model_weights_reverified';},
    value=>{value.index.platform_adapter_status='scientifically_deployed';},
    value=>{delete value.index.interpretation_limits;},
    value=>{value.index.interpretation_limits.pop();},
    value=>{value.index.interpretation_limits[2]='negative_C_increment_proves_no_physical_role';},
    value=>{value.index.interpretation_limits[2]=value.index.interpretation_limits[0];},
  ]) assert.throws(()=>validateResearchRegistration(changed(mutation)));
});

test('R07 真实读取/执行禁区和证据门控逐项false，缺失/字符串也拒绝', () => {
  for (const key of ['model_weights_loaded','locked_test_labels_read','new_training_or_prediction_performed','scientific_deployment_validated']) {
    for (const bad of [true,'false',undefined]) assert.throws(()=>validateResearchRegistration(changed(value=>{value.index[key]=bad;})));
  }
  for (const key of Object.keys(READ_ONLY_RESEARCH_ACTION_GATES)) {
    for (const target of ['index','adapter']) {
      const mutate = value=>{const gates=target==='index'?value.index.evidence_readiness_and_operation_gates:value.adapter_receipt.operation_gates;gates[key]=true;};
      assert.throws(()=>validateResearchRegistration(changed(mutate)),/false|门控/);
    }
  }
  assert.throws(()=>validateResearchRegistration(changed(value=>{value.adapter_receipt.operation_gates.new_prediction=true;})),/门控/);
  assert.throws(()=>validateResearchRegistration(changed(value=>{delete value.index.evidence_readiness_and_operation_gates.physical_cooling;})),/false/);
});

test('R08 四轴、来源核验范围与数量单独验证，不因技术pass默认补齐', () => {
  for (const axis of ['file_acceptance','science_validation','integration','execution']) {
    assert.throws(()=>validateResearchRegistration(changed(value=>{delete value.adapter_receipt[axis];})),/独立只读状态/);
    assert.throws(()=>validateResearchRegistration(changed(value=>{value.adapter_receipt[axis].state='pass';})),/独立只读状态/);
  }
  for (const mutation of [
    value=>{value.adapter_receipt.registered_at='invalid';},
    value=>{value.adapter_receipt.source_verification.verified_source_count=7;},
    value=>{value.adapter_receipt.source_verification.all_source_hashes_match=false;},
    value=>{value.adapter_receipt.source_verification.source_hashes_unchanged=false;},
    value=>{value.adapter_receipt.source_verification.index_hash_unchanged=false;},
    value=>{value.adapter_receipt.source_verification.scope='all_weights_and_inference_verified';},
    value=>{value.index.errors.push('source verification failed');},
    value=>{value.index.metadata_index_valid=false;},
  ]) assert.throws(()=>validateResearchRegistration(changed(mutation)));
});

test('R09 已登记efa历史快照继续合法，可与最新登记并存且不补写源声明', () => {
  const historical = JSON.parse(readFileSync(new URL('../public/data/research_snapshots/efa0962c4a6ea46d47d9339330e350120f7d923d80008aeb214da5b95f144fd2.json',import.meta.url),'utf8'));
  const before=JSON.stringify(historical);
  assert.strictEqual(validateResearchRegistration(historical),historical);
  assert.equal(historical.source_index.sha256,'efa0962c4a6ea46d47d9339330e350120f7d923d80008aeb214da5b95f144fd2');
  assert.notEqual(snapshot.registration_id,historical.registration_id);
  assert.equal(validateResearchRegistrations([historical,snapshot]).length,2);
  assert.deepEqual(historical.index.sources,snapshot.index.sources);
  assert.deepEqual(historical.index.development_metric_records,snapshot.index.development_metric_records);
  assert.equal(JSON.stringify(historical),before);
  assert.deepEqual(readOnlyResearchActionGates(historical),readOnlyResearchActionGates(snapshot));
});
