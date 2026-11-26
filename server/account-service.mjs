import {AgentError} from './agent-tools.mjs';
import {openAccountDatabase,credentials,loginToken,sessionCookie,accountCookieName} from './account-database.mjs';
import {createDeepSeekClient} from './project-agent.mjs';
import {createQwenClient} from './qwen-client.mjs';
import {QWEN_DEFAULTS} from './qwen-config.mjs';
import {connectTeamMcp} from './team-mcp.mjs';
import {PROJECT_MAX_FILE_BYTES,validateProject} from '../src/project.js';
import {inspectionFromCollection,editInspectionItem} from './inspection-items.mjs';

const DEFAULT={provider:'tuned',model:'',endpoint:''};
const LOCAL={provider:'本地规划工具',model:'本地规划工具',configured:true,localPlanning:true};
const DEEPSEEK_ENDPOINT='https://api.deepseek.com';
export const HUAWEI_MAAS_ENDPOINT='https://api.modelarts-maas.com/openai/v1';

function allowedEndpoints(values) {
  return [...new Set(values.map(value=>{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)
      throw new Error('Model endpoints must be HTTPS URLs without credentials, query strings or fragments.');
    return url.href.replace(/\/$/,'');
  }))];
}

export function createAccountService({filename,cookieScope=filename,secureCookie=false,qwen={},maas={},defaultProvider='tuned',endpoints=[],mcpPresets=new Map(),fetchImpl=fetch}) {
  const compatibleEndpoints=allowedEndpoints(endpoints);
  if(!['tuned','base','local'].includes(defaultProvider))throw new Error('默认模型可配置为 tuned、base 或 local。');
  let maasUrl;try{maasUrl=new URL(maas.baseUrl||HUAWEI_MAAS_ENDPOINT);}catch{throw new Error('华为云 MaaS 地址无效。');}
  if(maasUrl.protocol!=='https:'||!['api.modelarts-maas.com','api-ap-southeast-1.modelarts-maas.com'].includes(maasUrl.hostname)||
    maasUrl.username||maasUrl.password||maasUrl.search||maasUrl.hash||maasUrl.port||maasUrl.pathname.replace(/\/$/,'')!=='/openai/v1')
    throw new Error('请配置华为云 MaaS 官方 OpenAI 兼容接口 Base URL。');
  const maasEndpoint=maasUrl.href.replace(/\/$/,'');
  const defaultSettings={...DEFAULT,provider:defaultProvider};
  const db=openAccountDatabase(filename);
  const cookieName=accountCookieName(cookieScope);
  const attemptBuckets=new Map();
  const tunedModel=qwen.model||QWEN_DEFAULTS.model;
  const baseModel=qwen.specialistModel||QWEN_DEFAULTS.specialistModel;

  function loginLimit(address) {
    const now=Date.now();
    for(const [key,bucket] of attemptBuckets)if(bucket.until<=now)attemptBuckets.delete(key);
    const bucket=attemptBuckets.get(address)||{count:0,until:now+60_000};
    if(bucket.count>=20)throw new AgentError('auth_rate_limited','尝试次数过多，请稍后再试。',429);
    bucket.count++;
    attemptBuckets.set(address,bucket);
  }

  function publicSettings(user) {
    const row=db.readModel(user.id)||defaultSettings;
    const defaults={tuned:tunedModel,base:baseModel,local:'',deepseek:'deepseek-flash',maas:maas.model||''};
    return {provider:row.provider,model:row.model||defaults[row.provider]||'',endpoint:row.endpoint,
      key_configured:Boolean(row.encrypted_key),compatible_endpoints:compatibleEndpoints,maas_endpoint:maasEndpoint,maas_model:maas.model||''};
  }

  function saveSettings(user,body) {
    const {provider}=body;
    if(['tuned','base','local'].includes(provider)){
      db.saveModel(user.id,{...DEFAULT,provider});
      return publicSettings(user);
    }
    const model=typeof body.model==='string'?body.model.trim():'';
    if(!/^[\w][\w./:+-]{0,127}$/.test(model))
      throw new AgentError('invalid_model','请填写有效的模型 ID。');
    const endpoint=provider==='deepseek'?DEEPSEEK_ENDPOINT:provider==='maas'?maasEndpoint:body.endpoint;
    if(!['deepseek','maas'].includes(provider)&&(provider!=='compatible'||!compatibleEndpoints.includes(endpoint)))
      throw new AgentError('invalid_endpoint','请选择已登记的模型 API 地址。');
    const previous=db.readModel(user.id);
    let apiKey=typeof body.api_key==='string'?body.api_key.trim():'';
    if(!apiKey&&previous?.provider===provider&&previous.endpoint===endpoint)apiKey=db.readModelKey(user.id,previous);
    if(!/^[\x21-\x7e]{1,512}$/.test(apiKey))
      throw new AgentError('invalid_model_key','请填写此服务的 API Key。');
    db.saveModel(user.id,{provider,model,endpoint,apiKey});
    return publicSettings(user);
  }

  function authorize(request) {
    const user=db.currentUser(loginToken(request,cookieName));
    if(!user)throw new AgentError('login_required','请登录后继续。',401);
    if(request.headers['x-urbancool-account']!==user.id)
      throw new AgentError('account_changed','浏览器中的账户已切换，请重新打开工作台。',409);
    return user;
  }

  function mcpSettings(user) {
    const selected=db.readMcpPreset(user.id);
    return {selected:mcpPresets.has(selected)?selected:'',
      presets:[...mcpPresets.values()].map(({id,label,allowedTools})=>({id,label,tools:[...allowedTools]}))};
  }

  function registeredPreset(presetId) {
    const preset=mcpPresets.get(presetId);
    if(!preset)throw new AgentError('invalid_mcp_preset','请选择部署端已登记的 MCP 服务。');
    return preset;
  }

  return {
    authorize,
    health:()=>({ready:db.ping()}),
    close:()=>db.close(),
    storeFor:user=>db.agentStore(user.id),
    teamMcpFor(user) {
      const preset=mcpPresets.get(db.readMcpPreset(user.id));
      return preset?signal=>connectTeamMcp(preset,{signal}):null;
    },
    clientFor(user) {
      const row=db.readModel(user.id)||defaultSettings;
      if(row.provider==='local')return LOCAL;
      if(row.provider==='tuned'||row.provider==='base'){
        return createQwenClient({...qwen,model:row.provider==='tuned'?tunedModel:baseModel,
          specialistModel:baseModel,provider:row.provider==='tuned'?'UrbanCool Qwen 微调版':'Qwen 基座版',fetchImpl});
      }
      const apiKey=db.readModelKey(user.id,row);
      if(row.provider==='maas'&&row.endpoint===maasEndpoint)
        return createQwenClient({baseUrl:maasEndpoint,model:row.model,specialistModel:row.model,apiKey,provider:'华为云 MaaS',qwenTemplate:false,fetchImpl});
      if(row.provider==='deepseek')return createDeepSeekClient({model:row.model,apiKey,fetchImpl});
      if(row.provider==='compatible'&&compatibleEndpoints.includes(row.endpoint))
        return createQwenClient({baseUrl:row.endpoint,model:row.model,apiKey,provider:'兼容 API',qwenTemplate:false,fetchImpl});
      throw new AgentError('invalid_endpoint','已保存的 API 地址暂不可用，请在模型设置中重新选择。',503);
    },
    async route(path,request,response,json,body,catalog) {
      const {method}=request;
      const token=loginToken(request,cookieName);
      if(path==='/account'&&method==='GET')
        return json(response,200,{enabled:true,user:db.currentUser(token)||null});
      if((path==='/account/register'||path==='/account/login')&&method==='POST'){
        loginLimit(request.socket.remoteAddress);
        const entry=credentials(await body(request));
        const registration=path.endsWith('/register');
        const user=registration?await db.register(entry):await db.login(entry);
        db.endSession(token);
        response.setHeader('Set-Cookie',sessionCookie(db.startSession(user.id),secureCookie,cookieName));
        return json(response,registration?201:200,{user});
      }
      const user=authorize(request);
      if(path==='/inspection-items'&&method==='GET')
        return json(response,200,{items:db.inspectionItems(user.id)});
      if(path==='/inspection-items'&&method==='POST'){
        const {evidenceKey,item}=await inspectionFromCollection(user.id,await body(request));
        return json(response,200,{item:db.addInspectionItem(user.id,evidenceKey,item)});
      }
      const inspectionMatch=/^\/inspection-items\/([\da-f-]{36})$/.exec(path);
      if(inspectionMatch&&method==='PUT'){
        const current=db.inspectionItem(user.id,inspectionMatch[1]);
        const changes=await body(request);
        const updated=editInspectionItem(current,changes,catalog);
        return json(response,200,{item:db.updateInspectionItem(user.id,updated,changes.revision)});
      }
      if(path==='/account/logout'&&method==='POST'){
        db.endSession(token);
        response.setHeader('Set-Cookie',sessionCookie(null,secureCookie,cookieName));
        return json(response,200,{user:null});
      }
      if(path==='/model'&&method==='GET')return json(response,200,{settings:publicSettings(user)});
      if(path==='/model'&&method==='PUT')return json(response,200,{settings:saveSettings(user,await body(request))});
      if(path==='/mcp-settings'&&method==='GET')return json(response,200,{settings:mcpSettings(user)});
      if(path==='/mcp-settings'&&method==='PUT'){
        const {preset_id:id}=await body(request);
        if(id!=='')registeredPreset(id);
        db.saveMcpPreset(user.id,id);
        return json(response,200,{settings:mcpSettings(user)});
      }
      if(path==='/mcp-settings/check'&&method==='POST'){
        const {preset_id:id}=await body(request);
        const preset=registeredPreset(id);
        const controller=new AbortController();
        response.once('close',()=>{if(!response.writableEnded)controller.abort();});
        const connection=await connectTeamMcp(preset,{signal:controller.signal});
        try{
          return json(response,200,{tools:connection.tools.map(tool=>tool.function.name.slice('mcp_'.length))});
        }finally{await connection.close();}
      }
      if(path==='/project'&&method==='GET')return json(response,200,{text:db.readProject(user.id)});
      if(path==='/project'&&method==='PUT'){
        const snapshot=await body(request,PROJECT_MAX_FILE_BYTES);
        try {validateProject(snapshot);}
        catch {throw new AgentError('invalid_project','保存内容不是有效的 UrbanCool 场地工程。');}
        db.saveProject(user.id,JSON.stringify(snapshot));
        return json(response,200,{saved:true});
      }
      throw new AgentError('not_found','没有这个账户接口。',404);
    },
  };
}
