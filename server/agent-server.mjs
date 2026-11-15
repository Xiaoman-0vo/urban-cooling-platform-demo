import http from 'node:http';
import {access, readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {AgentError, loadProjectCatalog, newSession, publicSession, capabilities,sanitizeContext} from './agent-tools.mjs';
import {createDeepSeekClient, runAgentTurn} from './project-agent.mjs';
import {publicRoles} from './agent-roles.mjs';
import {recoverInterruptedTasks} from './agent-task-state.mjs';
import {DEFAULT_RUN_LIMITS} from './agent-runtime.mjs';
import {createHistoricalTemperature} from './historical-lst.mjs';
import {queryHeatPerception,queryXhsHeatPerception,requestHeatCollection} from './heat-perception-client.mjs';
import {loadTeamMcpPresets} from './team-mcp.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Windows文件观察器可短暂占用目标；只重试原子替换，不删除已有快照。
export async function replaceSessionFile(source,target,{renameImpl=rename,waitImpl=delay}={}) {
  for(let attempt=0;attempt<5;attempt++) {
    try {await renameImpl(source,target);return;}
    catch(error) {
      if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt===4)throw error;
      await waitImpl(20*2**attempt);
    }
  }
}

export class SessionStore {
  constructor(directory) { this.directory=directory; this.cache=new Map(); this.busy=new Set(); }
  async get(id) {
    if (!UUID.test(id || '')) throw new AgentError('invalid_session','会话标识无效。',400);
    if (this.cache.has(id)) return this.cache.get(id);
    try {
      const session=JSON.parse(await readFile(resolve(this.directory,`${id}.json`),'utf8'));
      if (session.id!==id || session.schema_version!=='urbancool-agent/1') throw new Error('invalid session');
      this.cache.set(id,session);
      if(recoverInterruptedTasks(session))await this.save(session);
      return session;
    } catch { throw new AgentError('session_not_found','该本地会话未找到，请开始新会话。',404); }
  }
  async save(session) {
    if (!UUID.test(session.id)) throw new AgentError('invalid_session','会话标识无效。');
    await mkdir(this.directory,{recursive:true});
    const temporary=resolve(this.directory,`${session.id}.pending`),target=resolve(this.directory,`${session.id}.json`);
    await writeFile(temporary,JSON.stringify(session,null,2),'utf8');
    await replaceSessionFile(temporary,target);
    this.cache.set(session.id,session);
  }
}

async function requestBody(request,maxBytes=32768) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new AgentError('json_required','请使用 JSON 请求。',415);
  if(Number(request.headers['content-length'])>maxBytes)throw new AgentError('body_too_large','请求超出大小上限。',413);
  let bytes=0; const chunks=[];
  for await (const chunk of request) {
    bytes+=chunk.length;
    if (bytes>maxBytes) throw new AgentError('body_too_large','请求超出大小上限。',413);
    chunks.push(chunk);
  }
  try { const body=JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!body || typeof body!=='object'||Array.isArray(body)) throw new Error(); return body; }
  catch { throw new AgentError('invalid_json','请求不是有效 JSON。'); }
}

export function createAgentServer({catalog,client,store,accounts,historicalTemperature,staticFiles,port=5181,uiPorts=[5173,4190],siteOrigin,turnTimeoutMs=180000}) {
  const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  const origins=new Set(uiPorts.flatMap(p=>[`http://127.0.0.1:${p}`,`http://localhost:${p}`]));
  if(siteOrigin){
    const site=new URL(siteOrigin);
    hosts.add(site.host);
    origins.add(site.origin);
  }
  const activeTurns=new Map();
  const pendingCollectionStarts=new Set();
  const json=(response,status,body)=>{if(response.destroyed)return;response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(body));};
  const server=http.createServer(async(request,response)=>{
    let session,requestStore=store;
    try {
      const boundPort=server.address()?.port || port;
      const boundHosts=new Set([...hosts,`127.0.0.1:${boundPort}`,`localhost:${boundPort}`]);
      if (!boundHosts.has(request.headers.host) || (request.headers.origin && !origins.has(request.headers.origin)))
        throw new AgentError('origin_rejected','此原型仅允许本机规划页面访问。',403);
      const url=new URL(request.url,`http://127.0.0.1:${port}`);
      if(staticFiles&&['GET','HEAD'].includes(request.method)&&!/^\/api(?:\/|$)/.test(url.pathname))
        return staticFiles(request,response,()=>{response.writeHead(404);response.end();});
      if(request.method!=='GET' && request.headers['x-urbancool-agent']!=='1')
        throw new AgentError('client_header_required','缺少客户端标识。',403);
      const path=url.pathname.slice('/api/agent'.length);
      if(url.pathname.startsWith('/api/agent/')&&(/^\/(account|mcp-settings)(?:\/|$)/.test(path)||['/model','/project'].includes(path))){
        if(accounts)return await accounts.route(path,request,response,json,requestBody);
        if(path==='/account'&&request.method==='GET')return json(response,200,{enabled:false});
        throw new AgentError('not_found','账户功能未启用。',404);
      }
      const user=accounts?.authorize(request);
      if(user)requestStore=accounts.storeFor(user);
      const collectionRoute=/^\/api\/agent\/(weibo|xhs)-collection$/.exec(url.pathname);
      if(collectionRoute){
        if(!user)throw new AgentError('login_required','请登录工作台后使用采集。',401);
        const channel=collectionRoute[1];
        const options={source:channel==='xhs'?'xiaohongshu':'weibo'};
        if(request.method==='GET')return json(response,200,{collection:await requestHeatCollection(user.id,undefined,options)});
        if(request.method==='POST'){
          const {keyword}=await requestBody(request);
          if(typeof keyword!=='string')throw new AgentError(`invalid_${channel}_keyword`,'请输入采集关键词。');
          const key=`${user.id}:${channel}`;
          if(pendingCollectionStarts.has(key))throw new AgentError(`${channel}_start_pending`,'采集任务正在提交，请稍后查看。',409);
          pendingCollectionStarts.add(key);
          try{
            const collection=await requestHeatCollection(user.id,keyword,options);
            return json(response,202,{collection});
          }finally{pendingCollectionStarts.delete(key);}
        }
      }
      if(user&&request.method==='GET'&&path==='/sessions'){
        const scope=sanitizeContext(Object.fromEntries(url.searchParams),catalog);
        const latest=await requestStore.latest(scope);
        return json(response,200,{session:latest?publicSession(latest):null});
      }
      if (request.method==='GET' && url.pathname==='/api/agent/health') {
        const activeClient=user?accounts.clientFor(user):client;
        const modelAvailable=await activeClient.probe?.();
        return json(response,200,{status:'ready',provider:activeClient.provider||'DeepSeek',model:activeClient.model,configured:activeClient.configured,capabilities:capabilities(catalog.pilot),
          ...(typeof modelAvailable==='boolean'?{model_available:modelAvailable}:{}),
          heat_perception:{transport:'mcp_stdio',collection:Boolean(user),xiaohongshu:true},
          ...(activeClient.localPlanning?{local_planning:true}:{}),
          ...(historicalTemperature?{historical_temperature:{sample_prompt:historicalTemperature.sample_prompt}}:{}),
          ...(catalog.pilot?{pilot:{site_id:catalog.pilot.site_id,scenario_id:catalog.pilot.scenario_id,
            candidates:catalog.pilot.candidates,outstanding:catalog.pilot.outstanding}}:{}),
          orchestration:'supervisor-workers',agents:publicRoles(),run_limits:DEFAULT_RUN_LIMITS});
      }
      const match=url.pathname.match(/^\/api\/agent\/sessions\/([^/]+)(?:\/(evidence|cancel))?$/);
      if (match && request.method==='GET' && !match[2])
        return json(response,200,{session:publicSession(await requestStore.get(match[1]))});
      if (match?.[2]==='evidence' && request.method==='GET') {
        const saved=await requestStore.get(match[1]);
        const runId=url.searchParams.get('run_id');
        if (!runId || !saved.tasks?.some(task=>task.run_id===runId))
          throw new AgentError('run_not_found','当前会话没有这轮任务。',404);
        return json(response,200,{traces:saved.traces.filter(trace=>trace.turn_id===runId)});
      }
      if (match?.[2]==='cancel' && request.method==='POST') {
        const {run_id:runId}=await requestBody(request);
        const saved=await requestStore.get(match[1]);
        const active=activeTurns.get(saved.id);
        if (!runId || active?.session.active_run_id!==runId)
          throw new AgentError('run_not_active','这轮任务已经结束或已切换，请查看最新进度。',409);
        active.controller.abort(new AgentError('turn_cancelled','本轮任务已停止，已完成的工具和产物保留。',499));
        return json(response,202,{run_id:runId});
      }
      if (request.method!=='POST' || !['/api/agent/sessions','/api/agent/chat'].includes(url.pathname))
        throw new AgentError('not_found','没有这个 Agent 接口。',404);
      const body=await requestBody(request);
      if (url.pathname==='/api/agent/sessions') {
        session=newSession(body.context,catalog); await requestStore.save(session);
        return json(response,201,{session:publicSession(session)});
      }
      session=await requestStore.get(body.session_id);
      if (requestStore.busy.has(session.id)) throw new AgentError('session_busy','上一轮任务尚未结束，请稍后再发。',409);
      if (session.messages.length>=100) throw new AgentError('session_full','本会话已达到100条记录，请导出后开始新会话。',429);
      const activeClient=user?accounts.clientFor(user):client;
      requestStore.busy.add(session.id);
      const controller=new AbortController();
      activeTurns.set(session.id,{session,controller});
      const timeout=setTimeout(()=>controller.abort(new AgentError('turn_timeout','本轮任务超过执行时限，已完成的工具和产物保留。',504)),turnTimeoutMs);
      response.once('close',()=>{if(!response.writableEnded)controller.abort();});
      try {
        const result=await runAgentTurn({session,context:body.context,text:body.message,planningAction:body.planning_action,catalog,client:activeClient,historicalTemperature,
          heatPerception:queryHeatPerception,xhsHeatPerception:queryXhsHeatPerception,
          teamMcp:user?accounts.teamMcpFor(user):null,signal:controller.signal,
          onProgress:()=>requestStore.save(session)});
        await requestStore.save(session);
        return json(response,200,{session:result});
      } finally {
        clearTimeout(timeout);
        activeTurns.delete(session.id);
        requestStore.busy.delete(session.id);
      }
    } catch(error) {
      const safe=error instanceof AgentError?error:new AgentError('internal_error','任务未完成，已保留当前会话；请重试或查看服务状态。',500);
      return json(response,safe.status,{error:{code:safe.code,message:safe.message},...(session?{session:publicSession(session)}:{})});
    }
  });
  return server;
}

async function loadLocalEnvironment() {
  try {
    const text=await readFile(resolve(ROOT,'.env.local'),'utf8');
    for(const line of text.split(/\r?\n/)) {
      const match=line.match(/^\s*(DEEPSEEK_API_KEY|DEEPSEEK_MODEL|AGENT_PORT|URBANCOOL_[A-Z_]+|QWEN_[A-Z_]+)\s*=\s*(.*?)\s*$/);
      if(match && !process.env[match[1]]) process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
    }
  } catch(error) {if(error.code!=='ENOENT')throw error;}
}

export async function startAgentServer({workbench=false}={}) {
  await loadLocalEnvironment();
  const port=Number(process.env.AGENT_PORT || 5181);
  if (!Number.isInteger(port)||port<1024||port>65535)throw new Error('AGENT_PORT must be a valid local port');
  const catalog=await loadProjectCatalog(ROOT);
  const localPlanning=process.env.URBANCOOL_LOCAL_TRIAL==='1';
  const client=localPlanning?{provider:'本地试用',model:'本地规划工具',configured:true,localPlanning}:
    createDeepSeekClient({apiKey:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL || 'deepseek-flash'});
  const store=new SessionStore(resolve(ROOT,localPlanning?'.runtime/agent-local-trial/sessions':'.runtime/agent/sessions'));
  let staticFiles;
  if(workbench){
    const site=resolve(ROOT,'dist/client');
    await access(resolve(site,'index.html')).catch(()=>{throw new Error('Run npm run build:accounts before starting the workbench.');});
    const {default:sirv}=await import('sirv');
    staticFiles=sirv(site,{etag:true,setHeaders(response,pathname){
      response.setHeader('X-Content-Type-Options','nosniff');
      response.setHeader('Cache-Control',pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');
    }});
  }
  const accounts=workbench||process.env.URBANCOOL_ACCOUNTS==='1'?await startAccounts():null;
  const siteOrigin=process.env.URBANCOOL_SITE_ORIGIN||(workbench?`http://127.0.0.1:${port}`:undefined);
  const server=createAgentServer({catalog,client,store,accounts,staticFiles,port,siteOrigin,historicalTemperature:createHistoricalTemperature()});
  if(accounts)server.on('close',()=>accounts.close());
  server.listen(port,'127.0.0.1',()=>console.log(`UrbanCool Agent: http://127.0.0.1:${port} (${accounts?'accounts':localPlanning?'local trial':client.configured?'DeepSeek configured':'DEEPSEEK_API_KEY missing'})`));
  server.on('error',error=>{console.error(`Agent service could not start (${error.code || 'error'}).`);process.exitCode=1;});
  return server;
}

async function startAccounts() {
  const {createAccountService}=await import('./account-service.mjs');
  return createAccountService({
    filename:resolve(ROOT,process.env.URBANCOOL_ACCOUNT_DB||'.runtime/accounts/workspace.sqlite'),
    secureCookie:process.env.URBANCOOL_SECURE_COOKIE==='1'||process.env.URBANCOOL_SITE_ORIGIN?.startsWith('https://'),
    endpoints:(process.env.URBANCOOL_MODEL_ENDPOINTS||'').split(',').map(item=>item.trim()).filter(Boolean),
    mcpPresets:loadTeamMcpPresets(process.env.URBANCOOL_MCP_SERVERS),
    qwen:{baseUrl:process.env.QWEN_BASE_URL||'http://127.0.0.1:18084/v1',model:process.env.QWEN_MODEL,
      specialistModel:process.env.QWEN_SPECIALIST_MODEL,apiKey:process.env.QWEN_API_KEY},
  });
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  await startAgentServer({workbench:process.argv.includes('--workbench')});
