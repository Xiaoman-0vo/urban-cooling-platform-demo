import JSZip from 'jszip';
import { SOURCE_PREPARATION_CATALOG } from './source-preparation-catalog.js';
import { parseStrictPreparationJson } from './preparation-state.js';
import { canonicalSupplement, inspectZipMembers, parseSupplementCsv } from './supplement-state.js';
import { validateOverlaySource } from './source-overlay.js';
import { validateWeatherSource } from './source-weather.js';
import { validateRoadSource } from './source-roads.js';

// This layer authenticates the explicit packages. It never executes source code,
// follows external paths, creates model inputs or changes scientific admission.
const MANIFEST_MEMBER = 'source-manifest.json';
const validators = {
  'micro-source-overlay': validateOverlaySource,
  'weather-cross-format': validateWeatherSource,
  'road-source-connectivity': validateRoadSource,
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('来源准备资料核对：' + message); };
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const expectedCatalog = structuredClone(SOURCE_PREPARATION_CATALOG);
const same = (actual, expected, label) => {
  if (canonicalSupplement(actual) !== canonicalSupplement(expected)) fail(label + '与已登记的原版本不一致。');
};
function finiteTree(value, depth = 0) {
  if (depth > 100 || typeof value === 'number' && !Number.isFinite(value)) fail('资料包含非有限数值或过深结构。');
  if (Array.isArray(value)) value.forEach(item => finiteTree(item, depth + 1));
  else if (record(value)) Object.values(value).forEach(item => finiteTree(item, depth + 1));
}
function encodedBytes(encoded, expectedBytes, label) {
  if (typeof encoded !== 'string' || encoded.length !== Math.ceil(expectedBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail(label + '完整原字节编码无效。');
  const decoded = atob(encoded);
  if (decoded.length !== expectedBytes || btoa(decoded) !== encoded) fail(label + '字节数或base64编码不一致。');
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
function gates(value, label) {
  if (!record(value) || !Object.keys(value).length || Object.values(value).some(item => item !== false)) fail(label + '必须保持全部严格false。');
}

/** Closed metadata validation; absent project fields are represented by []. */
export function validateSourcePreparationRegistrations(registrations = []) {
  if (!Array.isArray(registrations) || registrations.length > expectedCatalog.length) fail('三组登记结构无效。');
  const seen = new Set();
  for (const registration of registrations) {
    if (!record(registration)) fail('登记必须为对象。');
    finiteTree(registration);
    const expected = expectedCatalog.find(item => item.group_id === registration.group_id);
    if (!expected || seen.has(registration.group_id)) fail('未知或重复的组身份。');
    seen.add(registration.group_id);
    same(Object.keys(registration).sort(), [...Object.keys(expected), 'archive_base64', 'manifest_base64'].sort(), '登记字段');
    for (const key of Object.keys(expected)) same(registration[key], expected[key], registration.group_id + ' / ' + key);
    gates(registration.adapter_receipt.application_gates, '九项应用门控');
    if (registration.source_group.scientific_adoption !== 'not_adopted' || registration.source_group.software_intake !== 'not_yet_executed' || registration.source_group.area_D_physical_access_fairness_ranking_outputs_available !== false) fail('原来源状态不能因软件接入升级。');
    encodedBytes(registration.archive_base64, registration.archive.bytes, '原ZIP');
    encodedBytes(registration.manifest_base64, registration.manifest_source.bytes, '原清单');
  }
  return registrations;
}

export function sourcePreparationArchiveBytes(registration) {
  validateSourcePreparationRegistrations([registration]);
  return encodedBytes(registration.archive_base64, registration.archive.bytes, '原ZIP');
}

export function sourcePreparationManifestBytes(registration) {
  validateSourcePreparationRegistrations([registration]);
  return encodedBytes(registration.manifest_base64, registration.manifest_source.bytes, '原清单');
}

async function hash(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function validateManifest(manifest, registration) {
  if (!record(manifest)) fail('原清单不是对象。');
  finiteTree(manifest);
  same(manifest.schema_version, 'source-preparation-intake-manifest.v1', '原清单schema');
  same(manifest.group_count, 3, '原清单三组');
  same(manifest.explicit_file_count, 31, '原清单31件');
  same(manifest.scientific_capabilities_opened, false, '原清单科学门控');
  if (!Array.isArray(manifest.groups) || manifest.groups.length !== 3) fail('原清单三组缺失。');
  const identities = new Set();
  for (const group of manifest.groups) {
    const expected = expectedCatalog.find(item => item.group_id === group?.group_id);
    if (!expected || identities.has(group.group_id)) fail('原清单组身份未知或重复。');
    identities.add(group.group_id);
    same(group, expected.source_group, '原清单完整组元数据');
  }
  same(manifest.groups.find(group => group.group_id === registration.group_id), registration.source_group, '本组原清单与登记');
}

function validateCsv(table, source) {
  same(table.fields, source.columns, source.path + '完整字段及顺序');
  if (table.fields.length !== source.column_count || table.rows.length !== source.row_count) fail(source.path + '原行列数不一致。');
  const keys = source.primary_key_columns;
  if (!Array.isArray(keys) || !keys.length || new Set(keys).size !== keys.length || keys.some(key => !table.fields.includes(key)) || source.primary_keys_unique !== true) fail(source.path + '主键声明无效。');
  const seen = new Set(), indices = keys.map(key => table.fields.indexOf(key));
  for (const row of table.rows) {
    if (!Array.isArray(row) || row.length !== table.fields.length || row.some(cell => typeof cell !== 'string')) fail(source.path + '原单元必须保持字符串/空字符串。');
    const values = indices.map(index => row[index]);
    if (values.some(value => value === '')) fail(source.path + '主键值缺失。');
    const key = JSON.stringify(values);
    if (seen.has(key)) fail(source.path + '复合主键重复。');
    seen.add(key);
  }
}

function position(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) fail('展示几何必须为原WGS84经纬度，不转换或补坐标。');
}
function line(value, ring = false) {
  if (!Array.isArray(value) || value.length < (ring ? 4 : 2)) fail('展示线/环坐标缺失。');
  value.forEach(position);
  if (ring) same(value[0], value.at(-1), '原多边形闭环');
}
function polygon(value) {
  if (!Array.isArray(value) || !value.length) fail('展示多边形环缺失。');
  value.forEach(ring => line(ring, true));
}
function validateGeoJson(value, source) {
  if (!record(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) fail(source.path + '必须保留原FeatureCollection。');
  finiteTree(value);
  same(Object.keys(value).sort(), [...source.top_level_keys].sort(), source.path + '完整顶层字段');
  same(value.coordinate_crs, source.coordinate_crs, source.path + '经纬度坐标系');
  same(value.analysis_crs, source.analysis_crs, source.path + '原分析坐标系');
  same(value.area_and_length_units, 'm2 and m measured in native EPSG:32648 before coordinate conversion', source.path + '面积长度原单位');
  same(value.adoption_state, 'pending_research_decision', source.path + '研究动作未采用');
  same(value.features.length, source.feature_count, source.path + '完整对象数量');
  const road = source.path.endsWith('/道路分区线支持_WGS84.geojson');
  for (const feature of value.features) {
    if (!record(feature) || feature.type !== 'Feature' || !record(feature.geometry) || !record(feature.properties)) fail('展示Feature/geometry/properties类型无效。');
    same(Object.keys(feature.properties).sort(), [...source.source_properties].sort(), source.path + '完整源属性');
    const geometry = feature.geometry;
    if (road && !['LineString', 'MultiLineString'].includes(geometry.type) || !road && !['Polygon', 'MultiPolygon'].includes(geometry.type)) fail('来源展示几何类型不可替换。');
    if (geometry.type === 'LineString') line(geometry.coordinates);
    else if (geometry.type === 'MultiLineString') {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) fail('多线段坐标缺失。');
      geometry.coordinates.forEach(value => line(value));
    } else if (geometry.type === 'Polygon') polygon(geometry.coordinates);
    else {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) fail('多面坐标缺失。');
      geometry.coordinates.forEach(polygon);
    }
    for (const key of ['research_action_adopted', 'accepted_ground_or_road_surface', 'road_width_accepted_m', 'road_area_allocated_m2', 'research_day_snapshot_adopted', 'implementation_permission']) {
      if (Object.hasOwn(feature.properties, key)) same(feature.properties[key], null, '原未采用字段.' + key);
    }
  }
}

async function verifyRegistration(registration) {
  const archive = sourcePreparationArchiveBytes(registration), sidecar = sourcePreparationManifestBytes(registration);
  if (await hash(archive) !== registration.archive.sha256) fail('原ZIP真实SHA256不匹配。');
  if (await hash(sidecar) !== registration.manifest_source.sha256) fail('原清单真实SHA256不匹配。');
  const expected = new Map([[MANIFEST_MEMBER, registration.manifest_source.bytes], ...registration.source_group.files.map(source => [source.path, source.bytes])]);
  const entries = inspectZipMembers(archive, expected);
  if (entries.length !== expected.size || entries.some(entry => entry.directory)) fail('原ZIP必须精确包含本组原件和清单，不允许目录项或额外成员。');
  let zip;
  try { zip = await JSZip.loadAsync(archive, { checkCRC32: true }); }
  catch (error) { fail('ZIP的CRC或读取核验失败：' + error.message); }
  const manifestBytes = await zip.file(MANIFEST_MEMBER).async('uint8array');
  if (manifestBytes.length !== registration.manifest_source.bytes || await hash(manifestBytes) !== registration.manifest_source.sha256) fail('ZIP内原清单SHA256或字节数不匹配。');
  if (manifestBytes.some((value, index) => value !== sidecar[index])) fail('清单原字节sidecar与ZIP不一致。');
  const manifest = parseStrictPreparationJson(utf8.decode(manifestBytes).replace(/^\uFEFF/, ''));
  validateManifest(manifest, registration);
  const sources = manifest.groups.find(group => group.group_id === registration.group_id).files;
  const files = {}, raw = {};
  for (const source of sources) {
    const bytes = await zip.file(source.path).async('uint8array');
    if (bytes.length !== source.bytes || await hash(bytes) !== source.sha256) fail('源件真实SHA256或字节数不匹配：' + source.path);
    raw[source.path] = bytes;
    if (['json', 'geojson', 'csv', 'md', 'py'].includes(source.file_kind)) {
      const text = utf8.decode(bytes);
      if (source.file_kind === 'csv') { files[source.path] = parseSupplementCsv(text); validateCsv(files[source.path], source); }
      else if (['json', 'geojson'].includes(source.file_kind)) {
        files[source.path] = parseStrictPreparationJson(text.replace(/^\uFEFF/, ''));
        if (source.file_kind === 'geojson') validateGeoJson(files[source.path], source);
      } else files[source.path] = text;
    } else if (!['png', 'svg', 'gpkg'].includes(source.file_kind)) fail('未知来源格式：' + source.path);
  }
  const view = { sources, files };
  const summary = validators[registration.group_id](view);
  for (const gate of [summary.operation_gates, summary.scientific_gates, summary.summary?.scientific_action_gates]) if (gate !== undefined) gates(gate, '语义核查科学/操作门控');
  return { registration, sources, files, raw, summary };
}

/** Each result keeps its authenticated snapshot, unaffected by later UI edits. */
export async function verifySourcePreparationRegistrations(registrations = []) {
  validateSourcePreparationRegistrations(registrations);
  const snapshots = structuredClone(registrations);
  const pairs = await Promise.all(snapshots.map(async registration => [registration.group_id, await verifyRegistration(registration)]));
  return Object.fromEntries(pairs);
}
