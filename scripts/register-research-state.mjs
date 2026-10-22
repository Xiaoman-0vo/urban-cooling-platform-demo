import {createHash, randomUUID} from 'node:crypto';
import {readFile, realpath, stat, mkdir, writeFile, rename, link, unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {validateResearchRegistration} from '../src/research-state.js';

const APP_ROOT = fileURLToPath(new URL('../',import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL('../../',import.meta.url));
const INDEX_PATH = '共享接口/当前成果状态索引.json';
const CURRENT_PATH = 'public/data/research-state.json';
const RECEIPT_PATH = 'scripts/research-state-registration-receipt.json';
const SCHEMA = '0.1.read-only-research-registration';
const VERIFICATION_SCOPE = 'index_and_selected_metadata_bytes_not_all_weights_or_inference';
const SOURCE_ROLES = new Map([
  ['one_hop_development_manifest','manifest'],
  ['one_hop_development_independent_technical_receipt','receipt'],
  ['configuration_sources_manifest','manifest'],
  ['configuration_sources_independent_technical_receipt','receipt'],
  ['full_group_ablations_manifest','manifest'],
  ['full_group_ablations_independent_technical_receipt','receipt'],
  ['configuration_sources_development_MAE_summary','summary'],
  ['full_group_ablations_development_MAE_summary','summary']
]);
const FORBIDDEN_EXTENSION = /\.(pt|pth|ckpt|onnx|safetensors|pkl|pickle|bin|npy|npz|h5|hdf5|tif|tiff)$/i;
const FORBIDDEN_PATH = /(weights?|checkpoints?|predictions?|final[_ -]?test|locked[_ -]?.*(labels?|targets?)|test[_ -]?labels?|权重|预测|最终标签|正式标签|锁定标签|最终测试|终测)/i;
const gates = () => ({
  validated_new_site_prediction:false,physical_cooling:false,comfort_accessibility:false,
  actual_use:false,equity_results:false,minimum_area_search:false,optimal_recommendation:false
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const measurement = bytes => ({sha256:hash(bytes),bytes:bytes.length});
const inside = (root,target) => {
  const relative=path.relative(root,target);
  return relative!=='' && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
};
const stringify = value => JSON.stringify(value,null,2)+'\n';

function assertRelativePath(value,label) {
  if (typeof value!=='string' || !value.trim() || path.isAbsolute(value) ||
      value.includes('\\') || value.includes('\0') || value.split('/').includes('..') ||
      value.split('/').includes('.')) throw new Error(label+'必须是项目根内的明确相对路径。');
}

function assertMetadataPath(value,kind) {
  if (FORBIDDEN_EXTENSION.test(value) || FORBIDDEN_PATH.test(value)) throw new Error('禁止读取权重、预测或最终标签路径：'+value);
  const basename=path.basename(value);
  const expected=kind==='manifest'?/manifest\.json$/i:kind==='receipt'?/核验\.json$/:/开发误差汇总\.csv$/;
  if (!expected.test(basename)) throw new Error('来源角色与获准的元数据/开发汇总文件不一致：'+value);
}

/** This validates only the eight direct references; it never follows embedded paths. */
export function validateSelectedSourceReferences(sources) {
  if (!Array.isArray(sources) || sources.length!==8) throw new Error('本登记器只接收8项直接元数据引用。');
  const ids=new Set(),paths=new Set(),roles=new Set();
  for (const source of sources) {
    if (!source || typeof source!=='object' || Array.isArray(source) ||
        typeof source.source_id!=='string' || !source.source_id.trim() ||
        !/^[a-f0-9]{64}$/.test(source.sha256) ||
        !Number.isSafeInteger(source.bytes) || source.bytes<=0 ||
        !SOURCE_ROLES.has(source.role)) throw new Error('来源身份、哈希、大小或元数据角色无效。');
    assertRelativePath(source.path,'来源路径');
    assertMetadataPath(source.path,SOURCE_ROLES.get(source.role));
    if (ids.has(source.source_id) || paths.has(source.path) || roles.has(source.role)) throw new Error('8项来源的ID、路径与角色必须唯一。');
    ids.add(source.source_id);paths.add(source.path);roles.add(source.role);
  }
  return sources;
}

async function resolveSource(root,relative,kind=null) {
  assertRelativePath(relative,'读取路径');
  const resolved=await realpath(path.resolve(root,relative));
  if (!inside(root,resolved)) throw new Error('读取路径或符号链接超出项目根：'+relative);
  if (kind) assertMetadataPath(resolved,kind);
  const info=await stat(resolved);
  if (!info.isFile()) throw new Error('来源不是普通文件：'+relative);
  return resolved;
}

async function readMeasured(sourcePath,expected=null) {
  const bytes=await readFile(sourcePath);
  const actual=measurement(bytes);
  if (expected && (actual.sha256!==expected.sha256 || actual.bytes!==expected.bytes)) throw new Error('实测哈希或字节大小与索引不一致：'+sourcePath);
  return {bytes,actual};
}

async function readSources(root,sources) {
  const actualPaths=new Set();
  const records=[];
  for (const source of sources) {
    const sourcePath=await resolveSource(root,source.path,SOURCE_ROLES.get(source.role));
    if (actualPaths.has(sourcePath)) throw new Error('多个来源指向同一个实际文件：'+source.path);
    actualPaths.add(sourcePath);
    const read=await readMeasured(sourcePath,source);
    // Confirm that a manifest/receipt is readable JSON, without visiting its references.
    if (SOURCE_ROLES.get(source.role)!=='summary') JSON.parse(read.bytes.toString('utf8'));
    records.push({source_id:source.source_id,role:source.role,path:source.path,resolved_project_relative_path:path.relative(root,sourcePath).split(path.sep).join('/'),declared:{sha256:source.sha256,bytes:source.bytes},actual:read.actual});
  }
  return records;
}

async function outputDirectory(root,relative,{create=true}={}) {
  assertRelativePath(relative,'输出路径');
  const directory=path.dirname(path.resolve(APP_ROOT,relative));
  if (!inside(APP_ROOT,directory)) throw new Error('输出目录超出本地平台目录。');
  if (create) {
    let existing=directory;
    while (true) {
      try {
        const parent=await realpath(existing);
        if (parent!==root && !inside(root,parent)) throw new Error('输出父目录或符号链接超出项目根。');
        break;
      } catch(error) {
        if (error.code!=='ENOENT') throw error;
        const parent=path.dirname(existing);
        if (parent===existing) throw error;
        existing=parent;
      }
    }
    await mkdir(directory,{recursive:true});
  }
  const resolved=await realpath(directory);
  if (!inside(root,resolved)) throw new Error('输出目录或符号链接超出项目根。');
  return resolved;
}

async function atomicWrite(root,relative,bytes) {
  const directory=await outputDirectory(root,relative);
  const target=path.join(directory,path.basename(relative));
  const temporary=path.join(directory,'.registration-'+process.pid+'-'+randomUUID()+'.tmp');
  try {
    await writeFile(temporary,bytes,{flag:'wx'});
    await rename(temporary,target);
  } finally {
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT') throw error;});
  }
  return measurement(await readFile(target));
}

async function readRegistered(root,relative,sourceIndex,index) {
  const directory=await outputDirectory(root,relative,{create:false});
  const target=await realpath(path.join(directory,path.basename(relative)));
  if (!inside(root,target)) throw new Error('已登记文件指向项目根外。');
  const bytes=await readFile(target);
  const envelope=JSON.parse(bytes.toString('utf8'));
  validateResearchRegistration(envelope);
  if (!isDeepStrictEqual(envelope.source_index,sourceIndex) || !isDeepStrictEqual(envelope.index,index)) throw new Error('同一索引SHA的既有登记快照内容不一致；拒绝覆盖。');
  return {rawBytes:bytes,envelope,...measurement(bytes)};
}

async function preserveSnapshot(root,relative,envelope) {
  const directory=await outputDirectory(root,relative);
  const target=path.join(directory,path.basename(relative));
  const temporary=path.join(directory,'.registration-'+process.pid+'-'+randomUUID()+'.tmp');
  let reused=false;
  try {
    await writeFile(temporary,stringify(envelope),{flag:'wx'});
    try {
      // Hard-link publication is exclusive and atomic; historical identities are immutable.
      await link(temporary,target);
    } catch(error) {
      if (error.code!=='EEXIST') throw error;
      reused=true;
    }
  } finally {
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT') throw error;});
  }
  return {...await readRegistered(root,relative,envelope.source_index,envelope.index),reused};
}

export async function registerResearchState({checkOnly=false}={}) {
  const startedAt=new Date().toISOString();
  const root=await realpath(PROJECT_ROOT);
  const indexPath=await resolveSource(root,INDEX_PATH);
  const beforeIndex=await readMeasured(indexPath);
  const index=JSON.parse(beforeIndex.bytes.toString('utf8'));
  const sourceIndex={path:INDEX_PATH,...beforeIndex.actual};
  const sources=validateSelectedSourceReferences(index.sources);
  const before=await readSources(root,sources);
  const after=await readSources(root,sources);
  const afterIndexPath=await resolveSource(root,INDEX_PATH);
  if (afterIndexPath!==indexPath) throw new Error('索引实际路径在读取期间改变。');
  const afterIndex=await readMeasured(afterIndexPath,beforeIndex.actual);
  if (!isDeepStrictEqual(before,after)) throw new Error('来源实际路径或哈希在读取期间改变。');
  const sourceVerification={
    verified_source_count:8,all_source_hashes_match:true,source_hashes_unchanged:true,
    index_hash_unchanged:true,scope:VERIFICATION_SCOPE
  };
  const envelope={
    schema_version:SCHEMA,registration_id:'coordination-index:'+sourceIndex.sha256,
    source_index:sourceIndex,index,
    adapter_receipt:{
      adapter_version:'0.1',registered_at:new Date().toISOString(),
      file_acceptance:{state:'readable_verified_index'},
      science_validation:{state:'development_evidence_not_application_validated'},
      integration:{state:'local_read_only_registration'},
      execution:{state:'metadata_registered_no_model_execution'},
      source_verification:sourceVerification,operation_gates:gates()
    }
  };
  validateResearchRegistration(envelope);
  const snapshotPath='public/data/research_snapshots/'+sourceIndex.sha256+'.json';
  if (checkOnly) {
    const snapshot=await readRegistered(root,snapshotPath,sourceIndex,index);
    const current=await readRegistered(root,CURRENT_PATH,sourceIndex,index);
    if (!current.rawBytes.equals(snapshot.rawBytes)) throw new Error('当前登记副本与原SHA快照字节不同。');
    return {operation:'check_only_no_writes',registration_id:envelope.registration_id,source_index:sourceIndex,source_verification:sourceVerification,snapshot:{path:snapshotPath,sha256:snapshot.sha256,bytes:snapshot.bytes},current:{path:CURRENT_PATH,sha256:current.sha256,bytes:current.bytes}};
  }
  const snapshot=await preserveSnapshot(root,snapshotPath,envelope);
  const current=await atomicWrite(root,CURRENT_PATH,snapshot.rawBytes);
  if (current.sha256!==snapshot.sha256 || current.bytes!==snapshot.bytes) throw new Error('当前登记副本与快照写回不一致。');
  const receipt={
    schema_version:'0.1.read-only-research-registration-receipt',
    adapter_version:'0.1',registration_id:envelope.registration_id,
    operation:'verify_direct_metadata_and_register_read_only_index_snapshot',
    started_at:startedAt,completed_at:new Date().toISOString(),
    source_index:sourceIndex,
    index_measurements:{before:beforeIndex.actual,after:afterIndex.actual,unchanged:true},
    source_measurements:before.map((record,i)=>({
      source_id:record.source_id,role:record.role,path:record.path,resolved_project_relative_path:record.resolved_project_relative_path,declared:record.declared,
      before:record.actual,after:after[i].actual,
      all_declared_hashes_and_sizes_match:true,unchanged:true
    })),
    source_verification:sourceVerification,
    operation_gates:gates(),
    snapshot_identity:'original_index_sha256_not_envelope_digest',
    outputs:{
      current:{path:CURRENT_PATH,...current},
      snapshot:{path:snapshotPath,sha256:snapshot.sha256,bytes:snapshot.bytes,reused_existing_snapshot:snapshot.reused},
      receipt:{path:RECEIPT_PATH}
    },
    validation:{validator:'src/research-state.js:validateResearchRegistration',envelope_valid:true,current_and_snapshot_bytes_equal:true,original_index_object_preserved:true},
    scope:VERIFICATION_SCOPE
  };
  const receiptBytes=Buffer.from(stringify(receipt),'utf8');
  const receiptOutput=await atomicWrite(root,RECEIPT_PATH,receiptBytes);
  if (receiptOutput.sha256!==hash(receiptBytes)) throw new Error('独立软件回执写回不一致。');
  return {operation:'registered_read_only_snapshot',registration_id:envelope.registration_id,source_index:sourceIndex,source_verification:sourceVerification,outputs:{...receipt.outputs,receipt:{path:RECEIPT_PATH,...receiptOutput}}};
}

const isMain=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (isMain) {
  const args=process.argv.slice(2);
  if (args.some(arg=>arg!=='--check-only') || args.length>1) {
    console.error('仅支持直接登记或--check-only；不接受其他来源路径，不执行研究。');
    process.exitCode=1;
  } else {
    try {console.log(JSON.stringify(await registerResearchState({checkOnly:args.includes('--check-only')}),null,2));}
    catch(error) {console.error('科研索引只读登记失败：'+error.message);process.exitCode=1;}
  }
}
