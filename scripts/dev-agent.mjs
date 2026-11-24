import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadLocalEnvironment} from '../server/agent-server.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const children=[];
let stopping=false;
function stop(code=0) {
  if(stopping)return;
  stopping=true;
  for(const child of children)if(!child.killed)child.kill();
  process.exitCode=code;
}
const accounts=process.argv.includes('--accounts');
const qwen=process.argv.includes('--qwen')&&!accounts;
await loadLocalEnvironment();
const env={...process.env};
if(accounts){
  env.URBANCOOL_ACCOUNTS='1';
  env.VITE_URBANCOOL_ACCOUNTS='1';
}
for(const [file,args] of [[qwen?'server/qwen-agent-server.mjs':'server/agent-server.mjs',[]],['node_modules/vite/bin/vite.js',['--host','127.0.0.1','--port','5173','--strictPort']]]) {
  const child=spawn(process.execPath,[resolve(root,file),...args],{cwd:root,env,stdio:'inherit',windowsHide:true});
  children.push(child);
  child.on('error',()=>stop(1));
  child.on('exit',code=>stop(code || 0));
}
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
