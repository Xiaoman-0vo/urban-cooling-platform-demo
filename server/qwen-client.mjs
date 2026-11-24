import {AgentError} from './agent-tools.mjs';
import {QWEN_DEFAULTS} from './qwen-config.mjs';

export function createQwenClient({baseUrl=QWEN_DEFAULTS.baseUrl,model=QWEN_DEFAULTS.model,specialistModel=model,apiKey='',fetchImpl=fetch,timeoutMs=120000,
  provider='Qwen',qwenTemplate=true}={}) {
  const url=new URL(baseUrl);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new AgentError('invalid_provider_config','Qwen服务地址无效。');
  const endpoint=url.toString().replace(/\/$/,'')+'/chat/completions';
  const localRuntime=qwenTemplate&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  const healthURL=new URL(url);
  healthURL.pathname=healthURL.pathname.replace(/\/v1\/?$/,'').replace(/\/$/,'')+'/health';
  if(typeof model!=='string'||!model.trim()||typeof specialistModel!=='string'||!specialistModel.trim())throw new AgentError('invalid_provider_config','请配置Qwen模型名称。');
  const modelForRole=id=>id==='coordinator'?model:specialistModel;
  async function probeStatus(){
    const result=(state,available,code,message)=>({state,available,code,message,checked_at:new Date().toISOString()});
    try {
      const response=await fetchImpl(healthURL.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(1500),
        headers:apiKey?{Authorization:`Bearer ${apiKey}`}:{}});
      if(response.status===404||response.status===405){
        await response.body?.cancel();
        return result('unknown',null,'health_unsupported','模型服务未提供就绪状态，可通过实际对话检查。');
      }
      if(!response.ok){
        await response.body?.cancel();
        if(response.status===401||response.status===403)
          return result('unavailable',false,'model_auth_failed','模型服务认证失败，请核对服务端凭证配置。');
        return result('unavailable',false,'model_service_error','模型服务暂时无法响应，请检查推理服务状态。');
      }
      let status;
      try{status=await response.json();}
      catch{return result('unavailable',false,'invalid_health_response','模型服务返回了无法识别的就绪信息，请核对推理地址。');}
      if(status?.base_ready===true)return result('ready',true,'model_ready','模型服务已连接。');
      if(status?.base_ready===false)return result('loading',false,'model_loading','模型正在加载，完成后会自动重新检查。');
      return result('unknown',null,'health_unrecognized','已收到服务响应，但尚未确认模型就绪。');
    }catch{
      return result('unavailable',false,'model_unreachable','尚未连接到 Qwen 推理服务。使用云端模型时，请确认实例已开机、推理服务已启动，并保持 SSH 转发运行。');
    }
  }
  const probe=async()=>(await probeStatus()).available;
  return {provider,model:qwenTemplate&&model==='active'?'Qwen3-8B (selected main)':model,configured:true,modelForRole,
    ...(localRuntime?{probe,probeStatus}:{}),
    async complete(messages,{signal,tools=[],agentId='coordinator'}={}) {
      let response;
      try {
        response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs),
          headers:{'Content-Type':'application/json',...(apiKey?{Authorization:`Bearer ${apiKey}`}:{})},
          body:JSON.stringify({model:modelForRole(agentId),messages,tools,tool_choice:'auto',max_tokens:800,stream:false,
            ...(qwenTemplate?{chat_template_kwargs:{enable_thinking:false}}:{})})});
      }catch{throw new AgentError(signal?.aborted?'turn_cancelled':'provider_unreachable',signal?.aborted?'协作任务已停止，已完成记录保留。':`${provider}服务连接中断或超时，已保留当前记录。`,502);}
      let body;try{body=await response.json();}catch{throw new AgentError('invalid_provider_response',`${provider}服务没有返回有效JSON结果。`,502);}
      if(!response.ok){
        const code=response.status===401?'provider_auth_failed':response.status===429?'provider_rate_limited':'provider_error';
        throw new AgentError(code,response.status===401?`${provider}服务认证失败。`:response.status===429?`${provider}服务受到频率限制，请稍后重试。`:`${provider}服务请求失败（HTTP ${response.status}）。`,502);
      }
      const choice=body.choices?.[0],message=choice?.message;
      if(!message||message.role!=='assistant'||!['stop','tool_calls'].includes(choice.finish_reason))throw new AgentError('incomplete_provider_response',`${provider}响应未完整结束，已保留工具记录。`,502);
      if(message.tool_calls!==undefined&&!Array.isArray(message.tool_calls))throw new AgentError('invalid_provider_response',`${provider}工具调用格式无效。`,502);
      return {message,usage:body.usage||null};
    }};
}
