import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');

export async function buildWorkbench({root=projectRoot,mode,env=process.env,platform=process.platform}={}){
  let buildEnv={...env};
  if(platform==='win32'){
    // esbuild 的大文件转换由 Node 和原生子进程共同读写临时文件。
    // 放到项目内，避免低完整性子进程无法删除系统 TEMP 中由父进程创建的文件。
    const temporary=join(root,'.runtime','build-temp');
    await mkdir(temporary,{recursive:true});
    buildEnv={...buildEnv,TEMP:temporary,TMP:temporary,TMPDIR:temporary};
  }
  const steps=[['node_modules/vite/bin/vite.js','build',...(mode?['--mode',mode]:[])],
    ['scripts/prepare-sites-build.mjs']];
  for(const args of steps){
    const child=spawn(process.execPath,args,{cwd:root,env:buildEnv,stdio:'inherit',windowsHide:true});
    const [code,signal]=await once(child,'exit');
    if(code!==0)throw new Error(`页面构建失败（${args[0]}，${signal||`退出码 ${code}`}），请查看上方提示。`);
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {values}=parseArgs({options:{mode:{type:'string'}}});
  buildWorkbench({mode:values.mode}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
