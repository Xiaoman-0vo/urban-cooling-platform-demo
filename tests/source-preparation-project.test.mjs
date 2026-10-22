import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {createProject,parseProjectJson,validateProject,makeArchive,parseArchive} from '../src/project.js';
import {verifySourcePreparationRegistrations,sourcePreparationArchiveBytes,sourcePreparationManifestBytes} from '../src/source-preparation-state.js';

// These tests read the saved compact packages only, never referenced PBFs,
// weather archives, labels, models or producer code through an execution API.
const json = path => JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => structuredClone(value);
const registrations = json('../public/data/source-preparation-state.json');
const diskEvidence = json('../evidence/五组磁盘文件独立回读_20261006.json').disk_files;
const groups = ['micro-source-overlay','weather-cross-format','road-source-connectivity'];
const sourceManifest = readFileSync(new URL('../../平台产品设计/来源准备三组接入清单_20261006.json',import.meta.url));

function assertDiskIdentity(bytes,reference) {
  assert.equal(bytes.length,reference.bytes);
  assert.equal(sha(bytes),reference.sha256);
}
function publicLegacy() {
  const scene=json('../public/data/scene.json');
  return createProject(json('../public/data/manifest.json'),scene,{
    stage:'site',region:'成都',center:scene.center_lon_lat,location:scene.site_id,
    visible:{bounds:true,buildings:true,vegetation:true,roads:true,receptors:false,regional:false,greenFx:true},
    offline:true,preview:true,drawer:'versions',
  },scene.layers,[],[json('../public/data/research-state.json')],[json('../public/data/preparation-state.json')],json('../public/data/supplement-state.json'));
}
const actualLegacyAvailable=existsSync(diskEvidence.json.path)&&existsSync(diskEvidence.zip.path);
let legacy;
if(actualLegacyAvailable) {
  const bytes=readFileSync(diskEvidence.json.path);
  assertDiskIdentity(bytes,diskEvidence.json);
  legacy=parseProjectJson(bytes.toString('utf8'));
}else legacy=publicLegacy();
const attached=()=>({...copy(legacy),sourcePreparationRegistrations:copy(registrations)});
const compact=sourceRegistrations=>{
  const value=copy(legacy);delete value.supplementRegistrations;
  return {...value,sourcePreparationRegistrations:copy(sourceRegistrations)};
};
let archivePromise;
const archive=()=>archivePromise??=makeArchive(attached());
async function changedArchive(change) {
  const zip=await JSZip.loadAsync(await archive());
  await change(zip);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:1}});
}
async function rebindReceipt(zip,path) {
  const receipt=JSON.parse(await zip.file('archive-receipt.json').async('string'));
  const member=receipt.members.find(m=>m.path===path);assert.ok(member);
  const bytes=await zip.file(path).async('uint8array');member.bytes=bytes.length;member.sha256=sha(bytes);
  zip.file('archive-receipt.json',JSON.stringify(receipt),{createFolders:false});
}

test('SRP01 实际旧五组JSON/ZIP仍合法，新三组缺省字段不自动填充',async()=>{
  assert.equal(Object.hasOwn(legacy,'sourcePreparationRegistrations'),false);
  assert.equal(legacy.supplementRegistrations.length,5);
  const before=JSON.stringify(legacy);
  assert.deepEqual(parseProjectJson(before),legacy);
  const bytes=actualLegacyAvailable?readFileSync(diskEvidence.zip.path):await makeArchive(legacy);
  if(actualLegacyAvailable)assertDiskIdentity(bytes,diskEvidence.zip);
  assert.deepEqual(await parseArchive(bytes),legacy);
  assert.equal(Object.hasOwn(await parseArchive(bytes),'sourcePreparationRegistrations'),false);
  assert.equal(JSON.stringify(legacy),before);
});

test('SRP02 第9参数显式附新三组，JSON/ZIP全字段往返保存旧源件/科学状态和四类历史登记',async()=>{
  const value=createProject(legacy.sourcePackage,legacy.scene,legacy.uiState,legacy.layers,
    legacy.imports,legacy.researchRegistrations??[],legacy.preparationRegistrations??[],legacy.supplementRegistrations,registrations);
  const before=JSON.stringify({legacy,registrations});
  assert.deepEqual(value.sourcePreparationRegistrations.map(r=>r.group_id),groups);
  assert.notStrictEqual(value.sourcePreparationRegistrations,registrations);
  assert.strictEqual(validateProject(value),value);
  assert.deepEqual(parseProjectJson(JSON.stringify(value)),value);
  const reopened=await parseArchive(await archive());
  assert.deepEqual(reopened,attached());
  for(const key of ['sourcePackage','scene','layers','researchRegistrations','preparationRegistrations','supplementRegistrations','imports','uiState','software_receipt'])assert.deepEqual(reopened[key],legacy[key]);
  assert.deepEqual(reopened.sourcePreparationRegistrations,registrations);
  assert.equal(reopened.sourcePackage.artifact_count,24);
  assert.equal(reopened.scene.results.temperature_improvement_C,null);
  assert.equal(reopened.scene.results.value_state,'not_calculated');
  assert.equal(reopened.scene.scope_registry.find(s=>s.support_id==='physical_solver_domain').width_m,null);
  assert.equal(reopened.scene.scope_registry.find(s=>s.support_id==='physical_solver_domain').bounds_m,null);
  assert.equal(JSON.stringify({legacy,registrations}),before);
  const omitted=createProject(legacy.sourcePackage,legacy.scene,legacy.uiState,legacy.layers,
    legacy.imports,legacy.researchRegistrations??[],legacy.preparationRegistrations??[],legacy.supplementRegistrations);
  assert.equal(Object.hasOwn(omitted,'sourcePreparationRegistrations'),false);
});

test('SRP03 三原ZIP、完整原清单、31显式源件副本逐字节相等且成员回执SHA/bytes闭合',async()=>{
  const zip=await JSZip.loadAsync(await archive(),{checkCRC32:true});
  const handoff=await zip.file('交接说明.md').async('string');
  assert.match(handoff,/3组已显式登记的来源准备资料、31个完整来源文件的原字节/);
  assert.match(handoff,/PBF、全年天气ZIP及上游原场地资产不属于这批来源文件交付/);
  assert.deepEqual(JSON.parse(await zip.file('source-preparation/registrations.json').async('string')),registrations);
  assert.deepEqual(Buffer.from(await zip.file('source-preparation/source-manifest.json').async('uint8array')),sourceManifest);
  let sourceCount=0;
  for(const r of registrations) {
    const bytes=await zip.file('source-preparation/'+r.group_id+'.zip').async('uint8array');
    assert.deepEqual(bytes,sourcePreparationArchiveBytes(r));assert.equal(sha(bytes),r.archive.sha256);assert.equal(bytes.length,r.archive.bytes);
    assert.deepEqual(Buffer.from(sourcePreparationManifestBytes(r)),sourceManifest);
    const inner=await JSZip.loadAsync(bytes,{checkCRC32:true});
    assert.deepEqual(Buffer.from(await inner.file('source-manifest.json').async('uint8array')),sourceManifest);
    for(const s of r.source_group.files) {
      const raw=await zip.file('source-preparation/inputs/'+s.path).async('uint8array');
      assert.deepEqual(raw,await inner.file(s.path).async('uint8array'));
      assert.equal(raw.length,s.bytes);assert.equal(sha(raw),s.sha256);sourceCount++;
    }
  }
  assert.equal(sourceCount,31);
  const receipt=JSON.parse(await zip.file('archive-receipt.json').async('string'));
  const paths=Object.keys(zip.files).filter(path=>!zip.files[path].dir&&path!=='archive-receipt.json');
  assert.equal(receipt.schema_version,'0.1.project-member-hashes');
  assert.deepEqual(receipt.members.map(m=>m.path).sort(),paths.sort());
  assert.equal(new Set(receipt.members.map(m=>m.path)).size,paths.length);
  for(const m of receipt.members){const b=await zip.file(m.path).async('uint8array');assert.equal(b.length,m.bytes);assert.equal(sha(b),m.sha256);}
});

test('SRP04 hasOwn空数组仅有旁表；单组子集保留完整清单但只携该组9原件',async()=>{
  const empty=compact([]),emptyArchive=await makeArchive(empty),emptyZip=await JSZip.loadAsync(emptyArchive);
  assert.deepEqual(await parseArchive(emptyArchive),empty);
  assert.deepEqual(JSON.parse(await emptyZip.file('source-preparation/registrations.json').async('string')),[]);
  assert.equal(emptyZip.file('source-preparation/source-manifest.json'),null);
  assert.doesNotMatch(await emptyZip.file('交接说明.md').async('string'),/本次另含/);
  assert.equal(Object.keys(emptyZip.files).some(p=>p.startsWith('source-preparation/inputs/')),false);
  const road=compact([registrations.find(r=>r.group_id==='road-source-connectivity')]);
  const bytes=await makeArchive(road),zip=await JSZip.loadAsync(bytes);
  assert.deepEqual(await parseArchive(bytes),road);
  assert.deepEqual(Buffer.from(await zip.file('source-preparation/source-manifest.json').async('uint8array')),sourceManifest);
  assert.equal(Object.keys(zip.files).filter(p=>p.startsWith('source-preparation/inputs/')&&!zip.files[p].dir).length,9);
  assert.match(await zip.file('交接说明.md').async('string'),/1组已显式登记的来源准备资料、9个完整来源文件的原字节/);
  assert.equal(zip.file('source-preparation/weather-cross-format.zip'),null);
});

test('SRP05 schema/重复身份/源哈希/原字段/门控升级在保存前拒绝，且不突变工程',async()=>{
  const mutations=[
    p=>{p.sourcePreparationRegistrations=undefined;},
    p=>{p.sourcePreparationRegistrations=null;},
    p=>{p.sourcePreparationRegistrations[1]=copy(p.sourcePreparationRegistrations[0]);},
    p=>{p.sourcePreparationRegistrations[0].schema_version='foreign-source-preparation';},
    p=>{p.sourcePreparationRegistrations[0].archive.sha256='a'.repeat(64);},
    p=>{p.sourcePreparationRegistrations[0].manifest_source.sha256='b'.repeat(64);},
    p=>{p.sourcePreparationRegistrations[0].source_group.files[0].sha256=p.sourcePreparationRegistrations[0].source_group.files[1].sha256;},
    p=>{p.sourcePreparationRegistrations[0].source_group.files[0].bytes++;},
    p=>{p.sourcePreparationRegistrations[0].unexpected_field=null;},
    p=>{p.sourcePreparationRegistrations[0].adapter_receipt.application_gates.routing_or_OD=true;},
    p=>{p.sourcePreparationRegistrations[0].adapter_receipt.application_gates.physical_simulation='false';},
    p=>{p.sourcePreparationRegistrations[0].adapter_receipt.science_validation='scientifically_adopted';},
  ];
  for(const change of mutations) {
    const p=attached();change(p);const before=JSON.stringify(p);
    assert.throws(()=>validateProject(p));await assert.rejects(makeArchive(p));assert.equal(JSON.stringify(p),before);
  }
  const corrupted=attached(),r=corrupted.sourcePreparationRegistrations[2],bytes=sourcePreparationArchiveBytes(r);
  bytes[bytes.length-1]^=1;r.archive_base64=Buffer.from(bytes).toString('base64');
  assert.strictEqual(validateProject(corrupted),corrupted);
  const before=JSON.stringify(corrupted);await assert.rejects(makeArchive(corrupted),/SHA|哈希|字节/);assert.equal(JSON.stringify(corrupted),before);
});

test('SRP06 新旁表必需、canonical对应；孤立新成员不能偷偷接入旧工程',async()=>{
  await assert.rejects(parseArchive(await changedArchive(zip=>zip.remove('source-preparation/registrations.json'))),/缺少三组来源准备登记/);
  await assert.rejects(parseArchive(await changedArchive(zip=>zip.file('source-preparation/registrations.json','[]'))),/旁表与工程登记不一致/);
  const reordered=await changedArchive(async zip=>{
    zip.file('source-preparation/registrations.json',JSON.stringify(registrations.map(r=>Object.fromEntries(Object.entries(r).reverse()))));
    await rebindReceipt(zip,'source-preparation/registrations.json');
  });
  assert.deepEqual(await parseArchive(reordered),attached());
  for(const path of ['source-preparation/registrations.json','source-preparation/road-source-connectivity.zip','source-preparation/inputs/unlisted.csv']) {
    const zip=await JSZip.loadAsync(actualLegacyAvailable?readFileSync(diskEvidence.zip.path):await makeArchive(legacy));
    zip.file(path,path.endsWith('.json')?'[]':'orphan',{createFolders:false});
    await assert.rejects(parseArchive(await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:1}})),/没有对应工程登记/);
  }
});

test('SRP07 即使重签成员回执，原组ZIP/manifest/31源件中的篡改或缺失仍拒绝',async()=>{
  const paths=['source-preparation/road-source-connectivity.zip','source-preparation/source-manifest.json',
    'source-preparation/inputs/'+registrations[0].source_group.files.find(s=>s.file_kind==='gpkg').path,
    'source-preparation/inputs/'+registrations[2].source_group.files.find(s=>s.file_kind==='csv').path];
  for(const path of paths) {
    await assert.rejects(parseArchive(await changedArchive(async zip=>{
      const bytes=await zip.file(path).async('uint8array');bytes[bytes.length-1]^=1;zip.file(path,bytes,{createFolders:false});await rebindReceipt(zip,path);
    })),/原字节不一致/);
    await assert.rejects(parseArchive(await changedArchive(zip=>zip.remove(path))),/缺少/);
  }
  const missingManifestForEmpty=compact([]),emptyZip=await JSZip.loadAsync(await makeArchive(missingManifestForEmpty));
  emptyZip.file('source-preparation/source-manifest.json',sourceManifest,{createFolders:false});
  await assert.rejects(parseArchive(await emptyZip.generateAsync({type:'uint8array',compression:'DEFLATE'})),/未知成员/);
});

test('SRP08 归档成员闭集拒绝额外文件/缺回执/重复回执，保存门控与原空值不升级',async()=>{
  await assert.rejects(parseArchive(await changedArchive(zip=>zip.file('source-preparation/inputs/not_in_manifest.csv','unexpected',{createFolders:false}))),/未知成员/);
  await assert.rejects(parseArchive(await changedArchive(zip=>zip.remove('archive-receipt.json'))),/缺少成员|缺少成员哈希回执/);
  await assert.rejects(parseArchive(await changedArchive(async zip=>{
    const receipt=JSON.parse(await zip.file('archive-receipt.json').async('string'));
    receipt.members[1]=copy(receipt.members[0]);zip.file('archive-receipt.json',JSON.stringify(receipt),{createFolders:false});
  })),/重复/);
  const views=await verifySourcePreparationRegistrations(registrations);
  assert.deepEqual(Object.keys(views).sort(),groups.slice().sort());
  for(const r of registrations)assert.ok(Object.values(r.adapter_receipt.application_gates).every(v=>v===false));
  const roads=views['road-source-connectivity'];
  assert.ok(Object.values(roads.summary.operation_gates).every(v=>v===false));
  const table=roads.files['共享接口/服务链准备/源线连通诊断_20261006/原相邻段.csv'];
  for(const field of ['legal_walk_connection','bridge_raw','tunnel_raw','layer_raw','travel_time_min','route_cost'])assert.ok(table.rows.every(row=>row[table.fields.indexOf(field)]===''));
  assert.equal(attached().scene.results.temperature_improvement_C,null);
});
