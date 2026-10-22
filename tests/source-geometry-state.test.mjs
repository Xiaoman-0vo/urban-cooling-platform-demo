import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { GEOMETRY_SOURCE_CATALOG, GEOMETRY_SOURCE_ALIASES } from '../src/source-geometry-catalog.js';
import { validateGeometrySourceRegistrations, verifyGeometrySourceRegistrations, geometrySourceArchiveBytes, geometrySourceManifestBytes } from '../src/source-geometry-state.js';
import { validateBuildingGeometry } from '../src/source-geometry-building.js';
import { validateWindowGeometry } from '../src/source-geometry-window.js';
import { validateSourceMarks } from '../src/source-geometry-marks.js';
import { inspectZipMembers, parseSupplementCsv } from '../src/supplement-state.js';
import { parseStrictPreparationJson } from '../src/preparation-state.js';

// Fixture-only software tests: no external PBF/ancestor GPKG, producer, ray model,
// research labels/weights or browser is opened or executed.
const registrations = JSON.parse(readFileSync(new URL('../public/data/source-geometry-state.json', import.meta.url), 'utf8'));
const groupIds = ['building_geometry_svf', 'window_source_connectivity', 'OSM_source_marks'];
const copy = value => structuredClone(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = group => registrations.find(registration => registration.group_id === group);
const B = '共享接口/微观试验准备/建筑几何天空可视核查_20261006/';
const W = '共享接口/服务链准备/窗口与源连通范围诊断_20261006/';
const M = '共享接口/服务链准备/入口与开放空间来源标记_20261006/';
let verified;
const allViews = () => verified ??= verifyGeometrySourceRegistrations(registrations);
const decodedCopy = view => copy({ registration: view.registration, sources: view.sources, files: view.files, tables: view.tables, aliases: view.aliases });
function cell(view, path, field, value, index = 0) {
  const table = view.files[path], column = table.fields.indexOf(field);
  assert.ok(column >= 0, '反例字段来自真实表'); table.rows[index][column] = value;
}
function directory(bytes) {
  const buffer = Buffer.from(bytes); let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  assert.ok(end >= 0);
  const start = buffer.readUInt32LE(end + 16), entries = []; let offset = start;
  while (offset < end) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const nameSize = buffer.readUInt16LE(offset + 28), size = 46 + nameSize + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    entries.push({ offset, bytes: Buffer.from(buffer.subarray(offset, offset + size)) }); offset += size;
  }
  assert.equal(offset, end); return { buffer, start, end, entries };
}

test('GS01 真实三组核验72原件及原清单SHA/CRC，16主表32834原字符串行，历史与二进制保留', async () => {
  const before = JSON.stringify(registrations), views = await allViews();
  assert.deepEqual(Object.keys(views), groupIds); assert.equal(GEOMETRY_SOURCE_CATALOG.length, 3);
  assert.strictEqual(validateGeometrySourceRegistrations(registrations), registrations);
  let files = 0, bytes = 0, tables = 0, rows = 0;
  for (const registration of registrations) {
    const view = views[registration.group_id]; assert.deepEqual(view.registration, registration); assert.notStrictEqual(view.registration, registration);
    assert.deepEqual(view.sources, registration.source_group.source_files); assert.deepEqual(view.aliases, GEOMETRY_SOURCE_ALIASES);
    assert.deepEqual(Object.keys(view).sort(), ['registration', 'sources', 'files', 'raw', 'tables', 'aliases', 'summary', 'displayCollections', 'selectionLookup'].sort());
    const archive = geometrySourceArchiveBytes(registration), manifest = geometrySourceManifestBytes(registration);
    assert.equal(sha(archive), registration.archive.sha256); assert.equal(sha(manifest), registration.manifest_source.sha256);
    const expected = new Map([['source-manifest.json', manifest.length], ...view.sources.map(source => [source.path, source.bytes])]);
    const members = inspectZipMembers(archive, expected); assert.equal(members.length, expected.size); assert.ok(members.every(member => !member.directory));
    for (const source of view.sources) {
      assert.equal(view.raw[source.path].length, source.bytes); assert.equal(sha(view.raw[source.path]), source.sha256);
      if (['png', 'svg', 'gpkg', 'pbf'].includes(source.format)) assert.equal(Object.hasOwn(view.files, source.path), false);
      else assert.equal(Object.hasOwn(view.files, source.path), true);
      if (['md', 'py', 'txt'].includes(source.format)) assert.equal(view.files[source.path], new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(view.raw[source.path]));
      files++; bytes += source.bytes;
    }
    for (const metadata of registration.source_group.primary_tables) {
      const table = view.tables[metadata.path]; assert.strictEqual(table, view.files[metadata.path]);
      assert.deepEqual(table.fields, metadata.columns); assert.equal(table.rows.length, metadata.rows); assert.ok(table.rows.every(row => row.every(value => typeof value === 'string')));
      const indices = metadata.primary_key_columns.map(key => table.fields.indexOf(key));
      assert.equal(new Set(table.rows.map(row => JSON.stringify(indices.map(i => row[i])))).size, metadata.rows);
      tables++; rows += table.rows.length;
    }
    assert.equal(Object.hasOwn(view.summary, 'displayCollections'), false); assert.equal(Object.hasOwn(view.summary, 'selectionLookup'), false);
    assert.ok(Object.values(registration.adapter_receipt.application_gates).every(value => value === false));
  }
  assert.deepEqual([files, bytes, tables, rows], [72, 21403434, 16, 32834]);
  assert.equal(views.building_geometry_svf.displayCollections.buildings.features.length, 53);
  assert.equal(Object.keys(views.building_geometry_svf.selectionLookup.parts).length, 54);
  assert.equal(views.OSM_source_marks.sources.filter(source => source.role === 'retained_unaccepted_schema_history').length, 4);
  for (const source of views.OSM_source_marks.sources.filter(source => source.role === 'retained_unaccepted_schema_history')) assert.equal(Object.hasOwn(views.OSM_source_marks.tables, source.path), false);
  assert.equal(JSON.stringify(registrations), before);
});

test('GS02 旧缺字段为空合法、1/2组不自动补齐，异步验证返回提交前原快照', async () => {
  assert.deepEqual(validateGeometrySourceRegistrations(), []); assert.deepEqual(await verifyGeometrySourceRegistrations(), {});
  const input = [copy(original('OSM_source_marks'))], expected = copy(input[0]), pending = verifyGeometrySourceRegistrations(input);
  input[0].adapter_receipt.application_gates.routing_or_OD = true; input[0].archive_base64 = '';
  const view = await pending; assert.deepEqual(view.OSM_source_marks.registration, expected); assert.deepEqual(Object.keys(view), ['OSM_source_marks']);
  const subset = await verifyGeometrySourceRegistrations([original('window_source_connectivity'), original('OSM_source_marks')]);
  assert.deepEqual(Object.keys(subset), ['window_source_connectivity', 'OSM_source_marks']); assert.equal(Object.values(subset).reduce((n, v) => n + v.sources.length, 0), 43);
  assert.throws(() => validateGeometrySourceRegistrations(null));
});

test('GS03 闭集拒绝未知schema/key、重复组、metadata重签、失败改通过及九false/null升级', () => {
  assert.throws(() => validateGeometrySourceRegistrations([registrations[0], registrations[0]]), /重复/);
  for (const mutate of [
    r => { r.group_id = 'unknown'; }, r => { r.schema_version = '0.2.physical'; }, r => { r.extra = false; }, r => { delete r.manifest_base64; },
    r => { r.source_group.source_files[0].sha256 = '0'.repeat(64); }, r => { r.source_group.source_files[0].bytes++; },
    r => { r.source_group.primary_tables[0].columns.reverse(); }, r => { r.source_group.primary_tables[0].primary_key_columns = ['merged_id']; },
    r => { r.source_group.source_claims.physical_scene_adopted = false; }, r => { r.source_group.source_claims.analytical_passed = 15; },
    r => { r.source_group.scientific_adoption_opened = true; }, r => { r.adapter_receipt.science_validation = 'physical_accuracy_validated'; },
    r => { r.adapter_receipt.application_gates.physical_simulation = true; }, r => { r.adapter_receipt.application_gates.ranking = 'false'; },
    r => { r.adapter_receipt.application_gates.fairness = null; }, r => { r.adapter_receipt.application_gates.extra_gate = false; },
    r => { r.adapter_receipt.readonly_contract_review.sha256 = '1'.repeat(64); },
    r => { r.adapter_receipt.receiver_key_aliases[0].SVF_receptor_key = 'H1'; },
  ]) { const r = copy(registrations[0]); mutate(r); assert.throws(() => validateGeometrySourceRegistrations([r]), /来源几何资料核对/); }
});

test('GS04 多MB严格base64无正则溢出，字节改写SHA拒绝，更新声明SHA不能冒充catalog', async () => {
  assert.ok(original('building_geometry_svf').archive_base64.length > 4_000_000);
  assert.doesNotThrow(() => geometrySourceArchiveBytes(original('building_geometry_svf')));
  for (const field of ['archive_base64', 'manifest_base64']) {
    const r = copy(original('OSM_source_marks')), bytes = Buffer.from(r[field], 'base64'); bytes[Math.floor(bytes.length / 2)] ^= 1; r[field] = bytes.toString('base64');
    assert.doesNotThrow(() => validateGeometrySourceRegistrations([r])); await assert.rejects(verifyGeometrySourceRegistrations([r]), /真实SHA256/);
    r[field === 'archive_base64' ? 'archive' : 'manifest_source'].sha256 = sha(bytes);
    assert.throws(() => validateGeometrySourceRegistrations([r]), /原版本/);
  }
  for (const mutate of [r => { r.archive_base64 = '!' + r.archive_base64.slice(1); }, r => { r.archive_base64 = '=' + r.archive_base64.slice(1); }, r => { r.manifest_base64 = r.manifest_base64.slice(0, -1); }]) {
    const r = copy(original('OSM_source_marks')); mutate(r); assert.throws(() => validateGeometrySourceRegistrations([r]), /编码|填充/);
  }
});

test('GS05 重打有效CRC原ZIP并重签源/manifest/archive也不能变更未采用材料', async () => {
  const r = copy(original('OSM_source_marks')), zip = await JSZip.loadAsync(geometrySourceArchiveBytes(r), { checkCRC32: true });
  const path = M + '入口与开放空间来源标记.csv', old = await zip.file(path).async('string'), changed = Buffer.from(old.replace('EPSG:32648', 'EPSG:4326'));
  assert.notEqual(changed.toString('utf8'), old, '反例确实改变原文件');
  const manifest = JSON.parse(Buffer.from(geometrySourceManifestBytes(r)).toString('utf8')), group = manifest.groups.find(g => g.group_id === r.group_id), source = group.source_files.find(s => s.path === path);
  source.bytes = changed.length; source.sha256 = sha(changed); const manifestBytes = Buffer.from(JSON.stringify(manifest));
  zip.file(path, changed); zip.file('source-manifest.json', manifestBytes); const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  r.source_group = group; r.archive = { bytes: archive.length, sha256: sha(archive) }; r.archive_base64 = Buffer.from(archive).toString('base64');
  r.manifest_source.bytes = manifestBytes.length; r.manifest_source.sha256 = sha(manifestBytes); r.manifest_base64 = manifestBytes.toString('base64');
  await assert.rejects(verifyGeometrySourceRegistrations([r]), /原版本/);
});

test('GS06 实际CRC阶段拒绝破坏，中央目录重复及本组成员/size失配拒绝', async () => {
  const r = original('OSM_source_marks'), d = directory(geometrySourceArchiveBytes(r));
  d.buffer.writeUInt32LE((d.buffer.readUInt32LE(d.entries[0].offset + 16) ^ 1) >>> 0, d.entries[0].offset + 16);
  await assert.rejects(JSZip.loadAsync(d.buffer, { checkCRC32: true }), /CRC32/);
  const records = d.entries.map(e => e.bytes); records[1] = Buffer.from(records[0]); const replacement = Buffer.concat(records), tail = Buffer.from(d.buffer.subarray(d.end)); tail.writeUInt32LE(replacement.length, 12);
  assert.throws(() => inspectZipMembers(Buffer.concat([d.buffer.subarray(0, d.start), replacement, tail])), /重复/);
  const expected = new Map([['source-manifest.json', r.manifest_source.bytes], ...r.source_group.source_files.map(s => [s.path, s.bytes])]);
  const bytes = geometrySourceArchiveBytes(r); expected.delete(r.source_group.source_files[0].path); assert.throws(() => inspectZipMembers(bytes, expected), /未知成员/);
  expected.set(r.source_group.source_files[0].path, r.source_group.source_files[0].bytes); expected.set('source-manifest.json', r.manifest_source.bytes + 1); assert.throws(() => inspectZipMembers(bytes, expected), /原字节长度/);
});

test('GS07 严格JSON重复key/非有限和CSV重复field拒绝，原BOM、负号、False与空项不重写', async () => {
  for (const text of ['{"accepted":null,"accepted":false}', '{"x":0,"\\u0078":1}', '{"v":1e309}']) assert.throws(() => parseStrictPreparationJson(text));
  for (const text of ['id,id\n1,2\n', 'id,val\n1\n', 'x\n"open']) assert.throws(() => parseSupplementCsv(text));
  assert.deepEqual(parseSupplementCsv('\uFEFFid,value,flag\r\na,-0.0002,False\r\nb,,\r\n'), { fields: ['id', 'value', 'flag'], rows: [['a', '-0.0002', 'False'], ['b', '', '']] });
  const view = (await allViews()).building_geometry_svf, table = view.tables[B + '方向加密差异.csv'];
  assert.ok(table.rows.some(row => row[table.fields.indexOf('signed_fine_minus_coarse')].startsWith('-')));
  assert.equal(view.raw[B + '方向加密差异.csv'][0], 'r'.charCodeAt(0), '建筑原CSV无BOM，不主动添加');
  assert.deepEqual(Array.from((await allViews()).OSM_source_marks.raw[M + '入口与开放空间来源标记.csv'].subarray(0, 3)), [0xef, 0xbb, 0xbf], '来源标记原CSV有BOM，不主动移除原字节');
});

test('GS08 建筑全32400采样复合键及贡献FK拒绝漏行/重复/错误SHA层ID，空贡献不生成ID0', async () => {
  const view = (await allViews()).building_geometry_svf, path = B + '六点逐方位遮挡与来源.csv';
  for (const mutate of [
    v => { v.files[path].rows.pop(); }, v => { v.files[path].rows[1] = [...v.files[path].rows[0]]; },
    v => cell(v, path, 'sampling_N', '361'), v => cell(v, path, 'direction_index_0based', '360'),
    v => cell(v, path, 'receptor_key', 'H1'), v => cell(v, path, 'winning_source_part_key', 'unknown/part/1'),
    v => cell(v, path, 'all_tied_max_source_part_keys_json', '["unknown/part/1"]'),
    v => { const i = v.files[path].rows.findIndex(row => row[v.files[path].fields.indexOf('winning_source_part_key')] === ''); assert.ok(i >= 0); cell(v, path, 'winning_building_merged_id', '0', i); },
  ]) { const v = decodedCopy(view); mutate(v); assert.throws(() => validateBuildingGeometry(v), /建筑来源几何核对/); }
  assert.equal(Object.keys(view.selectionLookup.directions).length, 32400);
  const empty = Object.values(view.selectionLookup.directions).filter(value => value.raw.winning_source_part_key === ''); assert.equal(empty.length, 2506); assert.ok(empty.every(value => value.raw.winning_building_merged_id === '' && value.contributing_part_keys.length === 0));
});

test('GS09 SVF与无权重/无遮挡诊断不能替换，统一0..1与signed差及null工作高度边界严格', async () => {
  const view = (await allViews()).building_geometry_svf, svf = B + '六点建筑几何SVF_四级采样.csv', refinement = B + '方向加密差异.csv', contract = B + '坐标与水平面SVF契约.json';
  for (const mutate of [
    v => { const t = v.files[svf]; cell(v, svf, 'horizontal_building_SVF', t.rows[0][t.fields.indexOf('unweighted_sky_solid_angle_fraction_diagnostic')]); },
    v => cell(v, svf, 'horizontal_building_SVF', '73.541588'), v => cell(v, svf, 'accepted_physical_SVF', '0'),
    v => cell(v, refinement, 'signed_fine_minus_coarse', '0'), v => cell(v, refinement, 'domain_or_physical_accuracy_converged', 'True'),
    v => { v.files[contract].analysis_horizontal_units = 'km'; }, v => { v.files[contract].work_ground_z_m = null; },
    v => { v.files[contract].azimuth = 'true north'; }, v => { v.files[contract].accepted_receiver_height_m = 1.5; },
    v => { v.files[B + '六候选受体_几何SVF.geojson'].features[0].properties.accepted_physical_SVF = false; },
    v => cell(v, B + '六候选受体坐标关联.csv', 'position_and_height_confirmed', false),
  ]) { const v = decodedCopy(view); mutate(v); assert.throws(() => validateBuildingGeometry(v), /建筑来源几何核对/); }
  assert.deepEqual(view.summary.svf_color_domain, [0, 1]); assert.equal(view.summary.work_conditions.flat_work_ground_z_m, 0); assert.equal(view.summary.work_conditions.accepted_receiver_height_m, null);
});

test('GS10 14/15角点失败与311回读范围分开保留，不升级物理或全32400重新计算', async () => {
  const view = (await allViews()).building_geometry_svf;
  assert.equal(view.summary.known_failures.analytical_passed, 14); assert.equal(view.summary.known_failures.independent_readback_checks, 311);
  assert.equal(view.summary.known_failures.source_independent_recomputed_720_rays, 4320); assert.equal(view.summary.known_failures.platform_rays_recomputed, 0);
  for (const mutate of [
    v => { v.files[B + '解析与边界小例结果.json'].tests.find(t => t.passed === false).passed = true; },
    v => { v.files[B + '解析与边界小例结果.json'].failed_tests = []; },
    v => { v.files[B + '独立回读核查.json'].independently_recomputed_source_rays = 32400; },
    v => { v.files[B + '来源与生产核查.json'].physical_solver_executed = true; },
    v => { v.files[B + '交付文件清单.json'].physical_scene_adopted = false; },
    v => { v.files[B + '本组重复数值一致核查.json'].files['六点逐方位遮挡与来源.csv'].sha256_after = '0'.repeat(64); },
  ]) { const v = decodedCopy(view); mutate(v); assert.throws(() => validateBuildingGeometry(v), /建筑来源几何核对/); }
});

test('GS11 六完整前缀别名连接同SHA/layer/ID，两组原key不改写，不按裸ID连接', async () => {
  const views = await allViews();
  for (const alias of GEOMETRY_SOURCE_ALIASES) {
    const svf = views.building_geometry_svf.selectionLookup.receptors[alias.SVF_receptor_key], relation = views.OSM_source_marks.selectionLookup.receptors[alias.source_mark_relation_subject_key];
    assert.ok(svf && relation); assert.notEqual(alias.SVF_receptor_key, alias.source_mark_relation_subject_key);
    assert.ok(alias.source_mark_relation_subject_key.endsWith(alias.SVF_receptor_key));
    assert.equal(svf.raw.receptor_key, alias.SVF_receptor_key); assert.equal(relation.row.subject_key, alias.source_mark_relation_subject_key);
    assert.equal(Object.hasOwn(views.building_geometry_svf.selectionLookup.receptors, svf.raw.receptor_id), false);
  }
  const v = decodedCopy(views.OSM_source_marks), path = M + '源标记及候选受体与开放空间投影关系.csv';
  const i = v.files[path].rows.findIndex(row => row[v.files[path].fields.indexOf('subject_type')] === 'candidate_receptor_not_adopted'); assert.ok(i >= 0); cell(v, path, 'subject_key', 'H1', i);
  assert.throws(() => validateSourceMarks(v), /来源标记/);
});

test('GS12 窗外来源支撑不改公共路线、原标记False/空服务与2021快照不变准入', async () => {
  const views = await allViews(), window = views.window_source_connectivity, marks = views.OSM_source_marks;
  assert.equal(window.summary.strict_checks.failed, 1); assert.equal(window.summary.strict_checks.strict_failed_parent_segments, 11);
  for (const mutate of [v => { v.files[W + '独立范围核查.json'].all_passed = true; }, v => cell(v, W + '窗外来源支撑段.csv', 'legal_walk_connection', 'True')]) {
    const v = decodedCopy(window); mutate(v); assert.throws(() => validateWindowGeometry(v), /窗口来源几何/);
  }
  for (const mutate of [v => cell(v, M + '源标记及候选受体与开放空间投影关系.csv', 'source_point_covered_by_area_projection', false), v => cell(v, M + '源标记及候选受体与开放空间投影关系.csv', 'route_distance_m', '0'), v => { v.files[M + '来源提取与回读.json'].source_header.header.option.timestamp = '2026-10-06T00:00:00Z'; }]) {
    const v = decodedCopy(marks); mutate(v); assert.throws(() => validateSourceMarks(v), /来源标记/);
  }
  assert.equal(marks.summary.source_snapshot_utc, '2021-01-01T21:42:03Z'); assert.equal(marks.summary.complete_real_entrance_inventory_verified, false);
});
