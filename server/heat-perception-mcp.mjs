import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {HEAT_PERCEPTION_TOOL,HEAT_PERCEPTION_DESCRIPTION,HEAT_PERCEPTION_PATH,
  GET_HEAT_COLLECTION,START_HEAT_COLLECTION,summarizeHeatSnapshot} from './heat-perception-contract.mjs';
import {createWeiboCollection} from './weibo-collection.mjs';

const server=new McpServer({name:'urbancool-heat-perception',version:'1.0.0'});
const output=result=>({structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}]});
server.registerTool(HEAT_PERCEPTION_TOOL,{
  description:HEAT_PERCEPTION_DESCRIPTION,
  inputSchema:z.strictObject({}),
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
},async()=>{
  const bytes=await readFile(new URL(`../${HEAT_PERCEPTION_PATH}`,import.meta.url));
  const snapshot=JSON.parse(bytes.toString('utf8'));
  if(snapshot.source?.channel!=='weibo')throw new Error('Expected a Weibo archive');
  const result={
    status:'heat_perception_snapshot',
    city:'成都',
    scope:'城市级抽样',
    ...summarizeHeatSnapshot(snapshot),
    source:{channel:'微博',path:HEAT_PERCEPTION_PATH,sha256:createHash('sha256').update(bytes).digest('hex'),
      schema:snapshot.schema,generated_at:snapshot.generated_at,mode:snapshot.mode,versions:snapshot.meta},
    message:'城市级公开表达抽样，可用于发现待核查线索。温度、具体网格及总体受影响人数没有从该样本推断。',
  };
  return output(result);
});
const collectionAccount=process.env.URBANCOOL_WEIBO_WORKBENCH_ACCOUNT;
if(collectionAccount){
  const collection=createWeiboCollection(collectionAccount);
  server.registerTool(START_HEAT_COLLECTION,{
    description:'发起本账户的成都微博新采集任务，使用关键词搜索，异步返回采集状态。',
    inputSchema:z.strictObject({keyword:z.string().trim().min(1).max(40).regex(/^[^\p{Cc}]+$/u)}),
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true},
  },async({keyword})=>output(await collection.start(keyword)));
  server.registerTool(GET_HEAT_COLLECTION,{
    description:'查看本账户最近一次新采集任务的状态和样本汇总。',
    inputSchema:z.strictObject({}),
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  },async()=>output(await collection.get()));
}
await server.connect(new StdioServerTransport());
