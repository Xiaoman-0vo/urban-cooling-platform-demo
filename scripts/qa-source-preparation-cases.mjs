import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

// Disposable import counterexamples, derived only from an actual browser file.
// No original source asset or persisted browser project is changed here.
const [projectPath, outputPath] = process.argv.slice(2);
if (!projectPath || !outputPath) throw new Error('Need the actual JSON download and a test-output folder.');
const text = await readFile(projectPath, 'utf8');
const original = JSON.parse(text);
if (original.sourcePreparationRegistrations?.length !== 3) throw new Error('The actual file must carry all three source groups.');
await mkdir(outputPath, { recursive: true });
const cases = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function save(name, mutate, detection) {
  const project = structuredClone(original);
  const result = await mutate(project);
  const bytes = Buffer.from(typeof result === 'string' ? result : JSON.stringify(project, null, 2));
  const path = resolve(outputPath, name + '.json');
  await writeFile(path, bytes);
  cases.push({ name, path, bytes: bytes.length, sha256: sha(bytes), expected_detection: detection });
}
await save('01_错误来源哈希', p => { p.sourcePreparationRegistrations[0].archive.sha256 = '0'.repeat(64); }, 'closed registration identity');
await save('02_原清单损坏', p => {
  const r = p.sourcePreparationRegistrations[1];
  const bytes = Buffer.from(r.manifest_base64, 'base64'); bytes[10] ^= 1; r.manifest_base64 = bytes.toString('base64');
}, 'original manifest SHA256');
await save('03_重复组身份', p => { p.sourcePreparationRegistrations[1] = structuredClone(p.sourcePreparationRegistrations[0]); }, 'duplicate namespace');
await save('04_布尔字符串与准入升级', p => { p.sourcePreparationRegistrations[2].adapter_receipt.application_gates.routing_or_OD = 'False'; }, 'strict false plus frozen metadata');
await save('05_未采用状态升级', p => { p.sourcePreparationRegistrations[0].source_group.scientific_adoption = 'adopted'; }, 'frozen scientific state');
await save('06_重复JSON字段', p => JSON.stringify(p, null, 2).replace('{', '{"export_schema_version":"0.1.local-view-handoff",'), 'strict duplicate-key parser');
await save('07_新登记null错误', p => { p.sourcePreparationRegistrations = null; }, 'optional-field type');
const mutations = [
  ['08_天气漏行', 'weather-cross-format', '07月19日跨格式逐小时对照.csv', content => content.split('\n').filter((_, i) => i !== 2).join('\n')],
  ['09_来源CRS单位空值篡改', 'micro-source-overlay', '来源叠合分区_WGS84.geojson', content => {
    const value = JSON.parse(content); value.analysis_crs = 'EPSG:4326'; value.area_and_length_units = 'degrees'; value.features[0].properties.implementation_permission = false; return JSON.stringify(value);
  }],
  ['10_源段外键断开', 'road-source-connectivity', '原相邻段.csv', content => content.replace(/osm_snapshot@sha256:[a-f0-9]{64}\/nodes\/\d+/, 'bare_node_without_namespace')],
];
for (const [name, group, suffix, mutate] of mutations) await save(name, async p => {
  const r = p.sourcePreparationRegistrations.find(value => value.group_id === group);
  const zip = await JSZip.loadAsync(Buffer.from(r.archive_base64, 'base64'));
  const member = r.source_group.files.find(value => value.path.endsWith('/' + suffix));
  const content = await zip.file(member.path).async('string');
  const changed = mutate(content);
  if (changed === content) throw new Error(name + ': mutation did not alter the source.');
  zip.file(member.path, changed, { createFolders: false });
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  r.archive_base64 = Buffer.from(bytes).toString('base64');
  // A changed source version cannot inherit the authentic catalog identity.
  r.archive.bytes = bytes.length; r.archive.sha256 = sha(bytes);
}, 'changed source version rejected by frozen identity before semantic parsing');
await writeFile(resolve(outputPath, 'cases.json'), JSON.stringify({ input_path: resolve(projectPath), input_sha256: sha(Buffer.from(text)), cases }, null, 2));
console.log(JSON.stringify(cases.map(value => ({ name: value.name, bytes: value.bytes }))));
