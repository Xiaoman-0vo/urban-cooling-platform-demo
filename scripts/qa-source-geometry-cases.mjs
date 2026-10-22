import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const file = process.argv[2];
if (!file) throw new Error('需要实际从浏览器下载的完整新工程JSON路径。');
const bytes = await readFile(file), base = JSON.parse(bytes.toString('utf8'));
if (base.geometrySourceRegistrations?.length !== 3) throw new Error('反例基于已实际接纳三组的工程，不使用构造基线。');
const sha = raw => createHash('sha256').update(raw).digest('hex');
const directory = resolve('evidence/几何对象浏览器错误文件_20261006');
await mkdir(directory, { recursive: true });
const cases = [];
async function save(id, label, mutate, scope) {
  const value = structuredClone(base);
  await mutate(value);
  const target = resolve(directory, id + '.json');
  const raw = Buffer.from(JSON.stringify(value));
  await writeFile(target, raw);
  cases.push({ id, label, path: target, bytes: raw.length, sha256: sha(raw), expected: 'reject_before_engineering_state_commit', rejection_scope: scope });
}
await save('01_wrong_geometry_identity', '新增来源包身份指纹错误', value => {
  value.geometrySourceRegistrations[0].registration_id = value.geometrySourceRegistrations[0].registration_id.slice(0, -1) + '0';
}, 'closed source registration identity');
await save('02_direction_building_foreign_key', '方向贡献建筑外键改写', async value => {
  const registration = value.geometrySourceRegistrations[0];
  const source = registration.source_group.source_files.find(item => item.path.endsWith('/六点逐方位遮挡与来源.csv'));
  const zip = await JSZip.loadAsync(Buffer.from(registration.archive_base64, 'base64'));
  const text = await zip.file(source.path).async('string');
  const key = text.match(/[a-f0-9]{64}\/[^,\r\n"]*buildings[^,\r\n"]*/)?.[0];
  if (!key) throw new Error('未找到实际方向建筑来源键，不能构造虚假的成功反例。');
  const wrong = text.replace(key, key.replace(/^[a-f0-9]/, first => first === 'a' ? 'b' : 'a'));
  zip.file(source.path, wrong, { createFolders: false });
  const raw = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  registration.archive_base64 = raw.toString('base64'); registration.archive.bytes = raw.length; registration.archive.sha256 = sha(raw);
  source.bytes = Buffer.byteLength(wrong); source.sha256 = sha(Buffer.from(wrong));
}, 'changed frozen source identity rejected before inner foreign-key semantics; pure validators separately exercise foreign-key failure');
await save('03_strict_failure_upgraded', '严格等价失败错误升级为全部通过', value => {
  value.geometrySourceRegistrations[1].source_group.source_claims.exact_geometry_all_passed = true;
  value.geometrySourceRegistrations[1].source_group.source_claims.geometry_review_state = 'all_passed';
}, 'known failed source review state must remain legal read-only evidence, without upgrade');
await save('04_history_promoted', '未接受字段历史误放为当前资料', value => {
  const group = value.geometrySourceRegistrations[2].source_group;
  for (const source of group.source_files) if (source.role === 'retained_unaccepted_schema_history') source.role = 'source_material';
  group.source_claims.initial_unaccepted_schema_files_retained = 0;
}, 'historical role/count and current source group identity');
await save('05_bare_receiver_alias', '六受体别名被裸ID替代', value => {
  value.geometrySourceRegistrations[0].adapter_receipt.receiver_key_aliases[0].source_mark_relation_subject_key = 'H1';
}, 'full asset SHA/layer/original-ID alias evidence');
const receipt = { actual_downloaded_baseline: { path: resolve(file), bytes: bytes.length, sha256: sha(bytes) }, scope: 'five new geometry/source-identity/state counterexamples; whole-batch persistence checked separately', cases };
await writeFile(resolve(directory, 'cases.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(cases.map(item => ({ id: item.id, label: item.label, bytes: item.bytes }))));
