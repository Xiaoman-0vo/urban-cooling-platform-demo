import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {
  PREPARATION_INPUT_PATHS as P, PREPARATION_MANIFEST_MEMBER,
  readOnlyPreparationActionGates, parseStrictPreparationJson,
  validatePreparationRegistration, verifyPreparationRegistration,
} from '../src/preparation-state.js';
import {registerPreparationState} from '../scripts/register-preparation-state.mjs';

const registration=JSON.parse(readFileSync(new URL('../public/data/preparation-state.json',import.meta.url),'utf8'));
const copy=value=>structuredClone(value);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const originalBytes=Buffer.from(registration.archive_base64,'base64');
const snapshotPath=new URL('../public/data/preparation_snapshots/'+registration.manifest.source_fingerprint_sha256+'.json',import.meta.url);
const frozenReceiptPath=new URL('../scripts/preparation-state-registration-receipt_'+registration.manifest.source_fingerprint_sha256+'.json',import.meta.url);
const pythonJson=value=>Array.isArray(value)?'['+value.map(pythonJson).join(', ')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+': '+pythonJson(value[key])).join(', ')+'}':JSON.stringify(value);

/** Re-sign modified software-test fixtures so semantic checks run after integrity checks. */
async function changedInput(path,mutate) {
  const value=copy(registration), original=await JSZip.loadAsync(originalBytes);
  const inputBytes=await original.file('inputs/'+path).async('nodebuffer');
  const text=mutate(inputBytes.toString('utf8'));
  const bytes=Buffer.from(text,'utf8'), entry=value.manifest.entries.find(e=>e.path===path);
  entry.sha256=hash(bytes);entry.bytes=bytes.length;
  if(path===P.service) value.manifest.copied_source_snapshot_comparisons[0].copied_current_sha256=entry.sha256;
  const fingerprint=hash(Buffer.from(pythonJson({builder_sha256:value.manifest.builder_sha256,entries:value.manifest.entries})));
  value.manifest.source_fingerprint_sha256=fingerprint;
  value.manifest.package_id='pilot-preparation:'+fingerprint;value.registration_id=value.manifest.package_id;
  const folder='共享接口/共同试点输入对照/交接准备包/'+fingerprint.slice(0,16)+'/';
  value.archive.path=folder+value.site_id+'_研究输入准备.zip';value.manifest_source.path=folder+PREPARATION_MANIFEST_MEMBER;
  const manifestBytes=Buffer.from(JSON.stringify(value.manifest,null,2)+'\n');
  value.manifest_source.sha256=hash(manifestBytes);value.manifest_source.bytes=manifestBytes.length;
  const zip=new JSZip();zip.file(PREPARATION_MANIFEST_MEMBER,manifestBytes,{createFolders:false});
  for(const item of value.manifest.entries) zip.file(item.archive_path,item.path===path?bytes:await original.file(item.archive_path).async('uint8array'),{createFolders:false});
  const archive=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  value.archive.bytes=archive.length;value.archive.sha256=hash(archive);value.archive_base64=archive.toString('base64');
  return value;
}

test('T01 原93456字节完整保存，14原件精度/BOM/几何与真实缺项保留，view不写回登记', async()=>{
  const before=JSON.stringify(registration);
  assert.strictEqual(validatePreparationRegistration(registration),registration);
  const view=await verifyPreparationRegistration(registration);
  assert.strictEqual(view.manifest,registration.manifest);
  assert.deepEqual(Object.keys(view).sort(),['inputs','manifest']);
  assert.equal(originalBytes.length,93456);
  assert.equal(hash(originalBytes),'08c7156289efc7a383b096fca81a8442cc0915ed265c6986dfe4a6d6eaafd543');
  assert.equal(Object.keys(view.inputs).length,14);
  assert.ok(view.inputs[P.macroCsv].startsWith('\uFEFF'));
  assert.equal(view.inputs[P.residences].features.length,6);
  assert.equal(view.manifest.summary.macro_proxy_input_accepted_count,8);
  assert.deepEqual(view.manifest.summary.macro_missing_input_grid_ids,['E4126_N33890']);
  assert.equal(Object.keys(view.inputs[P.micro].unknown_values).length,33);
  assert.ok(Object.values(view.inputs[P.micro].unknown_values).every(value=>value===null));
  assert.equal(view.inputs[P.service].results.length,12);
  assert.ok(view.inputs[P.service].results.every(row=>row.value===null&&row.population_count===null));
  for(const entry of registration.manifest.entries) {
    const source=readFileSync(new URL('../../'+entry.path,import.meta.url));
    assert.equal(hash(source),entry.sha256);
    const expected=/\.(json|geojson)$/.test(entry.path)?JSON.parse(source.toString('utf8')):source.toString('utf8');
    assert.deepEqual(view.inputs[entry.path],expected);
  }
  assert.equal(JSON.stringify(registration),before);
  assert.equal(Object.hasOwn(registration,'inputs'),false);
});

test('T02 结构身份、14路径、六门控和原状态轴严格，不因文件check开放应用',()=>{
  const gates=readOnlyPreparationActionGates();assert.equal(Object.keys(gates).length,6);assert.ok(Object.values(gates).every(value=>value===false));
  gates.prediction=true;assert.equal(readOnlyPreparationActionGates().prediction,false);
  for(const mutate of [
    v=>{v.schema_version='project';},v=>{v.registration_id='other';},v=>{v.site_id='other-site';},
    v=>{v.manifest.status_axes.science='validated';},v=>{v.manifest.scientific_action_gates.prediction=true;},
    v=>{v.adapter_receipt.operation_gates.physical_simulation=true;},v=>{v.adapter_receipt.operation_gates.ranking='false';},
    v=>{v.archive_base64=v.archive_base64.slice(1);},v=>{v.archive.bytes=Infinity;},v=>{v.archive.sha256='bad';},
    v=>{v.manifest.entries[1].path=v.manifest.entries[0].path;},v=>{v.manifest.entries[0].path='../../weights.pt';},
    v=>{v.manifest.summary.macro_proxy_input_accepted_count=9;},v=>{v.manifest.scope_registry[3].width_m=500;},
    v=>{v.manifest.copied_source_snapshot_comparisons[0].same_bytes=true;},v=>{v.manifest.snapshot_currency_notice.source_snapshot_rebased_after_notice=true;},
  ]) {const value=copy(registration);mutate(value);assert.throws(()=>validatePreparationRegistration(value));}
});

test('T03 同步结构通过仍必须真SHA与原清单深等，不能只信回执',async()=>{
  const changed=copy(registration);changed.archive.sha256='0'.repeat(64);
  assert.doesNotThrow(()=>validatePreparationRegistration(changed));
  await assert.rejects(verifyPreparationRegistration(changed),/真实SHA256/);
  const manifest=copy(registration);manifest.manifest.created_at='2026-10-06T09:00:00+08:00';
  await assert.rejects(verifyPreparationRegistration(manifest),/原清单与登记完整对象不一致/);
});

test('T04 SHA重签不能掩盖CRC/源件hash损坏，额外缺失与重复成员被拒绝',async()=>{
  const broken=copy(registration), bytes=Buffer.from(originalBytes);
  const name=bytes.readUInt16LE(26),extra=bytes.readUInt16LE(28);bytes[30+name+extra+8]^=0xff;
  broken.archive.sha256=hash(bytes);broken.archive_base64=bytes.toString('base64');
  await assert.rejects(verifyPreparationRegistration(broken),/CRC|读取核验失败/);
  for(const operation of ['extra','missing']) {
    const zip=await JSZip.loadAsync(originalBytes);
    if(operation==='extra')zip.file('unlisted_model.pt','not-a-model',{createFolders:false});else zip.remove(registration.manifest.entries[0].archive_path);
    const output=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),value=copy(registration);
    value.archive.bytes=output.length;value.archive.sha256=hash(output);value.archive_base64=output.toString('base64');
    await assert.rejects(verifyPreparationRegistration(value),/精确15成员/);
  }
  const zip=await JSZip.loadAsync(originalBytes), nameInZip='inputs/'+P.serviceReadme;
  const source=await zip.file(nameInZip).async('nodebuffer');source[0]^=1;
  zip.file(nameInZip,source,{createFolders:false});
  const memberChanged=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),invalidMember=copy(registration);
  invalidMember.archive.bytes=memberChanged.length;invalidMember.archive.sha256=hash(memberChanged);invalidMember.archive_base64=memberChanged.toString('base64');
  await assert.rejects(verifyPreparationRegistration(invalidMember),/源件真实SHA256/);
  const end=originalBytes.length-22,start=originalBytes.readUInt32LE(end+16),records=[];
  let position=start;
  while(position<end) {const size=46+originalBytes.readUInt16LE(position+28)+originalBytes.readUInt16LE(position+30)+originalBytes.readUInt16LE(position+32);records.push(originalBytes.subarray(position,position+size));position+=size;}
  records[1]=records[0];
  const directory=Buffer.concat(records),tail=Buffer.from(originalBytes.subarray(end));tail.writeUInt32LE(directory.length,12);
  const duplicateBytes=Buffer.concat([originalBytes.subarray(0,start),directory,tail]),duplicate=copy(registration);
  duplicate.archive.bytes=duplicateBytes.length;duplicate.archive.sha256=hash(duplicateBytes);duplicate.archive_base64=duplicateBytes.toString('base64');
  await assert.rejects(verifyPreparationRegistration(duplicate),/重复/);
});

test('T05 JSON拒绝重复键、转义同名键、NaN与溢出数值，并允许合法字符串',async()=>{
  for(const text of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"x":NaN}','{"x":Infinity}','{"x":1e309}','{"x":1,}','[1,]']) assert.throws(()=>parseStrictPreparationJson(text));
  assert.deepEqual(parseStrictPreparationJson('{"description":"NaN is a missing-value word","value":null}'),{description:'NaN is a missing-value word',value:null});
  const duplicate=await changedInput(P.macro,text=>text.replace('"focal_grid_id": "E4125_N33891",','"focal_grid_id": "E4125_N33891", "focal_grid_id": "other",'));
  await assert.rejects(verifyPreparationRegistration(duplicate),/重复键/);
  const infinite=await changedInput(P.macro,text=>text.replace('"extracted_grid_rows": 9','"extracted_grid_rows": 1e309'));
  await assert.rejects(verifyPreparationRegistration(infinite),/非有限/);
});

test('T06 九格缺建筑/R不可填0，JSON缺项与完整模型资格不可升级',async()=>{
  for(const mutate of [
    text=>{const value=JSON.parse(text);value.missing_numeric_details[0].value=0;return JSON.stringify(value);},
    text=>{const value=JSON.parse(text);value.core_input_status.frozen_model_inference_ready=true;return JSON.stringify(value);},
  ]) await assert.rejects(verifyPreparationRegistration(await changedInput(P.macro,mutate)),/缺项|推理资格/);
  const csv=await changedInput(P.macroCsv,text=>{
    const lines=text.split(/\r?\n/),header=lines[0].replace(/^\uFEFF/,'').split(',');
    const at=lines.findIndex(line=>line.includes(',E4126_N33890,')),values=lines[at].split(',');values[header.indexOf('B01')]='0';lines[at]=values.join(',');return lines.join('\n');
  });
  await assert.rejects(verifyPreparationRegistration(csv),/不可填零/);
});

test('T07 住宅人口不分楼、未知权限/入住/T_P_U不补值，源身份与原生单位不变',async()=>{
  for(const mutate of [
    text=>{const value=JSON.parse(text);value.features[0].properties.building_population=91;return JSON.stringify(value);},
    text=>{const value=JSON.parse(text);value.features[0].properties.T_P_U='origin';return JSON.stringify(value);},
    text=>{const value=JSON.parse(text);value.features[0].properties.native_population_cell_id='wrong-cell';return JSON.stringify(value);},
  ]) await assert.rejects(verifyPreparationRegistration(await changedInput(P.residences,mutate)),/住宅|原生人口/);
  const unit=await changedInput(P.population,text=>{const value=JSON.parse(text);value.population_source.unit='persons_per_building';return JSON.stringify(value);});
  await assert.rejects(verifyPreparationRegistration(unit),/原生人口单位/);
});

test('T08 33null与气象地形候选不升级，12占位/受体角色与坐标仍未认证',async()=>{
  for(const [path,mutate,pattern] of [
    [P.micro,v=>{v.unknown_values.ground_elevation=0;},/保持null/],
    [P.weather,v=>{v.weather_candidates[0].project_admission.accepted=true;},/只是候选/],
    [P.weather,v=>{v.weather_candidates[0].July19_entry.literal_source_years=[2020];},/源年/],
    [P.weather,v=>{v.terrain_candidates[0].actual_member_metadata[0].pixel_values_read=true;},/未读像元/],
    [P.service,v=>{v.results[0].value=0;},/占位/],
    [P.service,v=>{v.results[0].origin_object_ref='six-residences';},/占位/],
    [P.service,v=>{v.source_objects[0].semantic_roles.resident_original_position=true;},/受体角色/],
    [P.service,v=>{v.source_objects[0].coordinates.x_m+=1;},/身份\/坐标/],
  ]) {
    const changed=await changedInput(path,text=>{const value=JSON.parse(text);mutate(value);return JSON.stringify(value);});
    await assert.rejects(verifyPreparationRegistration(changed),pattern);
  }
});

test('T09 独立check-only实核当前14源件，immutable快照与原回执保持原字节',async()=>{
  const beforeSnapshot=readFileSync(snapshotPath),beforeReceipt=readFileSync(frozenReceiptPath);
  const receipt=await registerPreparationState({checkOnly:true});
  assert.equal(receipt.check_only,true);assert.equal(receipt.verification.verified_source_count,14);assert.equal(receipt.verification.exact_member_count,15);
  assert.ok(receipt.source_measurements.every(row=>row.unchanged&&row.before.sha256===row.declared.sha256&&row.after.sha256===row.before.sha256));
  assert.deepEqual(readFileSync(snapshotPath),beforeSnapshot);assert.deepEqual(readFileSync(frozenReceiptPath),beforeReceipt);
  assert.deepEqual(readOnlyPreparationActionGates(),receipt.operation_gates);
});
