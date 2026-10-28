// P3 第 1 步：契约校验
// 职责：只判断"这个请求能不能往下走"。不合法就直接返回 400，绝不进入规则层。
// 输出：{ ok:true, req } 或 { ok:false, code, body:{...契约规定的错误响应...} }
//
// 一个动作要么在这里判死，要么明确回 501 —— 不允许"看不懂也往下走"，
// 否则 payload 缺字段时会拿 undefined 去跑一遍模型，返回一个看似成功的错结果。
const ALLOWED = ['health', 'classify', 'extract_batch', 'query_items', 'review'];
// 已经接通的动作；其余动作已在契约里声明，但工作流侧尚未实现（P7 补齐）
const IMPLEMENTED = ['health', 'classify'];
const MAX_TEXT = 2000;

const first = $input.first().json || {};
const req = (first.body && typeof first.body === 'object') ? first.body : {};
const errs = [];
const bad = (path, message) => errs.push({ code: 'E_CONTRACT_INVALID', message, path, retryable: false });

if (req.contract_version !== '1.0.0') bad('$.contract_version', '必须传 contract_version 且值为 1.0.0');
if (!req.request_id || String(req.request_id).length < 8) bad('$.request_id', 'request_id 必填且长度 >= 8');
if (!ALLOWED.includes(req.action)) bad('$.action', 'action 必须是 ' + ALLOWED.join(' / '));
const payload = req.payload;
if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  bad('$.payload', 'payload 必须是对象');
}

// 按动作校验必填字段：只校验动作真的用到的字段，避免"字段写错了却照样跑"
if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
  if (req.action === 'classify') {
    if (typeof payload.text !== 'string' || !payload.text.trim()) bad('$.payload.text', 'classify 需要 payload.text，非空字符串');
    else if (payload.text.length > MAX_TEXT) bad('$.payload.text', `payload.text 超过 ${MAX_TEXT} 字，请先切分`);
  }
  if (req.action === 'extract_batch') {
    const texts = payload.texts;
    if (!Array.isArray(texts) || texts.length === 0) bad('$.payload.texts', 'extract_batch 需要 payload.texts，非空数组');
    else if (texts.length > 20) bad('$.payload.texts', 'payload.texts 单次最多 20 条');
    else if (texts.some((t) => typeof t !== 'string' || !t.trim())) bad('$.payload.texts', 'payload.texts 每一项都必须是非空字符串');
  }
  if (req.action === 'review') {
    if (!payload.item_id || typeof payload.item_id !== 'string') bad('$.payload.item_id', 'review 需要 payload.item_id');
    if (!payload.decision) bad('$.payload.decision', 'review 需要 payload.decision');
  }
  if (req.action === 'query_items' && payload.limit != null) {
    const limit = Number(payload.limit);
    if (!Number.isFinite(limit) || limit < 1 || limit > 100) bad('$.payload.limit', 'payload.limit 必须是 1 到 100 的整数');
  }
  // scope 是可选的：不传就不过滤地点；传了就必须是一个城市名
  if (payload.scope != null) {
    const scope = payload.scope;
    if (typeof scope !== 'object' || Array.isArray(scope)) bad('$.payload.scope', 'payload.scope 必须是对象');
    else {
      if (typeof scope.city !== 'string' || !scope.city.trim()) bad('$.payload.scope.city', 'payload.scope.city 必须是非空字符串');
      if (scope.aliases != null && (!Array.isArray(scope.aliases) || scope.aliases.length > 20 || scope.aliases.some((a) => typeof a !== 'string'))) {
        bad('$.payload.scope.aliases', 'payload.scope.aliases 必须是最多 20 个字符串的数组');
      }
    }
  }
}

const meta = {
  rules_version: 'r1',
  classifier_version: 'c1-rule',
  taxonomy_version: 't1',
  model: 'none',
  latency_ms: 0,
  cached: false,
  processed_at: new Date().toISOString()
};

const envelope = (status, body, errors) => ({
  contract_version: '1.0.0',
  request_id: req.request_id || 'req-unknown',
  status: 'error',
  result: {},
  meta,
  errors
});

if (errs.length) {
  return [{ json: { ok: false, code: 400, body: envelope('error', {}, errs) } }];
}

if (!IMPLEMENTED.includes(req.action)) {
  return [{ json: {
    ok: false,
    code: 501,
    body: envelope('error', {}, [{
      code: 'E_NOT_IMPLEMENTED',
      message: req.action === 'extract_batch'
        ? 'extract_batch 尚未在工作流内实现：请逐条调用 classify（批量跑批用 scripts/run-pipeline.mjs），或在 P7 收口时补上。'
        : `${req.action} 尚未接入：条目查询读 data/heat_perception.json，人工复核待 P7 接 review 接口。`,
      path: '$.action',
      retryable: false,
      detail: { action: req.action, implemented: IMPLEMENTED }
    }])
  } }];
}

return [{ json: { ok: true, req } }];
