import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { createProject, parseProjectJson, makeArchive, parseArchive } from '../src/project.js';
import { geometrySourceArchiveBytes, geometrySourceManifestBytes } from '../src/source-geometry-state.js';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const registrations = readJson('../public/data/source-geometry-state.json');
const priorReceipt = readJson('../三组来源准备接入_20261006.json');
const legacyBytes = readFileSync(priorReceipt.actual_disk_deliveries.json.path);
assert.equal(sha(legacyBytes), priorReceipt.actual_disk_deliveries.json.sha256);
const legacy = parseProjectJson(legacyBytes.toString('utf8'));
const attached = () => ({ ...structuredClone(legacy), geometrySourceRegistrations: structuredClone(registrations) });
let archivePromise;
const archive = () => archivePromise ??= makeArchive(attached());

test('GSP01 第10参数独立追加，旧31/32/14与研究场景保持；旧字段缺省不补新包', () => {
  assert.equal(Object.hasOwn(legacy, 'geometrySourceRegistrations'), false);
  assert.equal(Object.hasOwn(parseProjectJson(JSON.stringify(legacy)), 'geometrySourceRegistrations'), false);
  const value = createProject(legacy.sourcePackage, legacy.scene, legacy.uiState, legacy.layers,
    legacy.imports, legacy.researchRegistrations, legacy.preparationRegistrations,
    legacy.supplementRegistrations, legacy.sourcePreparationRegistrations, registrations);
  assert.notStrictEqual(value.geometrySourceRegistrations, registrations);
  for (const key of ['sourcePackage', 'scene', 'uiState', 'layers', 'imports', 'researchRegistrations', 'preparationRegistrations', 'supplementRegistrations', 'sourcePreparationRegistrations', 'software_receipt']) assert.deepEqual(value[key], legacy[key]);
  assert.deepEqual(parseProjectJson(JSON.stringify(value)), value);
  assert.equal(value.supplementRegistrations.length, 5);
  assert.equal(value.sourcePreparationRegistrations.length, 3);
  assert.equal(value.researchRegistrations.length, 2);
  assert.equal(value.preparationRegistrations.length, 1);
  assert.equal(value.scene.results.temperature_improvement_C, null);
  for (const malformed of [null, {}, [registrations[0], registrations[0]]]) assert.throws(() => parseProjectJson(JSON.stringify({ ...legacy, geometrySourceRegistrations: malformed })));
});

test('GSP02 完整JSON/ZIP回读72原件与BOM/4历史不变，已知失败保留，闭合成员逐SHA一致', async () => {
  const before = JSON.stringify({ legacy, registrations });
  const bytes = await archive(), zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  assert.deepEqual(await parseArchive(bytes), attached());
  const manifest = readFileSync(new URL('../../平台产品设计/来源几何与对象三组接入清单_20261006.json', import.meta.url));
  assert.deepEqual(Buffer.from(await zip.file('geometry-source/source-manifest.json').async('uint8array')), manifest);
  let files = 0, history = 0, bom = 0;
  for (const registration of registrations) {
    const mirror = await zip.file('geometry-source/' + registration.group_id + '.zip').async('uint8array');
    assert.deepEqual(mirror, geometrySourceArchiveBytes(registration));
    assert.deepEqual(Buffer.from(geometrySourceManifestBytes(registration)), manifest);
    const inner = await JSZip.loadAsync(mirror, { checkCRC32: true });
    for (const source of registration.source_group.source_files) {
      const raw = await zip.file('geometry-source/inputs/' + source.path).async('uint8array');
      assert.deepEqual(raw, await inner.file(source.path).async('uint8array'));
      assert.deepEqual(Buffer.from(raw), readFileSync(new URL('../../' + source.path, import.meta.url)));
      assert.equal(raw.length, source.bytes); assert.equal(sha(raw), source.sha256);
      files++; if (source.role === 'retained_unaccepted_schema_history') history++;
      if (raw[0] === 239 && raw[1] === 187 && raw[2] === 191) bom++;
    }
    assert.ok(Object.values(registration.adapter_receipt.application_gates).every(value => value === false));
  }
  assert.equal(files, 72); assert.equal(history, 4); assert.equal(bom, 12);
  assert.equal(registrations[0].source_group.source_claims.exact_tangent_case_failures_retained, 1);
  assert.equal(registrations[1].source_group.source_claims.exact_geometry_all_passed, false);
  const receipt = JSON.parse(await zip.file('archive-receipt.json').async('string'));
  const expected = Object.keys(zip.files).filter(path => !zip.files[path].dir && path !== 'archive-receipt.json');
  assert.deepEqual(receipt.members.map(member => member.path).sort(), expected.sort());
  for (const member of receipt.members) {
    const raw = await zip.file(member.path).async('uint8array');
    assert.equal(raw.length, member.bytes); assert.equal(sha(raw), member.sha256);
  }
  assert.equal(JSON.stringify({ legacy, registrations }), before);
});

test('GSP03 72新包旁表/历史原件缺失及合法改写原件均拒绝，不靠回执或最后值覆盖', async () => {
  async function changed(change) {
    const zip = await JSZip.loadAsync(await archive());
    await change(zip);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 1 } });
  }
  const history = registrations[2].source_group.source_files.find(file => file.role === 'retained_unaccepted_schema_history');
  await assert.rejects(parseArchive(await changed(zip => zip.remove('geometry-source/inputs/' + history.path))), /原件|缺少/);
  await assert.rejects(parseArchive(await changed(zip => zip.remove('geometry-source/registrations.json'))), /登记/);
  const source = registrations[0].source_group.source_files.find(file => file.path.endsWith('/六候选受体坐标关联.csv'));
  await assert.rejects(parseArchive(await changed(async zip => {
    const path = 'geometry-source/inputs/' + source.path;
    const raw = await zip.file(path).async('uint8array'); raw[raw.length - 2] ^= 1;
    zip.file(path, raw, { createFolders: false });
    const receipt = JSON.parse(await zip.file('archive-receipt.json').async('string'));
    const entry = receipt.members.find(member => member.path === path); entry.sha256 = sha(raw);
    zip.file('archive-receipt.json', JSON.stringify(receipt), { createFolders: false });
  })), /原字节|原件/);
  const wrong = attached(); wrong.geometrySourceRegistrations[1].source_group.source_claims.exact_geometry_all_passed = true;
  assert.throws(() => parseProjectJson(JSON.stringify(wrong)), /原版本|登记|来源/);
});
