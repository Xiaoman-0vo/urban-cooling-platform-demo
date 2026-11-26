import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {HEAT_PERCEPTION_TOOL,HEAT_PERCEPTION_DESCRIPTION,HEAT_PERCEPTION_PATH,
  XHS_HEAT_PERCEPTION_TOOL,XHS_HEAT_PERCEPTION_DESCRIPTION,XHS_HEAT_PERCEPTION_PATH,
  GET_HEAT_COLLECTION,START_HEAT_COLLECTION,GET_XHS_COLLECTION,START_XHS_COLLECTION,summarizeHeatSnapshot} from './heat-perception-contract.mjs';
import {createHeatCollection} from './heat-collection.mjs';

const server=new McpServer({name:'urbancool-heat-perception',version:'1.0.0'});
const output=result=>({structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}]});
function registerArchive({tool,description,path,source,label}){
  server.registerTool(tool,{
    description,
    inputSchema:z.strictObject({}),
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  },async()=>{
    const bytes=await readFile(new URL(`../${path}`,import.meta.url));
    const snapshot=JSON.parse(bytes.toString('utf8'));
    if(snapshot.source?.channel!==source)throw new Error('Archive source does not match');
    return output({
      status:'heat_perception_snapshot',
      city:'成都',
      scope:'城市级抽样',
      ...summarizeHeatSnapshot(snapshot,source),
      source:{channel:label,path,sha256:createHash('sha256').update(bytes).digest('hex'),
        schema:snapshot.schema,generated_at:snapshot.generated_at,fetched_at:snapshot.source.fetched_at,mode:snapshot.mode,versions:snapshot.meta},
      message:'城市级公开表达抽样，可用于发现待核查线索。温度、具体网格及总体受影响人数没有从该样本推断。',
    });
  });
}
registerArchive({tool:HEAT_PERCEPTION_TOOL,description:HEAT_PERCEPTION_DESCRIPTION,path:HEAT_PERCEPTION_PATH,source:'weibo',label:'微博'});
registerArchive({tool:XHS_HEAT_PERCEPTION_TOOL,description:XHS_HEAT_PERCEPTION_DESCRIPTION,path:XHS_HEAT_PERCEPTION_PATH,source:'xiaohongshu',label:'小红书'});

function registerCollection(account,{source,label,start,get}){
  const collection=createHeatCollection(account,source);
  server.registerTool(start,{
    description:`按关键词发起本账户的成都${label}采集任务，异步返回采集状态。`,
    inputSchema:z.strictObject({keyword:z.string().trim().min(1).max(40).regex(/^[^\p{Cc}]+$/u)}),
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true},
  },async({keyword})=>output(await collection.start(keyword)));
  server.registerTool(get,{
    description:`查看本账户最近一次${label}采集的状态和样本汇总。`,
    inputSchema:z.strictObject({}),
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  },async()=>output(await collection.get()));
}
const collectionAccount=process.env.URBANCOOL_HEAT_WORKBENCH_ACCOUNT;
if(collectionAccount){
  registerCollection(collectionAccount,{source:'weibo',label:'微博',start:START_HEAT_COLLECTION,get:GET_HEAT_COLLECTION});
  registerCollection(collectionAccount,{source:'xiaohongshu',label:'小红书',start:START_XHS_COLLECTION,get:GET_XHS_COLLECTION});
}
await server.connect(new StdioServerTransport());
