import {createHash} from 'node:crypto';
import {lstat,readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import JSZip from 'jszip';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const roots=['src','server','public','worker','config','tests','scripts','deploy/huawei','.codeartsdoer/skills/urbancool-huawei-delivery',
  'verification/2026-11-24/consistency-review'];
const singles=['package.json','package-lock.json','index.html','vite.config.mjs','Dockerfile','.dockerignore','.gitignore','.codeartsdoer/.gitignore','AGENTS.md','CODEARTS_TASK.md','README.md',
  'documentation/赛题1部署与交付.md','documentation/系统操作指南.md','documentation/工作台启动与验收.md',
  'documentation/成都参考案例与评价边界_2026-11-24.md',
  'verification/2026-11-24/case-evaluation/protocol.json','verification/2026-11-24/case-evaluation/results.json',
  'verification/2026-11-24/case-evaluation/codearts-provenance.json',
  'verification/2026-11-24/case-evaluation/codearts-source/evaluation-readiness.js',
  'verification/2026-11-24/case-evaluation/codearts-source/evaluation-readiness.test.mjs',
  'verification/2026-11-24/case-evaluation/codearts-source/CODEARTS_CASE_TASK.md',
  'evidence/科研登记_最新双版本JSON磁盘核对.json'];
const templates=new Set(['deploy/huawei/.env.example']);
const requiredInputs=['package.json','package-lock.json','Dockerfile','index.html','server/agent-server.mjs','public/data/scene.json'];
const forbidden=path=>!templates.has(path)&&(path.split('/').some(part=>/^(?:node_modules|\.git|\.runtime|__pycache__|\.env.*|.*cookie.*)$/i.test(part))||
  /(?:\.pem|\.key|\.sqlite(?:-\w+)?|\.db|\.pt|\.pth|\.ckpt|\.joblib|\.onnx|\.safetensors|\.pkl)$/i.test(path)||
  /\/(?:auth|credentials|settings|target)\.json$/i.test(path));
const allowed=path=>!forbidden(path)&&(singles.includes(path)||roots.some(root=>path.startsWith(root+'/'))||
  /^(?:weibo-demand-agent|xiaohongshu_demand_agent)\/scripts\//.test(path));

export async function packSource(root,directory) {
  root=resolve(root);directory=resolve(directory);await mkdir(directory); // A prior release cannot be overwritten.
  const zip=new JSZip(),members=[];
  async function add(path){
    const full=join(root,path),info=await lstat(full);
    if(info.isSymbolicLink())throw Error('Release input contains a symbolic link.');
    if(info.isDirectory()){
      for(const name of (await readdir(full)).sort()){
        const child=`${path}/${name}`;if(!forbidden(child))await add(child);
      }
    }else if(info.isFile()&&allowed(path)){
      const bytes=await readFile(full);zip.file(path,bytes);members.push({path,bytes:bytes.length,sha256:sha256(bytes)});
    }
  }
  for(const name of [...singles,...roots,'weibo-demand-agent/scripts','xiaohongshu_demand_agent/scripts']){
    try{await add(name);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  for(const required of requiredInputs)
    if(!members.some(item=>item.path===required))throw Error(`Missing release input: ${required}`);
  const manifest={schema:'urbancool-topic1-release/1',created_at:new Date().toISOString(),members,
    scope:'Application source and registered public assets only; no user database, credentials, model weights or execution claim.'};
  zip.file('release-manifest.json',JSON.stringify(manifest,null,2));
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  const artifact=join(directory,'urbancool-source.zip');await writeFile(artifact,bytes);
  const record={...manifest,artifact:'urbancool-source.zip',artifact_sha256:sha256(bytes),artifact_bytes:bytes.length};
  await writeFile(join(directory,'release.json'),JSON.stringify(record,null,2)+'\n');
  return {artifact,record};
}

export async function verifySource(artifact){
  const bytes=await readFile(artifact),zip=await JSZip.loadAsync(bytes),entry=zip.file('release-manifest.json');
  if(!entry)throw Error('Release manifest missing.');
  const manifest=JSON.parse(await entry.async('string'));
  if(manifest.schema!=='urbancool-topic1-release/1'||!Array.isArray(manifest.members))throw Error('Invalid release manifest.');
  const names=new Set(['release-manifest.json']);
  for(const item of manifest.members){
    if(typeof item.path!=='string'||item.path.includes('..')||!allowed(item.path)||names.has(item.path))throw Error('Invalid release member.');
    const member=zip.file(item.path);if(!member||member.unsafeOriginalName&&member.unsafeOriginalName!==item.path)throw Error('Release member missing or unsafe.');
    const content=await member.async('uint8array');
    if(content.length!==item.bytes||sha256(content)!==item.sha256)throw Error('Release member hash mismatch.');
    names.add(item.path);
  }
  if(requiredInputs.some(name=>!names.has(name)))throw Error('Required release inputs missing.');
  if(Object.values(zip.files).some(item=>!item.dir&&!names.has(item.name)))throw Error('Unexpected release member.');
  return {sha256:sha256(bytes),bytes:bytes.length,members:manifest.members.length};
}

export function validateSpec(spec){
  if(!spec||spec.schema!=='urbancool-topic1-target/1'||Object.keys(spec).some(k=>!['schema','region','obs','ecs'].includes(k)))throw Error('Invalid target specification.');
  if(typeof spec.region!=='string'||spec.region&&!/^[a-z]{2}-[a-z0-9-]{2,28}$/.test(spec.region))throw Error('Invalid region.');
  const obs=spec.obs;
  if(!obs||Object.keys(obs).some(k=>!['bucket','create_bucket'].includes(k))||typeof obs.bucket!=='string'||
    obs.bucket&&!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(obs.bucket)||typeof obs.create_bucket!=='boolean')throw Error('Invalid OBS target.');
  const ecs=spec.ecs;
  if(!ecs||Object.keys(ecs).some(k=>!['host','ssh_port','ssh_user','deploy_directory','https_origin'].includes(k))||
    ['host','ssh_user','deploy_directory','https_origin'].some(k=>typeof ecs[k]!=='string')||
    ecs.ssh_port!==null&&(!Number.isInteger(ecs.ssh_port)||ecs.ssh_port<1||ecs.ssh_port>65535)||
    ecs.host&&!/^[a-zA-Z0-9.:-]{1,253}$/.test(ecs.host)||ecs.ssh_user&&!/^[a-z_][a-z0-9_-]{0,31}$/.test(ecs.ssh_user)||
    ecs.deploy_directory&&!/^\/[a-zA-Z0-9_./-]+$/.test(ecs.deploy_directory))throw Error('Invalid ECS target.');
  if(ecs.https_origin){
    const url=new URL(ecs.https_origin);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Invalid HTTPS origin.');
  }
  return spec;
}

export async function publishObs({spec,artifact,execute=false,env=process.env,clientFactory}){
  validateSpec(spec);const bundle=await verifySource(artifact);
  const result={schema:'urbancool-topic1-obs/1',status:'planned_not_executed',region:spec.region,bucket:spec.obs.bucket,
    object_key:`urbancool/releases/${bundle.sha256}.zip`,bundle,operations:[],missing:[]};
  if(!spec.region)result.missing.push('region');if(!spec.obs.bucket)result.missing.push('obs.bucket');
  if(!execute)return result;
  if(!env.HUAWEICLOUD_SDK_AK||!env.HUAWEICLOUD_SDK_SK)result.missing.push('environment_credentials');
  if(result.missing.length){result.status='not_run';return result;}
  if(!clientFactory){const {default:ObsClient}=await import('esdk-obs-nodejs');clientFactory=options=>new ObsClient(options);}
  const client=clientFactory({access_key_id:env.HUAWEICLOUD_SDK_AK,secret_access_key:env.HUAWEICLOUD_SDK_SK,
    security_token:env.HUAWEICLOUD_SDK_SECURITY_TOKEN,server:`https://obs.${spec.region}.myhuaweicloud.com`,timeout:20,max_retry_count:0});
  async function call(name,args){
    let reply;
    try{reply=await client[name](args);}catch{result.operations.push({operation:name,status:'network_error'});throw Error('OBS request failed.');}
    const status=Number(reply?.CommonMsg?.Status),request=reply?.CommonMsg?.RequestId;
    result.operations.push({operation:name,http_status:status,request_id:typeof request==='string'&&/^[a-f0-9]{8,128}$/i.test(request)?request:null});
    if(!Number.isInteger(status)||status<200||status>=300)throw Error('OBS rejected the request.');
    return reply;
  }
  try{
    if(spec.obs.create_bucket)await call('createBucket',{Bucket:spec.obs.bucket,Location:spec.region,ACL:'private'});
    else await call('getBucketMetadata',{Bucket:spec.obs.bucket});
    await call('putObject',{Bucket:spec.obs.bucket,Key:result.object_key,SourceFile:resolve(artifact),ACL:'private',ContentType:'application/zip'});
    const head=await call('getObjectMetadata',{Bucket:spec.obs.bucket,Key:result.object_key});
    if(Number(head?.InterfaceResult?.ContentLength)!==bundle.bytes)throw Error('OBS object length not verified.');
    result.status='uploaded_and_metadata_verified';
  }catch{result.status='failed';result.message='OBS操作未完成；已保留执行到的步骤，请核对权限和资源状态。';}
  finally{client.close?.();}
  return result;
}

export async function probeDeployment(baseUrl,{fetchImpl=fetch}={}){
  const url=new URL(baseUrl),local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw Error('Use an HTTPS origin or a local HTTP origin.');
  const result={schema:'urbancool-topic1-runtime/1',origin:url.origin,scope:local?'local_runtime':'remote_runtime_provider_not_attested',checks:{},cloud_provider_verified:false};
  try{
    const health=await fetchImpl(new URL('/healthz',url),{redirect:'error',signal:AbortSignal.timeout(5000)});
    const body=await health.json();result.checks.health=health.ok&&body.status==='ready'&&body.service==='urbancool-workbench'&&body.accounts===true;
    const page=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(5000)});
    const html=await page.text();result.checks.page=page.ok&&/id=["']root["']/.test(html)&&/UrbanCool/.test(html);
  }catch{result.checks.connection=false;}
  result.status=Object.values(result.checks).every(Boolean)?'passed':'failed';return result;
}
