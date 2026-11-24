import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {probeDeployment} from '../deploy/huawei/delivery.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const run=promisify(execFile);
const options={cwd:root,windowsHide:true,timeout:10000,maxBuffer:64*1024};
async function engineReady(){try{await run('docker',['version','--format','{{.Server.Version}}'],options);return true;}catch{return false;}}

async function main(){
  let local;
  try{local=JSON.parse(await readFile(new URL('../.runtime/topic1/active-preview.json',import.meta.url),'utf8')).local;}
  catch(error){if(error.code!=='ENOENT')throw error;
    const evidence=JSON.parse(await readFile(new URL('../verification/2026-11-22/topic1-prototype-acceptance.json',import.meta.url),'utf8'));
    local=evidence.deployment?.local;}
  const id=local?.container?.id,expectedImage=local?.container?.image_id;
  if(!/^[a-f0-9]{64}$/.test(id||'')||!/^sha256:[a-f0-9]{64}$/.test(expectedImage||'')||
    !/^urbancool-t1-[a-f0-9]+$/.test(local?.project||'')||local.origin!=='http://127.0.0.1:5312')
    throw Error('试用实例记录不完整，请检查原容器验收记录。');
  if(!await engineReady()){
    if(process.platform!=='win32')throw Error('请先启动 Docker 引擎。');
    await access('C:/Program Files/Docker/Docker/Docker Desktop.exe');
    console.log('正在后台启动 Docker Desktop…');
    await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      "Start-Process -FilePath 'C:/Program Files/Docker/Docker/Docker Desktop.exe' -WindowStyle Hidden"],options);
    const deadline=Date.now()+90000;
    while(!await engineReady()){
      if(Date.now()>deadline)throw Error('Docker 启动尚未完成，请稍后再次双击启动入口。');
      await delay(2000);
    }
  }
  let identity;
  try{identity=await run('docker',['inspect','--format',
    '{{.Id}} {{.Image}} {{index .Config.Labels "com.docker.compose.project"}}',id],options);}
  catch{throw Error('没有找到原试用容器，请联系维护者恢复原实例及其数据卷。');}
  if(identity.stdout.trim()!==`${id} ${expectedImage} ${local.project}`)
    throw Error('容器身份与试用记录不一致，未启动其他容器。');
  const state=await run('docker',['inspect','--format','{{.State.Running}}',id],options);
  if(state.stdout.trim()!=='true'){
    console.log('正在恢复原试用容器…');
    await run('docker',['start',id],options);
  }
  const deadline=Date.now()+60000;
  while((await probeDeployment(local.origin)).status!=='passed'){
    if(Date.now()>deadline)throw Error('服务尚未就绪，请检查原试用容器日志。');
    await delay(1000);
  }
  const url=local.origin+'/?view=workflow';
  console.log(`试用系统已就绪：${url}`);
  console.log('继续使用原试用账户即可。');
  if(!process.argv.includes('--no-open')&&process.platform==='win32'){
    const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'});
    child.on('error',()=>console.log('请手动打开上方地址。'));child.unref();
  }
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
