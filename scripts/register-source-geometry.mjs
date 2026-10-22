import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = resolve('..');
const path = '平台产品设计/来源几何与对象三组接入清单_20261006.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(resolve(root, path));
if (hash(manifestBytes) !== '55534ca2095418c3415acf6315cb24ae5cf0e9ffc29b9703595ee302b1466e56') throw new Error('冻结几何对象清单不一致。');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const manifest_source = { path, bytes: manifestBytes.length, sha256: hash(manifestBytes) };
const reviewPath = '共享接口/来源几何与对象三组交接/55534ca2095418c3/独立接入审阅.json';
const reviewBytes = await readFile(resolve(root, reviewPath));
if (hash(reviewBytes) !== 'cc2e88b975a94891553b0d509709c228b03fb8ac6b3bc23d2f728f4a173a13df') throw new Error('冻结后只读契约审阅版本不一致。');
const review = JSON.parse(reviewBytes.toString('utf8'));
const aliases = review.cross_group_receiver_key_alias_evidence;
const readonlyReview = { path: reviewPath, bytes: reviewBytes.length, sha256: hash(reviewBytes), check_count: 52, scope: 'post_freeze_read_only_contract_review_not_one_of_72_source_files' };
const originalZipPath = '共享接口/来源几何与对象三组交接/55534ca2095418c3/来源几何与对象三组原件_20261006.zip';
const originalZipBytes = await readFile(resolve(root, originalZipPath));
if (originalZipBytes.length !== 3870205 || hash(originalZipBytes) !== '2749735826a63859afe907e358382dc584d966bd9f38f237e0b9e34fba7f60f6') throw new Error('原冻结72件ZIP不一致。');
const originalZip = await JSZip.loadAsync(originalZipBytes, { checkCRC32: true });
const manifestEntry = Object.keys(originalZip.files).find(name => name.endsWith('来源几何与对象三组接入清单_20261006.json'));
if (!manifestEntry || hash(await originalZip.file(manifestEntry).async('nodebuffer')) !== hash(manifestBytes)) throw new Error('冻结ZIP清单原字节不一致。');
let frozen = [];
try { frozen = JSON.parse(await readFile('public/data/source-geometry-state.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const schema_version = '0.1.read-only-source-geometry';
const now = new Date().toISOString(), registrations = [], catalog = [], checks = [];
const application_gates = { new_site_prediction: false, physical_simulation: false, thermal_comfort: false, routing_or_OD: false, actual_access_or_use_service: false, fairness: false, minimum_green_area: false, candidate_generation: false, ranking: false };
for (const group of manifest.groups) {
  const before = new Map(), zip = new JSZip();
  zip.file('source-manifest.json', manifestBytes, { createFolders: false, date: new Date('2026-10-06T00:00:00Z') });
  for (const file of group.source_files) {
    const bytes = await readFile(resolve(root, file.path));
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error('来源版本不一致：' + file.path);
    const archived = await originalZip.file(file.path)?.async('nodebuffer');
    if (!archived || !archived.equals(bytes)) throw new Error('冻结包与当前原件不一致：' + file.path);
    before.set(file.path, bytes);
    zip.file(file.path, bytes, { createFolders: false, date: new Date('2026-10-06T00:00:00Z') });
  }
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const registration_id = 'source-geometry:' + group.group_id + ':' + hash(Buffer.from(JSON.stringify(group)));
  let entry = { schema_version, group_id: group.group_id, registration_id, source_group: group, manifest_source, archive: { bytes: archive.length, sha256: hash(archive) }, adapter_receipt: { version: '0.1', registered_at: now, file_acceptance: 'verified_72_source_bytes_and_original_manifest', science_validation: 'source_geometry_review_with_retained_failures_not_physical_adoption', integration: 'read_only_geometry_and_source_objects', execution: 'source_metadata_verified_no_producer_or_research_run', readonly_contract_review: readonlyReview, receiver_key_aliases: aliases, application_gates } };
  const old = frozen.find(item => item.registration_id === registration_id);
  if (old) {
    if (old.archive.sha256 !== entry.archive.sha256 || old.archive.bytes !== entry.archive.bytes || JSON.stringify(old.source_group) !== JSON.stringify(group) || old.manifest_source.sha256 !== entry.manifest_source.sha256) throw new Error('既有登记不可重基，应建立独立来源版本。');
    const { archive_base64, manifest_base64, ...previous } = old;
    entry = previous;
  }
  catalog.push(entry);
  registrations.push({ ...entry, archive_base64: archive.toString('base64'), manifest_base64: manifestBytes.toString('base64') });
  for (const [filePath, bytes] of before) {
    const after = await readFile(resolve(root, filePath));
    if (!after.equals(bytes)) throw new Error('读前读后原件变化：' + filePath);
    checks.push({ path: filePath, absolute_path: resolve(root, filePath), bytes: bytes.length, sha256: hash(bytes), before_after_equal: true });
  }
}
if (checks.length !== 72 || hash(await readFile(resolve(root, path))) !== manifest_source.sha256) throw new Error('原件或清单范围变化。');
await mkdir('evidence', { recursive: true });
await writeFile('src/source-geometry-catalog.js', '// Frozen source geometry, known failures and verified key aliases; no scientific adoption.\nexport const GEOMETRY_SOURCE_SCHEMA=' + JSON.stringify(schema_version) + ';\nexport const GEOMETRY_SOURCE_MANIFEST=Object.freeze(' + JSON.stringify(manifest_source) + ');\nexport const GEOMETRY_SOURCE_ALIASES=Object.freeze(' + JSON.stringify(aliases, null, 2) + ');\nexport const GEOMETRY_SOURCE_INTAKE_REVIEW=Object.freeze(' + JSON.stringify(readonlyReview) + ');\nexport const GEOMETRY_SOURCE_CATALOG=Object.freeze(' + JSON.stringify(catalog, null, 2) + ');\n');
await writeFile('public/data/source-geometry-state.json', JSON.stringify(registrations));
await writeFile('evidence/几何对象72原字节登记_20261006.json', JSON.stringify({ checked_at: now, manifest_source, original_frozen_zip: { path: originalZipPath, bytes: originalZipBytes.length, sha256: hash(originalZipBytes), members: 73 }, readonly_contract_review: readonlyReview, source_checks: checks, source_count: 72, source_bytes: manifest.source_bytes, group_count: 3, primary_tables: 16, primary_rows: 32834, source_bytes_unchanged: true, old_versions_preserved: true, producers_or_research_run: false, original_external_assets_delivered: false, receiver_key_aliases: aliases }, null, 2) + '\n');
console.log(JSON.stringify(catalog.map(item => ({ group_id: item.group_id, registration_id: item.registration_id, files: item.source_group.source_files.length, zip_bytes: item.archive.bytes }))));
