import {randomUUID} from 'node:crypto';
import {access,readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuredOpenCliEntry} from '../xiaohongshu_demand_agent/scripts/opencli-xhs.mjs';
import {findAgentReach} from '../xiaohongshu_demand_agent/scripts/agent-reach-bin.mjs';
import {collectorEnabled,COLLECTOR_DISABLED_MESSAGE} from './workbench-runtime.mjs';
import {classifierOrigin} from './classifier-config.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));

export async function checkClassification(fetchImpl=fetch,{env=process.env}={}) {
  try {
    const response=await fetchImpl(classifierOrigin(env)+'/webhook/weibo-demand/v1',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(2500),
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contract_version:'1.0.0',request_id:`req-readiness-${randomUUID()}`,action:'health',payload:{}}),
    });
    if(response.status===404)return {id:'classifier',label:'线索判定',ready:false,code:'workflow_unpublished',message:'判定工作流待配置，请联系维护者导入并发布。'};
    const reply=await response.json();
    if(response.ok&&reply.status==='ok'&&reply.result?.alive===true&&reply.result?.route==='health')
      return {id:'classifier',label:'线索判定',ready:true,message:'判定服务已就绪。'};
  } catch {}
  return {id:'classifier',label:'线索判定',ready:false,message:'判定服务尚未连接，正在检查本机服务状态。'};
}

export async function checkCollectionReadiness(channel,{fetchImpl=fetch,env=process.env,classifierService}={}) {
  if(!collectorEnabled(env))return {ready:false,checks:[{id:'execution',label:'采集运行位置',ready:false,message:COLLECTOR_DISABLED_MESSAGE}]};
  const classifierPromise=checkClassification(fetchImpl,{env}).then(check=>{
    if(check.ready||!classifierService)return check;
    void classifierService.ensure();
    return classifierService.check(check);
  });
  const checks=[];
  if(channel==='xhs'){
    const installed=env.OPENCLI_ENTRY?Boolean(configuredOpenCliEntry(env.OPENCLI_ENTRY)):Boolean(findAgentReach(env));
    checks.push({id:'collector',label:'采集程序',ready:installed,
      message:installed?'采集程序已配置。':'采集程序待安装，请按启动说明配置 OpenCLI。'});
    let profiles={};
    try{profiles=JSON.parse(await readFile(join(env.OPENCLI_CONFIG_DIR||join(homedir(),'.opencli'),'browser-profiles.json'),'utf8'));}catch{}
    const selected=env.OPENCLI_PROFILE?.trim()||profiles.defaultContextId?.trim();
    const context=profiles.aliases?.[selected]||selected;
    const statusUrl=new URL('http://127.0.0.1:19825/status');
    if(context)statusUrl.searchParams.set('contextId',context);
    let bridge=null;
    try{
      const response=await fetchImpl(statusUrl.href,{
        headers:{'X-OpenCLI':'1'},redirect:'error',signal:AbortSignal.timeout(1500),
      });
      if(response.ok)bridge=await response.json();
    }catch{}
    const connected=bridge?.extensionConnected===true;
    let message='OpenCLI 扩展尚未连接。请在已登录小红书的同一个浏览器中确认扩展已安装、已启用，并保持浏览器打开。';
    if(bridge?.profileRequired)message='多个浏览器已连接，请通过 OpenCLI 选择采集使用的浏览器后重新检查。';
    if(bridge?.profileDisconnected)message='采集选定的浏览器尚未连接，请打开该浏览器并启用 OpenCLI 扩展。';
    checks.push({id:'browser',label:'浏览器连接',ready:connected,message:connected
      ?'浏览器桥已连接。采集时会使用该浏览器的小红书登录状态。'
      :message});
  }else{
    let loggedIn=true;
    try{await Promise.all(['.weibo-cookie','.weibo-cookie-web'].map(name=>access(resolve(root,'weibo-demand-agent',name))));}
    catch{loggedIn=false;}
    checks.push({id:'login',label:'采集凭证',ready:loggedIn,message:loggedIn
      ?'本机已保存采集凭证，登录是否有效将在采集时确认。'
      :'请先在 Edge 登录微博，并按启动说明刷新本机采集凭证。'});
  }
  checks.unshift(await classifierPromise);
  return {ready:checks.every(check=>check.ready),checks};
}
