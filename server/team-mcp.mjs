import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {AgentError} from './agent-tools.mjs';

const identity=/^[a-z][a-z0-9_-]{0,39}$/;
const toolName=/^[A-Za-z0-9_-]{1,48}$/;

export function loadTeamMcpPresets(config='[]') {
  const entries=JSON.parse(config||'[]');
  if(!Array.isArray(entries))throw new Error('URBANCOOL_MCP_SERVERS must be a JSON array');
  const presets=new Map();
  for(const entry of entries){
    const {id,label,url,tools,token_env}=entry;
    const endpoint=new URL(url);
    const loopback=endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname);
    if((endpoint.protocol!=='https:'&&!loopback)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)
      throw new Error('MCP preset URLs must use HTTPS or local HTTP, without credentials or query parameters');
    if(typeof id!=='string'||!identity.test(id)||presets.has(id)||typeof label!=='string'||!label.trim()||label.length>80||
      !Array.isArray(tools)||!tools.length||tools.length>12||tools.some(name=>typeof name!=='string'||!toolName.test(name))||
      (token_env!==undefined&&(typeof token_env!=='string'||!/^URBANCOOL_MCP_TOKEN_[A-Z0-9_]+$/.test(token_env))))
      throw new Error('Invalid MCP preset id, label, read-only tool list or token environment variable');
    presets.set(id,{id,label:label.trim(),endpoint,allowedTools:new Set(tools),tokenEnv:token_env});
  }
  return presets;
}

const unavailable=()=>new AgentError('mcp_unavailable','团队 MCP 服务无法连接，或没有可用的已登记只读工具。',503);

export async function connectTeamMcp(preset,{signal,fetchImpl=fetch}={}) {
  signal?.throwIfAborted();
  const token=preset.tokenEnv&&process.env[preset.tokenEnv];
  if(preset.tokenEnv&&!token)throw unavailable();
  const budget=AbortSignal.timeout(7000);
  const discoverySignal=signal?AbortSignal.any([signal,budget]):budget;
  const transport=new StreamableHTTPClientTransport(preset.endpoint,{
    requestInit:token?{headers:{Authorization:`Bearer ${token}`}}:{},
    fetch:(url,init)=>fetchImpl(url,{...init,redirect:'error'}),
  });
  const client=new Client({name:'urbancool-team-tools',version:'1.0.0'});
  try{
    const options={timeout:5000,signal:discoverySignal};
    await client.connect(transport,options);
    const available=new Map();
    let cursor;
    for(let page=0;page<5;page++){
      const listing=await client.listTools(cursor?{cursor}:undefined,options);
      for(const tool of listing.tools){
        if(preset.allowedTools.has(tool.name)&&tool.annotations?.readOnlyHint===true&&
          tool.annotations.destructiveHint!==true&&
          JSON.stringify(tool.inputSchema).length<=8000)
          available.set(`mcp_${tool.name}`,tool);
      }
      cursor=listing.nextCursor;
      if(!cursor||available.size===preset.allowedTools.size)break;
    }
    if(!available.size)throw unavailable();
    return {
      tools:[...available].map(([name,tool])=>({type:'function',function:{
        name,description:(tool.description||tool.name).slice(0,300),parameters:tool.inputSchema,
      }})),
      close:()=>transport.close(),
      async call(name,args){
        const tool=available.get(name);
        if(!tool||!args||typeof args!=='object'||Array.isArray(args)||JSON.stringify(args).length>8000)
          throw new AgentError('invalid_mcp_arguments','未登记该 MCP 工具，或查询参数无效。');
        try{
          const result=await client.callTool({name:tool.name,arguments:args},undefined,{timeout:5000,signal});
          if(result.isError)throw unavailable();
          const text=result.structuredContent===undefined?result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n'):
            JSON.stringify(result.structuredContent);
          if(!text)throw unavailable();
          return {status:'mcp_read',transport:'mcp_streamable_http',
            source:{server_id:preset.id,server_label:preset.label,tool:tool.name},
            data:text.slice(0,8000),truncated:text.length>8000};
        }catch{
          signal?.throwIfAborted();
          throw unavailable();
        }
      },
    };
  }catch{
    await transport.close();
    signal?.throwIfAborted();
    throw unavailable();
  }
}
