import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { validateResearchRegistration, readOnlyResearchActionGates } from '../src/research-state.js';
import { verifyPreparationRegistration, readOnlyPreparationActionGates } from '../src/preparation-state.js';
import { verifySupplementRegistrations, READ_ONLY_SUPPLEMENT_GATES } from '../src/supplement-state.js';
import { verifySourcePreparationRegistrations } from '../src/source-preparation-state.js';
import { verifyGeometrySourceRegistrations } from '../src/source-geometry-state.js';
import { verifyConditionalSources } from '../src/conditional-source-state.js';
import { createProject, parseProjectJson, makeArchive, parseArchive } from '../src/project.js';

// 仅包内字节/合同验证，不代表复核当前科研源件。
// Read only committed public/data snapshots. Historical source paths remain
// provenance strings: these tests never resolve them against a research tree,
// Downloads, a browser, model weights, producer scripts, or an external service.
// The research registration contains a parsed index, not its original bytes;
// its source_index.sha256 is therefore a declared identity, not re-proven here.
const readData = name => JSON.parse(readFileSync(new URL('../public/data/' + name, import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const research = readData('research-state.json');
const preparation = readData('preparation-state.json');
const supplements = readData('supplement-state.json');
const sourcePreparations = readData('source-preparation-state.json');
const geometries = readData('source-geometry-state.json');
const conditions = readData('conditional-source-state.json');
const sourcePackage = readData('manifest.json');
const scene = readData('scene.json');
const snapshots = { research, preparation, supplements, sourcePreparations, geometries, conditions };
const unchanged = JSON.stringify(snapshots);
let preparationPromise, supplementPromise, sourcePreparationPromise, geometryPromise, conditionPromise;
const preparationView = () => preparationPromise ??= verifyPreparationRegistration(preparation);
const supplementViews = () => supplementPromise ??= verifySupplementRegistrations(supplements);
const sourcePreparationViews = () => sourcePreparationPromise ??= verifySourcePreparationRegistrations(sourcePreparations);
const geometryViews = () => geometryPromise ??= verifyGeometrySourceRegistrations(geometries);
const conditionViews = () => conditionPromise ??= verifyConditionalSources(conditions);

function assertRawSources(views) {
  let count = 0;
  for (const view of Object.values(views)) {
    for (const source of view.sources) {
      const bytes = view.raw[source.path];
      assert.equal(bytes.length, source.bytes, source.path);
      assert.equal(hash(bytes), source.sha256, source.path);
      count++;
    }
  }
  return count;
}

function corruptedArchive(registration) {
  const changed = structuredClone(registration);
  const bytes = Buffer.from(changed.archive_base64, 'base64');
  assert.ok(bytes.length > 32);
  bytes[32] ^= 1;
  changed.archive_base64 = bytes.toString('base64');
  return changed;
}

test('embedded research index preserves 8 source identities, 26 development records and closed application gates', () => {
  assert.strictEqual(validateResearchRegistration(research), research);
  assert.equal(research.index.sources.length, 8);
  assert.equal(research.index.development_metric_records.length, 26);
  assert.ok(Object.values(readOnlyResearchActionGates(research)).every(value => value === false));
  const changed = structuredClone(research);
  changed.index.development_metric_records[0].metric = 'temperature_improvement_C';
  assert.throws(() => validateResearchRegistration(changed));
});

test('embedded preparation ZIP authenticates its 14 members and retains missing values', async () => {
  const view = await preparationView();
  assert.equal(Object.keys(view.inputs).length, 14);
  assert.equal(view.manifest.summary.macro_proxy_input_accepted_count, 8);
  assert.ok(Object.values(readOnlyPreparationActionGates()).every(value => value === false));
  const bytes = Buffer.from(preparation.archive_base64, 'base64');
  assert.equal(bytes.length, preparation.archive.bytes);
  assert.equal(hash(bytes), preparation.archive.sha256);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  for (const entry of preparation.manifest.entries) {
    const member = await zip.file(entry.archive_path).async('uint8array');
    assert.equal(member.length, entry.bytes, entry.path);
    assert.equal(hash(member), entry.sha256, entry.path);
  }
});

test('embedded five supplement groups authenticate all 32 source members', async () => {
  const views = await supplementViews();
  assert.equal(Object.keys(views).length, 5);
  assert.equal(assertRawSources(views), 32);
  assert.ok(Object.values(READ_ONLY_SUPPLEMENT_GATES).every(value => value === false));
});

test('embedded source preparation groups authenticate all 31 members and preserve closed gates', async () => {
  const views = await sourcePreparationViews();
  assert.equal(Object.keys(views).length, 3);
  assert.equal(assertRawSources(views), 31);
  assert.ok(sourcePreparations.every(registration => Object.values(registration.adapter_receipt.application_gates).every(value => value === false)));
});

test('embedded geometry groups authenticate all 72 members including retained failed evidence', async () => {
  const views = await geometryViews();
  assert.equal(Object.keys(views).length, 3);
  assert.equal(assertRawSources(views), 72);
  assert.ok(geometries.every(registration => Object.values(registration.adapter_receipt.application_gates).every(value => value === false)));
  assert.equal(geometries[0].source_group.source_claims.exact_tangent_case_failures_retained, 1);
  assert.equal(geometries[1].source_group.source_claims.exact_geometry_all_passed, false);
});

test('embedded conditional sources authenticate 26 members and retain non-adoption and empty evidence', async () => {
  const views = await conditionViews();
  assert.equal(Object.keys(views).length, 3);
  const files = Object.values(views).flatMap(view => Object.values(view.files));
  assert.equal(files.length, 26);
  for (const file of files) {
    assert.equal(file.bytes.length, file.spec.bytes, file.spec.path);
    assert.equal(hash(file.bytes), file.spec.sha256, file.spec.path);
  }
  assert.ok(conditions.every(registration => registration.research_adoption === false));
  assert.equal(views.park_access_evidence.table.rows.flat().filter(value => value === '').length, 39);
  assert.equal(views.temperature_catalogue_preview.temperatureAcquisition.raster_acquired, false);
});

test('all five binary evidence verifiers reject a changed embedded archive', async () => {
  await assert.rejects(() => verifyPreparationRegistration(corruptedArchive(preparation)));
  await assert.rejects(() => verifySupplementRegistrations([corruptedArchive(supplements[0]) ]));
  await assert.rejects(() => verifySourcePreparationRegistrations([corruptedArchive(sourcePreparations[0]) ]));
  await assert.rejects(() => verifyGeometrySourceRegistrations([corruptedArchive(geometries[0]) ]));
  const changedConditions = structuredClone(conditions);
  changedConditions[0] = corruptedArchive(changedConditions[0]);
  await assert.rejects(() => verifyConditionalSources(changedConditions));
});

test('complete embedded project roundtrips JSON and ZIP with every registration and unknown scientific result', async () => {
  await Promise.all([preparationView(), supplementViews(), sourcePreparationViews(), geometryViews(), conditionViews()]);
  const uiState = {
    stage: 'site', region: '成都', center: scene.center_lon_lat, location: scene.site_id,
    visible: { bounds: true, buildings: true, vegetation: true, roads: true, receptors: false, regional: false, greenFx: true },
    offline: true, preview: true, drawer: 'versions',
  };
  const project = createProject(sourcePackage, scene, uiState, scene.layers, [], [research], [preparation],
    supplements, sourcePreparations, geometries, conditions, []);
  assert.deepEqual(parseProjectJson(JSON.stringify(project)), project);
  const bytes = await makeArchive(project);
  assert.deepEqual(await parseArchive(bytes), project);
  assert.equal(project.scene.results.temperature_improvement_C, null);
  assert.equal(project.scene.results.value_state, 'not_calculated');
  assert.equal(project.software_receipt.prediction_enabled, false);
  assert.equal(project.software_receipt.physics_enabled, false);
  assert.equal(project.software_receipt.optimal_recommendation_enabled, false);
  assert.equal(JSON.stringify(snapshots), unchanged);
});
