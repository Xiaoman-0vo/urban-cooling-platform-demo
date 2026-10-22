import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import {
  SUPPLEMENT_CATALOG, READ_ONLY_SUPPLEMENT_GATES, validateSupplementRegistrations,
  verifySupplementRegistration, verifySupplementRegistrations,
  supplementArchiveBytes, inspectZipMembers, parseSupplementCsv,
} from '../src/supplement-state.js';
import { parseStrictPreparationJson } from '../src/preparation-state.js';
import { validatePlanningSourceDescription, validatePlanningDevelopment } from '../src/supplement-planning.js';

// Software fixtures contain only the five already registered compact packages.
// Tests never load labels/weights, traverse upstream references or run research.
const registrations = JSON.parse(readFileSync(new URL('../public/data/supplement-state.json', import.meta.url), 'utf8'));
const copy = value => structuredClone(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const groups = ['planning-description', 'planning-development', 'candidate-resource', 'modifiable-evidence', 'focal-neighbor'];
const original = group => registrations.find(value => value.group_id === group);
let verified;
const allViews = () => verified ??= verifySupplementRegistrations(registrations);
const isolatedViews = new Map();
const viewOf = group => {
  if (!isolatedViews.has(group)) isolatedViews.set(group, verifySupplementRegistration(original(group)));
  return isolatedViews.get(group);
};
const decodedCopy = view => copy({ sources: view.sources, files: view.files });
const descriptionCsv = '共享接口/规划描述底稿/现状指标描述统计.csv';
const configCsv = '共享接口/规划开发增补/配置开发误差_紧凑.csv';
const pairCsv = '共享接口/规划开发增补/配对增量_紧凑.csv';
const bindingJson = '共享接口/规划开发增补/开发增补来源绑定.json';

function mutateCell(view, path, field, predicate, value) {
  const table = view.files[path];
  const position = table.fields.indexOf(field);
  assert.ok(position >= 0, '反例字段必须真实存在');
  const row = table.rows.find(cells => predicate(Object.fromEntries(table.fields.map((name, index) => [name, cells[index]]))));
  assert.ok(row, '反例必须命中真实来源行');
  row[position] = value;
}

function directory(bytes) {
  const buffer = Buffer.from(bytes);
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  }
  assert.ok(end >= 0, '真实ZIP必须有EOCD');
  const start = buffer.readUInt32LE(end + 16), entries = [];
  let offset = start;
  while (offset < end) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const nameSize = buffer.readUInt16LE(offset + 28);
    const size = 46 + nameSize + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    entries.push({ offset, bytes: Buffer.from(buffer.subarray(offset, offset + size)), name: buffer.subarray(offset + 46, offset + 46 + nameSize).toString('utf8') });
    offset += size;
  }
  assert.equal(offset, end);
  return { buffer, start, end, entries };
}

test('S01 五组真实原包完成SHA/CRC/显式源件与语义核验，32来源和原字节不变', async () => {
  const before = JSON.stringify(registrations);
  assert.deepEqual(registrations.map(value => value.group_id), groups);
  assert.equal(SUPPLEMENT_CATALOG.length, 5);
  assert.strictEqual(validateSupplementRegistrations(registrations), registrations);
  const views = await allViews();
  assert.equal(Object.keys(views).length, 5);
  let sources = 0;
  for (const registration of registrations) {
    const bytes = supplementArchiveBytes(registration);
    assert.equal(bytes.length, registration.archive.bytes);
    assert.equal(sha(bytes), registration.archive.sha256);
    const expected = new Map(registration.sources.map(source => [source.path, source.bytes]));
    const entries = inspectZipMembers(bytes, expected);
    assert.equal(entries.filter(entry => !entry.directory).length, registration.sources.length);
    const view = views[registration.registration_id];
    assert.equal(view.group_id, registration.group_id);
    assert.equal(view.registration_id, registration.registration_id);
    assert.deepEqual(view.sources, registration.sources);
    assert.ok(view.summary && typeof view.summary === 'object');
    assert.equal(Object.keys(view.raw).length, registration.sources.length);
    for (const source of registration.sources) {
      assert.equal(view.raw[source.path].length, source.bytes);
      assert.equal(sha(view.raw[source.path]), source.sha256);
      if (source.mime_type.startsWith('image/')) assert.equal(Object.hasOwn(view.files, source.path), false, 'PNG/SVG保留原字节，不冒充解码JSON/CSV');
      else assert.equal(Object.hasOwn(view.files, source.path), true);
    }
    assert.deepEqual(registration.adapter_receipt.operation_gates, READ_ONLY_SUPPLEMENT_GATES);
    sources += registration.sources.length;
  }
  assert.equal(sources, 32);
  assert.equal((await viewOf('planning-description')).files[descriptionCsv].rows.length, 18);
  assert.equal((await viewOf('planning-development')).files[configCsv].rows.length, 80);
  assert.equal((await viewOf('planning-development')).files[pairCsv].rows.length, 70);
  assert.equal(JSON.stringify(registrations), before);
  assert.equal(registrations.some(value => Object.hasOwn(value, 'files') || Object.hasOwn(value, 'raw')), false);
});

test('S02 closed登记拒绝重复组、未知组/schema/字段和被替换登记身份，旧空列表仍可用', async () => {
  assert.deepEqual(validateSupplementRegistrations([]), []);
  assert.deepEqual(await verifySupplementRegistrations([]), {});
  assert.throws(() => validateSupplementRegistrations({ registrations }), /登记/);
  assert.throws(() => validateSupplementRegistrations([registrations[0], registrations[0]]), /重复/);
  assert.throws(() => validateSupplementRegistrations([...registrations, registrations[0]]), /五组/);
  for (const mutate of [
    value => { value.group_id = 'unregistered-result'; },
    value => { value.schema_version = '0.2.auto-upgrade'; },
    value => { value.registration_id = 'replacement'; },
    value => { value.title = '已认证降温'; },
    value => { value.current_index = {}; },
    value => { delete value.sources; },
  ]) {
    const value = copy(registrations[0]); mutate(value);
    assert.throws(() => validateSupplementRegistrations([value]), /成果资料核对/);
  }
});

test('S03 来源路径/字节/SHA/MIME和新增单位元数据不能改写冻结catalog', () => {
  for (const mutate of [
    value => { value.sources[0].sha256 = '0'.repeat(64); },
    value => { value.sources[0].bytes++; },
    value => { value.sources[0].path = 'weights.pt'; },
    value => { value.sources[0].mime_type = 'application/octet-stream'; },
    value => { value.sources[0].unit = 'site_temperature_degC'; },
    value => { value.sources[0].source_epoch_verified = true; },
    value => { value.sources.push(copy(value.sources[0])); },
    value => { value.sources.pop(); },
  ]) {
    const value = copy(registrations[0]); mutate(value);
    assert.throws(() => validateSupplementRegistrations([value]), /原版本/);
  }
});

test('S04 软件回执保持六false，不能因资料核验开放预测/物理/排名或写成科学验证', () => {
  assert.equal(Object.keys(READ_ONLY_SUPPLEMENT_GATES).length, 6);
  assert.ok(Object.values(READ_ONLY_SUPPLEMENT_GATES).every(value => value === false));
  for (const mutate of [
    value => { value.adapter_receipt.science_validation = 'scientifically_validated'; },
    value => { value.adapter_receipt.execution = 'model_reexecuted'; },
    value => { value.adapter_receipt.operation_gates.prediction = true; },
    value => { value.adapter_receipt.operation_gates.physical_simulation = 'false'; },
    value => { value.adapter_receipt.operation_gates.ranking = true; },
    value => { value.adapter_receipt.operation_gates.new_application = false; },
  ]) {
    const value = copy(registrations[0]); mutate(value);
    assert.throws(() => validateSupplementRegistrations([value]), /原版本/);
  }
});

test('S05 同长度合法base64改写真实ZIP仍被异步SHA拒绝，重签metadata亦被closed拒绝', async () => {
  const value = copy(original('planning-development'));
  const bytes = Buffer.from(supplementArchiveBytes(value));
  bytes[Math.floor(bytes.length / 2)] ^= 1;
  value.archive_base64 = bytes.toString('base64');
  assert.doesNotThrow(() => validateSupplementRegistrations([value]));
  await assert.rejects(verifySupplementRegistration(value), /压缩包SHA256/);
  value.archive.sha256 = sha(bytes);
  assert.throws(() => validateSupplementRegistrations([value]), /原版本/);
  const malformed = copy(original('planning-development'));
  malformed.archive_base64 = '!' + malformed.archive_base64.slice(1);
  assert.throws(() => validateSupplementRegistrations([malformed]), /编码/);
});

test('S06 实际原ZIP的CRC拒绝链有效；CRC字段损坏不会被JSZip正常解压掩盖', async () => {
  const archive = directory(supplementArchiveBytes(original('planning-development')));
  const firstFile = archive.entries.find(entry => !entry.name.endsWith('/'));
  assert.ok(firstFile);
  archive.buffer.writeUInt32LE((archive.buffer.readUInt32LE(firstFile.offset + 16) ^ 0x00000001) >>> 0, firstFile.offset + 16);
  // Frozen registration hashes deliberately cannot be re-signed. Check the exact
  // JSZip CRC stage used by the verifier separately, without mutating the catalog.
  await assert.rejects(JSZip.loadAsync(archive.buffer, { checkCRC32: true }), /CRC32/);
});

test('S07 原ZIP中央目录重复成员在JSZip覆盖同名项之前被拒绝，未知/缺失成员同样拒绝', () => {
  const registration = original('planning-development');
  const archive = directory(supplementArchiveBytes(registration));
  const filePositions = archive.entries.map((entry, index) => !entry.name.endsWith('/') ? index : -1).filter(index => index >= 0);
  assert.ok(filePositions.length >= 2);
  const records = archive.entries.map(entry => entry.bytes);
  records[filePositions[1]] = Buffer.from(records[filePositions[0]]);
  const replacement = Buffer.concat(records), tail = Buffer.from(archive.buffer.subarray(archive.end));
  tail.writeUInt32LE(replacement.length, 12);
  const duplicate = Buffer.concat([archive.buffer.subarray(0, archive.start), replacement, tail]);
  assert.throws(() => inspectZipMembers(duplicate), /重复/);
  const expected = new Map(registration.sources.map(source => [source.path, source.bytes]));
  expected.delete(registration.sources[0].path);
  assert.throws(() => inspectZipMembers(archive.buffer, expected), /未知成员/);
  const missing = new Map(registration.sources.map(source => [source.path, source.bytes]));
  missing.set('共享接口/并不存在的成果.json', 1);
  assert.throws(() => inspectZipMembers(archive.buffer, missing), /缺少成员/);
});

test('S08 严格JSON拒绝重复键/转义同名键/溢出，正常null和文字不误判', () => {
  for (const text of ['{"unit":"share","unit":"temperature"}', '{"unit":1,"\\u0075nit":2}', '{"value":1e309}', '{"value":NaN}', '{"nested":{"x":1,"x":2}}']) assert.throws(() => parseStrictPreparationJson(text));
  assert.deepEqual(parseStrictPreparationJson('{"word":"NaN is a word","value":null,"finite":-0.02}'), { word: 'NaN is a word', value: null, finite: -0.02 });
});

test('S09 CSV拒绝重复field/破损引号/行宽，原负号/空串/BOM/引号换行保留', () => {
  for (const text of ['unit,unit\na,b\n', 'x,,y\n1,2,3\n', 'x,y\n1\n', 'x\n"unclosed', 'x\n"closed"tail\n']) assert.throws(() => parseSupplementCsv(text));
  assert.deepEqual(parseSupplementCsv('\uFEFFid,value,note\r\na,-0.25,"comma, quote"" and\nline"\r\nb,,""\r\n'), {
    fields: ['id', 'value', 'note'], rows: [['a', '-0.25', 'comma, quote" and\nline'], ['b', '', '']],
  });
});

test('S10 描述decodedview拒绝单位改写、NA补零、B02套R01结构状态、准入子集和复合身份重复', async () => {
  const view = await viewOf('planning-description'), before = JSON.stringify(view.files);
  for (const mutate of [
    value => mutateCell(value, descriptionCsv, 'unit_raw', row => row.field === 'G02', '百分比'),
    value => mutateCell(value, descriptionCsv, 'observed_zero_n', row => row.field === 'C03', '578'),
    value => mutateCell(value, descriptionCsv, 'structural_inapplicable_null_n', row => row.field === 'B02', '103'),
    value => mutateCell(value, descriptionCsv, 'filtered_on_proxy_input_accepted', () => true, 'True'),
    value => { value.files[descriptionCsv].rows[1] = [...value.files[descriptionCsv].rows[0]]; },
    value => { value.files[descriptionCsv].fields[1] = value.files[descriptionCsv].fields[0]; },
  ]) {
    const value = decodedCopy(view); mutate(value);
    assert.throws(() => validatePlanningSourceDescription(value), /规划资料语义核查/);
  }
  assert.equal(validatePlanningSourceDescription(view).counts.rows, 18);
  assert.equal(JSON.stringify(view.files), before);
});

test('S11 开发decodedview拒绝误差当温度、负号裁切、归一化空项补零、SD/宽度/配对链改写', async () => {
  const view = await viewOf('planning-development'), before = JSON.stringify(view.files);
  for (const mutate of [
    value => { value.files[bindingJson].comparison_contract.error_unit = 'site_temperature_degC'; },
    value => { value.files[bindingJson].scientific_gates.physical_cooling_validated = true; },
    value => mutateCell(value, pairCsv, 'delta_MAE_C_mean', row => row.contrast === 'DROP_C', '0'),
    value => mutateCell(value, pairCsv, 'relative_delta_MAE_mean', row => row.stage === 'cr', '0'),
    value => mutateCell(value, pairCsv, 'delta_MAE_C_sample_SD', () => true, '-1'),
    value => mutateCell(value, configCsv, 'width', () => true, '100'),
    value => mutateCell(value, pairCsv, 'baseline_configuration', row => row.contrast === 'CR_joint', 'C0_R1'),
    value => mutateCell(value, pairCsv, 'source_sha256', () => true, '0'.repeat(64)),
  ]) {
    const value = decodedCopy(view); mutate(value);
    assert.throws(() => validatePlanningDevelopment(value), /规划资料语义核查/);
  }
  const summary = validatePlanningDevelopment(view);
  assert.equal(summary.counts.configuration_rows, 80); assert.equal(summary.counts.paired_rows, 70);
  assert.equal(summary.counts.negative_C_conditions, 12);
  assert.ok(Object.values(summary.scientific_gates).every(value => value === false));
  assert.equal(JSON.stringify(view.files), before);
});
