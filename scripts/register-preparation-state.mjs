import {readFile,realpath,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {
  PREPARATION_SCHEMA, PREPARATION_AXIS_STATES, PREPARATION_INPUT_PATHS,
  PREPARATION_VERIFICATION_SCOPE, readOnlyPreparationActionGates,
  parseStrictPreparationJson, validatePreparationRegistration, verifyPreparationRegistration,
} from '../src/preparation-state.js';

const APP_ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT_ROOT=dirname(APP_ROOT);
const INDEX_PATH=join(PROJECT_ROOT,'共享接口','共同试点输入对照','当前准备包登记.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const measure=bytes=>({sha256:sha(bytes),bytes:bytes.length});
const stringify=value=>JSON.stringify(value,null,2)+'\n';
const relativePrefix='共享接口/共同试点输入对照/交接准备包/';

async function safeRead(path) {
  const absolute=resolve(path), actual=await realpath(absolute);
  if(actual!==absolute) throw new Error('准备登记不沿源件符号链接读取其他文件。');
  return readFile(actual);
}

async function atomicWrite(path,bytes) {
  await mkdir(dirname(path),{recursive:true});
  const temporary=path+'.tmp';await writeFile(temporary,bytes);await rename(temporary,path);
}

async function readIfPresent(path) {
  try{return await readFile(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}

/** Register only the original preparation ZIP, its manifest and 14 explicit files. */
export async function registerPreparationState({checkOnly=false}={}) {
  const startedAt=new Date().toISOString();
  const indexBytes=await safeRead(INDEX_PATH), sourceIndex=parseStrictPreparationJson(indexBytes.toString('utf8'));
  const fingerprint=sourceIndex.package_id?.replace(/^pilot-preparation:/,'');
  if(!/^[a-f0-9]{64}$/.test(fingerprint) || sourceIndex.site_id!=='E4125_N33891') throw new Error('当前准备登记身份无效。');
  const folder=relativePrefix+fingerprint.slice(0,16)+'/';
  const archivePath=folder+'E4125_N33891_研究输入准备.zip', manifestPath=folder+'准备清单.json';
  if(sourceIndex.archive!==join(PROJECT_ROOT,archivePath) || sourceIndex.manifest!==join(PROJECT_ROOT,manifestPath)) throw new Error('当前登记指向非显式准备包文件。');
  const archiveBytes=await safeRead(join(PROJECT_ROOT,archivePath)), manifestBytes=await safeRead(join(PROJECT_ROOT,manifestPath));
  if(sha(archiveBytes)!==sourceIndex.archive_sha256 || archiveBytes.length!==sourceIndex.archive_bytes || sha(manifestBytes)!==sourceIndex.manifest_sha256) throw new Error('原ZIP/清单字节与当前准备包登记不一致。');
  const manifest=parseStrictPreparationJson(manifestBytes.toString('utf8'));
  if(manifest.entries.length!==14 || manifest.entries.some(entry=>!Object.values(PREPARATION_INPUT_PATHS).includes(entry.path))) throw new Error('仅允许当前14件显式准备来源。');
  const sourceMeasurements=[];
  for(const entry of manifest.entries) {
    const before=await safeRead(join(PROJECT_ROOT,entry.path));
    const measurement=measure(before);
    if(measurement.sha256!==entry.sha256 || measurement.bytes!==entry.bytes) throw new Error('当前准备源件字节与原ZIP清单不一致：'+entry.path);
    sourceMeasurements.push({path:entry.path,declared:{sha256:entry.sha256,bytes:entry.bytes},before:measurement});
  }
  let registration={
    schema_version:PREPARATION_SCHEMA,registration_id:manifest.package_id,site_id:manifest.site_id,
    archive:{path:archivePath,...measure(archiveBytes)},archive_base64:archiveBytes.toString('base64'),
    manifest,manifest_source:{path:manifestPath,...measure(manifestBytes)},
    adapter_receipt:{
      adapter_version:'0.1',registered_at:new Date().toISOString(),
      ...Object.fromEntries(Object.entries(PREPARATION_AXIS_STATES).map(([axis,state])=>[axis,{state}])),
      source_verification:{verified_source_count:14,archive_member_count:15,archive_hash_matches:true,archive_crc_verified:true,manifest_hash_matches:true,all_member_hashes_match:true,current_source_hashes_match:true,source_hashes_unchanged:true,archive_hash_unchanged:true,manifest_hash_unchanged:true,scope:PREPARATION_VERIFICATION_SCOPE},
      operation_gates:readOnlyPreparationActionGates(),
    },
  };
  validatePreparationRegistration(registration);await verifyPreparationRegistration(registration);
  const archiveAfter=measure(await safeRead(join(PROJECT_ROOT,archivePath))), manifestAfter=measure(await safeRead(join(PROJECT_ROOT,manifestPath)));
  if(!isDeepStrictEqual(archiveAfter,measure(archiveBytes)) || !isDeepStrictEqual(manifestAfter,measure(manifestBytes))) throw new Error('准备包读取过程中原ZIP或清单发生变化。');
  for(const item of sourceMeasurements) {
    item.after=measure(await safeRead(join(PROJECT_ROOT,item.path)));
    item.unchanged=isDeepStrictEqual(item.before,item.after);
    if(!item.unchanged) throw new Error('准备源件读取前后发生变化：'+item.path);
  }
  const currentPath=join(APP_ROOT,'public','data','preparation-state.json');
  const snapshotPath=join(APP_ROOT,'public','data','preparation_snapshots',fingerprint+'.json');
  const receiptPath=join(APP_ROOT,'scripts','preparation-state-registration-receipt.json');
  const frozenReceiptPath=join(APP_ROOT,'scripts','preparation-state-registration-receipt_'+fingerprint+'.json');
  const existing=await readIfPresent(snapshotPath);let serialized;
  if(existing) {
    const frozen=parseStrictPreparationJson(existing.toString('utf8'));validatePreparationRegistration(frozen);await verifyPreparationRegistration(frozen);
    if(frozen.registration_id!==registration.registration_id || !isDeepStrictEqual(frozen.manifest,manifest) || !isDeepStrictEqual(frozen.archive,registration.archive) || !isDeepStrictEqual(frozen.manifest_source,registration.manifest_source) || frozen.archive_base64!==registration.archive_base64) throw new Error('同一准备指纹已有不同原字节快照，拒绝覆盖。');
    registration=frozen;serialized=existing;
  } else {
    if(checkOnly) throw new Error('尚无已保存准备快照。');
    serialized=Buffer.from(stringify(registration),'utf8');
  }
  const receipt={
    schema_version:'0.1.read-only-pilot-preparation-registration-receipt',
    registration_id:registration.registration_id,site_id:registration.site_id,started_at:startedAt,completed_at:new Date().toISOString(),
    source_current_index:{path:'共享接口/共同试点输入对照/当前准备包登记.json',...measure(indexBytes)},
    archive:{...registration.archive,before:measure(archiveBytes),after:archiveAfter,unchanged:true},
    manifest_source:{...registration.manifest_source,before:measure(manifestBytes),after:manifestAfter,unchanged:true},
    source_measurements:sourceMeasurements,
    verification:{scope:PREPARATION_VERIFICATION_SCOPE,archive_crc_verified:true,exact_member_count:15,verified_source_count:14,all_source_and_member_hashes_match:true,complete_original_zip_bytes_preserved:true,original_manifest_object_preserved:true,strict_json_duplicate_keys_and_nonfinite_rejected:true},
    operation_gates:readOnlyPreparationActionGates(),
    research_execution:{model_weights_loaded:false,locked_test_labels_read:false,raw_raster_links_followed:false,training_inference_simulation_fairness_or_service_run:false},
    outputs:{current:{path:'public/data/preparation-state.json',...measure(serialized)},snapshot:{path:'public/data/preparation_snapshots/'+fingerprint+'.json',...measure(serialized),reused_existing_snapshot:!!existing},receipt:{path:'scripts/preparation-state-registration-receipt.json'},immutable_receipt:{path:'scripts/preparation-state-registration-receipt_'+fingerprint+'.json'}},
  };
  if(checkOnly) {
    const current=await readFile(currentPath);if(!current.equals(serialized)) throw new Error('当前准备登记副本与不可变快照字节不同。');
    return {...receipt,check_only:true};
  }
  await mkdir(dirname(snapshotPath),{recursive:true});
  if(!existing) await writeFile(snapshotPath,serialized,{flag:'wx'});
  await atomicWrite(currentPath,serialized);
  if(!await readIfPresent(frozenReceiptPath)) await writeFile(frozenReceiptPath,stringify(receipt),{flag:'wx'});
  await atomicWrite(receiptPath,Buffer.from(stringify(receipt),'utf8'));
  if(!(await readFile(currentPath)).equals(await readFile(snapshotPath))) throw new Error('准备登记落盘回读不一致。');
  return receipt;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=='--check-only')) {console.error('仅支持直接登记或--check-only；不接受其他来源路径或研究操作。');process.exitCode=1;}
  else try {const receipt=await registerPreparationState({checkOnly:args.includes('--check-only')});console.log(JSON.stringify({registration_id:receipt.registration_id,archive:receipt.archive.sha256,verified_source_count:receipt.verification.verified_source_count,outputs:receipt.outputs,check_only:!!receipt.check_only},null,2));}
  catch(error) {console.error('准备只读登记失败：'+error.message);process.exitCode=1;}
}
