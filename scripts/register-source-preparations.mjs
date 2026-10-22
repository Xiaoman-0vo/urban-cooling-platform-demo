import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
const root=resolve('..'),path='平台产品设计/来源准备三组接入清单_20261006.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifestBytes=await readFile(resolve(root,path));
if(sha(manifestBytes)!=='4fbe5e23e47436869fbd78fc74741e5bbeb60a4017c73001b1b7583d7a1c8860')throw new Error('冻结清单版本不一致。');
const manifest=JSON.parse(manifestBytes.toString('utf8'));
const manifest_source={path,bytes:manifestBytes.length,sha256:sha(manifestBytes)};
let frozen=[];try{frozen=JSON.parse(await readFile('public/data/source-preparation-state.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const now=new Date().toISOString(),catalog=[],registrations=[],sourceChecks=[];
const gates={new_site_prediction:false,physical_simulation:false,thermal_comfort:false,routing_or_OD:false,actual_access_or_use_service:false,fairness:false,minimum_green_area:false,candidate_generation:false,ranking:false};
for(const group of manifest.groups){
 const zip=new JSZip();zip.file('source-manifest.json',manifestBytes,{createFolders:false,date:new Date('2026-10-06T00:00:00Z')});
 const before=new Map();
 for(const f of group.files){const bytes=await readFile(resolve(root,f.path));if(bytes.length!==f.bytes||sha(bytes)!==f.sha256)throw new Error('源件版本不一致：'+f.path);before.set(f.path,bytes);zip.file(f.path,bytes,{createFolders:false,date:new Date('2026-10-06T00:00:00Z')});}
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
 let entry={schema_version:'0.1.source-preparation-registration',group_id:group.group_id,registration_id:group.registration_id,source_group:group,manifest_source,archive:{bytes:bytes.length,sha256:sha(bytes)},adapter_receipt:{version:'0.1',registered_at:now,file_acceptance:'verified_31_source_bytes_and_original_manifest',science_validation:'source_preparation_not_adopted',integration:'read_only_source_review',execution:'source_metadata_verified_no_producer_or_research_run',application_gates:gates}};
 const original=frozen.find(r=>r.registration_id===group.registration_id);
 if(original){if(original.archive.sha256!==sha(bytes)||original.archive.bytes!==bytes.length||JSON.stringify(original.source_group)!==JSON.stringify(group)||original.manifest_source.sha256!==manifest_source.sha256)throw new Error('不能覆盖原登记，需独立新版本。');const {archive_base64,manifest_base64,...oldEntry}=original;entry=oldEntry;}
 catalog.push(entry);registrations.push({...entry,archive_base64:bytes.toString('base64'),manifest_base64:manifestBytes.toString('base64')});
 for(const [path,bytes]of before){const after=await readFile(resolve(root,path));if(sha(after)!==sha(bytes))throw new Error('读取前后源件变化：'+path);sourceChecks.push({path,absolute_path:resolve(root,path),bytes:bytes.length,sha256:sha(bytes),before_after_equal:true});}
}
if(sha(await readFile(resolve(root,path)))!==manifest_source.sha256)throw new Error('清单读取后变化。');
await mkdir('evidence',{recursive:true});
await writeFile('src/source-preparation-catalog.js','// Independent frozen source-preparation registrations; source claims are preserved.\nexport const SOURCE_PREPARATION_CATALOG=Object.freeze('+JSON.stringify(catalog,null,2)+');\n');
await writeFile('public/data/source-preparation-state.json',JSON.stringify(registrations));
await writeFile('evidence/三组来源原字节登记_20261006.json',JSON.stringify({checked_at:now,manifest_source,group_count:3,source_count:31,source_checks:sourceChecks,external_raw_assets_read_or_delivered:false,source_producers_run:false,source_bytes_unchanged:true,old_snapshots_preserved:true},null,2)+'\n');
console.log(JSON.stringify(catalog.map(r=>({group_id:r.group_id,source_count:r.source_group.file_count,zip_bytes:r.archive.bytes}))))
