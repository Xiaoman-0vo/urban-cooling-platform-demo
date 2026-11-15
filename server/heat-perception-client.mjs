import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {AgentError} from './agent-tools.mjs';
import {HEAT_PERCEPTION_TOOL,HEAT_PERCEPTION_PATH,START_HEAT_COLLECTION,GET_HEAT_COLLECTION} from './heat-perception-contract.mjs';

const entry=fileURLToPath(new URL('./heat-perception-mcp.mjs',import.meta.url));

export async function queryHeatPerception(args,{signal}={}) {
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length)
    throw new AgentError('invalid_arguments','成都热感知快照查询无需参数。');
  const result=await invokeHeatTool(HEAT_PERCEPTION_TOOL,{},{signal});
  if(result.status!=='heat_perception_snapshot'||result.source?.path!==HEAT_PERCEPTION_PATH)
    throw new AgentError('heat_perception_unavailable','暂时无法读取微博热感知快照，请稍后重试。',503);
  return {...result,transport:'mcp_stdio'};
}

export async function requestHeatCollection(accountId,keyword){
  if(keyword!==undefined&&(typeof keyword!=='string'||!keyword.trim()||keyword.trim().length>40||/\p{Cc}/u.test(keyword)))
    throw new AgentError('invalid_weibo_keyword','请输入 1 至 40 个字符的采集关键词。');
  const result=await invokeHeatTool(keyword===undefined?GET_HEAT_COLLECTION:START_HEAT_COLLECTION,
    keyword===undefined?{}:{keyword:keyword.trim()},{accountId});
  if(result.status==='unavailable')throw new AgentError(result.code,result.message,503);
  return {...result,transport:'mcp_stdio'};
}

async function invokeHeatTool(name,args,{accountId,signal}) {
  signal?.throwIfAborted();
  const client=new Client({name:'urbancool-workbench',version:'0.1.0'});
  const env=accountId?{URBANCOOL_WEIBO_WORKBENCH_ACCOUNT:accountId}:undefined;
  const transport=new StdioClientTransport({command:process.execPath,args:[entry],stderr:'ignore',env});
  try{
    const options={timeout:5000,signal};
    await client.connect(transport,options);
    const response=await client.callTool({name,arguments:args},undefined,options);
    if(response.isError||!response.structuredContent)throw new Error('Invalid heat perception response');
    return response.structuredContent;
  }catch{
    signal?.throwIfAborted();
    throw new AgentError('heat_perception_unavailable',accountId?'微博采集工具暂未响应，请稍后重试。':'暂时无法读取微博热感知快照，请稍后重试。',503);
  }finally{
    await transport.close();
  }
}
