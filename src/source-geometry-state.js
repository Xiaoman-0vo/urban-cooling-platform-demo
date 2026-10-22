import JSZip from 'jszip';
import { GEOMETRY_SOURCE_CATALOG, GEOMETRY_SOURCE_MANIFEST, GEOMETRY_SOURCE_ALIASES } from './source-geometry-catalog.js';
import { parseStrictPreparationJson } from './preparation-state.js';
import { canonicalSupplement, inspectZipMembers, parseSupplementCsv } from './supplement-state.js';
import { validateBuildingGeometry } from './source-geometry-building.js';
import { validateWindowGeometry } from './source-geometry-window.js';
import { validateSourceMarks } from './source-geometry-marks.js';

// Authentication and saved-source semantics only. Binary originals remain bytes;
// source scripts, external source references and research producers are never run.
const MANIFEST_MEMBER = 'source-manifest.json';
const CATALOG = structuredClone(GEOMETRY_SOURCE_CATALOG);
const ALIASES = structuredClone(GEOMETRY_SOURCE_ALIASES);
const validators = { building_geometry_svf: validateBuildingGeometry, window_source_connectivity: validateWindowGeometry, OSM_source_marks: validateSourceMarks };
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('来源几何资料核对：' + message); };
const same = (actual, expected, label) => { if (canonicalSupplement(actual) !== canonicalSupplement(expected)) fail(label + '与冻结登记原版本不一致。'); };

function finiteTree(value, depth = 0) {
  if (depth > 100 || typeof value === 'number' && !Number.isFinite(value)) fail('原资料包含非有限数值或过深结构。');
  if (Array.isArray(value)) value.forEach(item => finiteTree(item, depth + 1));
  else if (object(value)) Object.values(value).forEach(item => finiteTree(item, depth + 1));
}
function encodedBytes(encoded, bytes, label) {
  // Avoid a repeated-group regexp on multi-megabyte base64 strings.
  if (typeof encoded !== 'string' || encoded.length !== Math.ceil(bytes / 3) * 4 || /[^A-Za-z0-9+/=]/.test(encoded)) fail(label + '完整原字节编码无效。');
  const padding = (3 - bytes % 3) % 3, bodyLength = encoded.length - padding;
  if (encoded.slice(bodyLength) !== '='.repeat(padding) || encoded.indexOf('=') !== (padding ? bodyLength : -1)) fail(label + 'base64末尾填充无效。');
  let decoded;
  try { decoded = atob(encoded); } catch { fail(label + 'base64解码失败。'); }
  if (decoded.length !== bytes || btoa(decoded) !== encoded) fail(label + '原字节数或base64表示不一致。');
  // String iteration can allocate one temporary element per byte before
  // constructing a typed array. Fill the exact buffer directly instead.
  const result = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index++) result[index] = decoded.charCodeAt(index);
  return result;
}
function gates(value, label) {
  if (!object(value) || !Object.keys(value).length || Object.values(value).some(item => item !== false)) fail(label + '必须保持全部严格false。');
}

/** Missing old project fields are [], and explicit one/two-group subsets remain subsets. */
export function validateGeometrySourceRegistrations(registrations = []) {
  if (!Array.isArray(registrations) || registrations.length > CATALOG.length) fail('三组登记结构无效。');
  const seen = new Set();
  for (const registration of registrations) {
    if (!object(registration)) fail('登记必须为对象。');
    finiteTree(registration);
    const expected = CATALOG.find(item => item.group_id === registration.group_id);
    if (!expected || seen.has(registration.group_id)) fail('未知或重复组身份。');
    seen.add(registration.group_id);
    same(Object.keys(registration).sort(), [...Object.keys(expected), 'archive_base64', 'manifest_base64'].sort(), '完整登记字段');
    for (const key of Object.keys(expected)) same(registration[key], expected[key], registration.group_id + ' / ' + key);
    same(registration.manifest_source, GEOMETRY_SOURCE_MANIFEST, '原清单来源');
    same(registration.adapter_receipt.receiver_key_aliases, ALIASES, '完整六条已审阅前缀别名');
    gates(registration.adapter_receipt.application_gates, '九项应用门控');
    if (registration.source_group.scientific_adoption_opened !== false || registration.source_group.intake_status !== 'source_review_with_explicit_limits') fail('来源几何不能升级为科研采用。');
    encodedBytes(registration.archive_base64, registration.archive.bytes, '本组原ZIP');
    encodedBytes(registration.manifest_base64, registration.manifest_source.bytes, '完整原清单');
  }
  return registrations;
}

export function geometrySourceArchiveBytes(registration) {
  validateGeometrySourceRegistrations([registration]);
  return encodedBytes(registration.archive_base64, registration.archive.bytes, '本组原ZIP');
}
export function geometrySourceManifestBytes(registration) {
  validateGeometrySourceRegistrations([registration]);
  return encodedBytes(registration.manifest_base64, registration.manifest_source.bytes, '完整原清单');
}
async function hash(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
function validateManifest(manifest, registration) {
  if (!object(manifest)) fail('原清单不是对象。');
  finiteTree(manifest);
  same(manifest.schema_version, 'source-geometry-objects-three.v1', '原清单schema');
  for (const [key, value] of Object.entries({ source_file_count: 72, source_bytes: 21403434, primary_table_count: 16, primary_table_rows: 32834, retained_unaccepted_schema_file_count: 4, outside_existing31_task: true, old14_or_research_scenarios_replaced: false })) same(manifest[key], value, '原清单.' + key);
  if (!Array.isArray(manifest.groups) || manifest.groups.length !== CATALOG.length) fail('完整原清单三组缺失。');
  const seen = new Set();
  for (const group of manifest.groups) {
    const expected = CATALOG.find(item => item.group_id === group?.group_id);
    if (!expected || seen.has(group.group_id)) fail('原清单组身份未知或重复。');
    seen.add(group.group_id); same(group, expected.source_group, '原清单完整来源组');
  }
  same(manifest.groups.find(group => group.group_id === registration.group_id), registration.source_group, '清单与本组登记');
}
function validateCsv(table, metadata) {
  same(table.fields, metadata.columns, metadata.path + '原字段及顺序');
  if (table.fields.length !== metadata.column_count || table.rows.length !== metadata.rows) fail(metadata.path + '完整行列数缺失。');
  const keys = metadata.primary_key_columns;
  if (!Array.isArray(keys) || !keys.length || new Set(keys).size !== keys.length || keys.some(key => !table.fields.includes(key))) fail(metadata.path + '主键声明无效。');
  const indices = keys.map(key => table.fields.indexOf(key)), seen = new Set();
  for (const row of table.rows) {
    if (!Array.isArray(row) || row.length !== table.fields.length || row.some(cell => typeof cell !== 'string')) fail(metadata.path + '原单元必须保持字符串及空字符串。');
    const values = indices.map(index => row[index]), key = JSON.stringify(values);
    if (values.some(value => value === '') || seen.has(key)) fail(metadata.path + '复合主键空缺或重复。');
    seen.add(key);
    for (const field of metadata.json_coded_columns) {
      const value = row[table.fields.indexOf(field)];
      if (value !== '') parseStrictPreparationJson(value);
    }
  }
}
function position(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) fail('原显示几何必须为完整WGS84经纬度，不猜坐标或补值。');
}
function line(value, ring = false) {
  if (!Array.isArray(value) || value.length < (ring ? 4 : 2)) fail('原显示线或环缺失。');
  value.forEach(position);
  if (ring) same(value[0], value.at(-1), '原多边形闭环');
}
function polygon(value) {
  if (!Array.isArray(value) || !value.length) fail('原多边形环缺失。');
  value.forEach(ring => line(ring, true));
}
function validateDisplay(value, path) {
  if (!object(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) fail(path + '原FeatureCollection缺失。');
  finiteTree(value);
  for (const feature of value.features) {
    if (!object(feature) || feature.type !== 'Feature' || !object(feature.properties) || !object(feature.geometry)) fail(path + '原Feature/属性/几何类型无效。');
    const g = feature.geometry;
    if (g.type === 'Point') position(g.coordinates);
    else if (g.type === 'LineString') line(g.coordinates);
    else if (g.type === 'Polygon') polygon(g.coordinates);
    else if (g.type === 'MultiLineString' || g.type === 'MultiPolygon') {
      if (!Array.isArray(g.coordinates) || !g.coordinates.length) fail('原多部件几何为空。');
      g.coordinates.forEach(value => g.type === 'MultiLineString' ? line(value) : polygon(value));
    } else fail(path + '未知或替换的原显示几何类型。');
  }
}

async function verifyRegistration(registration) {
  const archive = geometrySourceArchiveBytes(registration), sidecar = geometrySourceManifestBytes(registration);
  if (await hash(archive) !== registration.archive.sha256) fail('本组原ZIP真实SHA256不匹配。');
  if (await hash(sidecar) !== registration.manifest_source.sha256) fail('原清单真实SHA256不匹配。');
  const group = registration.source_group;
  const groupHash = await hash(new TextEncoder().encode(JSON.stringify(group)));
  same(registration.registration_id, 'source-geometry:' + group.group_id + ':' + groupHash, '本组登记身份摘要');
  const expected = new Map([[MANIFEST_MEMBER, registration.manifest_source.bytes], ...group.source_files.map(source => [source.path, source.bytes])]);
  const members = inspectZipMembers(archive, expected);
  if (members.length !== expected.size || members.some(member => member.directory)) fail('本组ZIP必须精确包含原清单和本组原件，不允许目录或多余成员。');
  let zip;
  try { zip = await JSZip.loadAsync(archive, { checkCRC32: true }); }
  catch (error) { fail('原ZIP的CRC或读取核验失败：' + error.message); }
  const manifestBytes = await zip.file(MANIFEST_MEMBER).async('uint8array');
  if (manifestBytes.length !== sidecar.length || await hash(manifestBytes) !== registration.manifest_source.sha256 || manifestBytes.some((value, index) => value !== sidecar[index])) fail('ZIP内清单与完整原sidecar字节或SHA不一致。');
  const manifest = parseStrictPreparationJson(utf8.decode(manifestBytes).replace(/^\uFEFF/, ''));
  validateManifest(manifest, registration);
  const sources = manifest.groups.find(item => item.group_id === registration.group_id).source_files;
  const files = {}, raw = {}, tables = {};
  for (const source of sources) {
    const bytes = await zip.file(source.path).async('uint8array');
    if (bytes.length !== source.bytes || await hash(bytes) !== source.sha256) fail('原件真实SHA256或字节数不匹配：' + source.path);
    raw[source.path] = bytes;
    if (['csv', 'json', 'geojson', 'md', 'py', 'txt'].includes(source.format)) {
      const text = utf8.decode(bytes);
      if (source.format === 'csv') files[source.path] = parseSupplementCsv(text);
      else if (['json', 'geojson'].includes(source.format)) files[source.path] = parseStrictPreparationJson(text.replace(/^\uFEFF/, ''));
      else files[source.path] = text;
    } else if (!['png', 'svg', 'gpkg', 'pbf'].includes(source.format)) fail('未知原件格式：' + source.path);
  }
  for (const metadata of group.primary_tables) {
    const source = sources.find(item => item.path === metadata.path);
    if (!source || source.format !== 'csv' || metadata.historical_unaccepted_schema !== false || metadata.raw_CSV_empty_cells_preserved !== true) fail('主表不得引用未接受历史或补齐空值。');
    validateCsv(files[metadata.path], metadata); tables[metadata.path] = files[metadata.path];
  }
  for (const path of group.display_geojson) validateDisplay(files[path], path);
  const view = { registration, sources, files, raw, tables, aliases: structuredClone(ALIASES) };
  const result = validators[registration.group_id](view);
  if (!object(result) || !object(result.summary) || !object(result.displayCollections) || !object(result.selectionLookup)) fail('本组纯核对结果缺少摘要/显示/选择追溯。');
  for (const value of [result.summary.application_gates, result.summary.operation_gates, result.summary.scientific_action_gates]) if (value !== undefined) gates(value, '纯语义核对门控');
  return { ...view, summary: result.summary, displayCollections: result.displayCollections, selectionLookup: result.selectionLookup };
}

/** Returns immutable-in-flight snapshots; no omitted group is filled automatically. */
export async function verifyGeometrySourceRegistrations(registrations = []) {
  validateGeometrySourceRegistrations(registrations);
  const snapshots = structuredClone(registrations);
  const pairs = await Promise.all(snapshots.map(async registration => [registration.group_id, await verifyRegistration(registration)]));
  const views = Object.fromEntries(pairs), building = views.building_geometry_svf, marks = views.OSM_source_marks;
  // Explicit full SHA/layer/ID aliases bridge preserved prefixes only when both
  // authenticated groups were actually supplied; no nearest point or bare ID join.
  if (building && marks) for (const alias of ALIASES) {
    if (!Object.hasOwn(building.selectionLookup.receptors, alias.SVF_receptor_key) || !Object.hasOwn(marks.selectionLookup.receptors, alias.source_mark_relation_subject_key)) fail('完整六条冻结别名的双组外键缺失。');
  }
  return views;
}
