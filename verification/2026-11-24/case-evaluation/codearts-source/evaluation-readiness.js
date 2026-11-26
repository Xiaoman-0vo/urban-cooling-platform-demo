const DISPLAY_RESOLUTION_C = 0.001;
const TEMPERATURE_NUMERIC_KEYS = ['observed_lst_c', 'baseline_lst_c', 'scenario_lst_c'];
const FEATURE_VECTOR_KEYS = ['baseline_center', 'neighbor_mean'];

const LIMITATIONS = Object.freeze([
  '100米网格覆盖比例输入不编码布局位置，只表示登记网格的覆盖比例。',
  '缺少模型温差的不确定性区间，0.001℃显示精度不能当作置信区间或实际有效阈值。',
  '未验证现场干预效果，结果仅为历史覆盖情景的模型估算。',
  'LST不是气温，也不是人体热舒适，只表示地表温度。'
]);

const NEXT_STEPS = Object.freeze([
  '复核范围与覆盖假设，确认100米网格登记范围、候选边界、面积和覆盖比例对应实际场地。',
  '补充现场植栽条件与权属条件，确认养护约束和方案可实施性。',
  '设计独立干预验证，通过对照和重复观测确认实际降温效果。',
  '补充气温与人体热舒适评价（如空气温度、湿度、风速和热舒适指标），不要用 LST 替代。'
]);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
const isFiniteVector = value => Array.isArray(value) && value.length > 0 && value.every(isFiniteNumber);
const vectorEquals = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

function toMillicelsius(value) {
  const rounded = Math.round(value * 1000);
  return rounded === 0 ? 0 : rounded;
}

function readableDelta(value) {
  const text = value.toFixed(3);
  return text === '-0.000' ? '0.000' : text;
}

function candidateName(row, index) {
  const label = row?.label;
  return typeof label === 'string' && label.trim() ? label.trim() : `候选 ${index + 1}`;
}

function describeDeltas(items) {
  return items
    .map(item => `${candidateName(item.row, item.index)} ${readableDelta(item.temperature.predicted_delta_lst_c)}℃`)
    .join('；');
}

function usableRow(row) {
  if (!isRecord(row) || row.valid === false) return null;
  const temperature = row.temperature;
  if (!isRecord(temperature) || !isFiniteNumber(temperature.predicted_delta_lst_c)) return null;

  const presentNumbers = TEMPERATURE_NUMERIC_KEYS.filter(key => temperature[key] !== undefined);
  if (presentNumbers.length > 0 && presentNumbers.length < TEMPERATURE_NUMERIC_KEYS.length) return null;
  if (!presentNumbers.every(key => isFiniteNumber(temperature[key]))) return null;

  const features = temperature.compiled_features;
  if (!isRecord(features) || !isFiniteVector(features.scenario_center)) return null;

  const scenario = features.scenario_center;
  const hasStructuredFeatures = ['order', ...FEATURE_VECTOR_KEYS].some(key => features[key] !== undefined);
  if (hasStructuredFeatures) {
    const order = features.order;
    if (!Array.isArray(order) || order.length === 0 || !order.every(key => typeof key === 'string')) return null;
    if (order.length !== scenario.length) return null;
    for (const key of FEATURE_VECTOR_KEYS) {
      const vector = features[key];
      if (!isFiniteVector(vector) || vector.length !== order.length) return null;
    }
  }

  return {temperature, features};
}

function basisSignature(temperature, features) {
  return JSON.stringify([
    temperature.model_sha256 ?? null,
    temperature.model_version ?? null,
    temperature.dataset_sha256 ?? null,
    temperature.grid_id ?? null,
    temperature.scene_id ?? null,
    temperature.date ?? null,
    temperature.observed_utc ?? null,
    temperature.reference_grid_count ?? null,
    temperature.area_sha256 ?? null,
    isFiniteNumber(temperature.baseline_lst_c) ? temperature.baseline_lst_c : null,
    features.order ?? null,
    features.baseline_center ?? null,
    features.neighbor_mean ?? null
  ]);
}

function resultBase(status, title, detail, completed, total, millis) {
  return {
    status,
    title,
    detail,
    model_delta_distinguishable: null,
    response: 'not_comparable',
    supports_thermal_ranking: false,
    implementation_recommended: false,
    limitations: [...LIMITATIONS],
    next_steps: [...NEXT_STEPS],
    completed,
    total,
    delta_millicelsius: [...millis],
    display_resolution_c: DISPLAY_RESOLUTION_C
  };
}

export function evaluationReadiness(decision) {
  const rows = Array.isArray(decision?.rows) ? decision.rows : [];
  const total = rows.length;

  if (total === 0) {
    return resultBase(
      'missing',
      '候选结果缺项，暂不能比较',
      '没有可用于比较的候选行。缺失结果保持缺项，不用零值补齐，也不补造观测或倒填模型结果；请先完成评价并确认每个候选都有有限温差和完整模型输入。',
      0,
      0,
      []
    );
  }

  const items = [];
  rows.forEach((row, index) => {
    const parsed = usableRow(row);
    if (parsed) {
      items.push({
        row,
        index,
        temperature: parsed.temperature,
        features: parsed.features
      });
    }
  });

  const completed = items.length;
  const millis = items.map(item => toMillicelsius(item.temperature.predicted_delta_lst_c));
  const reportedCompleted = decision?.completed;
  const completionMatches = Number.isInteger(reportedCompleted) && reportedCompleted === total;
  const stale = decision?.status === 'stale' || decision?.fresh === false || rows.some(row => row?.fresh === false);
  const running = decision?.status === 'running' || decision?.evaluation_status === 'running';
  const partialState = decision?.status === 'partial' || decision?.status === 'unevaluated' || decision?.status === 'pending';

  if (stale) {
    return resultBase(
      'stale',
      '条件已变化，不能沿用旧比较',
      '候选或评价已过期，历史结果只供回看。请按当前预算、空间范围和覆盖假设重新生成并评价；过期的完成结果也不能标为可比较。',
      completed,
      total,
      millis
    );
  }

  if (completed === 0 && !running && !partialState) {
    return resultBase(
      'missing',
      '候选结果缺项，暂不能比较',
      `共有 ${total} 行候选，但没有一行同时具备有限温差和完整模型输入。缺失、NaN、Infinity 或无 compiled_features 的结果保持缺项；不会补零、补造观测或倒填模型结果。`,
      0,
      total,
      []
    );
  }

  if (completed < total || !completionMatches || running || partialState) {
    const reportedText = Number.isInteger(reportedCompleted) ? `${reportedCompleted}/${total}` : `未知/${total}`;
    const reason = completed < total
      ? '存在未完成、缺项或无效结果'
      : !completionMatches
        ? `完成计数与候选行数不一致（${reportedText}）`
        : '评价仍在进行或仍被标记为部分完成';
    return resultBase(
      'pending',
      '评价尚未完整完成，暂不能比较',
      `已完成 ${completed}/${total} 个候选的完整结果；${reason}，因此不能视为完整可比。缺失或无效项保持缺项，不用零值或推测值补齐；请重试或在同一口径下重新评价。`,
      completed,
      total,
      millis
    );
  }

  const signatures = new Set(items.map(item => basisSignature(item.temperature, item.features)));
  if (signatures.size > 1 || decision?.comparable === false || decision?.status === 'incomparable') {
    return resultBase(
      'incomparable',
      '评价基准不一致，不能直接比较',
      '候选结果的模型、日期、网格、基线或输入结构不一致。即使输入标记为可比，也不能把不同基准的结果直接选优；请在同一模型和数据口径下重新评价。',
      completed,
      total,
      millis
    );
  }

  if (completed === 1) {
    return {
      ...resultBase(
        'limited_comparison',
        '只有一个完整结果，不能形成候选比较',
        `当前只有 1 个完整结果（${describeDeltas(items)}），没有第二个完整可比结果，无法判断模型温差可区分性。该结果只能说明单一候选的模型输出，不能形成候选间排序，也不能支持实际施工建议。`,
        1,
        total,
        millis
      ),
      response: 'single_candidate'
    };
  }

  const firstScenario = items[0].features.scenario_center;
  const sameFeatures = items.every(item => vectorEquals(item.features.scenario_center, firstScenario));
  const sameDelta = millis.every(value => value === millis[0]);
  const distinguishable = new Set(millis).size > 1;

  let response;
  let title;
  let detail;

  if (sameFeatures) {
    response = 'same_features';
    title = '模型输入相同，候选差异不能当作效果差异';
    detail = `完整结果共 ${completed} 个，模型输入 scenario_center 相同（${describeDeltas(items)}）。输入相同意味着不能把面积、费用或位置差异解释为降温响应差异；${distinguishable ? '即使温差显示值不同，也不能归因于输入变化。' : '模型温差按整数毫摄氏度比较也相同。'}当前结果不支持实际降温排序或施工建议。`;
  } else if (sameDelta) {
    response = 'different_features_same_delta';
    title = '模型输入不同，但显示温差不可区分';
    detail = `完整结果共 ${completed} 个，模型输入 scenario_center 不同，但温差按整数毫摄氏度比较相同（${describeDeltas(items)}）。在当前 0.001℃显示精度下模型响应不可区分，不能据此判断面积增大或位置调整更有效；该精度只是显示精度，不是不确定性区间或实际有效阈值。`;
  } else {
    response = 'different_features_different_delta';
    title = '模型温差显示上可区分，但仍不支持实际排序';
    detail = `完整结果共 ${completed} 个，模型输入 scenario_center 不同，温差按整数毫摄氏度比较可区分（${describeDeltas(items)}）。这只说明本轮模型输出在当前显示精度下可区分；现有合同没有差值不确定性或独立干预验证，不能升级为实际降温排序或施工建议。`;
  }

  return {
    ...resultBase('limited_comparison', title, detail, completed, total, millis),
    model_delta_distinguishable: distinguishable,
    response
  };
}