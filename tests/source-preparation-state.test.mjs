import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { SOURCE_PREPARATION_CATALOG } from '../src/source-preparation-catalog.js';
import {
  validateSourcePreparationRegistrations, sourcePreparationArchiveBytes,
  sourcePreparationManifestBytes, verifySourcePreparationRegistrations,
} from '../src/source-preparation-state.js';
import { inspectZipMembers, parseSupplementCsv } from '../src/supplement-state.js';
import { parseStrictPreparationJson } from '../src/preparation-state.js';
import { validateOverlaySource } from '../src/source-overlay.js';
import { validateWeatherSource } from '../src/source-weather.js';
import { validateRoadSource } from '../src/source-roads.js';

// Only the three compact registrations are read. No referenced annual ZIP/PBF,
// native upstream geometry, labels, weights, producer or research code is run.
const registrations = JSON.parse(readFileSync(new URL('../public/data/source-preparation-state.json', import.meta.url), 'utf8'));
const groups = ['micro-source-overlay', 'weather-cross-format', 'road-source-connectivity'];
const copy = value => structuredClone(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = group => registrations.find(value => value.group_id === group);
const decodedCopy = view => copy({ sources: view.sources, files: view.files });
let verified;
const allViews = () => verified ??= verifySourcePreparationRegistrations(registrations);
const overlayPrefix = '共享接口/微观试验准备/研究范围来源叠合_20261006/';
const weatherPrefix = '共享接口/微观试验准备/天气跨格式试核_20261006/';
const roadPrefix = '共享接口/服务链准备/源线连通诊断_20261006/';

function cell(view, path, field, value, row = 0) {
  const table = view.files[path], index = table.fields.indexOf(field);
  assert.ok(index >= 0, '反例字段必须来自真实表');
  table.rows[row][index] = value;
}

function directory(bytes) {
  const buffer = Buffer.from(bytes);
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  }
  assert.ok(end >= 0);
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

test('SP01 三组真实fixture核验31原件SHA/CRC/清单和语义，返回按group_id及完整原字节', async () => {
  const before = JSON.stringify(registrations);
  assert.deepEqual(registrations.map(value => value.group_id), groups);
  assert.equal(SOURCE_PREPARATION_CATALOG.length, 3);
  assert.strictEqual(validateSourcePreparationRegistrations(registrations), registrations);
  const views = await allViews();
  assert.deepEqual(Object.keys(views), groups);
  let sources = 0;
  for (const registration of registrations) {
    const view = views[registration.group_id];
    assert.deepEqual(view.registration, registration);
    assert.notStrictEqual(view.registration, registration, '验证返回独立登记快照');
    assert.deepEqual(view.sources, registration.source_group.files);
    const archive = sourcePreparationArchiveBytes(registration), manifestBytes = sourcePreparationManifestBytes(registration);
    assert.equal(archive.length, registration.archive.bytes); assert.equal(sha(archive), registration.archive.sha256);
    assert.equal(manifestBytes.length, registration.manifest_source.bytes); assert.equal(sha(manifestBytes), registration.manifest_source.sha256);
    const expected = new Map([['source-manifest.json', registration.manifest_source.bytes], ...view.sources.map(source => [source.path, source.bytes])]);
    const entries = inspectZipMembers(archive, expected);
    assert.equal(entries.length, view.sources.length + 1);
    assert.ok(entries.every(entry => !entry.directory));
    const zip = await JSZip.loadAsync(archive, { checkCRC32: true });
    assert.deepEqual(await zip.file('source-manifest.json').async('uint8array'), manifestBytes);
    for (const source of view.sources) {
      assert.equal(view.raw[source.path].length, source.bytes); assert.equal(sha(view.raw[source.path]), source.sha256);
      if (['png', 'svg', 'gpkg'].includes(source.file_kind)) assert.equal(Object.hasOwn(view.files, source.path), false);
      else assert.equal(Object.hasOwn(view.files, source.path), true);
      if (source.file_kind === 'csv') {
        const table = view.files[source.path];
        assert.deepEqual(table.fields, source.columns); assert.equal(table.rows.length, source.row_count);
        assert.equal(table.fields.length, source.column_count);
        assert.ok(table.rows.every(row => row.every(value => typeof value === 'string')));
        const indices = source.primary_key_columns.map(key => table.fields.indexOf(key));
        assert.equal(new Set(table.rows.map(row => JSON.stringify(indices.map(index => row[index])))).size, table.rows.length);
      } else if (['md', 'py'].includes(source.file_kind)) {
        assert.equal(view.files[source.path], new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(view.raw[source.path]));
      }
    }
    assert.equal(Object.keys(view.raw).length, view.sources.length);
    assert.ok(Object.values(registration.adapter_receipt.application_gates).every(value => value === false));
    sources += view.sources.length;
  }
  assert.equal(sources, 31);
  assert.equal(Object.keys(views['micro-source-overlay'].files).length, 12);
  assert.equal(views['micro-source-overlay'].summary.displayCollections.cells.features.length, 16);
  assert.equal(views['weather-cross-format'].summary.hourly_rows.length, 24);
  assert.equal(views['road-source-connectivity'].summary.counts.nodes, 81);
  assert.equal(views['road-source-connectivity'].summary.counts.segments, 87);
  assert.equal(JSON.stringify(registrations), before);
  assert.ok(registrations.every(value => !Object.hasOwn(value, 'raw') && !Object.hasOwn(value, 'files')));
});

test('SP02 旧缺字段默认空列表合法；任一无重复子集独立核验，不要求假造31件完整性', async () => {
  assert.deepEqual(validateSourcePreparationRegistrations(), []);
  assert.deepEqual(await verifySourcePreparationRegistrations(), {});
  assert.deepEqual(await verifySourcePreparationRegistrations([]), {});
  for (const list of [[original('weather-cross-format')], [original('weather-cross-format'), original('road-source-connectivity')]]) {
    const views = await verifySourcePreparationRegistrations(list);
    assert.deepEqual(Object.keys(views), list.map(value => value.group_id));
    assert.equal(Object.values(views).reduce((total, view) => total + view.sources.length, 0), list.length === 1 ? 6 : 15);
  }
  assert.throws(() => validateSourcePreparationRegistrations(null), /登记结构/);
  assert.throws(() => validateSourcePreparationRegistrations({ registrations }), /登记结构/);
});

test('SP03 闭集拒绝重复组、unknown schema/keys、替换身份与缺base64，不自动升级登记', () => {
  assert.throws(() => validateSourcePreparationRegistrations([...registrations, registrations[0]]), /三组/);
  assert.throws(() => validateSourcePreparationRegistrations([registrations[0], registrations[0]]), /重复/);
  for (const mutate of [
    value => { value.group_id = 'unregistered-source'; },
    value => { value.schema_version = '0.2.auto-adopted'; },
    value => { value.registration_id = 'replacement'; },
    value => { value.current_index = {}; },
    value => { value.source_group.title = '已认证物理输入'; },
    value => { delete value.archive_base64; },
    value => { delete value.manifest_base64; },
  ]) {
    const value = copy(registrations[0]); mutate(value);
    assert.throws(() => validateSourcePreparationRegistrations([value]), /来源准备资料核对/);
  }
});

test('SP04 全部catalog元数据闭合，SHA/bytes/字段/PK/CRS单位/四轴及九门控改写均拒绝', () => {
  for (const mutate of [
    value => { value.source_group.files[0].sha256 = '0'.repeat(64); },
    value => { value.source_group.files[0].bytes++; },
    value => { value.source_group.files[0].path = 'weights.pt'; },
    value => { value.source_group.files[0].file_kind = 'json'; },
    value => { value.source_group.files[2].columns.reverse(); },
    value => { value.source_group.files[2].row_count--; },
    value => { value.source_group.files[2].primary_key_columns = ['source_key']; },
    value => { value.source_group.files[5].coordinate_crs = 'EPSG:32648'; },
    value => { value.source_group.files[5].area_unit = 'degrees_squared'; },
    value => { value.source_group.files.pop(); },
    value => { value.source_group.scientific_adoption = 'adopted'; },
    value => { value.source_group.software_intake = 'scientifically_validated'; },
    value => { value.source_group.area_D_physical_access_fairness_ranking_outputs_available = true; },
    value => { value.adapter_receipt.science_validation = 'validated'; },
    value => { value.adapter_receipt.execution = 'physical_simulation_completed'; },
    value => { value.adapter_receipt.application_gates.new_site_prediction = true; },
    value => { value.adapter_receipt.application_gates.physical_simulation = 'false'; },
    value => { value.adapter_receipt.application_gates.routing_or_OD = null; },
    value => { value.adapter_receipt.application_gates.extra_gate = false; },
  ]) {
    const value = copy(registrations[0]); mutate(value);
    assert.throws(() => validateSourcePreparationRegistrations([value]), /原版本/);
  }
});

test('SP05 原ZIP及独立原manifest字节改写被SHA拒绝，更新声明SHA也不能伪造catalog', async () => {
  for (const field of ['archive_base64', 'manifest_base64']) {
    const value = copy(original('weather-cross-format')), bytes = Buffer.from(value[field], 'base64');
    bytes[Math.floor(bytes.length / 2)] ^= 1; value[field] = bytes.toString('base64');
    assert.doesNotThrow(() => validateSourcePreparationRegistrations([value]));
    await assert.rejects(verifySourcePreparationRegistrations([value]), /真实SHA256/);
    value[field === 'archive_base64' ? 'archive' : 'manifest_source'].sha256 = sha(bytes);
    assert.throws(() => validateSourcePreparationRegistrations([value]), /原版本/);
  }
  for (const field of ['archive_base64', 'manifest_base64']) {
    const value = copy(original('weather-cross-format')); value[field] = '!' + value[field].slice(1);
    assert.throws(() => validateSourcePreparationRegistrations([value]), /编码/);
  }
});

test('SP06 即使重打有效CRC的ZIP并更新源件/manifest/archive哈希，登记仍拒绝重签元数据', async () => {
  const value = copy(original('weather-cross-format')), zip = await JSZip.loadAsync(sourcePreparationArchiveBytes(value), { checkCRC32: true });
  const path = weatherPrefix + '07月19日跨格式逐小时对照.csv';
  const changed = Buffer.from((await zip.file(path).async('string')).replace('candidate_not_adopted', 'forcing_adopted'));
  const manifest = JSON.parse(Buffer.from(sourcePreparationManifestBytes(value)).toString('utf8'));
  const group = manifest.groups.find(item => item.group_id === value.group_id), source = group.files.find(item => item.path === path);
  source.bytes = changed.length; source.sha256 = sha(changed);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  zip.file(path, changed); zip.file('source-manifest.json', manifestBytes);
  const archiveBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  value.source_group = copy(group);
  value.archive = { bytes: archiveBytes.length, sha256: sha(archiveBytes) }; value.archive_base64 = Buffer.from(archiveBytes).toString('base64');
  value.manifest_source.bytes = manifestBytes.length; value.manifest_source.sha256 = sha(manifestBytes); value.manifest_base64 = manifestBytes.toString('base64');
  await assert.rejects(verifySourcePreparationRegistrations([value]), /原版本/);
});

test('SP07 真实ZIP的CRC破坏会被重用CRC阶段拒绝，中央目录重复先于同名覆盖被拒绝', async () => {
  const registration = original('weather-cross-format'), archive = directory(sourcePreparationArchiveBytes(registration));
  archive.buffer.writeUInt32LE((archive.buffer.readUInt32LE(archive.entries[0].offset + 16) ^ 1) >>> 0, archive.entries[0].offset + 16);
  // Catalog SHA cannot be re-signed; exercise the exact CRC stage separately.
  await assert.rejects(JSZip.loadAsync(archive.buffer, { checkCRC32: true }), /CRC32/);
  const records = archive.entries.map(entry => entry.bytes); records[1] = Buffer.from(records[0]);
  const replacement = Buffer.concat(records), tail = Buffer.from(archive.buffer.subarray(archive.end));
  tail.writeUInt32LE(replacement.length, 12);
  const duplicate = Buffer.concat([archive.buffer.subarray(0, archive.start), replacement, tail]);
  assert.throws(() => inspectZipMembers(duplicate), /重复/);
});

test('SP08 ZIP精确本组文件+source-manifest，漏成员、额外成员、成员大小变化拒绝', () => {
  const registration = original('road-source-connectivity'), bytes = sourcePreparationArchiveBytes(registration);
  const expected = new Map([['source-manifest.json', registration.manifest_source.bytes], ...registration.source_group.files.map(source => [source.path, source.bytes])]);
  assert.equal(inspectZipMembers(bytes, expected).length, 10);
  const extra = new Map(expected); extra.delete(registration.source_group.files[0].path);
  assert.throws(() => inspectZipMembers(bytes, extra), /未知成员/);
  const missing = new Map(expected); missing.set('不存在的研究结果.csv', 1);
  assert.throws(() => inspectZipMembers(bytes, missing), /缺少成员/);
  const size = new Map(expected); size.set('source-manifest.json', registration.manifest_source.bytes + 1);
  assert.throws(() => inspectZipMembers(bytes, size), /原字节长度/);
});

test('SP09 严格JSON重复键与非有限数值拒绝，CSV重复field/坏引号/行宽拒绝，原空串/负号保留', () => {
  for (const text of ['{"unit":"m","unit":"km"}', '{"g":false,"\\u0067":true}', '{"x":1e309}', '{"x":NaN}', '{"x":{"a":null,"a":0}}']) assert.throws(() => parseStrictPreparationJson(text));
  assert.deepEqual(parseStrictPreparationJson('{"False":"原字符串","value":null,"flag":false}'), { False: '原字符串', value: null, flag: false });
  for (const text of ['id,id\n1,2\n', 'id,,unit\n1,2,3\n', 'id,x\n1\n', 'x\n"bad', 'x\n"closed"tail\n']) assert.throws(() => parseSupplementCsv(text));
  assert.deepEqual(parseSupplementCsv('\uFEFFid,value,flag\r\na,-0.01,False\r\nb,,\r\n'), { fields: ['id', 'value', 'flag'], rows: [['a', '-0.01', 'False'], ['b', '', '']] });
});

test('SP10 叠合视图拒绝漏行/重复复合键/外键替换及False/null误写，不把空接受值填零', async () => {
  const view = (await allViews())['micro-source-overlay'];
  const path = overlayPrefix + '分区与源对象正面积关系.csv', cells = overlayPrefix + '分区闭合与来源.csv';
  for (const mutate of [
    value => { value.files[path].rows.pop(); },
    value => { value.files[path].rows[1] = [...value.files[path].rows[0]]; },
    value => cell(value, path, 'cell_id', 'S999'),
    value => cell(value, path, 'source_key', 'unlisted/source/999'),
    value => cell(value, cells, 'research_action_adopted', 'False'),
    value => cell(value, cells, 'accepted_ground_or_road_surface', '0'),
    value => cell(value, overlayPrefix + '源对象几何审阅.csv', 'source_valid', false),
    value => { value.files[overlayPrefix + '来源叠合分区_WGS84.geojson'].features[0].properties.research_action_adopted = false; },
  ]) {
    const changed = decodedCopy(view); mutate(changed);
    assert.throws(() => validateOverlaySource(changed), /语义核查/);
  }
  assert.equal(validateOverlaySource(view).summary.counts.cell_source_relations, 41);
});

test('SP11 叠合GeoJSON拒绝CRS/几何类型/投影测量单位及道路空宽度升级', async () => {
  const view = (await allViews())['micro-source-overlay'];
  const area = overlayPrefix + '来源叠合分区_WGS84.geojson', roads = overlayPrefix + '道路分区线支持_WGS84.geojson';
  for (const mutate of [
    value => { value.files[area].coordinate_crs = 'EPSG:32648'; },
    value => { value.files[area].analysis_crs = 'EPSG:4326'; },
    value => { value.files[area].area_and_length_units = 'degrees_squared'; },
    value => { value.files[area].features[0].geometry.type = 'Point'; },
    value => { value.files[roads].features[0].properties.road_width_accepted_m = 0; },
    value => { value.files[roads].adoption_state = 'adopted'; },
  ]) {
    const changed = decodedCopy(view); mutate(changed);
    assert.throws(() => validateOverlaySource(changed), /语义核查/);
  }
});

test('SP12 天气完整24×35拒绝行键/四文本行号、空时间补值、单位和时长forcing升级', async () => {
  const view = (await allViews())['weather-cross-format'], csv = weatherPrefix + '07月19日跨格式逐小时对照.csv';
  const producer = weatherPrefix + '跨格式来源与实际核查.json', audit = weatherPrefix + '独立天气跨格式核查.json';
  for (const mutate of [
    value => { value.files[csv].rows.pop(); },
    value => { value.files[csv].rows[1] = [...value.files[csv].rows[0]]; },
    value => cell(value, csv, 'clm_text_line_1based', '4990'),
    value => cell(value, csv, 'normalized_real_timestamp', null),
    value => cell(value, csv, 'normalized_real_timestamp', '2020-07-19T00:30:00+08:00'),
    value => cell(value, csv, 'epw_accumulation_duration_hr', '1'),
    value => { value.files[producer].unit_scope.epw_direct_diffuse = 'W/m2'; },
    value => { value.files[producer].time_scope.accepted_accumulation_interval_hours = 1; },
    value => { value.files[producer].gates.weather_adopted_as_driver = true; },
    value => { value.files[producer].gates.physical_run_ready = 'false'; },
    value => { value.files[audit].precipitation.zero_certified_no_rain = true; },
    value => { value.files[audit].time_and_evidence_boundaries.CLM_header_year_literal = '2021'; },
    value => { const source = value.files[audit].protected_files.find(item => item.path.endsWith('/README.md')); source.sha256_before = source.sha256_after = '42134d453f8abf69614de87c38711857d0dd28662c355b0aaa97980c7fc0e7f5'; },
  ]) {
    const changed = decodedCopy(view); mutate(changed);
    assert.throws(() => validateWeatherSource(changed), /语义核查/);
  }
  const summary = validateWeatherSource(view);
  assert.ok(summary.hourly_rows.every(row => row.raw.normalized_real_timestamp === '' && row.typed.normalized_real_timestamp === null));
  assert.equal(summary.counts.positive_depth_with_zero_duration_rows, 16);
  assert.equal(summary.counts.annual_RAIN_zero_rows, 6645);
  assert.equal(summary.documentation_version_changes.length, 1);
});

test('SP13 道路完整表拒绝漏行/重复PK/节点外键、False/null和直线距离替代通行结果', async () => {
  const view = (await allViews())['road-source-connectivity'], nodes = roadPrefix + '原节点.csv', segments = roadPrefix + '原相邻段.csv';
  const receptors = roadPrefix + '受体与道路线平面关系.csv';
  for (const mutate of [
    value => { value.files[nodes].rows.pop(); },
    value => { value.files[nodes].rows[1] = [...value.files[nodes].rows[0]]; },
    value => cell(value, segments, 'from_node_key', 'unknown_node'),
    value => cell(value, nodes, 'public_walk_node_verified', false),
    value => cell(value, nodes, 'public_walk_node_verified', null),
    value => cell(value, receptors, 'route_distance_m', '3.98'),
    value => cell(value, receptors, 'graph_attachment_accepted', 'True'),
    value => cell(value, receptors, 'legal_access', 'False'),
    value => cell(value, receptors, 'measurement_crs', 'EPSG:4326'),
  ]) {
    const changed = decodedCopy(view); mutate(changed);
    assert.throws(() => validateRoadSource(changed), /道路来源核对/);
  }
  assert.ok(Object.values(validateRoadSource(view).operation_gates).every(value => value === false));
});

test('SP14 异步验证读取独立登记快照，调用中外部改写不污染已验证来源与门控', async () => {
  const list = [copy(original('weather-cross-format'))], before = copy(list[0]);
  const pending = verifySourcePreparationRegistrations(list);
  list[0].source_group.scientific_adoption = 'adopted';
  list[0].adapter_receipt.application_gates.physical_simulation = true;
  list[0].manifest_base64 = '';
  const views = await pending;
  assert.deepEqual(views['weather-cross-format'].registration, before);
  assert.equal(views['weather-cross-format'].summary.scientific_adoption, 'not_adopted');
  assert.ok(Object.values(views['weather-cross-format'].registration.adapter_receipt.application_gates).every(value => value === false));
  assert.throws(() => validateSourcePreparationRegistrations(list), /原版本/);
});
