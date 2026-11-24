import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadLocalEnvironment} from '../server/agent-server.mjs';
import {loadProjectCatalog} from '../server/agent-tools.mjs';
import {createQwenClient} from '../server/qwen-client.mjs';
import {qwenConfig} from '../server/qwen-config.mjs';
import {verifySpatialDialogue} from './spatial-dialogue-acceptance.mjs';

export async function main(args=process.argv.slice(2)) {
  if(args.length!==2||args[0]!=='--output'||!args[1])throw new Error('用法：npm run verify:spatial:live -- --output 新的验收目录');
  const directory=resolve(args[1]);
  await mkdir(dirname(directory),{recursive:true});
  await mkdir(directory); // Existing evidence must never be overwritten.
  await loadLocalEnvironment();
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const config=qwenConfig(),client=createQwenClient(config),catalog=await loadProjectCatalog(root);
  const endpoint=new URL(config.baseUrl);
  let emitted=0;
  const result=await verifySpatialDialogue({catalog,client,onRecord:async record=>{
    await writeFile(resolve(directory,'acceptance.json'),JSON.stringify({...record,inference_transport:'configured_qwen_http',
      endpoint:{origin:endpoint.origin,api_path:/^\/(?:openai\/)?v1\/?$/.test(endpoint.pathname)?endpoint.pathname:'custom'}},null,2)+'\n');
    for(const item of record.cases.slice(emitted))console.log(JSON.stringify({case:item.name,passed:item.passed,
      failed_checks:Object.keys(item.checks).filter(key=>!item.checks[key]),model_requests:item.model_requests}));
    emitted=record.cases.length;
  }});
  console.log(JSON.stringify({status:result.status,passed:result.passed||0,total:result.cases.length,
    model_requests:result.model_requests,reason:result.reason||null,report:resolve(directory,'acceptance.json')}));
  return result.status==='passed'?0:result.status==='not_run'?2:1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.exitCode=await main();}
  catch(error){console.error(error?.code==='EEXIST'?'验收目录已存在，请使用新目录以保留历史证据。':'验收未启动；请核对命令、输出目录与模型配置。');process.exitCode=2;}
}
