import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {createProject,parseProjectJson,validateProject,makeArchive,parseArchive} from '../src/project.js';
import {READ_ONLY_SUPPLEMENT_GATES,verifySupplementRegistrations,supplementArchiveBytes} from '../src/supplement-state.js';
import {validateCandidateResource,validateModifiableEvidence} from '../src/supplement-candidates.js';

const readJson = path => JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const registrations = readJson('../public/data/supplement-state.json');
const originalDownload = readJson('../evidence/科研登记_最新双版本JSON磁盘核对.json');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
const expectedGroups = ['planning-description','planning-development','candidate-resource','modifiable-evidence','focal-neighbor'];

// Prefer the actual preserved browser download. A clean checkout without that
// external file still exercises the same absent-field contract with public data.
const realDownloadAvailable = existsSync(originalDownload.file);
let legacyText;
if (realDownloadAvailable) {
  const bytes = readFileSync(originalDownload.file);
  assert.equal(bytes.length,originalDownload.bytes);
  assert.equal(sha256(bytes),originalDownload.sha256);
  legacyText = bytes.toString('utf8');
} else {
  const scene=readJson('../public/data/scene.json');
  legacyText=JSON.stringify(createProject(readJson('../public/data/manifest.json'),scene,{
    stage:'site',region:'成都',center:scene.center_lon_lat,location:scene.site_id,
    visible:{bounds:true,buildings:true,vegetation:true,roads:true,receptors:false,regional:false},
    offline:true,preview:true,drawer:'versions',
  },scene.layers,[],[readJson('../public/data/research-state.json')]));
}
const legacy = parseProjectJson(legacyText);
const attached = () => ({...copy(legacy),supplementRegistrations:copy(registrations)});
let archivePromise,viewsPromise;
const archive = () => archivePromise ||= makeArchive(attached());
const views = () => viewsPromise ||= verifySupplementRegistrations(registrations);
const changedArchive = async change => {
  const zip=await JSZip.loadAsync(await archive());
  await change(zip);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
};
const receiptOf = async zip => JSON.parse(await zip.file('archive-receipt.json').async('string'));
const writeReceipt = (zip,receipt) => zip.file('archive-receipt.json',JSON.stringify(receipt),{createFolders:false});
const cell = (view,path,field,value,row=0) => {
  const table=view.files[path],index=table.fields.indexOf(field);
  assert.ok(index>=0,`fixture field ${field}`);
  table.rows[row][index]=value;
};

test('SP01 真实旧JSON追加五组后JSON/ZIP全字段回读，旧24来源、场景和空热结果不变',async () => {
  assert.equal(Object.hasOwn(legacy,'supplementRegistrations'),false);
  assert.equal(legacy.sourcePackage.artifacts.length,24);
  const before=JSON.stringify(legacy),value=attached(),valueBefore=JSON.stringify(value);
  assert.deepEqual(value.supplementRegistrations.map(r=>r.group_id),expectedGroups);
  assert.strictEqual(validateProject(value),value);
  assert.deepEqual(parseProjectJson(JSON.stringify(value)),value);
  const reopened=await parseArchive(await archive());
  assert.deepEqual(reopened,value);
  assert.deepEqual(reopened.sourcePackage,legacy.sourcePackage);
  assert.deepEqual(reopened.scene,legacy.scene);
  assert.deepEqual(reopened.layers,legacy.layers);
  assert.deepEqual(reopened.researchRegistrations,legacy.researchRegistrations);
  assert.equal(reopened.scene.results.temperature_improvement_C,null);
  assert.equal(reopened.scene.results.value_state,'not_calculated');
  assert.equal(JSON.stringify(legacy),before);
  assert.equal(JSON.stringify(value),valueBefore);
});

test('SP02 createProject第8参数可显式附五组，旧JSON/ZIP缺省字段保持absent且不自动回填',async () => {
  const before=JSON.stringify({legacy,registrations});
  const created=createProject(legacy.sourcePackage,legacy.scene,legacy.uiState,legacy.layers,
    legacy.imports,legacy.researchRegistrations || [],legacy.preparationRegistrations || [],registrations);
  assert.deepEqual(created.supplementRegistrations,registrations);
  assert.deepEqual(created.sourcePackage,legacy.sourcePackage);
  assert.deepEqual(created.scene,legacy.scene);
  const omitted=createProject(legacy.sourcePackage,legacy.scene,legacy.uiState,legacy.layers,
    legacy.imports,legacy.researchRegistrations || [],legacy.preparationRegistrations || []);
  assert.equal(Object.hasOwn(omitted,'supplementRegistrations'),false);
  assert.equal(Object.hasOwn(parseProjectJson(legacyText),'supplementRegistrations'),false);
  const reopened=await parseArchive(await makeArchive(legacy));
  assert.equal(Object.hasOwn(reopened,'supplementRegistrations'),false);
  assert.deepEqual(reopened,legacy);
  assert.equal(JSON.stringify({legacy,registrations}),before);
});

test('SP03 五组源ZIP镜像原字节保真，回执闭合列出全部非自身成员并逐件核SHA',async () => {
  const zip=await JSZip.loadAsync(await archive());
  assert.deepEqual(JSON.parse(await zip.file('supplements/registrations.json').async('string')),registrations);
  for (const r of registrations) {
    const bytes=await zip.file(`supplements/${r.group_id}.zip`).async('uint8array');
    assert.equal(bytes.length,r.archive.bytes);
    assert.equal(sha256(bytes),r.archive.sha256);
    assert.deepEqual(bytes,supplementArchiveBytes(r));
  }
  const receipt=await receiptOf(zip);
  assert.equal(receipt.schema_version,'0.1.project-member-hashes');
  const paths=Object.keys(zip.files).filter(p=>!zip.files[p].dir&&p!=='archive-receipt.json').sort();
  assert.deepEqual(receipt.members.map(m=>m.path).sort(),paths);
  assert.equal(new Set(receipt.members.map(m=>m.path)).size,paths.length);
  for (const member of receipt.members) {
    const bytes=await zip.file(member.path).async('uint8array');
    assert.equal(member.bytes,bytes.length);
    assert.equal(member.sha256,sha256(bytes));
  }
});

test('SP04 未知schema/源SHA/字节/字段/重复组与登记门控升级都在保存前拒绝',async () => {
  const mutations=[
    p=>{p.supplementRegistrations[0].schema_version='foreign';},
    p=>{p.supplementRegistrations[0].archive.sha256='a'.repeat(64);},
    p=>{p.supplementRegistrations[0].sources[0].sha256='a'.repeat(64);},
    p=>{p.supplementRegistrations[0].sources[0].bytes+=1;},
    p=>{p.supplementRegistrations[0].unexpected_field=null;},
    p=>{p.supplementRegistrations[0].sources[0].unexpected_field=null;},
    p=>{p.supplementRegistrations[1]=copy(p.supplementRegistrations[0]);},
    p=>{p.supplementRegistrations[0].sources.pop();},
    p=>{p.supplementRegistrations[0].adapter_receipt.operation_gates.prediction=true;},
    p=>{p.supplementRegistrations[0].adapter_receipt.science_validation='validated';},
  ];
  for (const mutate of mutations) {
    const p=attached();mutate(p);
    assert.throws(()=>validateProject(p));
    assert.throws(()=>parseProjectJson(JSON.stringify(p)));
    await assert.rejects(makeArchive(p));
  }
});

test('SP05 已鉴真源view仍逐项拒绝错误单位/未知补零/33槽换名，保持科学门控false',async () => {
  const verified=await views();
  const r=verified[registrations.find(r=>r.group_id==='candidate-resource').registration_id];
  const m=verified[registrations.find(r=>r.group_id==='modifiable-evidence').registration_id];
  const support=Object.keys(r.files).find(p=>p.endsWith('六住宅植被资源支持候选.csv'));
  const resourceBefore=JSON.stringify(r.files),modifiableBefore=JSON.stringify(m.files);
  let bad=copy(r);cell(bad,support,'resource_area_unit','hectare');
  assert.throws(()=>validateCandidateResource(bad));
  bad=copy(r);cell(bad,support,'population_denominator','0');
  assert.throws(()=>validateCandidateResource(bad));
  const audit=Object.keys(m.files).find(p=>p.endsWith('可改空间来源与对象证据_20261006.json'));
  bad=copy(m);const slots=bad.files[audit].current_admission_state.original_unknown_values;
  delete slots.ground_elevation;slots.fake_ground_elevation=null;
  assert.throws(()=>validateModifiableEvidence(bad));
  bad=copy(m);bad.files[audit].current_admission_state.implementation_permission_mask=false;
  assert.throws(()=>validateModifiableEvidence(bad));
  assert.deepEqual(validateCandidateResource(r).operation_gates,READ_ONLY_SUPPLEMENT_GATES);
  assert.deepEqual(validateModifiableEvidence(m).operation_gates,READ_ONLY_SUPPLEMENT_GATES);
  assert.equal(JSON.stringify(r.files),resourceBefore);
  assert.equal(JSON.stringify(m.files),modifiableBefore);
});

test('SP06 缺成果旁表或合法但不相等的旁表均拒绝，旧包孤立旁表不被默认接纳',async () => {
  await assert.rejects(parseArchive(await changedArchive(zip=>zip.remove('supplements/registrations.json'))),/缺少.*登记|缺少成员/);
  await assert.rejects(parseArchive(await changedArchive(zip=>{
    zip.file('supplements/registrations.json',JSON.stringify(registrations.slice(0,-1)));
  })),/旁表.*不一致/);
  const oldZip=await JSZip.loadAsync(await makeArchive(legacy));
  oldZip.file('supplements/registrations.json',JSON.stringify(registrations));
  await assert.rejects(parseArchive(await oldZip.generateAsync({type:'uint8array'})),/没有对应工程登记/);
});

test('SP07 缺任一成果原字节镜像或镜像位翻转均拒绝',async () => {
  for (const r of registrations) {
    await assert.rejects(parseArchive(await changedArchive(zip=>zip.remove(`supplements/${r.group_id}.zip`))),/缺少成果原字节包|缺少成员/);
  }
  const path=`supplements/${registrations[0].group_id}.zip`;
  await assert.rejects(parseArchive(await changedArchive(async zip=>{
    const bytes=await zip.file(path).async('uint8array');bytes[Math.floor(bytes.length/2)]^=1;
    zip.file(path,bytes);
  })),/原字节不一致/);
});

test('SP08 archive_base64本体篡改即使工程和旁表同步仍拒绝真实源SHA不符',async () => {
  const tampered=attached();
  const r=tampered.supplementRegistrations[0],bytes=supplementArchiveBytes(r);
  bytes[Math.floor(bytes.length/2)]^=1;r.archive_base64=Buffer.from(bytes).toString('base64');
  assert.doesNotThrow(()=>validateProject(tampered));
  await assert.rejects(makeArchive(tampered),/SHA256不一致/);
  await assert.rejects(parseArchive(await changedArchive(zip=>{
    zip.file('project.json',JSON.stringify(tampered));
    zip.file('supplements/registrations.json',JSON.stringify(tampered.supplementRegistrations));
  })),/哈希不符|SHA256不一致|不一致/);
});

test('SP09 错误member哈希/字节/重复成员/缺成员/多字段回执均拒绝',async () => {
  const mutations=[
    r=>{r.members[0].sha256='a'.repeat(64);},
    r=>{r.members[0].bytes+=1;},
    r=>{r.members[1]=copy(r.members[0]);},
    r=>{r.members.pop();},
    r=>{r.members[0].unverified=true;},
    r=>{r.schema_version='foreign';},
  ];
  for (const mutate of mutations) {
    const bytes=await changedArchive(async zip=>{const r=await receiptOf(zip);mutate(r);writeReceipt(zip,r);});
    await assert.rejects(parseArchive(bytes),/哈希不符|回执|成员/);
  }
});

test('SP10 成果新包缺receipt、额外非白名单成员或新目录均拒绝闭合验收',async () => {
  await assert.rejects(parseArchive(await changedArchive(zip=>zip.remove('archive-receipt.json'))),/缺少成员|缺少成员哈希回执/);
  await assert.rejects(parseArchive(await changedArchive(zip=>zip.file('extra.bin',new Uint8Array([1]),{createFolders:false}))),/未知成员/);
  await assert.rejects(parseArchive(await changedArchive(zip=>zip.folder('unexpected'))),/未知目录/);
});

test('SP11 project/旁表/成员回执JSON的重复键与非有限数字不能靠最后值覆盖通过',async () => {
  const text=JSON.stringify(attached());
  assert.throws(()=>parseProjectJson('{"export_schema_version":"wrong",'+text.slice(1)),/重复/);
  const escaped='{'+ '"\\u0065xport_schema_version":"wrong",'+text.slice(1);
  assert.throws(()=>parseProjectJson(escaped),/重复/);
  assert.throws(()=>parseProjectJson(text.replace('"exported_at":','"test_nonfinite":1e999,"exported_at":')),/有限|非法|无效/);
  await assert.rejects(parseArchive(await changedArchive(zip=>zip.file('project.json','{"export_schema_version":"wrong",'+text.slice(1)))),/重复/);
  await assert.rejects(parseArchive(await changedArchive(zip=>{
    const side=JSON.stringify(registrations);
    zip.file('supplements/registrations.json',side.replace('"group_id":','"group_id":"wrong","group_id":'));
  })),/重复/);
  await assert.rejects(parseArchive(await changedArchive(async zip=>{
    const r=JSON.stringify(await receiptOf(zip));
    zip.file('archive-receipt.json','{"schema_version":"wrong",'+r.slice(1));
  })),/重复/);
});

test('SP12 保存、JSON读入与ZIP回读均不改原工程/登记或开启科学能力',async () => {
  const p=attached(),before=JSON.stringify(p),sourceBefore=JSON.stringify(registrations);
  const restored=parseProjectJson(JSON.stringify(p));
  const reloaded=await parseArchive(await makeArchive(p));
  for (const value of [p,restored,reloaded]) {
    for (const r of value.supplementRegistrations) assert.deepEqual(r.adapter_receipt.operation_gates,READ_ONLY_SUPPLEMENT_GATES);
    for (const key of ['prediction_enabled','physics_enabled','optimal_recommendation_enabled']) assert.equal(value.software_receipt[key],false);
    assert.equal(value.scene.results.temperature_improvement_C,null);
  }
  assert.equal(JSON.stringify(p),before);
  assert.equal(JSON.stringify(registrations),sourceBefore);
  restored.supplementRegistrations[0].adapter_receipt.operation_gates.prediction=true;
  assert.equal(p.supplementRegistrations[0].adapter_receipt.operation_gates.prediction,false);
  assert.equal(registrations[0].adapter_receipt.operation_gates.prediction,false);
  assert.throws(()=>validateProject(restored));
});
