import test from 'node:test';
import assert from 'node:assert/strict';
import realCase from '../reference/real-case-decision.json' with { type: 'json' };
import { evaluationReadiness } from '../src/evaluation-readiness.js';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function assertDisplayable(result) {
  assert.equal(typeof result.title, 'string');
  assert.equal(typeof result.detail, 'string');
  assert.ok(result.title.length > 0);
  assert.ok(result.detail.length > 0);
  assert.match(result.title, /[\u4e00-\u9fff]/);
  assert.match(result.detail, /[\u4e00-\u9fff]/);
  assert.equal(result.supports_thermal_ranking, false);
  assert.equal(result.implementation_recommended, false);
  assert.ok(Array.isArray(result.limitations));
  assert.ok(Array.isArray(result.next_steps));
}

function assertNotComparable(result, expectedStatus) {
  assert.equal(result.status, expectedStatus);
  assert.equal(result.response, 'not_comparable');
  assert.equal(result.model_delta_distinguishable, null);
  assertDisplayable(result);
}

test('真实冻结案例：输入不同但显示温差相同，只作有限比较', () => {
  const result = evaluationReadiness(structuredClone(realCase));

  assert.equal(result.status, 'limited_comparison');
  assert.equal(result.response, 'different_features_same_delta');
  assert.equal(result.model_delta_distinguishable, false);
  assert.deepEqual(result.delta_millicelsius, [-58, -58]);
  assert.equal(result.display_resolution_c, 0.001);
  assert.match(result.detail, /-0\.058℃/);
  assertDisplayable(result);
});

test('同面积不同位置但模型输入相同：响应归为同特征', () => {
  const decision = structuredClone(realCase);
  decision.rows[1].area_m2 = 102;
  decision.rows[1].bounds_utm = [412544, 3389123, 412550, 3389140];
  decision.rows[1].temperature.bounds_utm = [...decision.rows[1].bounds_utm];
  decision.rows[1].temperature.area_m2 = 102;
  decision.rows[1].temperature.compiled_features.scenario_center =
    [...decision.rows[0].temperature.compiled_features.scenario_center];
  decision.rows[1].temperature.predicted_delta_lst_c =
    decision.rows[0].temperature.predicted_delta_lst_c;

  const result = evaluationReadiness(decision);

  assert.equal(result.status, 'limited_comparison');
  assert.equal(result.response, 'same_features');
  assert.equal(result.model_delta_distinguishable, false);
  assertDisplayable(result);
});

test('单一候选只能作单候选说明，不能判断可区分性', () => {
  const decision = structuredClone(realCase);
  decision.rows = decision.rows.slice(0, 1);
  decision.completed = 1;
  decision.total = 1;
  decision.tradeoff = null;

  const result = evaluationReadiness(decision);

  assert.equal(result.status, 'limited_comparison');
  assert.equal(result.response, 'single_candidate');
  assert.equal(result.model_delta_distinguishable, null);
  assert.equal(result.completed, 1);
  assert.equal(result.total, 1);
  assertDisplayable(result);
});

test('缺项输入保持 missing，不补零也不补造结果', () => {
  for (const input of [null, undefined, {}, { rows: [] }]) {
    assertNotComparable(evaluationReadiness(input), 'missing');
  }

  const withoutFeatures = structuredClone(realCase);
  for (const row of withoutFeatures.rows) delete row.temperature.compiled_features;
  withoutFeatures.completed = 2;

  assertNotComparable(evaluationReadiness(withoutFeatures), 'missing');
});

test('部分完成、完成计数或输入向量不一致时保持 pending', () => {
  const partial = structuredClone(realCase);
  partial.rows[1].temperature.predicted_delta_lst_c = NaN;
  partial.completed = 1;

  const partialResult = evaluationReadiness(partial);
  assertNotComparable(partialResult, 'pending');
  assert.match(partialResult.detail, /已完成 1\/2/);

  const countMismatch = structuredClone(realCase);
  countMismatch.completed = 1;

  const countResult = evaluationReadiness(countMismatch);
  assertNotComparable(countResult, 'pending');
  assert.match(countResult.detail, /完成计数/);

  const truncated = structuredClone(realCase);
  truncated.rows[1].temperature.compiled_features.scenario_center =
    truncated.rows[1].temperature.compiled_features.scenario_center.slice(0, 3);
  truncated.completed = 2;

  assertNotComparable(evaluationReadiness(truncated), 'pending');
});

test('过期候选或过期评价保持 stale', () => {
  const stale = structuredClone(realCase);
  stale.status = 'stale';
  stale.comparable = true;
  for (const row of stale.rows) row.fresh = false;

  assertNotComparable(evaluationReadiness(stale), 'stale');

  const rowStale = structuredClone(realCase);
  rowStale.rows[1].fresh = false;

  assertNotComparable(evaluationReadiness(rowStale), 'stale');
});

test('模型、基线或可比标记不一致时保持 incomparable', () => {
  const modelChanged = structuredClone(realCase);
  modelChanged.comparable = true;
  modelChanged.rows[1].temperature.model_sha256 = 'b'.repeat(64);

  assertNotComparable(evaluationReadiness(modelChanged), 'incomparable');

  const baselineChanged = structuredClone(realCase);
  baselineChanged.comparable = true;
  baselineChanged.rows[1].temperature.baseline_lst_c = 32.98;
  baselineChanged.rows[1].temperature.scenario_lst_c += 0.01;

  assertNotComparable(evaluationReadiness(baselineChanged), 'incomparable');

  const flaggedIncomparable = structuredClone(realCase);
  flaggedIncomparable.comparable = false;

  assertNotComparable(evaluationReadiness(flaggedIncomparable), 'incomparable');
});

test('NaN、Infinity 和伪造实施标志不能提升状态', () => {
  const infinities = structuredClone(realCase);
  infinities.implementation_recommended = true;
  infinities.supports_thermal_ranking = true;
  infinities.verified = true;
  infinities.rows[0].implementation_recommended = true;
  infinities.rows[0].temperature.observed_lst_c = Infinity;
  infinities.completed = 2;

  const infiniteResult = evaluationReadiness(infinities);
  assertNotComparable(infiniteResult, 'pending');
  assert.equal(infiniteResult.supports_thermal_ranking, false);
  assert.equal(infiniteResult.implementation_recommended, false);

  const nans = structuredClone(realCase);
  nans.implementation_recommended = true;
  nans.rows.forEach(row => {
    row.temperature.predicted_delta_lst_c = NaN;
  });
  nans.completed = 2;

  const nanResult = evaluationReadiness(nans);
  assertNotComparable(nanResult, 'missing');
  assert.equal(nanResult.supports_thermal_ranking, false);
  assert.equal(nanResult.implementation_recommended, false);
});

test('[fixture] 人为正负零温差只用于软件夹具，按整数毫摄氏度视为相同', () => {
  const decision = structuredClone(realCase);
  for (const row of decision.rows) {
    row.temperature.baseline_lst_c = 33;
    row.temperature.scenario_lst_c = 33;
  }
  decision.rows[0].temperature.predicted_delta_lst_c = 0;
  decision.rows[1].temperature.predicted_delta_lst_c = -0;
  decision.rows[1].temperature.compiled_features.scenario_center =
    [...decision.rows[0].temperature.compiled_features.scenario_center];
  decision.completed = 2;
  decision.total = 2;

  const result = evaluationReadiness(decision);

  assert.equal(result.status, 'limited_comparison');
  assert.equal(result.response, 'same_features');
  assert.equal(result.model_delta_distinguishable, false);
  assert.deepEqual(result.delta_millicelsius, [0, 0]);
  assertDisplayable(result);
});

test('[fixture] 显示精度边界：整数毫摄氏度不同才可区分', () => {
  const distinct = structuredClone(realCase);
  distinct.rows[1].temperature.predicted_delta_lst_c = -0.057;
  distinct.rows[1].temperature.scenario_lst_c = 32.97 - (-0.057);

  const distinctResult = evaluationReadiness(distinct);
  assert.equal(distinctResult.status, 'limited_comparison');
  assert.equal(distinctResult.response, 'different_features_different_delta');
  assert.equal(distinctResult.model_delta_distinguishable, true);
  assert.deepEqual(distinctResult.delta_millicelsius, [-58, -57]);
  assertDisplayable(distinctResult);

  const rounded = structuredClone(realCase);
  rounded.rows[1].temperature.predicted_delta_lst_c = -0.0576;
  rounded.rows[1].temperature.scenario_lst_c = 32.97 - (-0.0576);

  const roundedResult = evaluationReadiness(rounded);
  assert.equal(roundedResult.status, 'limited_comparison');
  assert.equal(roundedResult.response, 'different_features_same_delta');
  assert.equal(roundedResult.model_delta_distinguishable, false);
  assert.deepEqual(roundedResult.delta_millicelsius, [-58, -58]);
  assertDisplayable(roundedResult);
});

test('输入不被修改，包括深冻结输入', () => {
  const decision = deepFreeze(structuredClone(realCase));
  const before = JSON.stringify(decision);

  const result = evaluationReadiness(decision);

  assert.equal(JSON.stringify(decision), before);
  assert.equal(result.status, 'limited_comparison');
  assertDisplayable(result);
});

test('host review: absent comparison approval or complete baseline metadata stays uncomparable', () => {
  const missingFlag = structuredClone(realCase);
  delete missingFlag.comparable;
  assertNotComparable(evaluationReadiness(missingFlag), 'incomparable');

  const missingFields = structuredClone(realCase);
  for (const row of missingFields.rows) {
    for (const key of ['observed_lst_c', 'baseline_lst_c', 'scenario_lst_c']) delete row.temperature[key];
    row.temperature.compiled_features = { scenario_center: row.temperature.compiled_features.scenario_center };
  }
  assertNotComparable(evaluationReadiness(missingFields), 'missing');
});

test('host review: source identity, complete feature schema and safe numeric output are mandatory', () => {
  for (const mutate of [
    t => delete t.model_sha256,
    t => delete t.compiled_features.order,
    t => delete t.compiled_features.baseline_center,
    t => { t.predicted_delta_lst_c = 1e308; },
    t => { t.predicted_delta_lst_c = 1; }
  ]) {
    const invalid = structuredClone(realCase);
    for (const row of invalid.rows) mutate(row.temperature);
    assertNotComparable(evaluationReadiness(invalid), 'missing');
  }
});

test('[fixture] 相同基准与 scenario_center 但整数毫摄氏度不同：复核运行记录，保留原值，不能排名', () => {
  const decision = structuredClone(realCase);
  decision.rows[1].temperature.compiled_features.scenario_center =
    [...decision.rows[0].temperature.compiled_features.scenario_center];
  decision.rows[1].temperature.predicted_delta_lst_c = -0.020;
  decision.rows[1].temperature.scenario_lst_c = 32.97 - (-0.020);
  decision.completed = 2;
  decision.total = 2;

  const result = evaluationReadiness(decision);

  assertNotComparable(result, 'incomparable');
  assert.deepEqual(result.delta_millicelsius, [-58, -20]);
  assert.match(result.title, /同输入输出不一致/);
  assert.match(result.detail, /同输入输出不一致/);
  assert.match(result.detail, /复核运行记录/);
  assert.match(result.detail, /保留两个原值/);
  assert.match(result.detail, /不能据此排名/);
  assert.match(result.detail, /-0\.058℃/);
  assert.match(result.detail, /-0\.020℃/);
  assert.equal(result.completed, 2);
  assert.equal(result.total, 2);
});

test('[fixture] 冲突报告再次判定时仍保留同输入冲突原因，不提前判基准不一致', () => {
  const decision = structuredClone(realCase);
  decision.rows[1].temperature.compiled_features.scenario_center =
    [...decision.rows[0].temperature.compiled_features.scenario_center];
  decision.rows[1].temperature.predicted_delta_lst_c = -0.020;
  decision.rows[1].temperature.scenario_lst_c = 32.97 - (-0.020);

  const first = evaluationReadiness(decision);
  assert.equal(first.status, 'incomparable');
  assert.match(first.detail, /同输入输出不一致/);

  decision.status = 'incomparable';
  decision.comparable = false;
  decision.title = '评价基准不一致，不能直接比较';
  decision.detail = '候选结果的模型、日期、网格、基线或输入结构不一致。';

  const second = evaluationReadiness(decision);

  assertNotComparable(second, 'incomparable');
  assert.match(second.title, /同输入输出不一致/);
  assert.match(second.detail, /同输入输出不一致/);
  assert.match(second.detail, /复核运行记录/);
  assert.match(second.detail, /保留两个原值/);
  assert.ok(!second.detail.includes('评价基准不一致'));
  assert.deepEqual(second.delta_millicelsius, [-58, -20]);
  assert.equal(second.completed, 2);
  assert.equal(second.total, 2);
  assertDisplayable(second);
});

test('[fixture] 三候选中任意相同输入组冲突：全部原值保留并判不可比', () => {
  const decision = structuredClone(realCase);
  const third = structuredClone(decision.rows[0]);
  third.id = 'fixture-third-candidate';
  third.label = '候选 3';
  third.temperature.compiled_features.scenario_center =
    [...decision.rows[0].temperature.compiled_features.scenario_center];
  third.temperature.predicted_delta_lst_c = -0.020;
  third.temperature.scenario_lst_c = 32.97 - (-0.020);
  decision.rows.push(third);
  decision.completed = 3;
  decision.total = 3;
  decision.comparable = true;

  const result = evaluationReadiness(decision);

  assertNotComparable(result, 'incomparable');
  assert.deepEqual(result.delta_millicelsius, [-58, -58, -20]);
  assert.match(result.title, /同输入输出不一致/);
  assert.match(result.detail, /同输入输出不一致/);
  assert.match(result.detail, /复核运行记录/);
  assert.match(result.detail, /保留全部原值/);
  assert.match(result.detail, /不能据此排名/);
  assert.match(result.detail, /-0\.058℃/);
  assert.match(result.detail, /-0\.020℃/);
  assert.equal(result.completed, 3);
  assert.equal(result.total, 3);
  assertDisplayable(result);
});

test('[fixture] 正反对照：同输入同输出仍正常；不同输入不同输出仍为有限比较', () => {
  const sameInput = structuredClone(realCase);
  sameInput.rows[1].temperature.compiled_features.scenario_center =
    [...sameInput.rows[0].temperature.compiled_features.scenario_center];
  sameInput.rows[1].temperature.predicted_delta_lst_c =
    sameInput.rows[0].temperature.predicted_delta_lst_c;

  const sameResult = evaluationReadiness(sameInput);
  assert.equal(sameResult.status, 'limited_comparison');
  assert.equal(sameResult.response, 'same_features');
  assert.equal(sameResult.model_delta_distinguishable, false);
  assertDisplayable(sameResult);

  const differentInput = structuredClone(realCase);
  differentInput.rows[1].temperature.predicted_delta_lst_c = -0.057;
  differentInput.rows[1].temperature.scenario_lst_c = 32.97 - (-0.057);

  const differentResult = evaluationReadiness(differentInput);
  assert.equal(differentResult.status, 'limited_comparison');
  assert.equal(differentResult.response, 'different_features_different_delta');
  assert.equal(differentResult.model_delta_distinguishable, true);
  assertDisplayable(differentResult);
});

test('说明覆盖四项适用性边界与可操作后续', () => {
  const result = evaluationReadiness(structuredClone(realCase));
  const limitations = result.limitations.join('\n');
  const nextSteps = result.next_steps.join('\n');

  for (const keyword of ['100米网格', '布局位置', '不确定性区间', '现场干预', 'LST', '气温', '人体热舒适']) {
    assert.ok(limitations.includes(keyword), `缺少限制说明：${keyword}`);
  }
  for (const keyword of ['覆盖假设', '植栽', '权属', '独立干预', '人体热舒适']) {
    assert.ok(nextSteps.includes(keyword), `缺少后续步骤：${keyword}`);
  }

  assert.match(result.detail, /0\.001℃/);
  assert.match(result.detail, /不确定性/);
  assertDisplayable(result);
});