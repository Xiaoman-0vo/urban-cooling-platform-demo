import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
const root=resolve('..');
const groups=[
 ['planning-description','规划来源描述','共享接口/规划描述底稿/',['README.md','现状指标描述统计.csv','描述范围与适用状态核查.json','现状绿色组织与建成背景.png']],
 ['planning-development','配置开发信息','共享接口/规划开发增补/',['说明与边界.md','开发增补来源绑定.json','配置开发误差_紧凑.csv','配对增量_紧凑.csv']],
 ['candidate-resource','候选资源与窗口','',[...['六住宅植被资源支持候选.csv','候选窗口重叠.csv','资源支持说明.md','资源支持核查.json','保存回读核查.json'].map(n=>'共享接口/公平性输入准备/资源支持试核/'+n),...['六对象窗口变化.csv','候选份额顺序变化.csv','窗口敏感性说明.md','窗口敏感性核查.json'].map(n=>'共享接口/公平性输入准备/窗口敏感性试核/'+n)]],
 ['modifiable-evidence','可改空间证据','共享接口/微观试验准备/',['可改空间接纳证据表_20261006.csv','可改空间接纳证据表_20261006.md','可改空间来源存在与版本_20261006.csv','可改空间来源与对象证据_20261006.json']],
 ['focal-neighbor','本格与周边描述','共享接口/本格与周边描述/',['README.md','本格与八邻格逐格对照.csv','六指标对照支持与差异.csv','共同案例与极值示例.csv','本格周边描述核查.json','制图来源与样式核查.json','本格与周边比例差异.png','本格与周边比例差异.svg','差值色阶近似色觉检查.png','独立核查.json','复现与接纳检查.json']]
];
const sha=b=>createHash('sha256').update(b).digest('hex');
const catalog=[], registrations=[], sourcesRead=[];
const now=new Date().toISOString();
let frozen=[];try{frozen=JSON.parse(await readFile('public/data/supplement-state.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const gates={prediction:false,physical_simulation:false,service_evaluation:false,fairness_evaluation:false,candidate_generation:false,ranking:false};
for(const [group_id,title,prefix,names] of groups) {
 const sources=[], snapshot=new Map(),zip=new JSZip();
 for(const n of names){
  const path=prefix+n,b=await readFile(resolve(root,path)); snapshot.set(path,b);
  const extension=path.split('.').at(-1),mime_type={csv:'text/csv',md:'text/markdown',json:'application/json',png:'image/png',svg:'image/svg+xml'}[extension];
  sources.push({path,bytes:b.length,sha256:sha(b),mime_type});
  zip.file(path,b,{createFolders:false,date:new Date('2026-10-06T00:00:00Z')});
 }
 const fingerprint=sha(Buffer.from(JSON.stringify(sources)));
 const archive=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
 let entry={group_id,title,schema_version:'0.1.read-only-'+group_id,registration_id:'supplement:'+group_id+':'+fingerprint,sources,archive:{bytes:archive.length,sha256:sha(archive)},adapter_receipt:{version:'0.1',registered_at:now,file_acceptance:'verified_explicit_original_bytes',science_validation:'source_states_preserved_no_upgrade',integration:'read_only_review',execution:'metadata_checked_no_research_execution',operation_gates:gates,application_gates:{new_site_prediction:false,physical_simulation:false,pedestrian_thermal_comfort:false,actual_access_or_use_service:false,fairness_evaluation:false,minimum_new_green_area_search:false,candidate_generation:false,ranking:false,planning_response_or_cooling_effect:false}}};
 const old=frozen.find(r=>r.group_id===group_id);
 if(old){
  if(JSON.stringify(old.sources)!==JSON.stringify(sources)||old.archive.sha256!==sha(archive)||old.archive.bytes!==archive.length||old.archive_base64!==archive.toString('base64'))throw new Error('Frozen snapshot changed; create a separate explicit version while retaining old registrations: '+group_id);
  const {archive_base64,...originalEntry}=old;entry=originalEntry;
 }
 catalog.push(entry);registrations.push({...entry,archive_base64:archive.toString('base64')});
 for(const [path,b] of snapshot){const after=await readFile(resolve(root,path));if(sha(after)!==sha(b))throw new Error('Source changed: '+path);sourcesRead.push({path,bytes:b.length,sha256:sha(b),before_after_bytes_equal:true});}
}
await mkdir('public/data',{recursive:true});await mkdir('evidence',{recursive:true});
await writeFile('src/supplement-catalog.js','// Frozen explicit byte identities. New sources require a separate registered snapshot.\nexport const SUPPLEMENT_CATALOG = Object.freeze('+JSON.stringify(catalog,null,2)+');\n');
await writeFile('public/data/supplement-state.json',JSON.stringify(registrations));
await writeFile('evidence/五组来源读取与登记_20261006.json',JSON.stringify({checked_at:now,frozen_registration_preserved:frozen.length>0,scope:'explicit_32_source_files_only_no_research_rerun',groups:catalog,source_reads:sourcesRead,source_bytes_unchanged:true,labels_weights_or_full_predictions_read:false},null,2)+'\n');
console.log(JSON.stringify(catalog.map(x=>({id:x.group_id,sources:x.sources.length,archive_bytes:x.archive.bytes,raw_bytes:x.sources.reduce((a,b)=>a+b.bytes,0)}))));
