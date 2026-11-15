export const AGENT_API=`${import.meta.env?.BASE_URL||'./'}api/agent`;
export const ACCOUNT_CHANGED='urbancool-account-changed';

export async function accountStatus(signal) {
  const accountBuild=import.meta.env.VITE_URBANCOOL_ACCOUNTS==='1';
  try {
    const response=await fetch(`${AGENT_API}/account`,{signal,cache:'no-store'});
    if(response.ok&&response.headers.get('content-type')?.includes('application/json')){
      const status=await response.json();
      if(status.enabled===true||(!accountBuild&&status.enabled===false))return status;
      throw new Error('账户服务未启用。');
    }
    if(!accountBuild&&[200,404,500,502,503].includes(response.status))return {enabled:false};
  }catch(error) {
    if(error.name==='AbortError')throw error;
    if(!accountBuild)return {enabled:false};
  }
  throw new Error('账户服务暂时无法连接。');
}

export async function accountRequest(path,{accountId,method='GET',body,signal}={}) {
  const response=await fetch(`${AGENT_API}${path}`,{
    method,signal,cache:'no-store',
    headers:{...(accountId?{'X-UrbanCool-Account':accountId}:{}),
      ...(method!=='GET'?{'X-UrbanCool-Agent':'1'}:{}),
      ...(body!==undefined?{'Content-Type':'application/json'}:{})},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>{throw new Error('账户服务未返回有效响应。');});
  if(!response.ok){
    if(accountId&&(response.status===401||data.error?.code==='account_changed'))
      window.dispatchEvent(new Event(ACCOUNT_CHANGED));
    const error=new Error(data.error?.message||'请求未完成，请重试。');
    error.session=data.session;
    error.code=data.error?.code;
    throw error;
  }
  return data;
}
