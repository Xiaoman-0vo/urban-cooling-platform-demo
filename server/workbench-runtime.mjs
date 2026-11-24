export function workbenchRuntime(env=process.env,{workbench=false}={}) {
  const port=Number(env.AGENT_PORT||5181),host=env.AGENT_HOST||'127.0.0.1';
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('AGENT_PORT 应为有效本地端口。');
  if(!['127.0.0.1','0.0.0.0'].includes(host))throw new Error('AGENT_HOST 仅支持 127.0.0.1 或 0.0.0.0。');
  if(host==='0.0.0.0'&&!env.URBANCOOL_SITE_ORIGIN)throw new Error('云端监听需显式配置 URBANCOOL_SITE_ORIGIN。');
  let siteOrigin=env.URBANCOOL_SITE_ORIGIN||(workbench?`http://127.0.0.1:${port}`:undefined);
  if(siteOrigin){
    let url;try{url=new URL(siteOrigin);}catch{throw new Error('URBANCOOL_SITE_ORIGIN 格式无效。');}
    const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||(!local&&url.protocol!=='https:'))
      throw new Error('URBANCOOL_SITE_ORIGIN 需为 HTTPS 源；本机验收可用回环 HTTP 地址。');
    siteOrigin=url.origin;
  }
  return {port,host,siteOrigin};
}

export const collectorEnabled=(env=process.env)=>env.URBANCOOL_COLLECTOR_MODE!=='disabled';
export const COLLECTOR_DISABLED_MESSAGE='此部署未启用浏览器采集。可查询历史归档和整理核查记录；新采集请在已登录平台的本地工作台运行。';
