import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';

const run=promisify(execFile);
export async function docker(args){
  return (await run('docker',args,{windowsHide:true,timeout:60000,maxBuffer:8*1024*1024})).stdout;
}

export async function findContainer({containerName,classifierOrigin}){
  const port=new URL(classifierOrigin).port||'80';
  for(const name of containerName?[containerName]:['urbancool-n8n','n8n']){
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name))throw new Error('n8n 容器名称无效。');
    let bindings;
    try{bindings=JSON.parse(await docker(['inspect','--format','{{json .HostConfig.PortBindings}}',name]));}
    catch{continue;}
    if(bindings?.['5678/tcp']?.some(binding=>binding.HostPort===port))return name;
    if(containerName)throw new Error(`容器 ${name} 的端口映射与 ${classifierOrigin} 不一致。`);
  }
  throw new Error(`找不到映射到 ${classifierOrigin} 的 n8n 容器，请先打开 Docker 并核对配置。`);
}

export async function classifierReady(origin){
  try{
    const response=await fetch(origin+'/webhook/weibo-demand/v1',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(2500),
      body:JSON.stringify({contract_version:'1.0.0',request_id:'req-xhs-start-health',action:'health',payload:{}})});
    const data=await response.json();
    return response.ok&&data.status==='ok'&&data.result?.alive===true&&data.result?.route==='health';
  }catch{return false;}
}

export async function waitForClassifier(origin,timeoutMs=60000){
  const deadline=Date.now()+timeoutMs;
  do{if(await classifierReady(origin))return;await delay(1000);}while(Date.now()<deadline);
  throw new Error('判定工作流未就绪，请先部署 03-demand-agent-api。');
}
