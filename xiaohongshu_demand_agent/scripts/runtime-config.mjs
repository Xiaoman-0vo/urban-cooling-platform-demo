import {readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuredOpenCliEntry} from './opencli-xhs.mjs';

export const appRoot=fileURLToPath(new URL('../',import.meta.url));
const allowed=/^(URBANCOOL_CLASSIFIER_ORIGIN|URBANCOOL_N8N_CONTAINER|N8N_URL|OPENCLI_ENTRY|OPENCLI_WINDOW|OPENCLI_PROFILE|OPENCLI_CONFIG_DIR|AGENT_REACH)$/;

export function classifierOrigin(env=process.env){
  const url=new URL(env.URBANCOOL_CLASSIFIER_ORIGIN||env.N8N_URL||'http://127.0.0.1:5678');
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||
    url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw new Error('判定地址应为本机回环 HTTP 源，例如 http://127.0.0.1:15678。');
  return url.origin;
}

export async function loadRuntimeEnvironment({env=process.env,root=appRoot}={}){
  for(const file of [join(root,'.env.local'),join(dirname(root),'.env.local')]){
    let text;
    try{text=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
    for(const line of text.split(/\r?\n/)){
      const match=line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if(match&&allowed.test(match[1])&&!env[match[1]])env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
    }
  }
  if(!env.OPENCLI_ENTRY&&env.APPDATA){
    const folder=join(env.APPDATA,'npm/node_modules/@jackwener/opencli');
    try{
      const pkg=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));
      const entry=resolve(folder,typeof pkg.bin==='string'?pkg.bin:pkg.bin.opencli);
      if(configuredOpenCliEntry(entry))env.OPENCLI_ENTRY=entry;
    }catch{}
  }
  return {classifierOrigin:classifierOrigin(env),containerName:env.URBANCOOL_N8N_CONTAINER||''};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(await loadRuntimeEnvironment()));
}
