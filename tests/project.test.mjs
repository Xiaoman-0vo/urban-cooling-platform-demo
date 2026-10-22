import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import proj4 from 'proj4';
import {PROJECT_SCHEMA, createProject, deepCopy, makeArchive, parseArchive, scopesFor, validateCollection, validateProject} from '../src/project.js';
import {verifyPreparationRegistration} from '../src/preparation-state.js';

const readData = name => JSON.parse(readFileSync(new URL('../public/data/' + name,import.meta.url),'utf8'));
const sourcePackage = readData('manifest.json');
const scene = readData('scene.json');
const researchRegistration = readData('research-state.json');
const preparationRegistration = readData('preparation-state.json');
const preparationArchive = readFileSync(new URL('../../共享接口/共同试点输入对照/交接准备包/7d66553a704f56bb/E4125_N33891_研究输入准备.zip',import.meta.url));
const preparationManifestBytes = readFileSync(new URL('../../共享接口/共同试点输入对照/交接准备包/7d66553a704f56bb/准备清单.json',import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const axes = ['file_acceptance','science_validation','integration','execution'];
const uiState = {
  stage:'site',region:'成都',center:scene.center_lon_lat,location:scene.site_id,
  visible:{bounds:true,buildings:true,vegetation:true,roads:true,receptors:false,regional:false},
  offline:true,preview:true,drawer:'versions',
  camera:{center:scene.center_lon_lat,zoom:17.8,bearing:-18,pitch:55}
};
const project = () => createProject(sourcePackage,scene,uiState,scene.layers,[]);
const point = (id,coordinates=[104.08,30.63]) => ({type:'Feature',id,properties:{value:null,missing:''},geometry:{type:'Point',coordinates}});
const collection = features => ({type:'FeatureCollection',features});
const layerPath = name => 'layers/' + name.replace(/[^a-zA-Z0-9_-]/g,'_') + '.geojson';

test('P01 真数据保存副本保留源身份、空值、四轴及相互独立的研究目标', () => {
  const before = JSON.stringify({sourcePackage,scene,uiState});
  const value = project();
  assert.strictEqual(validateProject(value),value);
  assert.equal(value.export_schema_version,PROJECT_SCHEMA);
  assert.deepEqual(value.sourcePackage,sourcePackage);
  assert.deepEqual(value.scene,scene);
  assert.deepEqual(value.uiState,uiState);
  for (let i=0;i<sourcePackage.artifacts.length;i++) {
    for (const axis of axes) assert.deepEqual(value.sourcePackage.artifacts[i][axis],sourcePackage.artifacts[i][axis]);
    assert.equal(value.sourcePackage.artifacts[i].source_observation_time,sourcePackage.artifacts[i].source_observation_time);
  }
  assert.equal(value.scene.results.temperature_improvement_C,null);
  assert.equal(value.scene.results.value_state,'not_calculated');
  assert.equal(value.scene.scope_registry.find(s=>s.support_id==='physical_solver_domain').width_m,null);
  assert.ok(value.scene.records.some(row=>Object.values(row).includes('')));
  const cap = id => value.sourcePackage.capabilities.find(c=>c.capability_id===id);
  assert.equal(cap('I04').objective_id,'normalized_indicator_distance');
  assert.equal(cap('I08').objective_id,'added_green_projection_area_m2');
  assert.equal(cap('I08').not_equivalent_to_objective,cap('I04').objective_id);
  assert.equal(cap('I11').weights,null);
  assert.equal(cap('I11').overall_score,null);
  assert.equal(value.software_receipt.science_validation,'not_upgraded');
  assert.equal(value.software_receipt.physics_enabled,false);
  value.sourcePackage.artifacts[0].science_validation.state='changed_copy_only';
  value.scene.records[0].grid_id='changed_copy_only';
  value.uiState.visible.roads=false;
  assert.equal(JSON.stringify({sourcePackage,scene,uiState}),before);
});

test('P02 真数据全部图层ZIP往返一致，缺失或损坏图层不能冒充成功重开', async () => {
  const value = project();
  const bytes = await makeArchive(value);
  assert.deepEqual(await parseArchive(bytes),value);
  const zip = await JSZip.loadAsync(bytes);
  assert.deepEqual(JSON.parse(await zip.file('project.json').async('string')),value);
  for (const [name,layer] of Object.entries(scene.layers)) {
    assert.deepEqual(JSON.parse(await zip.file(layerPath(name)).async('string')),layer);
  }
  const changed = deepCopy(value.layers.core);
  changed.features[0].properties.__test_only_tampering=true;
  zip.file(layerPath('core'),JSON.stringify(changed));
  await assert.rejects(parseArchive(await zip.generateAsync({type:'uint8array'})),/不一致/);
  zip.remove(layerPath('core'));
  await assert.rejects(parseArchive(await zip.generateAsync({type:'uint8array'})),/缺少图层/);
});

test('P03 100/300米范围以UTM48N米制构造，几何大小与角色可独立回验', () => {
  const scopes = scopesFor(scene.center_lon_lat);
  const expectedCenter = [412550,3389150];
  for (const [name,width] of [['core',100],['macro_context300',300]]) {
    const fc = scopes[name];
    validateCollection(fc);
    const feature = fc.features[0];
    const ring = feature.geometry.coordinates[0];
    assert.deepEqual(ring[0],ring.at(-1));
    const xy = ring.map(c=>proj4('EPSG:4326','EPSG:32648',c));
    const minX = Math.min(...xy.map(c=>c[0])), maxX = Math.max(...xy.map(c=>c[0]));
    const minY = Math.min(...xy.map(c=>c[1])), maxY = Math.max(...xy.map(c=>c[1]));
    assert.ok(Math.abs(maxX-minX-width)<1e-6);
    assert.ok(Math.abs(maxY-minY-width)<1e-6);
    assert.ok(Math.abs((minX+maxX)/2-expectedCenter[0])<1e-3);
    assert.ok(Math.abs((minY+maxY)/2-expectedCenter[1])<1e-3);
    assert.equal(feature.properties.width_m,width);
    assert.equal(feature.properties.area_m2,width*width);
    assert.equal(feature.properties.derivation,'platform_declared_meter_view_not_solver_domain');
  }
  for (const center of [[109,30],[104,-1],[NaN,30],['104',30],null]) assert.throws(()=>scopesFor(center));
});

test('P04 重复源ID和破损几何被拒绝，合法缺失属性及无源ID资料仍可浏览', () => {
  for (const features of [[point('same'),point('same')],[point(1),point('1')]]) assert.throws(()=>validateCollection(collection(features)),/ID重复/);
  const sourceIds = [point(undefined),point(undefined)];
  sourceIds.forEach(f=>{delete f.id;f.properties.source_id='duplicate-source';});
  assert.throws(()=>validateCollection(collection(sourceIds)),/ID重复/);
  for (const feature of [
    point('infinite',[Infinity,30]),point('latitude',[104,91]),point('altitude',[104,30,Infinity]),
    {...point('null'),geometry:null},
    {...point('short-line'),geometry:{type:'LineString',coordinates:[[104,30]]}},
    {...point('open-ring'),geometry:{type:'Polygon',coordinates:[[[104,30],[105,30],[105,31],[104,31]]]}},
    {...point('unsupported'),geometry:{type:'constructor',coordinates:[]}},
    {...point('wrong-id'),id:{}}
  ]) assert.throws(()=>validateCollection(collection([feature])));
  const valid = collection([point('a'),{...point('b'),properties:null}]);
  assert.strictEqual(validateCollection(valid),valid);
  const noId = point(undefined);delete noId.id;
  assert.doesNotThrow(()=>validateCollection(collection([noId])));
});

test('P05 显式错误CRS即使数值像经纬度仍被拒绝，WGS84/CRS84声明可用', () => {
  const value = collection([point('a')]);
  for (const crs of ['EPSG:3857',{type:'name',properties:{name:'EPSG:3857'}},{type:'link',properties:{href:'local.prj'}},null]) {
    assert.throws(()=>validateCollection({...value,crs}),/坐标系/);
  }
  for (const crs of ['EPSG:4326',{type:'name',properties:{name:'urn:ogc:def:crs:OGC:1.3:CRS84'}}]) {
    assert.doesNotThrow(()=>validateCollection({...value,crs}));
  }
});

test('P06 外来schema、缺失方案身份、重复来源/能力/范围ID被拒绝', () => {
  for (const schema of ['foreign-package-v1','0.1.local-reference',null]) assert.throws(()=>validateProject({...project(),export_schema_version:schema}));
  for (const key of ['site_id','scenario_id']) {
    const value=project();delete value.scene[key];
    assert.throws(()=>validateProject(value),/身份/);
  }
  for (const [path,key] of [['artifacts','artifact_id'],['capabilities','capability_id']]) {
    const value=project();
    value.sourcePackage[path][1][key]=value.sourcePackage[path][0][key];
    assert.throws(()=>validateProject(value),/重复ID/);
  }
  const value=project();
  value.scene.scope_registry[1].support_id=value.scene.scope_registry[0].support_id;
  assert.throws(()=>validateProject(value),/重复ID/);
});

test('P07 重开位置/相机/图层声明与文件名校验，同时允许真实用户位置的空场景', async () => {
  for (const center of [[999,30],[104,91],[Infinity,30]]) {
    const value=project();value.uiState.center=center;
    assert.throws(()=>validateProject(value),/位置/);
  }
  const camera=project();camera.uiState.camera.zoom='17';
  assert.throws(()=>validateProject(camera),/相机/);
  const visible=project();visible.uiState.visible.roads='true';
  assert.throws(()=>validateProject(visible),/显示设置/);
  const greenFx=project();greenFx.uiState.visible.greenFx='false';
  assert.throws(()=>validateProject(greenFx),/显示设置/);
  greenFx.uiState.visible.greenFx=false;
  const greenFxArchive=await parseArchive(await makeArchive(greenFx));
  assert.equal(greenFxArchive.uiState.visible.greenFx,false);
  const selection=project();selection.uiState.selectedReference={layerKey:'buildings',id:{}};
  assert.throws(()=>validateProject(selection),/身份引用/);
  const crs=project();crs.layers.core.crs='EPSG:3857';
  assert.throws(()=>validateProject(crs),/坐标系/);
  const colliding=project();colliding.layers['a/b']=collection([]);colliding.layers.a_b=collection([]);
  assert.throws(()=>validateProject(colliding),/相同导出文件名/);
  const center=[104.1,30.65],scopes=scopesFor(center);
  const emptyScene={site_id:'用户位置预览',scenario_id:'user_location_104.100000_30.650000_geometry',scenario_type:'geometry_candidate',center_lon_lat:center,scope_registry:[{support_id:'core_100',width_m:100},{support_id:'surrounding_view_300',width_m:300},{support_id:'physical_solver_domain',width_m:null}],counts:{},tables:{},records:[],version_alignment:{}};
  const value=createProject(sourcePackage,emptyScene,{...uiState,center,location:'104.1,30.65',stage:'region',drawer:''},scopes,[]);
  assert.doesNotThrow(()=>validateProject(value));
  const reopened=await parseArchive(await makeArchive(value));
  assert.deepEqual(reopened.scene,emptyScene);
  assert.deepEqual(Object.keys(reopened.layers).sort(),['core','macro_context300']);
  assert.deepEqual(reopened.scene.counts,{});
  assert.deepEqual(reopened.scene.records,[]);
  assert.equal(reopened.layers.buildings,undefined);
  assert.equal(reopened.scene.results,undefined);
});

test('P08 缺失四轴、哈希或能力结构在接入前被拒绝，不通过默认值补齐', () => {
  for (const axis of axes) {
    const value=project();delete value.sourcePackage.artifacts[0][axis];
    assert.throws(()=>validateProject(value),/原始/);
  }
  for (const badHash of ['',null,'not-a-sha256']) {
    const value=project();value.sourcePackage.artifacts[0].sha256=badHash;
    assert.throws(()=>validateProject(value),/SHA256/);
  }
  const missingCaps=project();delete missingCaps.sourcePackage.capabilities;
  assert.throws(()=>validateProject(missingCaps),/能力/);
  const nullArtifact=project();nullArtifact.sourcePackage.artifacts[0]=null;
  assert.throws(()=>validateProject(nullArtifact),/来源/);
  const missingArtifact=project();missingArtifact.sourcePackage.artifacts.pop();
  assert.throws(()=>validateProject(missingArtifact),/数量/);
  const missingReceipt=project();delete missingReceipt.software_receipt;
  assert.throws(()=>validateProject(missingReceipt),/软件/);
  const imported=project();
  imported.imports=[{file_name:'source.geojson',sha256:'a'.repeat(64),file_acceptance:{state:'accepted_for_browse'},science_validation:{state:'not_assessed'},integration:{state:'local_geometry_browse'},execution:{state:'imported_not_research_run'}}];
  assert.doesNotThrow(()=>validateProject(imported));
  delete imported.imports[0].science_validation;
  assert.throws(()=>validateProject(imported),/原始/);
});

test('P09 旧JSON与ZIP无科研登记字段合法，回读不自动补当前登记', async () => {
  const legacy = project();
  delete legacy.researchRegistrations;
  delete legacy.preparationRegistrations;
  const json = JSON.stringify(legacy);
  assert.strictEqual(validateProject(legacy),legacy);
  assert.equal(JSON.stringify(legacy),json);
  assert.equal(Object.hasOwn(validateProject(JSON.parse(json)),'researchRegistrations'),false);
  assert.equal(Object.hasOwn(validateProject(JSON.parse(json)),'preparationRegistrations'),false);
  const bytes = await makeArchive(legacy);
  const zip = await JSZip.loadAsync(bytes);
  assert.equal(zip.file('research/registrations.json'),null);
  assert.equal(zip.file('preparation/registrations.json'),null);
  const reopened = await parseArchive(bytes);
  assert.deepEqual(reopened,legacy);
  assert.equal(Object.hasOwn(reopened,'researchRegistrations'),false);
  assert.equal(Object.hasOwn(reopened,'preparationRegistrations'),false);
});

test('P10 新科研登记独立保存，JSON/ZIP往返保留历史24源件、原场景与全部原属性', async () => {
  const inputRegistration = structuredClone(researchRegistration);
  const value = createProject(sourcePackage,scene,uiState,scene.layers,[],[inputRegistration]);
  assert.strictEqual(validateProject(value),value);
  assert.deepEqual(value.researchRegistrations,[researchRegistration]);
  assert.notStrictEqual(value.researchRegistrations[0],inputRegistration);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(value))),value);
  assert.equal(value.sourcePackage.artifact_count,24);
  assert.deepEqual(value.sourcePackage,sourcePackage);
  assert.deepEqual(value.scene,scene);
  assert.deepEqual(value.layers,scene.layers);
  const bytes = await makeArchive(value), zip = await JSZip.loadAsync(bytes);
  assert.deepEqual(JSON.parse(await zip.file('research/registrations.json').async('string')),value.researchRegistrations);
  assert.deepEqual(await parseArchive(bytes),value);
  value.researchRegistrations[0].index.sources[0].role='only_saved_copy_changed';
  assert.deepEqual(inputRegistration,researchRegistration);
});

test('P11 新ZIP科研sidecar必需且与项目一致，重排JSON不会伪重算原SHA', async () => {
  const value=createProject(sourcePackage,scene,uiState,scene.layers,[],[researchRegistration]);
  const zip=await JSZip.loadAsync(await makeArchive(value));
  const registration=deepCopy(researchRegistration);
  const sourceSha=registration.source_index.sha256;
  registration.adapter_receipt.registered_at='2026-10-06T00:00:00Z';
  zip.file('research/registrations.json',JSON.stringify([registration]));
  await assert.rejects(parseArchive(await zip.generateAsync({type:'uint8array'})),/科研登记文件与项目登记不一致/);
  const original=value.researchRegistrations[0];
  const reordered=Object.fromEntries(Object.entries(original).reverse());
  zip.file('research/registrations.json',JSON.stringify([reordered]));
  const reopened=await parseArchive(await zip.generateAsync({type:'uint8array'}));
  assert.deepEqual(reopened,value);
  assert.equal(reopened.researchRegistrations[0].source_index.sha256,sourceSha);
  zip.remove('research/registrations.json');
  await assert.rejects(parseArchive(await zip.generateAsync({type:'uint8array'})),/缺少科研登记文件/);
  const empty=project();
  assert.deepEqual(empty.researchRegistrations,[]);
  assert.deepEqual(await parseArchive(await makeArchive(empty)),empty);
});

test('P12 科学软件门控严格false且不能以技术通过替代，非法登记保存前拒绝', () => {
  for (const key of ['prediction_enabled','physics_enabled','optimal_recommendation_enabled']) {
    for (const bad of [true,'false',undefined]) {
      const value=project();value.software_receipt[key]=bad;
      assert.throws(()=>validateProject(value),/false/);
    }
  }
  for (const mutation of [
    value=>{value.software_receipt.science_validation='validated';},
    value=>{value.software_receipt.research_execution='run_complete';},
    value=>{value.software_receipt.equity_enabled=true;},
    value=>{value.researchRegistrations=null;},
    value=>{value.researchRegistrations=[researchRegistration,researchRegistration];},
  ]) {const value=project();mutation(value);assert.throws(()=>validateProject(value));}
  const invalid=structuredClone(researchRegistration);
  invalid.index.development_metric_records[0].value=NaN;
  assert.throws(()=>createProject(sourcePackage,scene,uiState,scene.layers,[],[invalid]),/有限且非负/);
});

test('P13 真实准备ZIP与清单原字节随独立登记保存，JSON/ZIP往返不覆盖科研状态或历史场景', async () => {
  const original = deepCopy(preparationRegistration);
  const value = createProject(sourcePackage,scene,uiState,scene.layers,[],[researchRegistration],[original]);
  assert.strictEqual(validateProject(value),value);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(value))),value);
  assert.notStrictEqual(value.preparationRegistrations[0],original);
  assert.equal(preparationArchive.length,93456);
  assert.deepEqual(Buffer.from(value.preparationRegistrations[0].archive_base64,'base64'),preparationArchive);
  assert.equal(value.preparationRegistrations[0].archive.sha256,sha256(preparationArchive));
  assert.equal(value.preparationRegistrations[0].manifest_source.sha256,sha256(preparationManifestBytes));
  assert.equal(value.preparationRegistrations[0].manifest_source.bytes,preparationManifestBytes.length);
  assert.deepEqual(value.preparationRegistrations[0].manifest,JSON.parse(preparationManifestBytes.toString('utf8')));
  const view = await verifyPreparationRegistration(value.preparationRegistrations[0]);
  assert.deepEqual(view.manifest,preparationRegistration.manifest);
  assert.deepEqual(Object.keys(view.inputs).sort(),view.manifest.entries.map(entry=>entry.path).sort());
  const bytes = await makeArchive(value), zip = await JSZip.loadAsync(bytes);
  assert.deepEqual(JSON.parse(await zip.file('preparation/registrations.json').async('string')),value.preparationRegistrations);
  const reopened = await parseArchive(bytes);
  assert.deepEqual(reopened,value);
  assert.deepEqual(reopened.sourcePackage,sourcePackage);
  assert.deepEqual(reopened.scene,scene);
  assert.deepEqual(reopened.layers,scene.layers);
  assert.deepEqual(reopened.researchRegistrations,[researchRegistration]);
  assert.equal(reopened.sourcePackage.artifact_count,24);
  assert.equal(reopened.scene.results.temperature_improvement_C,null);
  for (const axis of axes) assert.deepEqual(reopened.sourcePackage.artifacts[0][axis],sourcePackage.artifacts[0][axis]);
  assert.equal(reopened.preparationRegistrations[0].manifest.summary.physical_simulations,0);
  assert.equal(reopened.preparationRegistrations[0].manifest.summary.macro_complete_nine_grid_input_support,false);
  assert.deepEqual(preparationRegistration,original);
});

test('P14 准备sidecar与项目必需一致，缺失/孤立/不一致被拒绝但JSON键重排合法', async () => {
  const value = createProject(sourcePackage,scene,uiState,scene.layers,[],[],[preparationRegistration]);
  const zip = await JSZip.loadAsync(await makeArchive(value));
  zip.file('preparation/registrations.json','[]');
  await assert.rejects(parseArchive(await zip.generateAsync({type:'uint8array'})),/准备登记文件与项目登记不一致/);
  const reordered = Object.fromEntries(Object.entries(preparationRegistration).reverse());
  zip.file('preparation/registrations.json',JSON.stringify([reordered]));
  assert.deepEqual(await parseArchive(await zip.generateAsync({type:'uint8array'})),value);
  zip.remove('preparation/registrations.json');
  await assert.rejects(parseArchive(await zip.generateAsync({type:'uint8array'})),/缺少准备登记文件/);
  const legacy = project();
  delete legacy.preparationRegistrations;
  const orphan = await JSZip.loadAsync(await makeArchive(legacy));
  orphan.file('preparation/registrations.json',JSON.stringify([preparationRegistration]));
  await assert.rejects(parseArchive(await orphan.generateAsync({type:'uint8array'})),/没有对应项目登记/);
  const empty = project();
  assert.deepEqual(empty.preparationRegistrations,[]);
  assert.deepEqual(await parseArchive(await makeArchive(empty)),empty);
});

test('P15 即使project与sidecar同步篡改原ZIP，异步字节哈希核验也拒绝导出和重开', async () => {
  const value = createProject(sourcePackage,scene,uiState,scene.layers,[],[],[preparationRegistration]);
  const zip = await JSZip.loadAsync(await makeArchive(value));
  const tampered = deepCopy(value);
  const changedBytes = Buffer.from(tampered.preparationRegistrations[0].archive_base64,'base64');
  changedBytes[changedBytes.length-1] ^= 1;
  tampered.preparationRegistrations[0].archive_base64 = changedBytes.toString('base64');
  assert.strictEqual(validateProject(tampered),tampered);
  const unchanged = JSON.stringify(tampered);
  await assert.rejects(makeArchive(tampered),/哈希|SHA|字节|准备/);
  zip.file('project.json',JSON.stringify(tampered));
  zip.file('preparation/registrations.json',JSON.stringify(tampered.preparationRegistrations));
  await assert.rejects(parseArchive(await zip.generateAsync({type:'uint8array'})),/哈希|SHA|字节|准备/);
  assert.equal(JSON.stringify(tampered),unchanged);
  assert.deepEqual(Buffer.from(preparationRegistration.archive_base64,'base64'),preparationArchive);
});

test('P16 准备登记未知schema、重复或不一致身份与错误scene在保存前拒绝，旧包不回填', async () => {
  const value = createProject(sourcePackage,scene,uiState,scene.layers,[],[],[preparationRegistration]);
  for (const mutate of [
    saved=>{saved.preparationRegistrations=null;},
    saved=>{saved.preparationRegistrations=[preparationRegistration,preparationRegistration];},
    saved=>{saved.preparationRegistrations[0].schema_version='foreign-preparation-v1';},
    saved=>{saved.preparationRegistrations[0].registration_id='unknown-preparation';},
    saved=>{saved.preparationRegistrations[0].site_id='E4126_N33891';},
    saved=>{saved.scene.site_id='用户位置预览';}
  ]) {
    const invalid = deepCopy(value);mutate(invalid);
    assert.throws(()=>validateProject(invalid));
    await assert.rejects(makeArchive(invalid));
  }
  const invalidBytes = deepCopy(preparationRegistration);invalidBytes.archive.bytes=NaN;
  assert.throws(()=>createProject(sourcePackage,scene,uiState,scene.layers,[],[],[invalidBytes]));
  assert.throws(()=>createProject(sourcePackage,{...scene,site_id:'用户位置预览'},uiState,scene.layers,[],[],[preparationRegistration]),/不匹配/);
  const legacy = project();delete legacy.preparationRegistrations;
  const reopened = await parseArchive(await makeArchive(legacy));
  assert.equal(Object.hasOwn(reopened,'preparationRegistrations'),false);
  assert.deepEqual(reopened,legacy);
});

test('P17 原研究输入准备ZIP及清单不能误作平台project，错误明确且不自动接纳', async () => {
  const manifest = JSON.parse(preparationManifestBytes.toString('utf8'));
  assert.equal(manifest.package_kind,'research_input_preparation_not_platform_project');
  assert.throws(()=>validateProject(manifest),/研究输入准备包.*不能作为场地交接包重开/);
  await assert.rejects(parseArchive(preparationArchive),/研究输入准备包.*不能作为场地交接包重开/);
});

test('P18 同ID但试点中心/核心/范围错位或带用户导入不能复用准备登记，布局图层不受限', async () => {
  const value = createProject(sourcePackage,scene,uiState,scene.layers,[],[researchRegistration],[preparationRegistration]);
  assert.equal(value.scene.site_id,'E4125_N33891');
  assert.deepEqual(await parseArchive(await makeArchive(value)),value);
  const shiftCenter = (saved,meters) => {
    const [e,n] = proj4('EPSG:4326','EPSG:32648',saved.scene.center_lon_lat);
    saved.scene.center_lon_lat = proj4('EPSG:32648','EPSG:4326',[e+meters,n]);
  };
  const shiftCore = core => core.features.forEach(feature=>feature.geometry.coordinates[0].forEach((coordinate,index,ring)=>{
    const [e,n] = proj4('EPSG:4326','EPSG:32648',coordinate);
    ring[index] = proj4('EPSG:32648','EPSG:4326',[e+1,n]);
  }));
  const imported = {file_name:'user.geojson',sha256:'b'.repeat(64),file_acceptance:{state:'accepted_for_browse'},science_validation:{state:'not_assessed'},integration:{state:'local_geometry_browse'},execution:{state:'imported_not_research_run'}};
  const mutations = [
    [saved=>shiftCenter(saved,1),/试点中心/],
    [saved=>shiftCore(saved.layers.core),/核心几何/],
    [saved=>shiftCore(saved.scene.layers.core),/核心几何/],
    [saved=>{saved.scene.scope_registry.find(scope=>scope.support_id==='core_100').bounds_m[0]+=1;},/范围/],
    [saved=>{saved.scene.scope_registry.find(scope=>scope.support_id==='macro_neighborhood_300').role='display_only';},/范围/],
    [saved=>{saved.scene.scope_registry.find(scope=>scope.support_id==='micro_preparation_500').bounds_m[2]+=1;},/范围/],
    [saved=>{saved.scene.scope_registry.find(scope=>scope.support_id==='physical_solver_domain').width_m=100;},/求解域/],
    [saved=>{saved.scene.scope_registry.find(scope=>scope.support_id==='physical_solver_domain').bounds_m=[412500,3389100,412600,3389200];},/求解域/],
    [saved=>{saved.scene.scope_registry.find(scope=>scope.support_id==='physical_solver_domain').status='defined';},/求解域/],
    [saved=>{saved.imports=[imported];},/用户导入/],
    [saved=>{saved.scene.imports=[imported];},/用户导入/]
  ];
  for (const [mutate,error] of mutations) {
    const invalid = deepCopy(value);mutate(invalid);
    assert.equal(invalid.scene.site_id,value.scene.site_id);
    assert.throws(()=>validateProject(invalid),error);
    await assert.rejects(makeArchive(invalid),error);
  }
  const withinTolerance = deepCopy(value);shiftCenter(withinTolerance,0.025);
  assert.doesNotThrow(()=>validateProject(withinTolerance));
  const layout = deepCopy(value);layout.layers.draft_layout=collection([point('draft-layout')]);
  assert.doesNotThrow(()=>validateProject(layout));
  assert.equal(value.scene.scope_registry.find(scope=>scope.support_id==='physical_solver_domain').width_m,null);
  assert.equal(value.scene.scope_registry.find(scope=>scope.support_id==='physical_solver_domain').bounds_m,null);
});
