import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {createAccountService} from '../server/account-service.mjs';
import {createAgentServer} from '../server/agent-server.mjs';
import {loadProjectCatalog} from '../server/agent-tools.mjs';
import {createProject} from '../src/project.js';
import {loadTeamMcpPresets} from '../server/team-mcp.mjs';

test('two accounts isolate project snapshots, Agent sessions and model settings',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'urbancool-accounts-'));
  const filename=join(directory,'test.sqlite');
  const upstream=[];
  const config={filename,fetchImpl:async(url,options)=>{
    upstream.push({url,authorization:options.headers.Authorization,model:JSON.parse(options.body).model});
    return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:'已读取本轮请求。'}}]})};
  }};
  let accounts=createAccountService(config),server;
  const root=new URL('../',import.meta.url);
  const catalog=await loadProjectCatalog(fileURLToPath(root));
  const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id,planning_mode:'mapped_pilot'};
  async function start() {
    server=createAgentServer({accounts,catalog,port:0});
    server.listen(0,'127.0.0.1');
    await once(server,'listening');
    return `http://127.0.0.1:${server.address().port}/api/agent`;
  }
  async function stop() {
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    accounts.close();
  }
  let base=await start();
  t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});
  async function request(path,{account,method='GET',body,headers={}}={}) {
    const response=await fetch(base+path,{method,headers:{
      ...(account?{Cookie:account.cookie,'X-UrbanCool-Account':account.id}:{}),
      ...(method==='GET'?{}:{'X-UrbanCool-Agent':'1'}),
      ...(body===undefined?{}:{'Content-Type':'application/json'}),...headers,
    },body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
  }
  async function authenticate(path,username,password) {
    const reply=await request(path,{method:'POST',body:{username,password}});
    assert.equal(reply.status,path.endsWith('register')?201:200);
    assert.match(reply.cookie,/HttpOnly; SameSite=Strict/);
    return {...reply.data.user,cookie:reply.cookie.split(';')[0]};
  }
  const password='account-test-passphrase';
  const apiKey='fixture-only-key-abc123';
  assert.equal((await request('/health')).status,401);
  const a=await authenticate('/account/register','Alice',password);
  const b=await authenticate('/account/register','Bob',password);
  const duplicate=await request('/account/register',{method:'POST',body:{username:'ALICE',password}});
  assert.equal(duplicate.status,409);
  const invalid=await request('/account/login',{method:'POST',body:{username:'Alice',password:'incorrect-passphrase'}});
  assert.equal(invalid.status,401);
  assert.equal((await request('/project',{account:b,headers:{'X-UrbanCool-Account':a.id}})).status,409);

  const sourcePackage=JSON.parse(await readFile(new URL('public/data/manifest.json',root),'utf8'));
  const scene=catalog.scene;
  const snapshot=createProject(sourcePackage,scene,{stage:'site',region:'成都',center:scene.center_lon_lat,
    location:scene.site_id,visible:{bounds:true,buildings:true,vegetation:true,roads:true,receptors:false,regional:false},
    offline:true,preview:true,drawer:'',
    camera:{center:scene.center_lon_lat,zoom:16,bearing:0,pitch:0}},scene.layers,[]);
  assert.equal((await request('/project',{account:a,method:'PUT',body:snapshot})).status,200);
  assert.deepEqual(JSON.parse((await request('/project',{account:a})).data.text),snapshot);
  assert.equal((await request('/project',{account:b})).data.text,null);

  const created=await request('/sessions',{account:a,method:'POST',body:{context}});
  assert.equal(created.status,201);
  const id=created.data.session.id;
  assert.equal((await request(`/sessions/${id}`,{account:b})).status,404);
  assert.equal((await request(`/sessions/${id}/evidence?run_id=other`,{account:b})).status,404);
  assert.equal((await request(`/sessions/${id}/cancel`,{account:b,method:'POST',body:{run_id:'other'}})).status,404);
  assert.equal((await request('/chat',{account:b,method:'POST',body:{context,session_id:id,message:'尝试读取会话'}})).status,404);
  const scoped='/sessions?'+new URLSearchParams(context);
  assert.equal((await request(scoped,{account:a})).data.session.id,id);
  assert.equal((await request(scoped,{account:b})).data.session,null);

  const body={context,session_id:id,message:'试用模型路由。'};
  assert.equal((await request('/chat',{account:a,method:'POST',body})).status,200);
  assert.equal(upstream.at(-1).model,'epoch_2');
  assert.equal((await request('/model',{account:a,method:'PUT',body:{provider:'base'}})).status,200);
  assert.equal((await request('/chat',{account:a,method:'POST',body})).status,200);
  assert.equal(upstream.at(-1).model,'base');
  assert.equal((await request('/model',{account:a,method:'PUT',body:{provider:'compatible',model:'x',
    endpoint:'http://127.0.0.1/secret',api_key:apiKey}})).status,400);
  const saved=await request('/model',{account:a,method:'PUT',body:{provider:'deepseek',model:'test-model',api_key:apiKey}});
  assert.equal(saved.status,200);
  assert.equal(saved.data.settings.key_configured,true);
  assert.ok(!JSON.stringify(saved.data).includes(apiKey));
  assert.equal((await request('/model',{account:b})).data.settings.provider,'tuned');
  assert.equal((await request('/chat',{account:a,method:'POST',body})).status,200);
  assert.deepEqual(upstream.at(-1),{url:'https://api.deepseek.com/chat/completions',authorization:`Bearer ${apiKey}`,model:'test-model'});
  const verify=new DatabaseSync(filename,{readOnly:true});
  try {
    assert.notEqual(verify.prepare('SELECT password_hash FROM users WHERE id=?').get(a.id).password_hash,password);
    assert.ok(!verify.prepare('SELECT encrypted_key FROM model_settings WHERE user_id=?').get(a.id).encrypted_key.includes(apiKey));
  }finally{verify.close();}

  assert.equal((await request('/account/logout',{account:a,method:'POST'})).status,200);
  assert.equal((await request('/project',{account:a})).status,401);
  await stop();
  accounts=createAccountService(config);
  base=await start();
  const restored=await authenticate('/account/login','ALICE',password);
  assert.equal(restored.id,a.id);
  assert.deepEqual(JSON.parse((await request('/project',{account:restored})).data.text),snapshot);
  assert.equal((await request(scoped,{account:restored})).data.session.id,id);
  assert.equal((await request('/chat',{account:restored,method:'POST',body})).status,200);
  assert.equal(upstream.at(-1).authorization,`Bearer ${apiKey}`);

  const startCount=upstream.length;
  const form=(planning_action)=>request('/chat',{account:restored,method:'POST',body:{context,session_id:id,planning_action}});
  const compared=await form({type:'compare',fields:{budget_rmb:100000,candidate_area_m2:300,unit_cost_rmb_per_m2:300}});
  assert.equal(compared.status,200);
  assert.equal(compared.data.session.scenarios.length,2);
  const revised=await form({type:'compare',fields:{budget_rmb:50000}});
  assert.equal(revised.status,200);
  assert.equal(revised.data.session.goal.unit_cost_rmb_per_m2,300);
  assert.equal(revised.data.session.scenarios.find(s=>!s.is_stale&&s.candidate_id==='B').budget_check_passed,false);
  const report=await form({type:'export'});
  assert.equal(report.status,200);
  assert.match(report.data.session.reports.at(-1).markdown,/v2 \| B.*超预算/);
  const heat=await form({type:'heat_perception'});
  assert.equal(heat.status,200);
  assert.equal(heat.data.session.traces.at(-1).result.transport,'mcp_stdio');
  assert.equal(heat.data.session.tasks.at(-1).agent_id,'data_audit');
  assert.equal(heat.data.session.tasks.at(-1).language_model,null);
  const xhs=await form({type:'xhs_heat_perception'});
  assert.equal(xhs.status,200);
  const xhsTrace=xhs.data.session.traces.at(-1);
  assert.equal(xhsTrace.tool,'get_chengdu_xhs_heat_perception');
  assert.equal(xhsTrace.result.transport,'mcp_stdio');
  assert.equal(xhsTrace.result.source.channel,'小红书');
  assert.equal(xhsTrace.result.source.path,'public/data/heat_perception.json');
  assert.ok(xhsTrace.result.examples.length>0);
  assert.ok(xhsTrace.result.examples.every(({url})=>url.startsWith('https://www.xiaohongshu.com/explore/')));
  const chatXhs=await request('/chat',{account:restored,method:'POST',body:{context,session_id:id,message:'查一下成都小红书热感知归档有几条。'}});
  assert.equal(chatXhs.status,200);
  assert.match(chatXhs.data.session.messages.at(-1).content,/小红书热感知归档/);
  assert.equal(chatXhs.data.session.traces.at(-1).tool,'get_chengdu_xhs_heat_perception');
  assert.equal(upstream.length,startCount);

  assert.equal((await request('/weibo-collection')).status,401);
  assert.equal((await request('/weibo-collection',{account:restored,method:'POST',body:{keyword:''}})).status,400);
  assert.equal((await request('/weibo-collection',{account:restored})).data.collection.status,'idle');
  const jobId=randomUUID();
  const jobRoot=fileURLToPath(new URL(`.runtime/weibo-collections/${a.id}/`,root));
  await mkdir(jobRoot,{recursive:true});
  t.after(()=>rm(jobRoot,{recursive:true,force:true}));
  const jobDir=join(jobRoot,jobId);
  const jobFile=join(jobDir,'jobs',`${jobId}.json`);
  await mkdir(join(jobDir,'jobs'),{recursive:true});
  await writeFile(join(jobRoot,'latest.json'),JSON.stringify({id:jobId}));
  const query='成都 高温 遮阴';
  const created_at=new Date().toISOString();
  const job={id:jobId,query,created_at};
  await writeFile(jobFile,JSON.stringify({...job,status:'queued',phase:'queued'}));
  const pending=await request('/weibo-collection',{account:restored,method:'POST',body:{keyword:'高温 遮阴'}});
  assert.equal(pending.status,202);
  assert.equal(pending.data.collection.job_id,jobId);
  assert.equal(pending.data.collection.status,'queued');

  const workerDir=fileURLToPath(new URL('weibo-demand-agent/',root));
  const mock=join(directory,'weibo-fetch.mjs');
  await Promise.all(['.weibo-cookie','.weibo-cookie-web'].map(name=>writeFile(join(directory,name),'fixture-only')));
  await writeFile(mock,`globalThis.fetch=async url=>{
    const path=new URL(url).pathname;
    const old=new Date(Date.now()-10*86400000).toUTCString().replace(/^(...), (\\d+) (...) (\\d+) (.*) GMT$/,'$1 $3 $2 $5 +0000 $4');
    if(path==='/api/container/getIndex')return Response.json({ok:1,data:{cards:[
      {mblog:{id:'old',created_at:old,text:'历史帖子'}},
      {mblog:{id:'1',created_at:'刚刚',text:'成都公交站太热，希望增加遮阴'}}
    ]}});
    if(path==='/ajax/statuses/buildComments')return Response.json({ok:1,data:[
      {id:'old-comment',created_at:old,text:'历史评论'},
      {id:'new-comment',created_at:'2分钟前',text:'等车时晒得厉害'}
    ]});
    throw new Error('Unexpected outgoing request: '+path);
  };`);
  const exec=promisify(execFile);
  const rawName=`raw_job_${jobId}`;
  const rawPath=join(jobDir,`${rawName}.json`);
  await exec(process.execPath,['--import',pathToFileURL(mock).href,'scripts/collect-weibo.mjs',
    '--workbench','--cookie-dir',directory,'--query',query,'--pages','1','--top','1','--pace','0','--out',rawPath],{cwd:workerDir});
  const raw=JSON.parse(await readFile(rawPath,'utf8'));
  assert.deepEqual(raw.posts.map(post=>post.source_post_id),['1']);
  assert.deepEqual(raw.comments.map(comment=>comment.source_comment_id),['new-comment']);
  const items=join(jobDir,'items.json');
  await writeFile(items,JSON.stringify({items:[{item_id:'fixture',kind:'post',in_scope:true,heat_relevance:'relevant',
    is_public_demand:true,demand_topic:'shade_deficit',text_full:raw.posts[0].text,published_at:raw.posts[0].published_at}]}));
  await exec(process.execPath,['scripts/aggregate-heat-perception.mjs','--items',items,'--city','成都',
    '--raws',rawName,'--no-platform','--on-demand','--out',join(jobDir,`heat_perception_job_${jobId}.json`)],{
    cwd:workerDir,env:{...process.env,URBANCOOL_WEIBO_JOB_DATA_DIR:jobDir},
  });
  await writeFile(jobFile,JSON.stringify({...job,status:'done',phase:'done'}));
  const completed=await request('/weibo-collection',{account:restored});
  assert.equal(completed.data.collection.transport,'mcp_stdio');
  assert.equal(completed.data.collection.status,'done');
  assert.equal(completed.data.collection.summary.collected_at,raw.fetched_at);
  assert.equal(completed.data.collection.summary.public_demand_count,1);
  assert.equal((await request('/weibo-collection',{account:b})).data.collection.status,'idle');

  assert.equal((await request('/xhs-collection')).status,401);
  assert.equal((await request('/xhs-collection',{account:restored})).data.collection.status,'idle');
  const xhsJobId=randomUUID();
  const xhsRoot=fileURLToPath(new URL(`.runtime/xhs-collections/${a.id}/`,root));
  const xhsJobDir=join(xhsRoot,xhsJobId);
  const xhsJobFile=join(xhsJobDir,'jobs',`${xhsJobId}.json`);
  await mkdir(join(xhsJobDir,'jobs'),{recursive:true});
  t.after(()=>rm(xhsRoot,{recursive:true,force:true}));
  await writeFile(join(xhsRoot,'latest.json'),JSON.stringify({id:xhsJobId}));
  await writeFile(xhsJobFile,JSON.stringify({id:xhsJobId,query,city:'成都',created_at:new Date().toISOString(),status:'queued',phase:'queued',limit:2}));
  const existingXhs=await request('/xhs-collection',{account:restored,method:'POST',body:{keyword:'高温 遮阴'}});
  assert.equal(existingXhs.status,202);
  assert.equal(existingXhs.data.collection.job_id,xhsJobId);
  const openCli=join(directory,'opencli-fixture.mjs');
  await writeFile(openCli,`
    const missing='https://www.xiaohongshu.com/explore/'+'a'.repeat(24)+'?xsec_token=fixture';
    const found='https://www.xiaohongshu.com/explore/'+'b'.repeat(24)+'?xsec_token=fixture';
    const published_at=new Date().toISOString();
    const [, , site, method, input, ...options]=process.argv;
    if(site!=='xiaohongshu'||!options.includes('json')) process.exit(64);
    if(method==='search')console.log(JSON.stringify([{url:missing,title:'成都高温'},{url:found,title:'成都公交站遮阴',published_at}]));
    else if(method==='note'&&input===found)console.log(JSON.stringify([{field:'content',value:'成都公交站中午太晒，希望增加遮阴设施。'}]));
    else if(method==='comments'&&input===found)console.log(JSON.stringify([
      {rank:1,text:'应排除的二级回复',is_reply:true},
      {rank:2,text:'这里的候车座位晒得太烫了，希望增设树荫。',is_reply:false},
    ]));
    else process.exit(66);
  `);
  const xhsMock=join(directory,'xhs-upstream.mjs');
  await writeFile(xhsMock,`
    globalThis.fetch=async (url,options)=>{
      if(new URL(url).pathname!=='/webhook/weibo-demand/v1')throw new Error('Unexpected URL');
      const {payload}=JSON.parse(options.body);
      if(payload.scope.city!=='成都')throw new Error('Missing classifier scope');
      return Response.json({result:{route:'fixture',item:{in_scope:true,scope_target:'成都',heat_relevance:'relevant',
        excerpt:payload.text,is_public_demand:true,demand_topic:'shade_deficit',evaluation_direction:'discomfort'}}});
    };
  `);
  await exec(process.execPath,['scripts/job-worker.mjs','--once'],{
    cwd:fileURLToPath(new URL('xiaohongshu_demand_agent/',root)),
    env:{...process.env,OPENCLI_ENTRY:openCli,URBANCOOL_XHS_JOB_DATA_DIR:xhsJobDir,
      NODE_OPTIONS:`--import=${pathToFileURL(xhsMock).href}`},
  });
  const xhsDone=await request('/xhs-collection',{account:restored});
  assert.equal(xhsDone.status,200);
  assert.equal(xhsDone.data.collection.status,'done');
  const xhsSummary=xhsDone.data.collection.summary;
  assert.equal(xhsSummary.raw_posts,1);
  assert.equal(xhsSummary.raw_comments,1);
  assert.equal(xhsSummary.public_demand_count,2);
  assert.equal(xhsSummary.collection,'partial');
  assert.deepEqual(xhsSummary.examples.map(example=>example.url),['https://www.xiaohongshu.com/explore/'+'b'.repeat(24)]);
  assert.equal((await request('/xhs-collection',{account:b})).data.collection.status,'idle');
  assert.equal((await request('/weibo-collection',{account:restored})).data.collection.job_id,jobId);
});

test('account-selectable team MCP only exposes approved read-only tools to the data audit role',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'urbancool-team-mcp-'));
  const filename=join(directory,'test.sqlite');
  const calls=[];
  const fixture=createServer(async(req,res)=>{
    const mcp=new McpServer({name:'team-test',version:'1.0.0'});
    mcp.registerTool('get_reference',{description:'查询测试资料',inputSchema:z.object({query:z.string()}),annotations:{readOnlyHint:true}},
      async args=>{calls.push(args);return {content:[{type:'text',text:'测试资料版本 v2'}]};});
    mcp.registerTool('change_reference',{annotations:{destructiveHint:true}},
      async()=>({content:[{type:'text',text:'unexpected write'}]}));
    mcp.registerTool('unregistered_read',{annotations:{readOnlyHint:true}},
      async()=>({content:[{type:'text',text:'unexpected read'}]}));
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.once('close',()=>mcp.close());
    await mcp.connect(transport);
    await transport.handleRequest(req,res);
  });
  fixture.listen(0,'127.0.0.1');
  await once(fixture,'listening');
  const mcpPresets=loadTeamMcpPresets(JSON.stringify([{id:'references',label:'规划资料',
    url:`http://127.0.0.1:${fixture.address().port}/mcp`,tools:['get_reference','change_reference']}]));
  const observed=[];
  const accounts=createAccountService({filename,mcpPresets,fetchImpl:async(_url,options)=>{
    const {messages,tools}=JSON.parse(options.body);
    observed.push(tools.map(tool=>tool.function.name));
    let message={role:'assistant',content:'已核对资料。'};
    if(messages.at(-1).role!=='tool'){
      const name=tools.some(tool=>tool.function.name==='mcp_get_reference')?'mcp_get_reference':'delegate_data_audit';
      const args=name==='mcp_get_reference'?{query:'桐梓林'}:{task:'使用团队 MCP 查桐梓林。'};
      message={role:'assistant',content:null,tool_calls:[{id:'call_1',type:'function',function:{name,arguments:JSON.stringify(args)}}]};
    }
    return {ok:true,json:async()=>({choices:[{finish_reason:message.tool_calls?'tool_calls':'stop',message}]})};
  }});
  const root=fileURLToPath(new URL('../',import.meta.url));
  const catalog=await loadProjectCatalog(root);
  const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id};
  const app=createAgentServer({accounts,catalog,port:0});
  app.listen(0,'127.0.0.1');
  await once(app,'listening');
  t.after(async()=>{
    for(const server of [app,fixture])await new Promise(done=>{server.close(done);server.closeAllConnections();});
    accounts.close();
    await rm(directory,{recursive:true,force:true});
  });
  const base=`http://127.0.0.1:${app.address().port}/api/agent`;
  const jsonHeaders={'Content-Type':'application/json','X-UrbanCool-Agent':'1'};
  async function register(username){
    const reply=await fetch(base+'/account/register',{method:'POST',headers:jsonHeaders,
      body:JSON.stringify({username,password:'test-only-preset-4d5'})});
    assert.equal(reply.status,201);
    return {...jsonHeaders,Cookie:reply.headers.get('set-cookie').split(';')[0],
      'X-UrbanCool-Account':(await reply.json()).user.id};
  }
  const alice=await register('McpAlice'),bob=await register('McpBob');
  const request=(path,headers,method='GET',body)=>fetch(base+path,{headers,method,body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal((await request('/mcp-settings',{},'GET')).status,401);
  assert.equal((await request('/mcp-settings',alice,'PUT',{preset_id:'unknown'})).status,400);
  const checked=await request('/mcp-settings/check',alice,'POST',{preset_id:'references'});
  assert.equal(checked.status,200);
  assert.deepEqual((await checked.json()).tools,['get_reference']);
  const saved=await request('/mcp-settings',alice,'PUT',{preset_id:'references'});
  assert.equal((await saved.json()).settings.selected,'references');
  assert.equal((await (await request('/mcp-settings',bob)).json()).settings.selected,'');

  const created=await request('/sessions',alice,'POST',{context});
  const {session}=await created.json();
  const response=await request('/chat',alice,'POST',{context,session_id:session.id,message:'用团队 MCP 查询桐梓林资料。'});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(observed[0].includes('mcp_get_reference'),false);
  assert.ok(observed.some(tools=>tools.includes('mcp_get_reference')));
  assert.ok(observed.every(tools=>!tools.includes('mcp_change_reference')&&!tools.includes('mcp_unregistered_read')));
  assert.deepEqual(calls,[{query:'桐梓林'}]);
  const trace=result.session.traces.find(trace=>trace.tool==='mcp_get_reference');
  assert.equal(trace.agent_id,'data_audit');
  assert.deepEqual(trace.result.source,{server_id:'references',server_label:'规划资料',tool:'get_reference'});
  assert.equal(trace.result.data,'测试资料版本 v2');
  assert.equal((await request('/mcp-settings',alice,'PUT',{preset_id:''})).status,200);
  assert.equal((await (await request('/mcp-settings',alice)).json()).settings.selected,'');
});
