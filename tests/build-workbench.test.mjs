import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildWorkbench} from '../scripts/build-workbench.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'UrbanCool 构建 '));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'node_modules/vite/bin'),{recursive:true});
  await mkdir(join(root,'scripts'),{recursive:true});
  await writeFile(join(root,'package.json'),'{"type":"module"}');
  await writeFile(join(root,'node_modules/vite/bin/vite.js'),`
    const fs=require('node:fs');const os=require('node:os');
    fs.writeFileSync('build-proof.json',JSON.stringify({temp:os.tmpdir(),TEMP:process.env.TEMP,TMP:process.env.TMP,args:process.argv.slice(2)}));
    if(process.env.URBANCOOL_TEST_BUILD_FAIL==='1')process.exitCode=7;
  `);
  await writeFile(join(root,'scripts/prepare-sites-build.mjs'),"import fs from 'node:fs';fs.writeFileSync('prepared.txt','ready');");
  return root;
}

test('Windows build children share a project temporary directory without changing the caller environment',async t=>{
  const root=await fixture(t),env={...process.env,TEMP:'caller-temp',TMP:'caller-tmp'};
  await buildWorkbench({root,mode:'accounts',env,platform:'win32'});
  const proof=JSON.parse(await readFile(join(root,'build-proof.json'),'utf8'));
  assert.equal(proof.temp,join(root,'.runtime','build-temp'));
  assert.equal(proof.TEMP,proof.TMP);
  assert.deepEqual(proof.args,['build','--mode','accounts']);
  assert.equal(env.TEMP,'caller-temp');assert.equal(env.TMP,'caller-tmp');
  assert.equal(await readFile(join(root,'prepared.txt'),'utf8'),'ready');
});

test('failed Vite compilation stops before preparing a successful build',async t=>{
  const root=await fixture(t);
  await assert.rejects(buildWorkbench({root,platform:'win32',env:{...process.env,URBANCOOL_TEST_BUILD_FAIL:'1'}}),/退出码 7/);
  await assert.rejects(access(join(root,'prepared.txt')));
});
