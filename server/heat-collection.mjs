import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {access,mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarizeHeatSnapshot} from './heat-perception-contract.mjs';
import {findAgentReach} from '../xiaohongshu_demand_agent/scripts/agent-reach-bin.mjs';
import {configuredOpenCliEntry} from '../xiaohongshu_demand_agent/scripts/opencli-xhs.mjs';

const sources={
  weibo:{label:'微博',worker:'weibo-demand-agent',directory:'weibo-collections',dataEnv:'URBANCOOL_WEIBO_JOB_DATA_DIR',
    limits:{pages:1,top:4,comment_pages:1,max:24,pace:1500}},
  xiaohongshu:{label:'小红书',worker:'xiaohongshu_demand_agent',directory:'xhs-collections',dataEnv:'URBANCOOL_XHS_JOB_DATA_DIR',
    limits:{limit:4,per_note_comments:6,max:12}},
};
const uuid=/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const stages={queued:'排队中',collecting:'正在收集搜索结果和一级评论',classifying:'正在判定市内热感知线索',
  aggregating:'正在汇总本批样本',done:'采集完成',failed:'采集未完成'};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const issue=(code,message)=>({status:'unavailable',code,message});

export function createHeatCollection(accountId,sourceId) {
  if(!uuid.test(accountId))throw new Error('Invalid collection account');
  const source=sources[sourceId];
  const workerDir=fileURLToPath(new URL(`../${source.worker}/`,import.meta.url));
  const collectionRoot=fileURLToPath(new URL(`../.runtime/${source.directory}/`,import.meta.url));
  const directory=resolve(collectionRoot,accountId);
  const latest=resolve(directory,'latest.json');
  const jobPath=id=>resolve(directory,id,'jobs',`${id}.json`);

  async function get() {
    let job;
    try {
      const pointer=await readJson(latest);
      if(!uuid.test(pointer.id))throw new Error('Invalid collection pointer');
      job=await readJson(jobPath(pointer.id));
      if(job.id!==pointer.id)throw new Error('Invalid collection job');
    }catch(error){
      if(error.code==='ENOENT')return {status:'idle'};
      throw error;
    }
    const expired=['queued','running'].includes(job.status)&&Date.now()-Date.parse(job.created_at)>31*60*1000;
    const state=expired?'failed':job.status;
    const result={job_id:job.id,query:job.query,status:state,phase:job.phase,message:stages[job.phase]||stages[state],
      posts:job.posts,comments:job.comments,classified:job.done,total:job.total};
    if(state==='failed'){
      const progress=sourceId==='xiaohongshu'&&!expired?await readJson(resolve(directory,job.id,'jobs',`${job.id}.progress.json`)).catch(()=>null):null;
      const message=expired?'采集已超时，请重新提交。':
        progress?.browser_disconnected?'OpenCLI 浏览器桥未连接。请启用扩展并保持浏览器打开。':
        progress?.need_login?'请在 OpenCLI 已连接的浏览器中登录小红书。':
        `采集或判定失败。请检查${source.label}登录状态和 n8n 后重试。`;
      return {...result,message};
    }
    if(state!=='done')return result;

    if(!uuid.test(job.id))throw new Error('Invalid collection job');
    let bytes;
    try{bytes=await readFile(resolve(directory,job.id,`heat_perception_job_${job.id}.json`));}
    catch(error){
      if(error.code==='ENOENT')return {...result,status:'failed',message:'采集结果文件不存在，请重新提交。'};
      throw error;
    }
    const snapshot=JSON.parse(bytes);
    if(snapshot.mode!=='on_demand_sample'||snapshot.source?.channel!==sourceId||!Number.isFinite(Date.parse(snapshot.source?.fetched_at))||
      Date.parse(snapshot.source.fetched_at)<Date.parse(job.created_at)||!snapshot.source.queries?.includes(job.query))
      return {...result,status:'failed',message:'采集结果与本次任务不匹配，请重新提交。'};
    return {...result,summary:{
      ...summarizeHeatSnapshot(snapshot,sourceId),
      collected_at:snapshot.source.fetched_at,
      generated_at:snapshot.generated_at,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      classification:snapshot.status.classification,
      collection:snapshot.status.collection,
      raw_posts:snapshot.counts.raw_posts,
      raw_comments:snapshot.counts.raw_comments,
    }};
  }

  async function start(keyword) {
    const previous=await get();
    if(['queued','running'].includes(previous.status))return previous;
    if(sourceId==='weibo'){
      try{
        await Promise.all(['.weibo-cookie','.weibo-cookie-web'].map(file=>access(resolve(workerDir,file))));
      }catch{
        return issue('weibo_login_required','采集机器缺少微博登录文件，请先在 Edge 登录微博并刷新采集凭证。');
      }
    }else if(process.env.OPENCLI_ENTRY&&!configuredOpenCliEntry()){
      return issue('xhs_opencli_unavailable','找不到已配置的 OpenCLI 程序。请检查 OPENCLI_ENTRY。');
    }else if(!process.env.OPENCLI_ENTRY&&!findAgentReach()){
      return issue('xhs_agent_reach_required','请配置 OpenCLI，或安装 Agent Reach 后重试。');
    }
    try{
      const response=await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(2000),redirect:'error'});
      if(!response.ok)throw new Error('n8n offline');
      await response.body?.cancel();
    }catch{
      return issue(sourceId==='weibo'?'weibo_n8n_unavailable':'xhs_n8n_unavailable','采集机器上的 n8n 不可用。请启动 n8n 判定服务后重试。');
    }
    const id=randomUUID();
    const jobDir=resolve(directory,id);
    const query=/^(?:成都|成都市)(?:\s|$)/.test(keyword)?keyword:`成都 ${keyword}`;
    const job={id,query,city:'成都',...source.limits,
      status:'queued',phase:'queued',created_at:new Date().toISOString(),auto:false};
    await mkdir(resolve(jobDir,'jobs'),{recursive:true});
    await writeFile(jobPath(id),JSON.stringify(job),{flag:'wx'});
    const pointer=resolve(directory,`latest-${id}.tmp`);
    await writeFile(pointer,JSON.stringify({id}),{flag:'wx'});
    await rename(pointer,latest);
    const worker=spawn(process.execPath,[resolve(workerDir,'scripts/job-worker.mjs'),'--once'],{
      cwd:workerDir,env:{...process.env,[source.dataEnv]:jobDir},
      detached:true,windowsHide:true,stdio:'ignore',
    });
    try{
      await once(worker,'spawn');
      worker.unref();
    }catch{
      await writeFile(jobPath(id),JSON.stringify({...job,status:'failed',phase:'failed'}));
      return issue(sourceId==='weibo'?'weibo_worker_unavailable':'xhs_worker_unavailable',`${source.label}采集进程启动失败，请检查本机 Node.js 环境。`);
    }
    return get();
  }

  return {get,start};
}
