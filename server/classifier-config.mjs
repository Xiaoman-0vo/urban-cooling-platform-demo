export function classifierOrigin(env=process.env) {
  const url=new URL(env.URBANCOOL_CLASSIFIER_ORIGIN||'http://127.0.0.1:5678');
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||
    url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw new Error('URBANCOOL_CLASSIFIER_ORIGIN 必须是本机回环 HTTP 地址。');
  return url.origin;
}
