import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {access,mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarizeHeatSnapshot} from './heat-perception-contract.mjs';

const workerDir=fileURLToPath(new URL('../weibo-demand-agent/',import.meta.url));
const collectionRoot=fileURLToPath(new URL('../.runtime/weibo-collections/',import.meta.url));
const uuid=/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const limits={pages:1,top:4,comment_pages:1,max:24,pace:1500};
const stages={queued:'排队中',collecting:'正在搜索微博和一级评论',classifying:'正在判定市内热感知线索',
  aggregating:'正在汇总本批样本',done:'采集完成',failed:'采集未完成'};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const issue=(code,message)=>({status:'unavailable',code,message});

export function createWeiboCollection(accountId) {
  if(!uuid.test(accountId))throw new Error('Invalid Weibo collection account');
  const directory=resolve(collectionRoot,accountId);
  const latest=resolve(directory,'latest.json');
  const jobPath=id=>resolve(directory,id,'jobs',`${id}.json`);

  async function get() {
    let job;
    try {
      const pointer=await readJson(latest);
      if(!uuid.test(pointer.id))throw new Error('Invalid collection pointer');
      job=await readJson(jobPath(pointer.id));
    }catch(error){
      if(error.code==='ENOENT')return {status:'idle'};
      throw error;
    }
    const expired=['queued','running'].includes(job.status)&&Date.now()-Date.parse(job.created_at)>31*60*1000;
    const state=expired?'failed':job.status;
    const result={job_id:job.id,query:job.query,status:state,phase:job.phase,message:stages[job.phase]||stages[state],
      posts:job.posts,comments:job.comments,classified:job.done,total:job.total};
    if(state==='failed')return {...result,message:expired?'采集已超时，请重新提交。':'采集或判定失败。请检查微博登录状态和 n8n 后重试。'};
    if(state!=='done')return result;

    if(!uuid.test(job.id))throw new Error('Invalid collection job');
    let bytes;
    try{bytes=await readFile(resolve(directory,job.id,`heat_perception_job_${job.id}.json`));}
    catch(error){
      if(error.code==='ENOENT')return {...result,status:'failed',message:'采集结果文件不存在，请重新提交。'};
      throw error;
    }
    const snapshot=JSON.parse(bytes);
    if(snapshot.mode!=='on_demand_sample'||!Number.isFinite(Date.parse(snapshot.source?.fetched_at))||
      Date.parse(snapshot.source.fetched_at)<Date.parse(job.created_at)||!snapshot.source.queries?.includes(job.query))
      return {...result,status:'failed',message:'采集结果与本次任务不匹配，请重新提交。'};
    return {...result,summary:{
      ...summarizeHeatSnapshot(snapshot),
      collected_at:snapshot.source.fetched_at,
      generated_at:snapshot.generated_at,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      classification:snapshot.status.classification,
      raw_posts:snapshot.counts.raw_posts,
      raw_comments:snapshot.counts.raw_comments,
    }};
  }

  async function start(keyword) {
    const previous=await get();
    if(['queued','running'].includes(previous.status))return previous;
    try{
      await Promise.all(['.weibo-cookie','.weibo-cookie-web'].map(file=>access(resolve(workerDir,file))));
    }catch{
      return issue('weibo_login_required','采集机器缺少微博登录文件，请先在 Edge 登录微博并刷新采集凭证。');
    }
    try{
      const response=await fetch('http://127.0.0.1:5678/healthz',{signal:AbortSignal.timeout(2000),redirect:'error'});
      if(!response.ok)throw new Error('n8n offline');
      await response.body?.cancel();
    }catch{
      return issue('weibo_n8n_unavailable','采集机器上的 n8n 尚未启动。启动后即可提交新采集任务。');
    }
    const id=randomUUID();
    const jobDir=resolve(directory,id);
    const job={id,query:`成都 ${keyword}`,city:'成都',aliases:['成都','成都市'],...limits,
      status:'queued',phase:'queued',created_at:new Date().toISOString(),auto:false};
    await mkdir(resolve(jobDir,'jobs'),{recursive:true});
    await writeFile(jobPath(id),JSON.stringify(job),{flag:'wx'});
    const pointer=resolve(directory,`latest-${id}.tmp`);
    await writeFile(pointer,JSON.stringify({id}),{flag:'wx'});
    await rename(pointer,latest);
    const worker=spawn(process.execPath,[resolve(workerDir,'scripts/job-worker.mjs'),'--once'],{
      cwd:workerDir,env:{...process.env,URBANCOOL_WEIBO_JOB_DATA_DIR:jobDir},
      detached:true,windowsHide:true,stdio:'ignore',
    });
    try{
      await once(worker,'spawn');
      worker.unref();
    }catch{
      await writeFile(jobPath(id),JSON.stringify({...job,status:'failed',phase:'failed'}));
      return issue('weibo_worker_unavailable','微博采集工人启动失败，请检查本机 Node.js 环境。');
    }
    return get();
  }

  return {get,start};
}
