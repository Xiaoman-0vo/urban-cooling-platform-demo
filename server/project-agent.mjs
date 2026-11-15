import {AgentError, TOOL_DEFINITIONS} from './agent-tools.mjs';
import {runCollaborativeTurn} from './multi-agent.mjs';
import {AGENT_ROLES} from './agent-roles.mjs';

export const SYSTEM_INSTRUCTIONS = AGENT_ROLES.coordinator.instructions;

export function createDeepSeekClient({apiKey, model='deepseek-flash', fetchImpl=fetch, timeoutMs=30000}) {
  return {model, configured:Boolean(apiKey), async complete(messages, {signal,tools=TOOL_DEFINITIONS}={}) {
    if (!apiKey) throw new AgentError('missing_api_key','服务端尚未配置 DEEPSEEK_API_KEY。',503);
    let response;
    try {
      response = await fetchImpl('https://api.deepseek.com/chat/completions', {
        method:'POST', redirect:'error', signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs),
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
        body:JSON.stringify({model,messages,tools,tool_choice:'auto',thinking:{type:'disabled'},max_tokens:1800,stream:false}),
      });
    } catch { throw new AgentError(signal?.aborted?'turn_cancelled':'provider_unreachable',signal?.aborted?'协作任务已停止，完成的记录保留。':'模型服务连接中断或超时；已保留当前草案，可稍后重试。',502); }
    let body;
    try { body = await response.json(); } catch { throw new AgentError('invalid_provider_response','模型服务没有返回有效结果。',502); }
    if (!response.ok) {
      const code = response.status===401?'provider_auth_failed':response.status===402?'provider_balance_insufficient':response.status===429?'provider_rate_limited':'provider_error';
      const message = {provider_auth_failed:'DeepSeek 密钥校验失败，请检查服务端配置。',provider_balance_insufficient:'DeepSeek API 余额不足，请在对应账户检查计费。',provider_rate_limited:'DeepSeek 请求受到频率限制，请稍后重试。',provider_error:`模型服务请求失败（HTTP ${response.status}）。`}[code];
      throw new AgentError(code,message,502);
    }
    const choice = body.choices?.[0];
    if (!choice?.message || !['stop','tool_calls'].includes(choice.finish_reason))
      throw new AgentError('incomplete_provider_response','模型响应未完整结束；已保留完成的工具记录。',502);
    return {message:choice.message,usage:body.usage || null};
  }};
}

// 保留原入口，旧客户端和测试继续使用；默认运行新的主从协作流程。
export async function runAgentTurn(options) {
  return runCollaborativeTurn(options);
}
