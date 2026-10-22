import proj4 from 'proj4';
import {validateConditionalSources,verifyConditionalSources,conditionalArchiveBytes,conditionalManifestBytes} from './conditional-source-state.js';
import {validateConditionalDrafts} from './conditional-drafts.js';
import JSZip from 'jszip';
import {validateResearchRegistrations, validateReadOnlySoftwareReceipt} from './research-state.js';
import {validatePreparationRegistration, verifyPreparationRegistration,parseStrictPreparationJson} from './preparation-state.js';
import {validateSupplementRegistrations,verifySupplementRegistrations,supplementArchiveBytes,inspectZipMembers,canonicalSupplement} from './supplement-state.js';
import {validateSourcePreparationRegistrations,verifySourcePreparationRegistrations,sourcePreparationArchiveBytes,sourcePreparationManifestBytes} from './source-preparation-state.js';
import {validateGeometrySourceRegistrations,verifyGeometrySourceRegistrations,geometrySourceArchiveBytes,geometrySourceManifestBytes} from './source-geometry-state.js';

export const PROJECT_SCHEMA = '0.1.local-view-handoff';
export const PROJECT_MAX_FILE_BYTES = 96_000_000;
export const PROJECT_ZIP_LIMITS = {archiveBytes:PROJECT_MAX_FILE_BYTES,memberBytes:48_000_000,totalBytes:160_000_000,maxEntries:256};
export const STORAGE_KEY = 'dense-block-green-workspace-v1';
export const EMPTY_COLLECTION = {type:'FeatureCollection', features:[]};
export const deepCopy = value => JSON.parse(JSON.stringify(value));

const AXES = ['file_acceptance','science_validation','integration','execution'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const isHash = value => typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value);
const isLonLat = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
const archiveLayerPath = name => 'layers/' + name.replace(/[^a-zA-Z0-9_-]/g,'_') + '.geojson';
const PREPARATION_KIND = 'research_input_preparation_not_platform_project';
const PREPARATION_PROJECT_ERROR = '这是研究输入准备包（research_input_preparation_not_platform_project）；请使用准备材料接纳入口，不能作为场地交接包重开。';
const PREPARATION_TOLERANCE_M = 0.05;

function requireUniqueIds(records,key,label) {
  if (!Array.isArray(records)) throw new Error(label + '必须为列表。');
  const seen = new Set();
  records.forEach(record => {
    if (!isRecord(record) || !hasText(record[key])) throw new Error(label + '缺少' + key + '。');
    if (seen.has(record[key])) throw new Error(label + '存在重复ID：' + record[key] + '。');
    seen.add(record[key]);
  });
}

function validateAxes(record,label) {
  AXES.forEach(axis => {
    if (!isRecord(record[axis]) || !hasText(record[axis].state)) throw new Error(label + '缺少原始' + axis + '状态。');
  });
}

function matchingMeters(actual,expected) {
  return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length &&
    actual.every((value,index)=>Number.isFinite(value) && Number.isFinite(expected[index]) && Math.abs(value-expected[index]) <= PREPARATION_TOLERANCE_M);
}

function validatePreparationSite(registration,scene,layers) {
  if (registration.site_id !== scene?.site_id) throw new Error('准备登记场地与当前场景不匹配；不能将试点准备材料用于其他位置。');
  const preparedScopes = registration.manifest.scope_registry;
  const preparedCore = preparedScopes.find(scope=>scope.support_id === 'core_100');
  if (!isLonLat(scene.center_lon_lat) || !Array.isArray(preparedCore?.bounds_m) || preparedCore.bounds_m.length !== 4) throw new Error('准备登记缺少有效试点中心或核心范围。');
  const bounds = preparedCore.bounds_m;
  const expectedCenter = [(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
  if (!matchingMeters(proj4('EPSG:4326','EPSG:32648',scene.center_lon_lat),expectedCenter)) throw new Error('准备登记试点中心与当前场景不匹配；同名位置不能替代原试点。');
  for (const prepared of preparedScopes.filter(scope=>[100,300,500].includes(scope.width_m))) {
    const saved = scene.scope_registry?.find(scope=>scope.support_id === prepared.support_id);
    if (!saved || saved.role !== prepared.role || saved.width_m !== prepared.width_m ||
        saved.bounds_m != null && !matchingMeters(saved.bounds_m,prepared.bounds_m)) throw new Error('准备登记的100/300/500米范围与场景角色或边界不匹配。');
  }
  const solver = scene.scope_registry?.find(scope=>scope.support_id === 'physical_solver_domain');
  if (!solver || solver.role !== 'solver_domain' || solver.width_m !== null || solver.bounds_m !== null || solver.status !== 'not_defined') throw new Error('准备登记的物理求解域必须保持未定义及空值。');
  const coreLayers = [layers?.core];
  if (scene.layers !== undefined && scene.layers !== layers) coreLayers.push(scene.layers?.core);
  for (const core of coreLayers) {
    if (!core) throw new Error('准备登记缺少对应试点核心图层。');
    validateCollection(core);
    const coordinates = core.features.flatMap(feature=>coordinatesOf(feature.geometry));
    if (!coordinates.length) throw new Error('准备登记的试点核心图层为空。');
    const actual = coordinates.map(coordinate=>proj4('EPSG:4326','EPSG:32648',coordinate)).reduce((box,coordinate)=>[
      Math.min(box[0],coordinate[0]),Math.min(box[1],coordinate[1]),Math.max(box[2],coordinate[0]),Math.max(box[3],coordinate[1])
    ],[Infinity,Infinity,-Infinity,-Infinity]);
    if (!matchingMeters(actual,bounds)) throw new Error('准备登记试点核心几何与原100米边界不匹配。');
  }
}

function validatePreparationRegistrations(registrations,scene,layers,imports=[]) {
  requireUniqueIds(registrations,'registration_id','准备登记');
  if (registrations.length && (!Array.isArray(imports) || imports.length > 0 || scene?.imports != null && (!Array.isArray(scene.imports) || scene.imports.length > 0))) throw new Error('用户导入场地不能复用原试点准备登记。');
  registrations.forEach(registration => {
    validatePreparationRegistration(registration);
    validatePreparationSite(registration,scene,layers);
  });
}

async function verifyProjectPreparations(project) {
  if (Object.hasOwn(project,'preparationRegistrations')) {
    await Promise.all(project.preparationRegistrations.map(registration=>verifyPreparationRegistration(registration)));
  }
  if(Object.hasOwn(project,'supplementRegistrations')) await verifySupplementRegistrations(project.supplementRegistrations);
  if(Object.hasOwn(project,'sourcePreparationRegistrations')) await verifySourcePreparationRegistrations(project.sourcePreparationRegistrations);
  if(Object.hasOwn(project,'geometrySourceRegistrations')) await verifyGeometrySourceRegistrations(project.geometrySourceRegistrations);
  const conditionalViews=await verifyConditionalSources(project.conditionalSourceRegistrations||[]);
  validateConditionalDrafts(project.conditionalScenarioDrafts||[],project.conditionalSourceRegistrations||[],conditionalViews,[...(project.preparationRegistrations||[]),...(project.sourcePreparationRegistrations||[]),...(project.geometrySourceRegistrations||[])]);
}

function validateDeclaredCrs(collection) {
  if (!Object.hasOwn(collection,'crs')) return;
  const crs = collection.crs;
  const name = typeof crs === 'string' ? crs : crs?.type === 'name' ? crs.properties?.name : null;
  const accepted = ['EPSG:4326','OGC:CRS84','urn:ogc:def:crs:EPSG::4326','urn:ogc:def:crs:OGC:1.3:CRS84','http://www.opengis.net/def/crs/EPSG/0/4326'];
  if (!accepted.includes(name)) throw new Error('GeoJSON明确声明了其他或未知坐标系；请先转为WGS84经纬度。');
}

function validateGeometry(geometry,label,depth=0) {
  if (!isRecord(geometry) || depth > 32) throw new Error(label + '缺少有效几何。');
  const position = c => Array.isArray(c) && c.length >= 2 && c.every(Number.isFinite) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
  const line = c => Array.isArray(c) && c.length >= 2 && c.every(position);
  const ring = c => Array.isArray(c) && c.length >= 4 && c.every(position) && c[0].length === c.at(-1).length && c[0].every((v,i)=>v === c.at(-1)[i]);
  const polygon = c => Array.isArray(c) && c.length > 0 && c.every(ring);
  const list = (c,test) => Array.isArray(c) && c.length > 0 && c.every(test);
  const coords = geometry.coordinates;
  const checks = {
    Point:()=>position(coords),
    MultiPoint:()=>list(coords,position),
    LineString:()=>line(coords),
    MultiLineString:()=>list(coords,line),
    Polygon:()=>polygon(coords),
    MultiPolygon:()=>list(coords,polygon),
    GeometryCollection:()=>list(geometry.geometries,g=>{validateGeometry(g,label,depth+1);return true;})
  };
  if (!Object.hasOwn(checks,geometry.type) || !checks[geometry.type]()) throw new Error(label + '几何结构或坐标不符合WGS84经纬度。');
}

export function coordinatesOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'GeometryCollection') return (geometry.geometries || []).flatMap(coordinatesOf);
  const result = [];
  function walk(value) {
    if (Array.isArray(value) && typeof value[0] === 'number') result.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
  }
  walk(geometry.coordinates);
  return result;
}

export function validateCollection(collection) {
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('需要GeoJSON FeatureCollection。');
  validateDeclaredCrs(collection);
  if (collection.features.length > 10000) throw new Error('首版单层最多浏览10,000个要素，请先提供有来源记录的场地子集。');
  const seen = new Set();
  collection.features.forEach((feature,index) => {
    const label = '第' + (index+1) + '个要素';
    if (!isRecord(feature) || feature.type !== 'Feature' || !feature.geometry) throw new Error(label + '缺少几何。');
    if (feature.properties !== undefined && feature.properties !== null && !isRecord(feature.properties)) throw new Error(label + '属性必须为对象或空值。');
    validateGeometry(feature.geometry,label);
    const id = feature.id ?? feature.properties?.source_id ?? feature.properties?.id ?? feature.properties?.__platform_object_id;
    if (id !== undefined && id !== null) {
      if (!(hasText(id) || typeof id === 'number' && Number.isFinite(id))) throw new Error(label + '源对象ID无效。');
      if (seen.has(String(id))) throw new Error('源对象ID重复：' + id + '。请核对后再导入。');
      seen.add(String(id));
    }
  });
  return collection;
}

export function boundsOf(collection) {
  const coords = (collection?.features || []).flatMap(f => coordinatesOf(f.geometry));
  if (!coords.length) return null;
  return coords.reduce((b,c) => [Math.min(b[0],c[0]), Math.min(b[1],c[1]), Math.max(b[2],c[0]), Math.max(b[3],c[1])], [Infinity,Infinity,-Infinity,-Infinity]);
}

export function scopesFor(center) {
  if (!isLonLat(center) || center[0]<102 || center[0]>108 || center[1]<0 || center[1]>84) throw new Error('此首版米制范围工具限定UTM48N经度带；其他区域需另选合适的计量投影。');
  const [e,n] = proj4('EPSG:4326','EPSG:32648',center);
  const square = (width,role) => {
    const half = width/2;
    const bounds = [e-half,n-half,e+half,n+half];
    const ring = [[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]],[bounds[0],bounds[1]]].map(c => proj4('EPSG:32648','EPSG:4326',c));
    return {type:'FeatureCollection',features:[{type:'Feature',id:role,properties:{role,width_m:width,area_m2:width*width,derivation:'platform_declared_meter_view_not_solver_domain'},geometry:{type:'Polygon',coordinates:[ring]}}]};
  };
  return {core:square(100,'user_core_preview'), macro_context300:square(300,'surrounding_view_preview')};
}

export function validateProject(value) {
  if (value?.package_kind === PREPARATION_KIND) throw new Error(PREPARATION_PROJECT_ERROR);
  if (!isRecord(value) || value.export_schema_version !== PROJECT_SCHEMA || !isRecord(value.sourcePackage) || !isRecord(value.scene) || !isRecord(value.uiState) || !isRecord(value.layers)) throw new Error('该文件不是本平台保存的场地交接包。');
  const source = value.sourcePackage;
  if (source.schema_version !== '0.1.local-reference' || !hasText(source.package_id) || !hasText(source.package_version)) throw new Error('交接包缺少受支持的来源清单身份与版本。');
  requireUniqueIds(source.artifacts,'artifact_id','来源清单');
  if (!Number.isInteger(source.artifact_count) || source.artifact_count !== source.artifacts.length) throw new Error('来源清单登记数量与源件列表不一致。');
  source.artifacts.forEach(artifact => {
    if (!isHash(artifact.sha256)) throw new Error('源件' + artifact.artifact_id + '缺少有效SHA256。');
    validateAxes(artifact,'源件' + artifact.artifact_id);
  });
  requireUniqueIds(source.capabilities,'capability_id','能力清单');
  source.capabilities.forEach(capability => {
    if (!hasText(capability.question)) throw new Error('能力' + capability.capability_id + '缺少问题说明。');
  });
  const scene = value.scene;
  if (!hasText(scene.site_id) || !hasText(scene.scenario_id) || !hasText(scene.scenario_type) || !isLonLat(scene.center_lon_lat)) throw new Error('交接包缺少场地/方案身份或有效位置。');
  requireUniqueIds(scene.scope_registry,'support_id','范围登记');
  scene.scope_registry.forEach(scope => {
    if (!Object.hasOwn(scope,'width_m') || scope.width_m !== null && (!Number.isFinite(scope.width_m) || scope.width_m <= 0)) throw new Error('范围' + scope.support_id + '尺寸无效；待定义范围必须保留空值。');
    if (scope.bounds_m != null && (!Array.isArray(scope.bounds_m) || scope.bounds_m.length !== 4 || !scope.bounds_m.every(Number.isFinite) || scope.bounds_m[0] >= scope.bounds_m[2] || scope.bounds_m[1] >= scope.bounds_m[3])) throw new Error('范围' + scope.support_id + '坐标边界无效。');
  });
  const paths = new Set();
  Object.entries(value.layers).forEach(([name,collection]) => {
    if (!hasText(name)) throw new Error('交接包图层名称为空。');
    validateCollection(collection);
    const path = archiveLayerPath(name);
    if (paths.has(path)) throw new Error('图层名称产生相同导出文件名；请保留唯一图层身份。');
    paths.add(path);
  });
  if (scene.layers !== undefined) {
    if (!isRecord(scene.layers)) throw new Error('场景图层登记无效。');
    Object.values(scene.layers).forEach(validateCollection);
  }
  if (!isLonLat(value.uiState.center)) throw new Error('保存的位置无效。');
  if (!['region','site'].includes(value.uiState.stage)) throw new Error('保存的视图状态无效。');
  if (!hasText(value.uiState.region) || typeof value.uiState.drawer !== 'string' || typeof value.uiState.preview !== 'boolean' || typeof value.uiState.offline !== 'boolean' || !isRecord(value.uiState.visible)) throw new Error('保存的视图设置结构无效。');
  const visible = value.uiState.visible;
  if (!['bounds','buildings','vegetation','roads','receptors','regional'].every(key=>typeof visible[key] === 'boolean') || visible.roads_snapshot !== undefined && typeof visible.roads_snapshot !== 'string' || visible.greenFx !== undefined && typeof visible.greenFx !== 'boolean') throw new Error('保存的图层显示设置无效。');
  const selected = value.uiState.selectedReference;
  if (selected != null && (!isRecord(selected) || !hasText(selected.layerKey) || !(hasText(selected.id) || typeof selected.id === 'number' && Number.isFinite(selected.id) || hasText(selected.platformId)))) throw new Error('保存的对象身份引用无效。');
  const camera = value.uiState.camera;
  if (camera != null && (!isRecord(camera) || !isLonLat(camera.center) || !['zoom','bearing','pitch'].every(key=>Number.isFinite(camera[key])) || camera.zoom < 0 || camera.zoom > 24 || camera.pitch < 0 || camera.pitch > 85)) throw new Error('保存的相机状态无效。');
  if (!Array.isArray(value.imports)) throw new Error('交接包缺少导入记录列表。');
  value.imports.forEach(item => {
    if (!isRecord(item) || !hasText(item.file_name) || !isHash(item.sha256)) throw new Error('导入记录缺少文件身份或SHA256。');
    validateAxes(item,'导入记录');
  });
  if (!isRecord(value.software_receipt) || !hasText(value.software_receipt.science_validation) || !hasText(value.software_receipt.research_execution)) throw new Error('交接包缺少独立的软件操作记录。');
  validateReadOnlySoftwareReceipt(value.software_receipt);
  if (Object.hasOwn(value,'researchRegistrations')) validateResearchRegistrations(value.researchRegistrations);
  if (Object.hasOwn(value,'preparationRegistrations')) validatePreparationRegistrations(value.preparationRegistrations,scene,value.layers,value.imports);
  if(Object.hasOwn(value,'supplementRegistrations')) validateSupplementRegistrations(value.supplementRegistrations);
  if(Object.hasOwn(value,'sourcePreparationRegistrations')) {
    if(!Array.isArray(value.sourcePreparationRegistrations)) throw new Error('来源准备登记字段必须为列表；缺省与显式空数组应分别保存。');
    validateSourcePreparationRegistrations(value.sourcePreparationRegistrations);
  }
  if(Object.hasOwn(value,'geometrySourceRegistrations')) {
    if(!Array.isArray(value.geometrySourceRegistrations)) throw new Error('几何与对象来源登记必须为列表；缺省与显式空数组分别保存。');
    validateGeometrySourceRegistrations(value.geometrySourceRegistrations);
  }
  if(Object.hasOwn(value,'conditionalSourceRegistrations')) validateConditionalSources(value.conditionalSourceRegistrations);
  if(Object.hasOwn(value,'conditionalScenarioDrafts')) validateConditionalDrafts(value.conditionalScenarioDrafts,value.conditionalSourceRegistrations||[],null,[...(value.preparationRegistrations||[]),...(value.sourcePreparationRegistrations||[]),...(value.geometrySourceRegistrations||[])]);
  return value;
}

export function parseProjectJson(text) { return validateProject(parseStrictPreparationJson(text)); }

export function createProject(sourcePackage,scene,uiState,layers,imports=[],researchRegistrations=[],preparationRegistrations=[],supplementRegistrations=undefined,sourcePreparationRegistrations=undefined,geometrySourceRegistrations=undefined,conditionalSourceRegistrations=undefined,conditionalScenarioDrafts=undefined) {
  // Validate before JSON copying, which would otherwise turn NaN/Infinity into null.
  validateResearchRegistrations(researchRegistrations);
  validatePreparationRegistrations(preparationRegistrations,scene,layers,imports);
  if(supplementRegistrations!==undefined) validateSupplementRegistrations(supplementRegistrations);
  if(sourcePreparationRegistrations!==undefined) validateSourcePreparationRegistrations(sourcePreparationRegistrations);
  if(geometrySourceRegistrations!==undefined) validateGeometrySourceRegistrations(geometrySourceRegistrations);
  if(conditionalSourceRegistrations!==undefined)validateConditionalSources(conditionalSourceRegistrations);
  if(conditionalScenarioDrafts!==undefined)validateConditionalDrafts(conditionalScenarioDrafts,conditionalSourceRegistrations||[],null,[...preparationRegistrations,...(sourcePreparationRegistrations||[]),...(geometrySourceRegistrations||[])]);
  return deepCopy({...(conditionalSourceRegistrations===undefined?{}:{conditionalSourceRegistrations}),...(conditionalScenarioDrafts===undefined?{}:{conditionalScenarioDrafts}),...(supplementRegistrations===undefined?{}:{supplementRegistrations}),...(sourcePreparationRegistrations===undefined?{}:{sourcePreparationRegistrations}),...(geometrySourceRegistrations===undefined?{}:{geometrySourceRegistrations}),export_schema_version:PROJECT_SCHEMA,exported_at:new Date().toISOString(),package_kind:'display_copies_and_source_references_not_complete_research_release',sourcePackage,scene,layers,uiState,imports,researchRegistrations,preparationRegistrations,software_receipt:{operation:'save_or_export_display_project',file_acceptance:'readable_display_data',science_validation:'not_upgraded',integration:'local_browser_workflow',research_execution:'not_requested',prediction_enabled:false,physics_enabled:false,optimal_recommendation_enabled:false}});
}

export async function makeArchive(project) {
  const savedProject = deepCopy(validateProject(project));
  await verifyProjectPreparations(savedProject);
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(savedProject,null,2));
  if (Object.hasOwn(savedProject,'researchRegistrations')) zip.file('research/registrations.json',JSON.stringify(savedProject.researchRegistrations,null,2));
  if (Object.hasOwn(savedProject,'preparationRegistrations')) zip.file('preparation/registrations.json',JSON.stringify(savedProject.preparationRegistrations,null,2));
  if(Object.hasOwn(savedProject,'supplementRegistrations')) {
    zip.file('supplements/registrations.json',JSON.stringify(savedProject.supplementRegistrations,null,2));
    for(const r of savedProject.supplementRegistrations) zip.file('supplements/'+r.group_id+'.zip',supplementArchiveBytes(r),{createFolders:false});
  }
  if(Object.hasOwn(savedProject,'sourcePreparationRegistrations')) {
    zip.file('source-preparation/registrations.json',JSON.stringify(savedProject.sourcePreparationRegistrations,null,2),{createFolders:false});
    if(savedProject.sourcePreparationRegistrations.length) zip.file('source-preparation/source-manifest.json',sourcePreparationManifestBytes(savedProject.sourcePreparationRegistrations[0]),{createFolders:false});
    for(const r of savedProject.sourcePreparationRegistrations) {
      const archive=sourcePreparationArchiveBytes(r);
      zip.file('source-preparation/'+r.group_id+'.zip',archive,{createFolders:false});
      const sourceZip=await JSZip.loadAsync(archive,{checkCRC32:true});
      for(const s of r.source_group.files) zip.file('source-preparation/inputs/'+s.path,await sourceZip.file(s.path).async('uint8array'),{createFolders:false});
    }
  }
  if(Object.hasOwn(savedProject,'geometrySourceRegistrations')) {
    zip.file('geometry-source/registrations.json',JSON.stringify(savedProject.geometrySourceRegistrations,null,2),{createFolders:false});
    if(savedProject.geometrySourceRegistrations.length) zip.file('geometry-source/source-manifest.json',geometrySourceManifestBytes(savedProject.geometrySourceRegistrations[0]),{createFolders:false});
    for(const registration of savedProject.geometrySourceRegistrations) {
      const bytes=geometrySourceArchiveBytes(registration);
      zip.file('geometry-source/'+registration.group_id+'.zip',bytes,{createFolders:false});
      const sourceZip=await JSZip.loadAsync(bytes,{checkCRC32:true});
      for(const source of registration.source_group.source_files) zip.file('geometry-source/inputs/'+source.path,await sourceZip.file(source.path).async('uint8array'),{createFolders:false});
    }
  }
  if(Object.hasOwn(savedProject,'conditionalSourceRegistrations')) {
    zip.file('conditional-sources/registrations.json',JSON.stringify(savedProject.conditionalSourceRegistrations,null,2),{createFolders:false});
    if(savedProject.conditionalSourceRegistrations.length) {
      const first=savedProject.conditionalSourceRegistrations[0];
      zip.file('conditional-sources/source-manifest.json',conditionalManifestBytes(first),{createFolders:false});
      zip.file('conditional-sources/original-source.zip',conditionalArchiveBytes(first),{createFolders:false});
      const sourceZip=await JSZip.loadAsync(conditionalArchiveBytes(first),{checkCRC32:true});
      for(const r of savedProject.conditionalSourceRegistrations)for(const f of r.source_group.files)zip.file('conditional-sources/inputs/'+f.path,await sourceZip.file(f.path).async('uint8array'),{createFolders:false});
    }
  }
  if(Object.hasOwn(savedProject,'conditionalScenarioDrafts'))zip.file('conditional-scenarios/drafts.json',JSON.stringify(savedProject.conditionalScenarioDrafts,null,2),{createFolders:false});
  let handoffText='# 场地浏览交接包\n\n本包保存场地展示副本、源件引用与哈希、范围、原研究状态及视图。并不包含24个完整研究原文件，源件许可尚未用于公开分发审查。\n\n重新打开本平台，选择“重开交接包”，导入本ZIP或project.json。保持空值和未计算状态；软件回读不升级科学验证。\n';
  if(savedProject.sourcePreparationRegistrations?.length) {
    const registrations=savedProject.sourcePreparationRegistrations;
    const sourceCount=registrations.reduce((count,r)=>count+r.source_group.files.length,0);
    handoffText+='\n本次另含'+registrations.length+'组已显式登记的来源准备资料、'+sourceCount+'个完整来源文件的原字节、各原组ZIP及原source-manifest.json（source-preparation/source-manifest.json）。来源文件位于source-preparation/inputs/，实际嵌入范围以当前登记的组和成员为准；原清单保留完整三组元数据，子集登记不代表交付其余未选组。\n\n上述准备资料原字节与sourcePackage中的24个历史研究源件引用分别保存。PBF、全年天气ZIP及上游原场地资产不属于这批来源文件交付，仍保留为来源引用。保存源码文本不执行producer；来源诊断、候选表示和软件核查不改变科学准入或开放研究计算。\n';
  }
  if(savedProject.geometrySourceRegistrations?.length) {
    const registrations=savedProject.geometrySourceRegistrations;
    const files=registrations.flatMap(registration=>registration.source_group.source_files);
    handoffText+='\n本轮独立追加'+registrations.length+'组来源几何与对象资料、'+files.length+'件原文件，其中'+files.filter(file=>file.role==='retained_unaccepted_schema_history').length+'件未接受历史。原字节保存在geometry-source/inputs/，三组ZIP和原manifest分别保留；默认地图及主表不使用未接受历史。32,400方向记录为同六候选点的离散采样，SVF仅限工作建筑几何。精确角点切线失败、严格equals失败和数值限定复核分别保留，软件重开不能改写科学状态。完整中国PBF和祖先场地GPKG是外部引用；小型提取PBF属于实际72件原文件时按原字节交付。未生成物理温差、入口、合法步行、路线、实际服务或推荐。\n';
  }
  if(savedProject.conditionalSourceRegistrations?.length)handoffText+='\n条件来源独立保存在conditional-sources/，含冻结清单、完整原来源ZIP及所登记组原件；历史文件只保留回读。两个独立情景草稿位于conditional-scenarios/drafts.json，来源引用与编辑均不采用研究输入，不产生路线、温度、服务、舒适、公平或推荐。\n';
  zip.file('交接说明.md',handoffText);
  for (const [name,collection] of Object.entries(savedProject.layers)) zip.file(archiveLayerPath(name),JSON.stringify(collection));
  if(Object.hasOwn(savedProject,'supplementRegistrations')||Object.hasOwn(savedProject,'sourcePreparationRegistrations')||Object.hasOwn(savedProject,'geometrySourceRegistrations')||Object.hasOwn(savedProject,'conditionalSourceRegistrations')||Object.hasOwn(savedProject,'conditionalScenarioDrafts')) {
    const members=[];for(const [path,entry] of Object.entries(zip.files)) if(!entry.dir){const bytes=await entry.async('uint8array');members.push({path,bytes:bytes.length,sha256:await digest(bytes)});}
    zip.file('archive-receipt.json',JSON.stringify({schema_version:'0.1.project-member-hashes',members},null,2),{createFolders:false});
  }
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isRecord(value)) return '{' + Object.keys(value).sort().map(key=>JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function archiveMemberPaths(project) {
  const paths=['project.json','交接说明.md',...Object.keys(project.layers).map(archiveLayerPath)];
  if(Object.hasOwn(project,'researchRegistrations')) paths.push('research/registrations.json');
  if(Object.hasOwn(project,'preparationRegistrations')) paths.push('preparation/registrations.json');
  if(Object.hasOwn(project,'supplementRegistrations')) paths.push('supplements/registrations.json',...project.supplementRegistrations.map(r=>'supplements/'+r.group_id+'.zip'));
  if(Object.hasOwn(project,'sourcePreparationRegistrations')) {
    paths.push('source-preparation/registrations.json');
    if(project.sourcePreparationRegistrations.length) paths.push('source-preparation/source-manifest.json');
    for(const r of project.sourcePreparationRegistrations) paths.push('source-preparation/'+r.group_id+'.zip',...r.source_group.files.map(s=>'source-preparation/inputs/'+s.path));
  }
  if(Object.hasOwn(project,'geometrySourceRegistrations')) {
    paths.push('geometry-source/registrations.json');
    if(project.geometrySourceRegistrations.length) paths.push('geometry-source/source-manifest.json');
    for(const registration of project.geometrySourceRegistrations) paths.push('geometry-source/'+registration.group_id+'.zip',...registration.source_group.source_files.map(source=>'geometry-source/inputs/'+source.path));
  }
  if(Object.hasOwn(project,'conditionalSourceRegistrations')) {
    paths.push('conditional-sources/registrations.json');
    if(project.conditionalSourceRegistrations.length)paths.push('conditional-sources/source-manifest.json','conditional-sources/original-source.zip');
    for(const r of project.conditionalSourceRegistrations)paths.push(...r.source_group.files.map(f=>'conditional-sources/inputs/'+f.path));
  }
  if(Object.hasOwn(project,'conditionalScenarioDrafts'))paths.push('conditional-scenarios/drafts.json');
  return paths;
}

async function verifyArchiveMirror(zip,path,expected,label,sha256) {
  const entry=zip.file(path);if(!entry)throw new Error('ZIP缺少'+label+'：'+path);
  const bytes=await entry.async('uint8array');
  if(bytes.length!==expected.length||bytes.some((byte,index)=>byte!==expected[index])||sha256&&await digest(bytes)!==sha256) throw new Error('ZIP'+label+'与登记原字节不一致：'+path);
}

export async function parseArchive(bytes) {
  inspectZipMembers(bytes,null,PROJECT_ZIP_LIMITS);
  const zip = await JSZip.loadAsync(bytes,{checkCRC32:true});
  const preparationManifest = zip.file('准备清单.json');
  if (preparationManifest) {
    const manifestText = await preparationManifest.async('string');
    if (manifestText.length > 30000000) throw new Error('准备清单JSON超过首版30MB读取限额。');
    if (JSON.parse(manifestText)?.package_kind === PREPARATION_KIND) throw new Error(PREPARATION_PROJECT_ERROR);
  }
  const entry = zip.file('project.json');
  if (!entry) throw new Error('ZIP缺少project.json；请选择本平台导出的交接包。');
  const text = await entry.async('string');
  if (text.length > 30000000) throw new Error('项目JSON超过首版30MB读取限额。');
  const project = parseProjectJson(text);
  if (Object.hasOwn(project,'researchRegistrations')) {
    const registrationEntry = zip.file('research/registrations.json');
    if (!registrationEntry) throw new Error('ZIP缺少科研登记文件research/registrations.json。');
    const registrationText = await registrationEntry.async('string');
    if (registrationText.length > 30000000) throw new Error('科研登记JSON超过首版30MB读取限额。');
    const registrations = parseStrictPreparationJson(registrationText);
    validateResearchRegistrations(registrations);
    if (canonicalJson(registrations) !== canonicalJson(project.researchRegistrations)) throw new Error('ZIP科研登记文件与项目登记不一致。');
  }
  const preparationEntry = zip.file('preparation/registrations.json');
  if (Object.hasOwn(project,'preparationRegistrations')) {
    if (!preparationEntry) throw new Error('ZIP缺少准备登记文件preparation/registrations.json。');
    const preparationText = await preparationEntry.async('string');
    if (preparationText.length > 30000000) throw new Error('准备登记JSON超过首版30MB读取限额。');
    const registrations = parseStrictPreparationJson(preparationText);
    validatePreparationRegistrations(registrations,project.scene,project.layers,project.imports);
    if (canonicalJson(registrations) !== canonicalJson(project.preparationRegistrations)) throw new Error('ZIP准备登记文件与项目登记不一致。');
  } else if (preparationEntry) {
    throw new Error('ZIP准备登记文件没有对应项目登记。');
  }
  const supplementEntry=zip.file('supplements/registrations.json');
  if(Object.hasOwn(project,'supplementRegistrations')) {
    if(!supplementEntry) throw new Error('ZIP缺少五组成果登记。');
    const registrations=parseStrictPreparationJson(await supplementEntry.async('string'));
    validateSupplementRegistrations(registrations);
    if(canonicalSupplement(registrations)!==canonicalSupplement(project.supplementRegistrations)) throw new Error('ZIP成果旁表与工程登记不一致。');
    for(const r of registrations){const member=zip.file('supplements/'+r.group_id+'.zip');if(!member)throw new Error('ZIP缺少成果原字节包：'+r.group_id);const b=await member.async('uint8array');if(b.length!==r.archive.bytes||await digest(b)!==r.archive.sha256)throw new Error('ZIP成果包与工程原字节不一致。');}
  }else if(supplementEntry||Object.keys(zip.files).some(p=>p.startsWith('supplements/')&&!zip.files[p].dir))throw new Error('ZIP成果旁表没有对应工程登记。');
  const sourcePreparationEntry=zip.file('source-preparation/registrations.json');
  if(Object.hasOwn(project,'sourcePreparationRegistrations')) {
    if(!sourcePreparationEntry)throw new Error('ZIP缺少三组来源准备登记source-preparation/registrations.json。');
    const registrationText=await sourcePreparationEntry.async('string');
    if(registrationText.length>30000000)throw new Error('来源准备登记JSON超过首版30MB读取限额。');
    const registrations=parseStrictPreparationJson(registrationText);
    validateSourcePreparationRegistrations(registrations);
    if(canonicalJson(registrations)!==canonicalJson(project.sourcePreparationRegistrations))throw new Error('ZIP来源准备旁表与工程登记不一致。');
    if(registrations.length) await verifyArchiveMirror(zip,'source-preparation/source-manifest.json',sourcePreparationManifestBytes(registrations[0]),'来源准备原清单',registrations[0].manifest_source.sha256);
    for(const r of registrations) {
      const expectedArchive=sourcePreparationArchiveBytes(r);
      await verifyArchiveMirror(zip,'source-preparation/'+r.group_id+'.zip',expectedArchive,'来源准备原组包',r.archive.sha256);
      const sourceZip=await JSZip.loadAsync(expectedArchive,{checkCRC32:true});
      for(const s of r.source_group.files) await verifyArchiveMirror(zip,'source-preparation/inputs/'+s.path,await sourceZip.file(s.path).async('uint8array'),'来源准备源件副本',s.sha256);
    }
  }else if(sourcePreparationEntry||Object.keys(zip.files).some(p=>p.startsWith('source-preparation/')&&!zip.files[p].dir))throw new Error('ZIP来源准备成员没有对应工程登记。');
  const geometryEntry=zip.file('geometry-source/registrations.json');
  if(Object.hasOwn(project,'geometrySourceRegistrations')) {
    if(!geometryEntry) throw new Error('ZIP缺少几何与对象来源登记。');
    const text=await geometryEntry.async('string');
    if(text.length>30_000_000) throw new Error('几何与对象来源登记超出30MB读取限额。');
    const registrations=parseStrictPreparationJson(text);
    validateGeometrySourceRegistrations(registrations);
    if(canonicalJson(registrations)!==canonicalJson(project.geometrySourceRegistrations)) throw new Error('ZIP几何来源旁表与工程登记不一致。');
    if(registrations.length) await verifyArchiveMirror(zip,'geometry-source/source-manifest.json',geometrySourceManifestBytes(registrations[0]),'几何来源原清单',registrations[0].manifest_source.sha256);
    for(const registration of registrations) {
      const archive=geometrySourceArchiveBytes(registration);
      await verifyArchiveMirror(zip,'geometry-source/'+registration.group_id+'.zip',archive,'几何来源原组包',registration.archive.sha256);
      const sourceZip=await JSZip.loadAsync(archive,{checkCRC32:true});
      for(const source of registration.source_group.source_files) await verifyArchiveMirror(zip,'geometry-source/inputs/'+source.path,await sourceZip.file(source.path).async('uint8array'),'几何来源原件',source.sha256);
    }
  } else if(geometryEntry||Object.keys(zip.files).some(path=>path.startsWith('geometry-source/')&&!zip.files[path].dir)) throw new Error('ZIP几何来源成员没有对应工程登记。');
  const conditionalEntry=zip.file('conditional-sources/registrations.json');
  if(Object.hasOwn(project,'conditionalSourceRegistrations')) {
    if(!conditionalEntry)throw new Error('ZIP缺少条件来源登记。');
    const registrations=parseStrictPreparationJson(await conditionalEntry.async('string'));
    validateConditionalSources(registrations);
    if(canonicalJson(registrations)!==canonicalJson(project.conditionalSourceRegistrations))throw new Error('ZIP条件来源旁表与工程不同。');
    if(registrations.length) {
      const first=registrations[0];
      await verifyArchiveMirror(zip,'conditional-sources/source-manifest.json',conditionalManifestBytes(first),'条件来源原清单',first.manifest_source.sha256);
      await verifyArchiveMirror(zip,'conditional-sources/original-source.zip',conditionalArchiveBytes(first),'条件来源原ZIP',first.archive.sha256);
      const sourceZip=await JSZip.loadAsync(conditionalArchiveBytes(first),{checkCRC32:true});
      for(const r of registrations)for(const f of r.source_group.files)await verifyArchiveMirror(zip,'conditional-sources/inputs/'+f.path,await sourceZip.file(f.path).async('uint8array'),'条件来源原件',f.sha256);
    }
  } else if(Object.keys(zip.files).some(p=>p.startsWith('conditional-sources/')&&!zip.files[p].dir))throw new Error('条件来源成员没有对应工程登记。');
  const draftsEntry=zip.file('conditional-scenarios/drafts.json');
  if(Object.hasOwn(project,'conditionalScenarioDrafts')) {
    if(!draftsEntry||canonicalJson(parseStrictPreparationJson(await draftsEntry.async('string')))!==canonicalJson(project.conditionalScenarioDrafts))throw new Error('情景草稿旁表与工程不同。');
  }else if(Object.keys(zip.files).some(p=>p.startsWith('conditional-scenarios/')&&!zip.files[p].dir))throw new Error('情景草稿成员没有对应工程登记。');
  if(Object.hasOwn(project,'supplementRegistrations')||Object.hasOwn(project,'sourcePreparationRegistrations')||Object.hasOwn(project,'geometrySourceRegistrations')||Object.hasOwn(project,'conditionalSourceRegistrations')||Object.hasOwn(project,'conditionalScenarioDrafts')) {
    const memberPaths=archiveMemberPaths(project);
    inspectZipMembers(bytes,new Map([...memberPaths,'archive-receipt.json'].map(p=>[p,null])),PROJECT_ZIP_LIMITS);
    const receiptEntry=zip.file('archive-receipt.json');if(!receiptEntry)throw new Error('ZIP缺少成员哈希回执。');
    const receipt=parseStrictPreparationJson(await receiptEntry.async('string'));
    if(canonicalSupplement(Object.keys(receipt).sort())!==canonicalSupplement(['members','schema_version'])||receipt.schema_version!=='0.1.project-member-hashes'||!Array.isArray(receipt.members)||receipt.members.length!==memberPaths.length)throw new Error('ZIP成员回执字段或版本无效。');
    const seen=new Set();for(const m of receipt.members){if(!m||canonicalSupplement(Object.keys(m).sort())!==canonicalSupplement(['bytes','path','sha256'])||seen.has(m.path)||!memberPaths.includes(m.path))throw new Error('ZIP回执重复、未知或缺少成员。');seen.add(m.path);const b=await zip.file(m.path).async('uint8array');if(b.length!==m.bytes||await digest(b)!==m.sha256)throw new Error('ZIP成员哈希不符：'+m.path);}
  }
  await verifyProjectPreparations(project);
  for (const [name,collection] of Object.entries(project.layers)) {
    const layer = zip.file(archiveLayerPath(name));
    if (!layer) throw new Error('ZIP缺少图层文件：' + name + '。');
    const saved = parseStrictPreparationJson(await layer.async('string'));
    validateCollection(saved);
    if (canonicalJson(saved) !== canonicalJson(collection)) throw new Error('ZIP图层文件与项目登记不一致：' + name + '。');
  }
  return project;
}

export async function digest(bytes) {
  const hash = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash), v=>v.toString(16).padStart(2,'0')).join('');
}
