import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {packSource,verifySource,publishObs,validateSpec,probeDeployment} from '../deploy/huawei/delivery.mjs';

const spec=()=>({schema:'urbancool-topic1-target/1',region:'cn-north-4',obs:{bucket:'urbancool-fixture',create_bucket:false},
  ecs:{host:'',ssh_port:22,ssh_user:'',deploy_directory:'',https_origin:''}});
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'urbancool-delivery-'));
  for(const [path,content] of Object.entries({'package.json':'{}','package-lock.json':'{}','Dockerfile':'FROM node',
    'index.html':'<div id="root"></div>','server/agent-server.mjs':'// fixture','public/data/scene.json':'{}',
    'deploy/huawei/.env':'private-env','deploy/huawei/.env.example':'URBANCOOL_SITE_ORIGIN=https://replace-with-your-domain.example',
    'deploy/huawei/target.json':'private-target',
    'README.md':'# Reproduction instructions','scripts/start-workbench.mjs':'// startup fixture',
    'tests/example.test.mjs':'// test fixture','tests/fixtures/case.json':'{"scope":"fixture"}',
    'evidence/科研登记_最新双版本JSON磁盘核对.json':'{"scope":"public research fixture"}',
    'tests/.env':'private-test-env',
    'server/credentials.json':'private-key','public/data/cache.sqlite':'private-db','server/.weibo-cookie':'private-cookie',
    'server/private.key':'private-key','public/data/model.joblib':'private-weight','src/example.js':'export const fixture=true;'})){
    const full=join(root,path);await mkdir(join(full,'..'),{recursive:true});await writeFile(full,content);
  }
  return {root,...await packSource(root,join(root,'release'))};
}

test('release packages boot inputs while excluding secrets, private targets and user state',async()=>{
  const {artifact,record,root}=await fixture(),verified=await verifySource(artifact);
  assert.equal(verified.sha256,record.artifact_sha256);assert.equal(verified.members,13);
  const zip=await JSZip.loadAsync(await readFile(artifact));
  assert.ok(zip.file('deploy/huawei/.env.example'));
  for(const path of ['README.md','scripts/start-workbench.mjs','tests/example.test.mjs','tests/fixtures/case.json'])assert.ok(zip.file(path),path);
  assert.ok(zip.file('evidence/科研登记_最新双版本JSON磁盘核对.json'));
  assert.ok(!Object.keys(zip.files).some(path=>/credentials|cache\.sqlite|\.env$|cookie|private\.key|target\.json|model\.joblib/.test(path)));
  await assert.rejects(packSource(root,join(root,'release')),{code:'EEXIST'});
});

test('modified members, extra files and traversal names cannot be accepted for upload',async()=>{
  const {artifact,root}=await fixture();
  for(const attack of ['content','extra','traversal','empty']){
    const zip=await JSZip.loadAsync(await readFile(artifact));
    if(attack==='content')zip.file('src/example.js','tampered');
    if(attack==='extra')zip.file('server/credentials.json','not-allowed');
    if(attack==='traversal'){
      const manifest=JSON.parse(await zip.file('release-manifest.json').async('string'));
      manifest.members[0].path='../package.json';zip.file('release-manifest.json',JSON.stringify(manifest));
    }
    if(attack==='empty'){
      for(const name of Object.keys(zip.files))zip.remove(name);
      zip.file('release-manifest.json',JSON.stringify({schema:'urbancool-topic1-release/1',members:[]}));
    }
    const modified=join(root,attack+'.zip');await writeFile(modified,await zip.generateAsync({type:'nodebuffer'}));
    await assert.rejects(verifySource(modified));
  }
});

test('target accepts the intentionally blank cloud fields and rejects credential fields and unsafe origins',()=>{
  const empty=spec();empty.region='';empty.obs.bucket='';empty.ecs.ssh_port=null;assert.equal(validateSpec(empty),empty);
  for(const mutate of [s=>s.ak='never-save-a-key',s=>s.ecs.password='never-save-a-password',
    s=>s.ecs.ssh_port=0,s=>s.obs.bucket='UPPER_bucket',s=>s.region='cn-north-4/other',
    s=>s.ecs.https_origin='https://user:secret@example.org',s=>s.ecs.https_origin='http://example.org']){
    const invalid=spec();mutate(invalid);assert.throws(()=>validateSpec(invalid));
  }
});

test('OBS planning and incomplete execution never instantiate the SDK client',async()=>{
  const {artifact}=await fixture();let calls=0;const clientFactory=()=>{calls++;throw Error('not expected');};
  const planned=await publishObs({spec:spec(),artifact,clientFactory});
  assert.equal(planned.status,'planned_not_executed');assert.equal(planned.operations.length,0);
  const incomplete=spec();incomplete.region='';incomplete.obs.bucket='';
  const skipped=await publishObs({spec:incomplete,artifact,execute:true,env:{},clientFactory});
  assert.equal(skipped.status,'not_run');assert.deepEqual(skipped.missing,['region','obs.bucket','environment_credentials']);assert.equal(calls,0);
});

test('official OBS request contract creates a private bucket, uploads a content-addressed ZIP and verifies length',async()=>{
  const {artifact,record}=await fixture(),calls=[];let closed=false;
  const target=spec();target.obs.create_bucket=true;
  const clientFactory=options=>{
    assert.equal(options.server,'https://obs.cn-north-4.myhuaweicloud.com');
    assert.equal(options.security_token,'fixture-token');
    return Object.fromEntries(['createBucket','putObject','getObjectMetadata'].map(name=>[name,async args=>{
      calls.push({name,args});return {CommonMsg:{Status:name==='createBucket'?201:200,RequestId:'ABCDEF123456'},
        InterfaceResult:{ContentLength:String(record.artifact_bytes)}};
    }]).concat([['close',()=>{closed=true;}]]));
  };
  const result=await publishObs({spec:target,artifact,execute:true,env:{HUAWEICLOUD_SDK_AK:'fixture-ak',HUAWEICLOUD_SDK_SK:'fixture-sk',HUAWEICLOUD_SDK_SECURITY_TOKEN:'fixture-token'},clientFactory});
  assert.equal(result.status,'uploaded_and_metadata_verified');assert.equal(closed,true);
  assert.deepEqual(calls.map(c=>c.name),['createBucket','putObject','getObjectMetadata']);
  assert.equal(calls[0].args.ACL,'private');assert.equal(calls[1].args.ACL,'private');
  assert.equal(calls[1].args.Key,`urbancool/releases/${record.artifact_sha256}.zip`);
  assert.ok(!JSON.stringify(result).includes('fixture-ak'));assert.ok(!JSON.stringify(result).includes('fixture-token'));
});

test('OBS denied access or wrong object size fails honestly without logging SDK error secrets or retrying',async()=>{
  const {artifact}=await fixture();
  for(const mode of ['denied','wrong_size','network']){
    const calls=[],clientFactory=()=>Object.fromEntries(['getBucketMetadata','putObject','getObjectMetadata'].map(name=>[name,async()=>{
      calls.push(name);if(mode==='network')throw Error('fixture-secret');
      return {CommonMsg:{Status:mode==='denied'?403:200,Message:'fixture-secret'},InterfaceResult:{ContentLength:1}};
    }]));
    const result=await publishObs({spec:spec(),artifact,execute:true,env:{HUAWEICLOUD_SDK_AK:'a',HUAWEICLOUD_SDK_SK:'s'},clientFactory});
    assert.equal(result.status,'failed');assert.ok(!JSON.stringify(result).includes('fixture-secret'));
    assert.equal(calls.length,mode==='wrong_size'?3:1);
  }
});

test('runtime probe tests real readiness and page markers without asserting a cloud provider',async()=>{
  let calls=0;
  const fetchImpl=async(url,options)=>{
    assert.equal(options.redirect,'error');calls++;
    return new URL(url).pathname==='/healthz'?Response.json({status:'ready',service:'urbancool-workbench',accounts:true}):
      new Response('<title>UrbanCool AI</title><div id="root"></div>');
  };
  const local=await probeDeployment('http://127.0.0.1:5312',{fetchImpl});
  assert.equal(local.status,'passed');assert.equal(local.scope,'local_runtime');assert.equal(calls,2);
  const remote=await probeDeployment('https://example.org',{fetchImpl});
  assert.equal(remote.status,'passed');assert.equal(remote.cloud_provider_verified,false);
  assert.equal(remote.scope,'remote_runtime_provider_not_attested');
  for(const invalid of ['http://example.org','https://user:secret@example.org','https://example.org/path','https://example.org/?key=secret'])
    await assert.rejects(probeDeployment(invalid,{fetchImpl}));
  assert.equal((await probeDeployment('http://localhost:5312',{fetchImpl:async()=>{throw Error('private-path');}})).status,'failed');
});

test('CLI creates a reviewable blank-target plan and refuses to replace its existing evidence',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'urbancool-delivery-cli-')),output=join(directory,'new','plan');
  const cli=fileURLToPath(new URL('../scripts/topic1-delivery.mjs',import.meta.url));
  const run=promisify(execFile),args=[cli,'plan','--out',output];
  await run(process.execPath,args);
  const original=await readFile(join(output,'evidence.json'),'utf8'),record=JSON.parse(original);
  assert.equal(record.status,'prepared_not_executed');assert.equal(record.target.ecs.host,'');assert.equal(record.target.ecs.ssh_port,null);assert.equal(record.cloud_provider_verified,false);
  await assert.rejects(run(process.execPath,args));
  assert.equal(await readFile(join(output,'evidence.json'),'utf8'),original);
});
