import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadProjectCatalog,newSession,executeTool,publicSession} from '../server/agent-tools.mjs';
import {runAgentTurn,createDeepSeekClient} from '../server/project-agent.mjs';
import {AGENT_ROLES,roleTools} from '../server/agent-roles.mjs';
import {SessionStore,createAgentServer,replaceSessionFile} from '../server/agent-server.mjs';
import {queryHeatPerception} from '../server/heat-perception-client.mjs';
import {HEAT_PERCEPTION_TOOL} from '../server/heat-perception-contract.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=await loadProjectCatalog(root),context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id};
const fresh=()=>newSession(context,catalog);
const prompt='请三个Agent协作：预算10万元，候选面积800平方米，单价100元/平方米，保留建筑，生成三档草案并尝试温度预测。';
const answer=content=>({message:{role:'assistant',content},usage:{prompt_tokens:10,completion_tokens:3}});
const tools=(...entries)=>({message:{role:'assistant',tool_calls:entries.map(([name,args],i)=>({id:`call_${i}`,type:'function',function:{name,arguments:JSON.stringify(args)}}))},usage:{prompt_tokens:20,completion_tokens:5}});

function scripted(scripts) {
  const positions={},seen=[];
  return {model:'scripted-test',configured:true,seen,async complete(messages,options) {
    const id=options.agentId,index=positions[id] || 0;positions[id]=index+1;
    seen.push({id,tools:options.tools.map(t=>t.function.name),messages:structuredClone(messages)});
    const step=scripts[id]?.[index];
    if(!step)throw new Error(`unexpected test request ${id}/${index}`);
    return typeof step==='function'?step(messages,options):step;
  }};
}

function collaborationClient(session) {
  return scripted({
    coordinator:[tools(['delegate_data_audit',{task:'检查当前场地的真实来源和缺项。'}],['set_planning_goal',{budget_rmb:100000,candidate_area_m2:800,unit_cost_rmb_per_m2:100,evidence_quote:prompt}]),
      tools(['delegate_plan_exploration',{task:'按当前已登记目标生成并比较三档投入配置。'}]),
      tools(['delegate_prediction_evaluation',{task:'按原始用户要求尝试当前较高投入草案的预测，并保留真实阻塞状态。'}]),
      tools(['export_planning_report',{}]),answer('已完成协作汇总。配置草案已生成，温度模型未接通，预测未执行。')],
    data_audit:[tools(['get_project_overview',{}],['get_input_gaps',{}]),answer('已核对当前场地来源，现有绿色投影1989㎡，模型与输入仍有缺项。')],
    plan_exploration:[tools(['generate_scenario_options',{}],['compare_scenario_options',{}]),answer('已生成三档投入模板；尚无空间布局和降温计算。')],
    prediction_evaluation:[tools(['compare_scenario_options',{}]),()=>tools(['request_temperature_prediction',{scenario_id:session.scenarios.at(-1).id}]),answer('预测未接通，保留空值和阻塞条件。')],
  });
}

test('only the data audit role can call the real MCP snapshot for a requested heat perception query',async()=>{
  const client=scripted({
    coordinator:[tools([HEAT_PERCEPTION_TOOL,{}],['delegate_data_audit',{task:'读取成都微博热感知快照。'}]),answer('已读取快照。')],
    data_audit:[tools([HEAT_PERCEPTION_TOOL,{}]),answer('成都城市级抽样。')],
  });
  const result=await runAgentTurn({session:fresh(),context,text:'查询场地资料，也查看成都微博热感知快照。',catalog,client,heatPerception:queryHeatPerception});
  assert.equal(client.seen.find(step=>step.id==='coordinator').tools.includes(HEAT_PERCEPTION_TOOL),false);
  assert.equal(client.seen.find(step=>step.id==='data_audit').tools.includes(HEAT_PERCEPTION_TOOL),true);
  const traces=result.traces.filter(trace=>trace.tool===HEAT_PERCEPTION_TOOL);
  assert.equal(traces.find(trace=>trace.agent_id==='coordinator').result.status,'rejected');
  const record=traces.find(trace=>trace.agent_id==='data_audit').result;
  const bytes=await readFile(resolve(root,'public/data/weibo_heat_perception_archive.json'));
  const rows=JSON.parse(bytes).items.filter(item=>item.in_scope===true);
  assert.equal(record.source.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(record.sample_count,rows.length);
  assert.equal(record.public_demand_count,rows.filter(item=>item.is_public_demand===true).length);
  assert.equal(record.transport,'mcp_stdio');
  assert.equal(record.scope,'城市级抽样');
  assert.equal(record.items,undefined);
  assert.equal(roleTools('prediction_evaluation',{heatPerception:true}).some(tool=>tool.function.name===HEAT_PERCEPTION_TOOL),false);
  await assert.rejects(queryHeatPerception({grid_id:'other'}),e=>e.code==='invalid_arguments');
});

test('a direct archive query reads the real snapshot even when the coordinator skips delegation',async()=>{
  const client=scripted({coordinator:[answer('已查询场地。'),answer('归档已读取。')]});
  const result=await runAgentTurn({session:fresh(),context,text:'请查一下成都微博热感知的归档，有多少条市内样本，里面多少条是公开诉求？',
    catalog,client,heatPerception:queryHeatPerception});
  const audit=result.tasks.find(task=>task.agent_id==='data_audit');
  assert.equal(audit.execution_kind,'mcp_read');
  assert.equal(audit.language_model,null);
  const reads=result.traces.filter(trace=>trace.tool===HEAT_PERCEPTION_TOOL);
  assert.equal(reads.length,1);
  assert.equal(reads[0].task_id,audit.id);
  assert.equal(reads[0].result.transport,'mcp_stdio');
  assert.ok(result.messages.at(-1).content.includes(`${reads[0].result.sample_count} 条去重后`));
});

test('historical temperature runs as a separate recorded tool and preserves the planning session',async()=>{
  const session=fresh(),client=scripted({});
  const text='估计 E4105_N33911 在 2022-09-28 的历史地表温度';
  const historicalTemperature={async estimate(query){
    assert.deepEqual(query,{grid_id:'E4105_N33911',date:'2022-09-28'});
    return {...query,status:'estimated',estimated_lst_c:32.039,observed_lst_c:33.92,
      observed_utc:'2022-09-28T03:33:44Z',model_version:'V3 梯度提升树',reference_grid_count:1558};
  }};
  const result=await runAgentTurn({session,context,text,catalog,client,historicalTemperature});
  assert.equal(client.seen.length,0);
  assert.equal(result.goal.version,0);
  assert.deepEqual(result.scenarios,[]);
  assert.equal(result.traces[0].tool,'estimate_historical_surface_temperature');
  assert.equal(result.traces[0].result.estimated_lst_c,32.039);
  assert.match(result.messages.at(-1).content,/32\.04℃.*33\.92℃.*北京时间 11:33/);
  assert.equal(result.tasks[0].result.summary_source,'system');
  assert.equal(result.tasks[0].execution_kind,'historical_temperature');
  assert.equal(result.tasks[0].language_model,null);
  assert.equal(result.tasks[0].output_scope.temperature_model_version,'V3 梯度提升树');
});

test('historical questions resolve the mapped grid and carry only missing inputs into the next turn',async()=>{
  const context={site_id:catalog.scene.site_id,scenario_id:catalog.scene.scenario_id,
    selection:{layer:'regional',id:'E4105_N33911'}};
  const session=newSession(context,catalog);
  const client=scripted({coordinator:[answer('按普通规划请求处理。')]});
  const calls=[];
  const historicalTemperature={async estimate(query){
    calls.push(query);
    return {...query,status:'no_data'};
  }};
  const turn=text=>runAgentTurn({session,context,text,catalog,client,historicalTemperature});
  const natural=await turn('这个格子 2022 年 9 月 28 日有多热？');
  assert.match(natural.messages.at(-1).content,/E4105_N33911.*2022-09-28/);
  assert.equal(natural.tasks.at(-1).status,'no_data');
  const missing=await turn('这个网格的历史温度是多少？');
  assert.match(missing.messages.at(-1).content,/请提供一个完整有效的日期/);
  assert.doesNotMatch(missing.messages.at(-1).content,/网格编号/);
  assert.equal(missing.tasks.at(-1).status,'needs_inputs');
  const partial=await turn('9月28号');
  assert.equal(partial.traces.at(-1).result.status,'needs_inputs');
  await turn('2022年9月28号');
  const ambiguous=await turn('这个格子 2022-09-28 和 2022-08-10 有多热？');
  assert.equal(ambiguous.traces.at(-1).result.status,'needs_inputs');
  const invalid=await turn('2022年2月30日');
  assert.equal(invalid.traces.at(-1).result.status,'needs_inputs');
  const explicit=await turn('E4125_N33891 在 2022/9/28 有多热？');
  assert.equal(explicit.traces.at(-1).result.grid_id,'E4125_N33891');
  await turn('把预算改成5万元，再估一下方案的地表温度。');
  assert.deepEqual(calls,[
    {grid_id:'E4105_N33911',date:'2022-09-28'},
    {grid_id:'E4105_N33911',date:'2022-09-28'},
    {grid_id:'E4125_N33891',date:'2022-09-28'},
  ]);
  assert.equal(client.seen.length,1);
  assert.equal(session.goal.version,0);
});

test('multi-agent performs real delegated loops with scoped tools and blocked prediction',async()=>{
  const session=fresh(),client=collaborationClient(session),checkpoints=[];
  const result=await runAgentTurn({session,context,text:prompt,catalog,client,onProgress:async()=>checkpoints.push(publicSession(session))});
  assert.equal(result.tasks.length,4);
  const root=result.tasks.find(t=>!t.parent_task_id),children=result.tasks.filter(t=>t.parent_task_id);
  assert.equal(root.status,'completed_with_limits');assert.equal(result.active_run_id,null);
  assert.deepEqual(children.map(t=>t.agent_id),['data_audit','plan_exploration','prediction_evaluation']);
  assert.deepEqual(children.map(t=>t.status),['completed','completed','blocked']);
  assert.ok(children.every(t=>t.parent_task_id===root.id&&t.run_id===root.run_id));
  assert.ok(result.traces.every(t=>t.task_id&&t.agent_id));
  assert.equal(result.scenarios.length,3);assert.deepEqual(result.scenarios.map(s=>s.added_green_area_m2),[400,600,800]);
  assert.ok(result.scenarios.every(s=>s.geometry===null&&s.predicted_delta_lst_c===null&&s.prediction_status==='not_run'));
  assert.equal(result.traces.find(t=>t.tool==='request_temperature_prediction').result.status,'not_connected');
  assert.equal(root.budget.used.model_requests,12);assert.equal(result.messages.at(-1).usage.model_requests,12);
  assert.ok(checkpoints.some(s=>s.tasks.some(t=>t.parent_task_id&&t.status==='running')));
  assert.ok(checkpoints.some(s=>s.tasks.some(t=>t.phase==='tool'&&t.current_tool==='generate_scenario_options')));
  assert.ok(checkpoints.every((s,i)=>!i||s.event_version>checkpoints[i-1].event_version));
  assert.ok(checkpoints.filter(s=>s.tasks[0].status==='running').every(s=>s.tasks[0].is_stale===false));
  assert.match(result.reports.at(-1).markdown,/本轮协作记录/);
  for(const request of client.seen)assert.deepEqual(request.tools,roleTools(request.id).map(t=>t.function.name));
});

test('specialists cannot change goals or delegate recursively even if model requests it',async()=>{
  const session=fresh();
  const client=scripted({coordinator:[tools(['delegate_data_audit',{task:'核查当前场地。'}]),answer('已读取资料。')],
    data_audit:[tools(['set_planning_goal',{budget_rmb:100000,evidence_quote:'预算10万元'}],['delegate_plan_exploration',{task:'不应发生的委派'}],['get_project_overview',{}]),answer('资料核查完成，越权请求未执行。')]});
  const result=await runAgentTurn({session,context,text:'预算10万元，核查场地即可。',catalog,client});
  assert.equal(result.goal.version,0);assert.equal(result.scenarios.length,0);assert.equal(result.tasks.length,2);
  const rejected=result.traces.filter(t=>t.result.status==='rejected');assert.equal(rejected.length,2);
  assert.ok(rejected.every(t=>t.result.code==='tool_not_allowed'&&t.agent_id==='data_audit'));
  const childInput=client.seen.find(s=>s.id==='data_audit').messages;
  assert.ok(childInput.some(m=>m.content.includes('原始用户要求')));
  assert.ok(!childInput.some(m=>m.role==='assistant'));
});

test('coordinator delegates generation instead of bypassing specialist tool permissions',async()=>{
  const session=fresh(),client=scripted({coordinator:[tools(['generate_scenario_options',{}]),answer('需要通过方案Agent生成。')]});
  const result=await runAgentTurn({session,context,text:'生成草案',catalog,client});
  assert.equal(result.traces[0].result.code,'tool_not_allowed');assert.equal(result.scenarios.length,0);
});

test('delegation validates schema before creating a child task',async()=>{
  const session=fresh(),client=scripted({coordinator:[tools(['delegate_data_audit',{task:'核查',override_budget:999}]),answer('参数不合法，未委派。')]});
  const result=await runAgentTurn({session,context,text:'核查资料',catalog,client});
  assert.equal(result.tasks.length,1);assert.equal(result.traces[0].result.code,'invalid_delegation');
});

test('planning specialist reports missing inputs without inventing values',async()=>{
  const session=fresh(),client=scripted({coordinator:[tools(['delegate_plan_exploration',{task:'检查能否生成方案。'}]),answer('请提供预算、面积和单价。')],
    plan_exploration:[tools(['generate_scenario_options',{}]),answer('条件不全，需要用户提供。')]});
  const result=await runAgentTurn({session,context,text:'请生成方案。',catalog,client});
  assert.equal(result.tasks.at(-1).status,'needs_inputs');assert.equal(result.tasks[0].status,'needs_inputs');assert.equal(result.scenarios.length,0);
});

test('repeated template generation in one target version is idempotent',()=>{
  const s=fresh();s.messages.push({role:'user',content:prompt});
  executeTool('set_planning_goal',{budget_rmb:100000,candidate_area_m2:800,unit_cost_rmb_per_m2:100,evidence_quote:prompt},s,catalog);
  const first=executeTool('generate_scenario_options',{},s,catalog),again=executeTool('generate_scenario_options',{},s,catalog);
  assert.equal(again.status,'draft_options_reused');assert.equal(s.scenarios.length,3);assert.deepEqual(again.scenarios,first.scenarios);
});

test('old user quotes cannot restore a budget after a new user revision',()=>{
  const s=fresh();s.messages.push({role:'user',content:'预算10万元。'},{role:'user',content:'把预算改成5万元。'});
  assert.throws(()=>executeTool('set_planning_goal',{budget_rmb:100000,evidence_quote:'预算10万元。'},s,catalog),/本轮/);
  assert.equal(s.goal.version,0);
});

test('delegated prediction cannot override an original user refusal',async()=>{
  const s=fresh();s.messages.push({role:'user',content:prompt});
  executeTool('set_planning_goal',{budget_rmb:100000,candidate_area_m2:800,unit_cost_rmb_per_m2:100,evidence_quote:prompt},s,catalog);
  executeTool('generate_scenario_options',{},s,catalog);
  const client=scripted({coordinator:[tools(['delegate_prediction_evaluation',{task:'尝试预测'}]),answer('未运行预测。')],
    prediction_evaluation:[tools(['request_temperature_prediction',{scenario_id:s.scenarios[0].id}],['compare_scenario_options',{}]),answer('原始用户不要求计算，未进行预测。')]});
  const result=await runAgentTurn({session:s,context,text:'只比较费用，不计算温度。',catalog,client});
  const trace=result.traces.find(t=>t.tool==='request_temperature_prediction');
  assert.equal(trace.result.code,'prediction_not_requested');assert.ok(s.scenarios.every(v=>v.prediction_status==='not_run'));
});

test('task output versions become stale after target changes while data audit remains reusable',async()=>{
  const s=fresh();await runAgentTurn({session:s,context,text:prompt,catalog,client:collaborationClient(s)});
  s.messages.push({role:'user',content:'把预算改成5万元。'});
  executeTool('set_planning_goal',{budget_rmb:50000,evidence_quote:'把预算改成5万元。'},s,catalog);
  const view=publicSession(s);
  assert.equal(view.tasks.find(t=>t.agent_id==='data_audit').is_stale,false);
  assert.ok(view.tasks.filter(t=>t.agent_id!=='data_audit').every(t=>t.is_stale));
  assert.ok(view.scenarios.every(t=>t.is_stale));
});

test('global model budget bounds the whole tree and preserves partial tool evidence',async()=>{
  const s=fresh(),client=scripted({coordinator:[tools(['delegate_data_audit',{task:'核查资料'}])],data_audit:[tools(['get_project_overview',{}])]});
  await assert.rejects(runAgentTurn({session:s,context,text:'核查资料',catalog,client,budgetLimits:{model_requests:2}}),e=>e.code==='run_budget_exceeded');
  assert.equal(client.seen.length,2);assert.equal(s.active_run_id,null);assert.ok(s.tasks.every(t=>t.status==='failed'));
  assert.equal(s.traces.find(t=>t.tool==='get_project_overview').result.current_site.classified_green_projection_area_m2,1989);
});

test('specialist provider failures remain failed tasks rather than fabricated successful outputs',async()=>{
  const s=fresh(),client=scripted({coordinator:[tools(['delegate_data_audit',{task:'核查资料'}]),answer('资料任务失败，未取得结果。')],
    data_audit:[()=>{throw new Error('private upstream failure must not appear');}]});
  const result=await runAgentTurn({session:s,context,text:'核查资料',catalog,client});
  assert.equal(result.tasks.at(-1).status,'failed');assert.equal(result.tasks[0].status,'completed_with_limits');
  assert.ok(!JSON.stringify(result).includes('private upstream'));assert.equal(result.tasks.at(-1).result.error.code,'task_failed');
});

for(const [kind,limit] of [['tool_calls',1],['delegations',0]])test(`global ${kind} budget also bounds delegation`,async()=>{
  const s=fresh(),client=scripted({coordinator:[tools(['get_project_overview',{}],['delegate_data_audit',{task:'核查资料'}])]});
  await assert.rejects(runAgentTurn({session:s,context,text:'核查资料',catalog,client,budgetLimits:{[kind]:limit}}),e=>e.code==='run_budget_exceeded');
  assert.equal(s.active_run_id,null);assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].status,'failed');
  assert.equal(s.tasks[0].budget.used[kind],limit);
});

test('cancellation closes running task tree and retains its records',async()=>{
  const s=fresh(),controller=new AbortController(),client=scripted({coordinator:[tools(['delegate_data_audit',{task:'核查资料'}])]});
  await assert.rejects(runAgentTurn({session:s,context,text:'核查资料',catalog,client,signal:controller.signal,onProgress:async()=>{if(s.tasks.length===2)controller.abort();}}));
  assert.equal(s.active_run_id,null);assert.equal(s.tasks.length,2);assert.ok(s.tasks.every(t=>t.status==='cancelled'));
});

test('provider receives only the current role tool list',async()=>{
  const permitted=roleTools('data_audit');
  const client=createDeepSeekClient({apiKey:'fake-test-only',fetchImpl:async(_url,options)=>{
    assert.deepEqual(JSON.parse(options.body).tools,permitted);
    return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:'仅测试适配'}}]})};
  }});
  await client.complete([],{tools:permitted});assert.equal(Object.keys(AGENT_ROLES).length,4);
});

const fixtureRoot=resolve(root,'.test-fixtures');await mkdir(fixtureRoot,{recursive:true});
const fixture=await mkdtemp(resolve(fixtureRoot,'multi-agent-'));
test.after(async()=>{assert.ok(resolve(fixture).startsWith(fixtureRoot+sep));await rm(fixture,{recursive:true,force:true});});

test('restart marks persisted running tasks interrupted and does not auto-retry',async()=>{
  const s=fresh();s.tasks=[{id:'task',run_id:'run',parent_task_id:null,agent_id:'coordinator',status:'running',trace_ids:[]}];s.active_run_id='run';
  const store=new SessionStore(fixture);await store.save(s);
  const restored=await new SessionStore(fixture).get(s.id);
  assert.equal(restored.active_run_id,null);assert.equal(restored.tasks[0].status,'interrupted');
  assert.equal(JSON.parse(await readFile(resolve(fixture,`${s.id}.json`),'utf8')).tasks[0].status,'interrupted');
});

test('legacy sessions without task fields remain readable',async()=>{
  const s=fresh();delete s.tasks;delete s.event_version;delete s.active_run_id;
  const store=new SessionStore(fixture);await store.save(s);
  const restored=await new SessionStore(fixture).get(s.id),view=publicSession(restored);
  assert.deepEqual(view.tasks,[]);assert.equal(view.event_version,0);assert.equal(view.active_run_id,null);
});

test('Windows temporary file locks retry the same atomic replacement without deleting snapshots',async()=>{
  let attempts=0;const waits=[];
  await replaceSessionFile('pending-file','existing-snapshot',{renameImpl:async(source,target)=>{
    assert.equal(source,'pending-file');assert.equal(target,'existing-snapshot');
    if(++attempts<3)throw Object.assign(new Error('temporary lock'),{code:'EPERM'});
  },waitImpl:async ms=>waits.push(ms)});
  assert.equal(attempts,3);assert.deepEqual(waits,[20,40]);
});

test('snapshot rename failures stay bounded and non-lock errors are not retried',async()=>{
  let attempts=0;
  await assert.rejects(replaceSessionFile('pending','saved',{renameImpl:async()=>{attempts++;throw Object.assign(new Error('locked'),{code:'EBUSY'});},waitImpl:async()=>{}}),e=>e.code==='EBUSY');
  assert.equal(attempts,5);attempts=0;
  await assert.rejects(replaceSessionFile('pending','saved',{renameImpl:async()=>{attempts++;throw Object.assign(new Error('missing'),{code:'ENOENT'});},waitImpl:async()=>assert.fail('must not wait')}),e=>e.code==='ENOENT');
  assert.equal(attempts,1);
});

test('HTTP progress exposes actual running tasks and refuses overlapping writes',async t=>{
  let entered,release;
  const enteredPromise=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>release=resolve);
  const client={model:'test-only',configured:true,async complete(){entered();await hold;return answer('任务结束。');}};
  const store=new SessionStore(fixture),server=createAgentServer({catalog,client,store,port:0});
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  t.after(()=>{release();server.closeAllConnections();return new Promise(done=>server.close(done));});
  const base=`http://127.0.0.1:${server.address().port}/api/agent`,headers={'Content-Type':'application/json','X-UrbanCool-Agent':'1'};
  const created=await(await fetch(`${base}/sessions`,{method:'POST',headers,body:JSON.stringify({context})})).json();
  const body=JSON.stringify({session_id:created.session.id,context,message:'你好'});
  const request=fetch(`${base}/chat`,{method:'POST',headers,body});await enteredPromise;
  const live=await(await fetch(`${base}/sessions/${created.session.id}`)).json();assert.equal(live.session.tasks[0].status,'running');
  assert.equal((await fetch(`${base}/chat`,{method:'POST',headers,body})).status,409);
  release();const done=await(await request).json();assert.equal(done.session.tasks[0].status,'completed');assert.equal(done.session.active_run_id,null);
  const health=await(await fetch(`${base}/health`)).json();assert.equal(health.agents.length,4);assert.equal(health.capabilities.multi_agent,true);
});

test('HTTP cancellation targets the active run and preserves its completed tool evidence',async t=>{
  let waiting;
  const entered=new Promise(resolve=>waiting=resolve);
  const client=scripted({coordinator:[
    tools(['get_project_overview',{}]),
    (_messages,{signal})=>new Promise((_resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
      waiting();
    }),
    answer('下一轮已完成。'),
  ]});
  const store=new SessionStore(fixture),server=createAgentServer({catalog,client,store,port:0});
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  t.after(()=>{server.closeAllConnections();return new Promise(done=>server.close(done));});
  const base=`http://127.0.0.1:${server.address().port}/api/agent`;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-UrbanCool-Agent':'1'},body:JSON.stringify(body)});
  const created=await (await post('/sessions',{context})).json();
  const id=created.session.id,sessionPath=`/sessions/${id}`;
  const request=post('/chat',{session_id:id,context,message:'请查场地资料'});
  await entered;
  const live=await (await fetch(base+sessionPath)).json();
  const runId=live.session.active_run_id;
  assert.ok(runId);
  assert.equal((await post(sessionPath+'/cancel',{run_id:'wrong-run'})).status,409);
  assert.equal((await post(sessionPath+'/cancel',{run_id:runId})).status,202);
  const response=await request;
  assert.equal(response.status,499);
  const stopped=await response.json();
  assert.equal(stopped.session.active_run_id,null);
  assert.equal(stopped.session.tasks[0].status,'cancelled');
  assert.deepEqual(stopped.session.messages.map(message=>message.turn_id),[runId,runId]);
  assert.equal((await post(sessionPath+'/cancel',{run_id:runId})).status,409);

  const saved=await store.get(id);
  const sourceTrace=saved.traces[0];
  saved.traces.push(...Array.from({length:40},(_,i)=>({...sourceTrace,id:`later-${i}`,turn_id:'later'})));
  await store.save(saved);
  assert.equal((await (await fetch(base+sessionPath)).json()).session.traces.some(trace=>trace.turn_id===runId),false);
  const evidence=await (await fetch(base+sessionPath+'/evidence?run_id='+runId)).json();
  assert.deepEqual(evidence.traces,[sourceTrace]);
  assert.equal((await fetch(base+sessionPath+'/evidence?run_id=invalid')).status,404);
  assert.equal((await post('/chat',{session_id:id,context,message:'再查一次'})).status,200);
});

test('HTTP turn timeout records a failure distinct from user cancellation',async t=>{
  const client=scripted({coordinator:[(_messages,{signal})=>{
    signal.throwIfAborted();
    return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  }]});
  const store=new SessionStore(fixture),server=createAgentServer({catalog,client,store,port:0,turnTimeoutMs:100});
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  t.after(()=>{server.closeAllConnections();return new Promise(done=>server.close(done));});
  const base=`http://127.0.0.1:${server.address().port}/api/agent`;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-UrbanCool-Agent':'1'},body:JSON.stringify(body)});
  const created=await (await post('/sessions',{context})).json();
  const response=await post('/chat',{session_id:created.session.id,context,message:'核查场地'});
  const {error,session}=await response.json();
  assert.equal(response.status,504);
  assert.equal(error.code,'turn_timeout');
  assert.equal(session.tasks[0].status,'failed');
  assert.equal(session.active_run_id,null);
});
