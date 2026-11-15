import {AgentError} from './agent-tools.mjs';

export function createQwenClient({baseUrl='http://127.0.0.1:18083/v1',model='active',specialistModel=model,apiKey='',fetchImpl=fetch,timeoutMs=120000,
  provider='Qwen',qwenTemplate=true}={}) {
  const url=new URL(baseUrl);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new AgentError('invalid_provider_config','Qwen服务地址无效。');
  const endpoint=url.toString().replace(/\/$/,'')+'/chat/completions';
  const localRuntime=qwenTemplate&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  const healthURL=new URL(url);
  healthURL.pathname=healthURL.pathname.replace(/\/v1\/?$/,'').replace(/\/$/,'')+'/health';
  if(typeof model!=='string'||!model.trim()||typeof specialistModel!=='string'||!specialistModel.trim())throw new AgentError('invalid_provider_config','请配置Qwen模型名称。');
  const modelForRole=id=>id==='coordinator'?model:specialistModel;
  async function probe(){
    try {
      const response=await fetchImpl(healthURL.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(1500),
        headers:apiKey?{Authorization:`Bearer ${apiKey}`}:{}});
      if(response.status===404||response.status===405){
        await response.body?.cancel();
        return null;
      }
      const status=response.ok?await response.json():null;
      return status?.base_ready===false?false:response.ok;
    }catch{return false;}
  }
  return {provider,model:qwenTemplate&&model==='active'?'Qwen3-8B (selected main)':model,configured:true,modelForRole,
    ...(localRuntime?{probe}:{}),
    async complete(messages,{signal,tools=[],agentId='coordinator'}={}) {
      let response;
      try {
        response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs),
          headers:{'Content-Type':'application/json',...(apiKey?{Authorization:`Bearer ${apiKey}`}:{})},
          body:JSON.stringify({model:modelForRole(agentId),messages,tools,tool_choice:'auto',max_tokens:800,stream:false,
            ...(qwenTemplate?{chat_template_kwargs:{enable_thinking:false}}:{})})});
      }catch{throw new AgentError(signal?.aborted?'turn_cancelled':'provider_unreachable',signal?.aborted?'协作任务已停止，已完成记录保留。':'Qwen服务连接中断或超时，已保留当前记录。',502);}
      let body;try{body=await response.json();}catch{throw new AgentError('invalid_provider_response','Qwen服务没有返回有效JSON结果。',502);}
      if(!response.ok){
        const code=response.status===401?'provider_auth_failed':response.status===429?'provider_rate_limited':'provider_error';
        throw new AgentError(code,response.status===401?'Qwen服务认证失败。':response.status===429?'Qwen服务受到频率限制，请稍后重试。':`Qwen服务请求失败（HTTP ${response.status}）。`,502);
      }
      const choice=body.choices?.[0],message=choice?.message;
      if(!message||message.role!=='assistant'||!['stop','tool_calls'].includes(choice.finish_reason))throw new AgentError('incomplete_provider_response','Qwen响应未完整结束，已保留工具记录。',502);
      if(message.tool_calls!==undefined&&!Array.isArray(message.tool_calls))throw new AgentError('invalid_provider_response','Qwen工具调用格式无效。',502);
      return {message,usage:body.usage||null};
    }};
}
