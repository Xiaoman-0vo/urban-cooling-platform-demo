import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {appRoot,loadRuntimeEnvironment} from './runtime-config.mjs';
import {classifierReady,docker,findContainer,waitForClassifier} from './n8n-local.mjs';

async function main(){
  const config=await loadRuntimeEnvironment();
  if(!await classifierReady(config.classifierOrigin)){
    const container=await findContainer(config);
    console.log(`正在恢复判定容器 ${container}…`);
    await docker(['start',container]);
    await waitForClassifier(config.classifierOrigin);
  }
  const args=process.argv.slice(2);
  const index=args.indexOf('--port');
  const port=Number(index>=0?args[index+1]:process.env.CHAT_PORT||4177);
  try{
    const response=await fetch(`http://127.0.0.1:${port}/healthz`,{signal:AbortSignal.timeout(1000)});
    const current=await response.json();
    if(current.service==='urbancool-xhs-chat'){
      if(current.classifier_origin!==config.classifierOrigin)throw new Error('现有聊天页使用旧判定地址，请先关闭旧进程再重启。');
      console.log(`聊天页已在运行：http://127.0.0.1:${port}/`);
      return;
    }
  }catch(error){if(error.message.includes('旧判定地址'))throw error;}
  const child=spawn(process.execPath,['scripts/serve-chat.mjs',...process.argv.slice(2)],{
    cwd:appRoot,env:process.env,stdio:'inherit',windowsHide:true});
  const [code]=await once(child,'exit');
  process.exitCode=code??1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
