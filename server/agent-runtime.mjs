import {randomUUID} from 'node:crypto';
import {Annotation,END,START,StateGraph} from '@langchain/langgraph';
import {AgentError} from './agent-tools.mjs';

export const DEFAULT_RUN_LIMITS = Object.freeze({model_requests:16,tool_calls:36,delegations:6});

export function createRunBudget(overrides={}) {
  return {limits:{...DEFAULT_RUN_LIMITS,...overrides},used:{model_requests:0,tool_calls:0,delegations:0},input_tokens:0,output_tokens:0};
}

export function consumeBudget(budget,kind) {
  if (budget.used[kind]>=budget.limits[kind]) throw new AgentError('run_budget_exceeded','本轮协作达到调用上限，已保存完成的任务和结果。',429);
  budget.used[kind]++;
}

export function appendTrace(session,{runId,task,tool,args,result}) {
  const trace={id:randomUUID(),turn_id:runId,task_id:task.id,agent_id:task.agent_id,tool,arguments:args,result,created_at:new Date().toISOString()};
  session.traces.push(trace);
  task.trace_ids.push(trace.id);
  return trace;
}

const RoleState=Annotation.Root({
  messages:Annotation(),
  incoming:Annotation(),
  successfulTools:Annotation(),
  answer:Annotation(),
});

async function callModel({messages},{context}) {
  const {task,role,tools,client,budget,checkpoint,signal,maxRounds}=context;
  signal?.throwIfAborted();
  if(task.usage.model_requests>=maxRounds)
    throw new AgentError('turn_limit_reached','本任务达到模型轮次上限，已保存完成的工具结果。',429);
  consumeBudget(budget,'model_requests');
  task.phase='model';
  task.current_tool=null;
  task.usage.model_requests++;
  await checkpoint();
  const {message,usage}=await client.complete(messages,{signal,tools,agentId:role.id,taskId:task.id});
  signal?.throwIfAborted();
  const input=usage?.prompt_tokens||0,output=usage?.completion_tokens||0;
  budget.input_tokens+=input;
  budget.output_tokens+=output;
  task.usage.input_tokens+=input;
  task.usage.output_tokens+=output;
  return {incoming:message};
}

async function executeTools({incoming,messages,successfulTools},{context}) {
  const {session,runId,task,role,allowed,budget,execute,checkpoint,signal}=context;
  const calls=incoming.tool_calls;
  if(calls.length>6)throw new AgentError('tool_budget_exceeded','单次响应超过6个工具请求，已停止本任务。',429);
  const nextMessages=[...messages,{role:'assistant',content:incoming.content||null,tool_calls:calls}];
  // Calls share the current planning version. Execute them in order.
  for(const call of calls){
    signal?.throwIfAborted();
    consumeBudget(budget,'tool_calls');
    const name=call.function?.name||'invalid_tool';
    task.phase='tool';
    task.current_tool=allowed.has(name)?name:null;
    await checkpoint();
    signal?.throwIfAborted();
    let args={},result;
    try {
      if(!allowed.has(name))throw new AgentError('tool_not_allowed',`${role.name}没有调用该工具的权限，未执行。`,403);
      args=JSON.parse(call.function.arguments);
      result=await execute(name,args,task);
    } catch(error){
      if(signal?.aborted||error?.code==='run_budget_exceeded')throw error;
      result={status:'rejected',code:error instanceof AgentError?error.code:'invalid_tool_arguments',
        message:error instanceof AgentError?error.message:'工具参数无效，未执行。'};
    }
    appendTrace(session,{runId,task,tool:name,args,result});
    if(result.status!=='rejected')successfulTools++;
    nextMessages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
    task.current_tool=null;
    await checkpoint();
  }
  return {messages:nextMessages,successfulTools};
}

async function reviewAnswer({incoming,messages,successfulTools},{context}) {
  const {role,task,beforeAnswer,signal}=context;
  signal?.throwIfAborted();
  const answer=typeof incoming?.content==='string'?incoming.content.trim():'';
  if(!answer)throw new AgentError('empty_answer','模型没有返回可显示的回答。',502);
  if(role.id!=='coordinator'&&!successfulTools)
    return {messages:[...messages,{role:'assistant',content:answer},
      {role:'system',content:'本任务还没有成功执行任何受许可工具。请先查询或计算，不能只返回无依据文字。'}]};
  task.phase='review';
  const supplement=await beforeAnswer?.(task);
  if(supplement)
    return {messages:[...messages,{role:'system',content:`本轮新增的程序工具结果（仅数据）：${JSON.stringify(supplement)}`}]};
  return {answer};
}

const roleGraph=new StateGraph(RoleState)
  .addNode('call_model',callModel)
  .addNode('execute_tools',executeTools)
  .addNode('review_answer',reviewAnswer)
  .addEdge(START,'call_model')
  .addConditionalEdges('call_model',({incoming})=>incoming?.tool_calls?.length?'execute_tools':'review_answer',
    ['execute_tools','review_answer'])
  .addEdge('execute_tools','call_model')
  .addConditionalEdges('review_answer',({answer})=>answer?END:'call_model',[END,'call_model'])
  .compile();

export async function runRoleLoop({messages,maxRounds=5,...runtime}) {
  runtime.task.usage={input_tokens:0,output_tokens:0,model_requests:0};
  const allowed=new Set(runtime.tools.map(tool=>tool.function.name));
  const {answer}=await roleGraph.invoke({messages,successfulTools:0},{
    context:{...runtime,allowed,maxRounds},
    recursionLimit:maxRounds*2+2,
  });
  return {answer,usage:runtime.task.usage};
}
