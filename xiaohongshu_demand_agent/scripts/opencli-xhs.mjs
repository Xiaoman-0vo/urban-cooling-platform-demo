import {spawnSync} from 'node:child_process';
import {accessSync,statSync} from 'node:fs';
import {isAbsolute} from 'node:path';

export function configuredOpenCliEntry(path=process.env.OPENCLI_ENTRY){
  if(!path||!isAbsolute(path))return undefined;
  try{
    accessSync(path);
    return statSync(path).isFile()?path:undefined;
  }catch{
    return undefined;
  }
}

const errors={
  69:{code:'BROWSER_CONNECT',message:'OpenCLI 浏览器桥未连接。请启用扩展并保持浏览器打开。'},
  75:{code:'TIMEOUT',message:'小红书读取超时，请重试。'},
  77:{code:'LOGIN_REQUIRED',message:'请在 OpenCLI 已连接的浏览器中登录小红书。'},
};

export function runOpenCliXhs(entry,action,input,{timeout,maxComments}){
  const command=action==='read'?'note':action;
  const limits=command==='comments'?['--limit',String(Math.max(1,maxComments))]:[];
  const child=spawnSync(process.execPath,[entry,'xiaohongshu',command,input,...limits,'-f','json'],{
    encoding:'utf8',timeout,maxBuffer:4*1024*1024,windowsHide:true,
    env:{...process.env,OPENCLI_WINDOW:process.env.OPENCLI_WINDOW||'background'},
  });
  if(child.error?.code==='ETIMEDOUT')return {ok:false,error:errors[75]};
  if(child.status===66&&command!=='note')return {ok:true,backend:'opencli',items:[]};
  if(child.status!==0)return {ok:false,error:errors[child.status]||
    {code:'OPENCLI_FAILED',message:'OpenCLI 未能读取小红书内容。'}};
  let rows;
  try{rows=JSON.parse(child.stdout);}
  catch{return {ok:false,error:{code:'BAD_OUTPUT',message:'OpenCLI 返回了无效的 JSON。'}};}
  if(!Array.isArray(rows))return {ok:false,error:{code:'BAD_OUTPUT',message:'OpenCLI 返回了意外的数据格式。'}};
  if(command==='note'){
    const note=Object.fromEntries(rows.map(({field,value})=>[field,value]));
    return {ok:true,backend:'opencli',items:[{title:note.title,author:note.author,text:note.content}]};
  }
  if(command==='comments'){
    rows=rows.filter(row=>row.is_reply!==true).map(({author,text,likes,rank})=>({author,text,like_count:likes,floor:rank}));
  }
  return {ok:true,backend:'opencli',items:rows};
}
