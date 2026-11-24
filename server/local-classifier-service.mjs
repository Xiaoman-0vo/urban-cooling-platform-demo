import {execFile} from 'node:child_process';
import {access} from 'node:fs/promises';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {checkClassification} from './collection-readiness.mjs';
import {collectorEnabled} from './workbench-runtime.mjs';

export function canManageClassifier({workbench,host,env=process.env}) {
  return Boolean(workbench&&host==='127.0.0.1'&&collectorEnabled(env)&&env.URBANCOOL_CLASSIFIER_AUTOSTART!=='0');
}

export function createLocalClassifierService({env=process.env,platform=process.platform,
  run=promisify(execFile),check=()=>checkClassification(fetch,{env}),exists=async path=>access(path).then(()=>true,()=>false),
  wait=delay,now=Date.now,engineWaitMs=90000,serviceWaitMs=60000,retryMs=30000}={}) {
  let pending=null,nextAttempt=0;
  const controller=new AbortController();
  let status={state:'idle',message:'正在检查判定服务。'};
  const options={windowsHide:true,timeout:15000,maxBuffer:128*1024,signal:controller.signal};
  async function waitFor(probe,timeoutMs) {
    const deadline=now()+timeoutMs;
    do {controller.signal.throwIfAborted();if(await probe())return true;await wait(1500,undefined,{signal:controller.signal});}while(now()<deadline);
    return false;
  }
  const dockerReady=async()=>{
    try{await run('docker',['info','--format','{{.ServerVersion}}'],{...options,timeout:6000});return true;}
    catch{return false;}
  };
  async function start() {
    const health=await check();
    if(health.ready){status={state:'ready',message:health.message};return;}
    if(health.code==='workflow_unpublished'){status={state:'failed',message:health.message};return;}
    if(!await dockerReady()){
      status={state:'starting',message:'正在自动启动本机运行环境，你可以继续使用工作台。'};
      if(platform==='win32'){
        const executable=join(env.ProgramFiles||'C:/Program Files','Docker/Docker/Docker Desktop.exe');
        if(!await exists(executable))throw new Error('docker_missing');
        await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',
          `Start-Process -FilePath '${executable.replaceAll("'","''")}' -WindowStyle Hidden`],options);
      }else await run('docker',['desktop','start'],options);
      if(!await waitFor(dockerReady,engineWaitMs))throw new Error('engine_unavailable');
    }
    const containers=env.URBANCOOL_N8N_CONTAINER?[env.URBANCOOL_N8N_CONTAINER]:['urbancool-n8n','n8n'];
    let container;
    for(const name of containers){
      if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name))continue;
      try{await run('docker',['inspect','--format','{{.Name}}',name],options);container=name;break;}catch{}
    }
    if(!container)throw new Error('container_missing');
    status={state:'starting',message:'正在自动启动判定服务，准备好后即可采集。'};
    try{await run('docker',['start',container],options);}
    catch(error){
      if(/ports are not available|address already in use|forbidden by its access permissions/i.test(String(error.stderr||error.message)))
        throw new Error('port_unavailable');
      throw new Error('container_unavailable');
    }
    let last=health;
    if(!await waitFor(async()=>{last=await check();return last.ready||last.code==='workflow_unpublished';},serviceWaitMs))
      throw new Error('classifier_unavailable');
    status={state:last.ready?'ready':'failed',message:last.message};
  }
  function ensure() {
    if(controller.signal.aborted)return Promise.resolve(status);
    if(pending)return pending;
    if(status.state!=='ready'&&now()<nextAttempt)return Promise.resolve(status);
    status={state:'starting',message:'正在自动检查并启动判定服务…'};
    pending=start().catch(error=>{
      const messages={docker_missing:'本机运行环境尚未安装，请联系维护者配置。',
        engine_unavailable:'本机运行环境未能启动，系统会稍后自动重试。',
        container_missing:'本机尚未配置判定服务，请联系维护者导入工作流。',
        port_unavailable:'判定端口被占用或被 Windows 预留，请由维护者调整本机服务端口。',
        container_unavailable:'判定服务未能启动，系统会稍后自动重试。',
        classifier_unavailable:'判定服务尚未就绪，系统会稍后自动重试。'};
      status={state:'failed',message:messages[error.message]||'判定服务恢复失败，系统会稍后自动重试。'};
    }).finally(()=>{nextAttempt=now()+retryMs;pending=null;}).then(()=>({...status}));
    return pending;
  }
  return {ensure,close(){controller.abort();},check(fallback){return status.state==='idle'?fallback:{...fallback,ready:false,state:status.state,message:status.message};},
    get status(){return {...status};}};
}
