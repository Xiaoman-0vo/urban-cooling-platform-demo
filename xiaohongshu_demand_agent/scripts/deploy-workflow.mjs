import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {appRoot,loadRuntimeEnvironment,classifierOrigin} from './runtime-config.mjs';
import {docker,findContainer,waitForClassifier} from './n8n-local.mjs';

export function stageWorkflow(incoming,existing){
  if(!incoming?.name||!Array.isArray(incoming.nodes))throw new Error('工作流必须有名称和节点列表。');
  const matches=existing.filter(workflow=>workflow.name===incoming.name)
    .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const staged={...incoming,active:false};
  delete staged.id;
  if(matches.length)staged.id=matches[0].id;
  return staged;
}

async function main(){
  const {values}=parseArgs({options:{workflow:{type:'string',multiple:true},container:{type:'string'},
    'base-url':{type:'string'},'no-restart':{type:'boolean',default:false}}});
  const config=await loadRuntimeEnvironment();
  if(values.container)config.containerName=values.container;
  if(values['base-url'])config.classifierOrigin=classifierOrigin({URBANCOOL_CLASSIFIER_ORIGIN:values['base-url']});
  const inputs=await Promise.all((values.workflow||['workflows/03-demand-agent-api.json']).map(async file=>{
    const parsed=JSON.parse(await readFile(resolve(appRoot,file),'utf8'));
    if(!Array.isArray(parsed)||parsed.length!==1)throw new Error('每个文件应只包含一个工作流。');
    return parsed[0];
  }));
  if(new Set(inputs.map(w=>w.name)).size!==inputs.length)throw new Error('一次部署不能包含重复名称。');
  const container=await findContainer(config);
  const token=randomUUID();
  const backup=join(appRoot,'.runtime/n8n-deploy',new Date().toISOString().replace(/[:.]/g,'-')+'-'+token.slice(0,8));
  await mkdir(backup,{recursive:true});
  async function exported(suffix){
    const remote=`/tmp/urbancool-${token}-${suffix}.json`;
    const local=join(backup,suffix+'.json');
    await docker(['exec',container,'n8n','export:workflow','--all','--output='+remote]);
    await docker(['cp',container+':'+remote,local]);
    return JSON.parse(await readFile(local,'utf8'));
  }
  let existing=await exported('before');
  console.log(`原工作流已备份：${backup}`);
  const deployed=[];
  for(const incoming of inputs){
    const staged=stageWorkflow(incoming,existing);
    const local=join(backup,'staged-'+deployed.length+'.json');
    const remote=`/tmp/urbancool-${token}-staged.json`;
    await writeFile(local,JSON.stringify([staged]));
    await docker(['cp',local,container+':'+remote]);
    await docker(['exec',container,'n8n','import:workflow','--input='+remote]);
    existing=await exported('after-import-'+deployed.length);
    const imported=stageWorkflow(incoming,existing);
    if(!imported.id||staged.id&&imported.id!==staged.id)throw new Error('导入后的工作流身份不一致，未发布。');
    await docker(['exec',container,'n8n','publish:workflow','--id='+imported.id]);
    deployed.push({name:imported.name,id:imported.id});
    console.log(`已发布 ${imported.name}，id=${imported.id}`);
  }
  // 保留已有指针；首次启用进度接口时初始化为空闲状态。
  await mkdir(join(appRoot,'data/jobs'),{recursive:true});
  try{await writeFile(join(appRoot,'data/jobs/latest.json'),JSON.stringify({id:null,status:'idle',phase:'idle'}),{flag:'wx'});}
  catch(error){if(error.code!=='EEXIST')throw error;}
  if(!values['no-restart']){
    await docker(['restart',container]);
    await waitForClassifier(config.classifierOrigin);
    console.log('n8n 已恢复，判定健康接口已通过。');
  }
  await writeFile(join(backup,'deployment.json'),JSON.stringify({container,origin:config.classifierOrigin,deployed,restarted:!values['no-restart']},null,2));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
