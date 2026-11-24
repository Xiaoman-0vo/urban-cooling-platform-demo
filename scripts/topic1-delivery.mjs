import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import JSZip from 'jszip';
import {packSource,verifySource,publishObs,probeDeployment,validateSpec,sha256} from '../deploy/huawei/delivery.mjs';
import {smokeWorkbench} from './topic1-local-smoke.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const {values,positionals}=parseArgs({allowPositionals:true,options:{target:{type:'string'},out:{type:'string'},
  artifact:{type:'string'},origin:{type:'string'},port:{type:'string'},'node-image':{type:'string'},execute:{type:'boolean'},help:{type:'boolean'}}});
const action=positionals[0]||'plan';
const help=`赛题一交付工具（在仓库根目录执行）
  npm run topic1 -- plan [--target deploy/huawei/target.json]
  npm run topic1 -- pack [--out 新目录]
  npm run topic1 -- verify --artifact ZIP路径
  npm run topic1 -- skill [--out 新目录]
  npm run topic1 -- obs --artifact ZIP路径 [--target 配置路径] [--execute]
  npm run topic1 -- probe --origin https://实际域名
  npm run topic1 -- local [--port 5312] [--node-image 镜像]
默认只计划 OBS；--execute 才调用官方 SDK，凭证只读环境变量。
local 仅创建独立的本机 Compose 项目，保留其容器和持久卷，不操作其他项目。
云主机没有配置时保持待执行。`;
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(3).toString('hex');
const output=resolve(values.out||join(root,'.runtime/topic1',action+'-'+stamp()));
async function newOutput(){await mkdir(resolve(output,'..'),{recursive:true});await mkdir(output);}
async function save(record){await writeFile(join(output,'evidence.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...record},null,2));}
async function target(){return validateSpec(JSON.parse(await readFile(resolve(values.target||join(root,'deploy/huawei/target.example.json')),'utf8')));}
async function command(args,{log}={}){
  return new Promise((done,reject)=>{
    const child=spawn('docker',args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';
    child.stdout.on('data',chunk=>{text+=chunk;});child.stderr.on('data',chunk=>{text+=chunk;});
    child.on('error',reject);child.on('close',async code=>{
      if(log)await writeFile(join(output,log),text);
      if(code===0)done(text);else reject(Error(`Docker命令失败（退出码 ${code}），请查看本次运行目录中的日志。`));
    });
  });
}
async function local(){
  const port=Number(values.port||5312);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port.');
  const nodeImage=values['node-image']||'node:24-bookworm-slim';
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/.test(nodeImage))throw Error('Invalid build image.');
  const project='urbancool-t1-'+randomBytes(5).toString('hex'),origin=`http://127.0.0.1:${port}`,image=`urbancool-workbench:${project}`;
  const envFile=join(output,'local.env');
  await writeFile(envFile,`URBANCOOL_SITE_ORIGIN=${origin}\nURBANCOOL_HTTP_PORT=${port}\nURBANCOOL_NODE_IMAGE=${nodeImage}\nURBANCOOL_IMAGE=${image}\n`);
  const compose=['compose','--project-name',project,'--env-file',envFile,'-f','deploy/huawei/compose.yaml'];
  const record={schema:'urbancool-topic1-local/1',started_at:new Date().toISOString(),status:'running',scope:'local_container_only',
    project,image,node_image:nodeImage,origin,checks:{},cloud_provider_verified:false,codearts_execution_verified:false};
  try{
    // Bind check happens before building, and fails without touching any existing listener.
    const {createServer}=await import('node:net');
    await new Promise((done,reject)=>{const server=createServer();server.on('error',reject);server.listen(port,'127.0.0.1',()=>server.close(done));});
    await command([...compose,'config','--quiet'],{log:'compose-config.log'});
    await command([...compose,'build','workbench'],{log:'build.log'});record.checks.fresh_build=true;
    await command([...compose,'up','-d','--no-build','workbench'],{log:'start.log'});
    async function waitReady(){for(let i=0;i<35;i++){try{if((await probeDeployment(origin)).status==='passed')return;}catch{}await new Promise(done=>setTimeout(done,1000));}throw Error('Container readiness timed out.');}
    await waitReady();
    const smoke=await smokeWorkbench(origin,root);const {checks,...details}=smoke.record;
    Object.assign(record,details);Object.assign(record.checks,checks);
    await command([...compose,'restart','workbench'],{log:'restart.log'});await waitReady();
    Object.assign(record.checks,await smoke.verifyAfterRestart());
    const id=(await command([...compose,'ps','-q','workbench'])).trim();
    const inspected=JSON.parse(await command(['inspect',id]))[0];
    record.container={id:inspected.Id,image_id:inspected.Image,user:inspected.Config.User,read_only:inspected.HostConfig.ReadonlyRootfs,
      mounts:inspected.Mounts.map(m=>({type:m.Type,destination:m.Destination,name:m.Name||null})),health:inspected.State.Health?.Status};
    record.checks.non_root=record.container.user==='node';record.checks.read_only=record.container.read_only===true;
    assertChecks(record.checks);record.status='passed';
  }catch(error){record.status='failed';record.message=error.message;process.exitCode=1;}
  record.finished_at=new Date().toISOString();await save(record);
}
function assertChecks(checks){if(!Object.values(checks).every(v=>v===true))throw Error('A local acceptance check failed.');}
try{
  if(!values.help&&['plan','obs','probe','skill','local'].includes(action))await newOutput();
  if(values.help||action==='help')console.log(help);
  else if(action==='plan'){
    const spec=await target();await save({schema:'urbancool-topic1-plan/1',status:'prepared_not_executed',target:spec,
      obs_credentials_present:Boolean(process.env.HUAWEICLOUD_SDK_AK&&process.env.HUAWEICLOUD_SDK_SK),
      missing:[...(!spec.region?['region']:[]),...(!spec.obs.bucket?['obs.bucket']:[]),
        ...['host','ssh_port','ssh_user','deploy_directory','https_origin'].filter(k=>!spec.ecs[k]).map(k=>'ecs.'+k)],
      codearts_execution_verified:false,cloud_provider_verified:false});
  }else if(action==='pack'){
    await mkdir(resolve(output,'..'),{recursive:true});const result=await packSource(root,output);
    console.log(JSON.stringify({artifact:result.artifact,sha256:result.record.artifact_sha256,bytes:result.record.artifact_bytes,members:result.record.members.length},null,2));
  }else if(action==='verify'){
    if(!values.artifact)throw Error('--artifact required.');console.log(JSON.stringify(await verifySource(resolve(values.artifact)),null,2));
  }else if(action==='obs'){
    if(!values.artifact)throw Error('--artifact required.');const result=await publishObs({spec:await target(),artifact:resolve(values.artifact),execute:values.execute});
    await save(result);if(['failed','not_run'].includes(result.status))process.exitCode=1;
  }else if(action==='probe'){
    if(!values.origin)throw Error('--origin required.');const result=await probeDeployment(values.origin);await save(result);if(result.status!=='passed')process.exitCode=1;
  }else if(action==='skill'){
    const name='urbancool-huawei-delivery',zip=new JSZip();
    zip.file(`${name}/SKILL.md`,await readFile(join(root,'.codeartsdoer/skills',name,'SKILL.md')));
    const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});if(bytes.length>5*1024*1024)throw Error('Skill exceeds import size limit.');
    await writeFile(join(output,name+'.zip'),bytes);await save({schema:'urbancool-codearts-skill/1',status:'packaged_not_imported',
      path:'.codeartsdoer/skills/'+name,archive:name+'.zip',sha256:sha256(bytes),bytes:bytes.length,requires_current_repository:true});
  }else if(action==='local')await local();
  else throw Error('Unknown action.\n'+help);
}catch(error){console.error(error.message);process.exitCode=1;}
