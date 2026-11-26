import {spawn,execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {closeSync,openSync} from 'node:fs';
import {access,mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {createServer} from 'node:net';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {loadLocalEnvironment} from '../server/agent-server.mjs';
import {checkClassification,checkCollectionReadiness} from '../server/collection-readiness.mjs';
import {createHistoricalTemperature} from '../server/historical-lst.mjs';
import {configuredOpenCliEntry} from '../xiaohongshu_demand_agent/scripts/opencli-xhs.mjs';
import {createQwenClient} from '../server/qwen-client.mjs';
import {qwenConfig} from '../server/qwen-config.mjs';
import {portOccupied,serverMatches} from './local-platform-service.mjs';
import {buildWorkbench} from './build-workbench.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runtime=join(root,'.runtime');
const run=promisify(execFile);
const runOptions={cwd:root,windowsHide:true,timeout:20000,maxBuffer:128*1024};

async function exists(path) {
  try{await access(path);return true;}catch{return false;}
}

async function newestFile(path) {
  const info=await stat(path);
  if(!info.isDirectory())return info.mtimeMs;
  const children=await readdir(path);
  const modified=await Promise.all(children.map(name=>newestFile(join(path,name))));
  return Math.max(info.mtimeMs,...modified);
}

async function prepareBuild() {
  if(!await exists(join(root,'node_modules/vite/bin/vite.js')))
    throw new Error('请先在工作台目录运行一次 npm ci 安装依赖。');
  const index=join(root,'dist/client/index.html');
  const inputs=['src','public','index.html','vite.config.mjs','package.json','package-lock.json','scripts/build-workbench.mjs'];
  const newest=Math.max(...await Promise.all(inputs.map(path=>newestFile(join(root,path)))));
  if(await exists(index)&&(await stat(index)).mtimeMs>=newest){
    console.log('页面已是最新构建。');return;
  }
  console.log('正在准备最新页面，首次启动需要稍等…');
  await buildWorkbench({root,mode:'accounts'});
}

async function prepareModel() {
  if(!process.env.URBANCOOL_LST_ROOT){
    for(const candidate of [resolve(root,'../finetune-temperature-deepseek'),resolve(root,'../../finetune-temperature-deepseek')]){
      if(await exists(join(candidate,'tabular-v3/model.joblib'))){process.env.URBANCOOL_LST_ROOT=candidate;break;}
    }
  }
  const model=createHistoricalTemperature();
  if(!model){console.log('温度模型待配置，可先使用地图、预算与报告。');return;}
  try{
    const result=await model.estimate({grid_id:'E4125_N33891',date:'2022-09-28'});
    if(result.status!=='estimated')throw new Error('No sample');
    console.log('本地 V3 温度模型已就绪。');
  }catch{
    console.log('温度模型未就绪，请在 .env.local 核对模型目录和 Python。');
  }
}

async function waitFor(check,timeoutMs) {
  const deadline=Date.now()+timeoutMs;
  do{
    if(await check())return true;
    await delay(1500);
  }while(Date.now()<deadline);
  return false;
}

async function prepareClassification() {
  if((await checkClassification()).ready){console.log('线索判定服务已在运行。');return;}
  console.log('工作台正在后台自动准备判定服务…');
  if(await waitFor(async()=>(await checkClassification()).ready,10000))console.log('线索判定服务已就绪。');
  else console.log('可先使用工作台；采集页会自动显示启动进度和重试结果。');
}

async function prepareBrowserBridge() {
  if(!process.env.OPENCLI_ENTRY){
    const packageRoot=join(process.env.APPDATA||join(homedir(),'.local/lib'),'npm/node_modules/@jackwener/opencli');
    try{
      const metadata=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
      const entry=resolve(packageRoot,typeof metadata.bin==='string'?metadata.bin:metadata.bin.opencli);
      if(configuredOpenCliEntry(entry))process.env.OPENCLI_ENTRY=entry;
    }catch{}
  }
  const entry=configuredOpenCliEntry();
  if(!entry)return;
  try{
    const response=await fetch('http://127.0.0.1:19825/status',{headers:{'X-OpenCLI':'1'},signal:AbortSignal.timeout(1200)});
    if(response.ok&&typeof (await response.json()).extensionConnected==='boolean')return;
  }catch{}
  try{
    await run(process.execPath,[entry,'daemon','restart'],{...runOptions,timeout:15000});
  }catch{}
}

async function startWorkbench(url) {
  if(await portOccupied(url)){
    if(!await serverMatches(root,url))throw new Error(`${new URL(url).port} 端口被其他服务使用，请在 .env.local 修改 AGENT_PORT。`);
    console.log('工作台已在运行，直接打开。');
    return;
  }
  const stdout=openSync(join(runtime,'local-preview.stdout.log'),'a');
  const stderr=openSync(join(runtime,'local-preview.stderr.log'),'a');
  let child;
  try{
    console.log('正在启动账户工作台…');
    child=spawn(process.execPath,['server/agent-server.mjs','--workbench'],{
      cwd:root,env:process.env,windowsHide:true,detached:true,stdio:['ignore',stdout,stderr],
    });
    await once(child,'spawn');
  }finally{closeSync(stdout);closeSync(stderr);}
  await writeFile(join(runtime,'local-preview.pid'),String(child.pid)+'\n');
  child.unref();
  if(!await waitFor(()=>serverMatches(root,url),60000))
    throw new Error('工作台启动未完成，请查看 .runtime/local-preview.stderr.log。');
  console.log('工作台已就绪。');
}

async function openPage(url) {
  const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
  const child=spawn(command,args,{windowsHide:true,detached:true,stdio:'ignore'});
  await once(child,'spawn');child.unref();
}

async function main() {
  process.chdir(root);
  await loadLocalEnvironment();
  await mkdir(runtime,{recursive:true});
  const port=Number(process.env.AGENT_PORT||5181);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('AGENT_PORT 应为 1024–65535 之间的端口。');
  const url=`http://127.0.0.1:${port}`;
  console.log('正在准备 UrbanCool 工作台…');
  await prepareBuild();
  await prepareModel();
  if(process.argv.includes('--skip-qwen-check'))console.log('Qwen 对话 · 已跳过连接检查。');
  else try{
    const languageModel=createQwenClient(qwenConfig());
    if(languageModel.probeStatus){
      const connection=await languageModel.probeStatus();
      console.log(`Qwen 对话 · ${connection.message}`);
    }
  }catch{console.log('Qwen 对话 · 请在 .env.local 核对模型服务配置。');}
  await prepareBrowserBridge();
  await startWorkbench(url);
  await prepareClassification();
  const readiness=await checkCollectionReadiness('xhs');
  for(const check of readiness.checks)console.log(`${check.label} · ${check.ready?'已就绪':check.message}`);
  console.log(`工作台地址 ${url}`);
  if(!process.argv.includes('--no-open'))await openPage(url);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const lock=createServer();
  const scope=createHash('sha256').update(root).digest('hex').slice(0,16);
  const lockAddress=process.platform==='win32'?'\\\\.\\pipe\\urbancool-start-'+scope:join(root,'.runtime','workbench-start.sock');
  await mkdir(runtime,{recursive:true});
  try{
    lock.listen(lockAddress);
    await once(lock,'listening');
    try{await main();}finally{lock.close();}
  }catch(error){
    if(error.code==='EADDRINUSE')console.log('工作台正在准备，请稍候。');
    else {console.error(error.message);process.exitCode=1;}
  }
}
