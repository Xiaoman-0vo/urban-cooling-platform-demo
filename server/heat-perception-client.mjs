import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {AgentError} from './agent-tools.mjs';
import {HEAT_PERCEPTION_TOOL,HEAT_PERCEPTION_PATH,XHS_HEAT_PERCEPTION_TOOL,XHS_HEAT_PERCEPTION_PATH,
  START_HEAT_COLLECTION,GET_HEAT_COLLECTION,START_XHS_COLLECTION,GET_XHS_COLLECTION} from './heat-perception-contract.mjs';

const entry=fileURLToPath(new URL('./heat-perception-mcp.mjs',import.meta.url));

export async function queryHeatPerception(args,{signal}={}) {
  return queryArchive(args,{signal,tool:HEAT_PERCEPTION_TOOL,path:HEAT_PERCEPTION_PATH,label:'微博'});
}

export async function queryXhsHeatPerception(args,{signal}={}) {
  return queryArchive(args,{signal,tool:XHS_HEAT_PERCEPTION_TOOL,path:XHS_HEAT_PERCEPTION_PATH,label:'小红书'});
}

async function queryArchive(args,{signal,tool,path,label}) {
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length)
    throw new AgentError('invalid_arguments','成都热感知快照查询无需参数。');
  const result=await invokeHeatTool(tool,{},{signal,label});
  if(result.status!=='heat_perception_snapshot'||result.source?.path!==path||result.source.channel!==label)
    throw new AgentError('heat_perception_unavailable',`暂时无法读取${label}热感知快照，请稍后重试。`,503);
  return {...result,transport:'mcp_stdio'};
}

export async function requestHeatCollection(accountId,keyword,{source='weibo'}={}){
  const xhs=source==='xiaohongshu';
  if(keyword!==undefined&&(typeof keyword!=='string'||!keyword.trim()||keyword.trim().length>40||/\p{Cc}/u.test(keyword)))
    throw new AgentError(xhs?'invalid_xhs_keyword':'invalid_weibo_keyword','请输入 1 至 40 个字符的采集关键词。');
  const [get,start]=xhs?[GET_XHS_COLLECTION,START_XHS_COLLECTION]:[GET_HEAT_COLLECTION,START_HEAT_COLLECTION];
  const result=await invokeHeatTool(keyword===undefined?get:start,
    keyword===undefined?{}:{keyword:keyword.trim()},{accountId,label:xhs?'小红书':'微博',xhs});
  if(result.status==='unavailable')throw new AgentError(result.code,result.message,503);
  return {...result,transport:'mcp_stdio'};
}

async function invokeHeatTool(name,args,{accountId,signal,label,xhs}) {
  signal?.throwIfAborted();
  const client=new Client({name:'urbancool-workbench',version:'0.1.0'});
  const env=accountId?{URBANCOOL_HEAT_WORKBENCH_ACCOUNT:accountId,
    ...(xhs&&process.env.AGENT_REACH?{AGENT_REACH:process.env.AGENT_REACH}:{})}:undefined;
  const transport=new StdioClientTransport({command:process.execPath,args:[entry],stderr:'ignore',env});
  try{
    const options={timeout:5000,signal};
    await client.connect(transport,options);
    const response=await client.callTool({name,arguments:args},undefined,options);
    if(response.isError||!response.structuredContent)throw new Error('Invalid heat perception response');
    return response.structuredContent;
  }catch{
    signal?.throwIfAborted();
    throw new AgentError('heat_perception_unavailable',accountId?`${label}采集工具暂未响应，请稍后重试。`:`暂时无法读取${label}热感知快照，请稍后重试。`,503);
  }finally{
    await transport.close();
  }
}
