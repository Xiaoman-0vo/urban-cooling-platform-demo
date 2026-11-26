import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {checkCollectionReadiness,checkClassification} from '../server/collection-readiness.mjs';
import {classifierOrigin} from '../server/classifier-config.mjs';
import {canManageClassifier,createLocalClassifierService} from '../server/local-classifier-service.mjs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {requestHeatCollection} from '../server/heat-perception-client.mjs';

const env={OPENCLI_ENTRY:fileURLToPath(import.meta.url)};
const missingEntry=fileURLToPath(new URL('./missing-opencli-program.mjs',import.meta.url));
const health={status:'ok',result:{route:'health',alive:true}};

test('collection readiness requires a published classifier and a connected browser',async()=>{
  let classifier=health;
  let bridge={extensionConnected:false};
  const fetchImpl=async(url,options)=>{
    if(new URL(url).port==='19825'){
      if(options.headers?.['X-OpenCLI']!=='1')return Response.json({error:'Forbidden'},{status:403});
      return Response.json(bridge);
    }
    const body=JSON.parse(options.body);
    assert.equal(body.action,'health');
    assert.deepEqual(body.payload,{});
    return Response.json(classifier);
  };
  const disconnected=await checkCollectionReadiness('xhs',{env,fetchImpl});
  assert.equal(disconnected.ready,false);
  assert.equal(disconnected.checks.find(check=>check.id==='browser').ready,false);
  bridge={extensionConnected:true};
  assert.equal((await checkCollectionReadiness('xhs',{env,fetchImpl})).ready,true);
  bridge={extensionConnected:false,profileRequired:true,profiles:[{},{}]};
  const multiple=await checkCollectionReadiness('xhs',{env,fetchImpl});
  assert.equal(multiple.ready,false);
  assert.match(multiple.checks.find(check=>check.id==='browser').message,/多个浏览器/);
  bridge={extensionConnected:true};
  classifier={status:'accepted',result:{alive:true}};
  const missingWorkflow=await checkCollectionReadiness('xhs',{env,fetchImpl});
  assert.equal(missingWorkflow.ready,false);
  assert.equal(missingWorkflow.checks[0].ready,false);
});

test('readiness explains missing programs and offline services without reporting them ready',async()=>{
  const failed=await checkCollectionReadiness('xhs',{
    env:{OPENCLI_ENTRY:missingEntry},
    fetchImpl:async()=>{throw new TypeError('connection failed');},
  });
  assert.equal(failed.ready,false);
  assert.ok(failed.checks.every(check=>check.ready===false));
  assert.match(failed.checks[0].message,/正在检查/);
  const unpublished=await checkCollectionReadiness('xhs',{
    env,fetchImpl:async url=>new URL(url).port==='19825'?Response.json({extensionConnected:true}):new Response('',{status:404}),
  });
  assert.match(unpublished.checks[0].message,/工作流待配置/);
});

test('classifier port is configurable and only loopback endpoints are accepted',async()=>{
  assert.equal(classifierOrigin({URBANCOOL_CLASSIFIER_ORIGIN:'http://127.0.0.1:15678/'}),'http://127.0.0.1:15678');
  for(const value of ['https://example.org','http://user:secret@localhost:15678','http://localhost:15678/path','http://localhost:15678/?key=secret'])
    assert.throws(()=>classifierOrigin({URBANCOOL_CLASSIFIER_ORIGIN:value}));
  const result=await checkClassification(async url=>{
    assert.equal(url,'http://127.0.0.1:15678/webhook/weibo-demand/v1');return Response.json(health);
  },{env:{URBANCOOL_CLASSIFIER_ORIGIN:'http://127.0.0.1:15678'}});
  assert.equal(result.ready,true);
});

test('local recovery coalesces simultaneous checks and restarts a stopped existing service',async()=>{
  let alive=false,release;
  const gate=new Promise(done=>{release=done;}),calls=[];
  const service=createLocalClassifierService({env:{URBANCOOL_N8N_CONTAINER:'urbancool-n8n'},
    check:async()=>({ready:alive,message:alive?'判定服务已就绪。':'offline'}),
    run:async(command,args)=>{calls.push([command,...args]);if(args[0]==='info')await gate;if(args[0]==='start')alive=true;},
  });
  const a=service.ensure(),b=service.ensure();assert.equal(a,b);
  assert.equal(service.check({ready:false}).state,'starting');
  release();assert.equal((await a).state,'ready');
  assert.equal(calls.filter(call=>call[1]==='start').length,1);
  alive=false;await service.ensure();
  assert.equal(calls.filter(call=>call[1]==='start').length,2);
});

test('failed recovery explains port reservation without leaking errors and backs off',async()=>{
  let clock=0,starts=0;
  const service=createLocalClassifierService({now:()=>clock,check:async()=>({ready:false}),
    run:async(_command,args)=>{if(args[0]==='start'){starts++;throw Object.assign(Error('fixture-private-env'),{stderr:'ports are not available: forbidden by its access permissions fixture-private-env'});}},
  });
  await service.ensure();assert.equal(service.status.state,'failed');
  assert.match(service.status.message,/Windows/);assert.ok(!JSON.stringify(service.status).includes('fixture-private-env'));
  await service.ensure();assert.equal(starts,1);
  clock=30001;await service.ensure();assert.equal(starts,2);
});

test('Windows recovery launches the installed runtime hidden; cloud and disabled modes never manage it',async()=>{
  let engine=false,alive=false;const calls=[];
  const service=createLocalClassifierService({platform:'win32',exists:async()=>true,
    check:async()=>({ready:alive}),run:async(command,args)=>{
      calls.push([command,...args]);
      if(command==='powershell.exe')engine=true;
      if(args[0]==='info'&&!engine)throw Error('offline');
      if(args[0]==='start')alive=true;
    },
  });
  await service.ensure();assert.equal(service.status.state,'ready');
  assert.match(calls.find(call=>call[0]==='powershell.exe').at(-1),/-WindowStyle Hidden/);
  assert.equal(canManageClassifier({workbench:true,host:'127.0.0.1',env:{}}),true);
  for(const settings of [{workbench:true,host:'0.0.0.0',env:{}},{workbench:true,host:'127.0.0.1',env:{URBANCOOL_COLLECTOR_MODE:'disabled'}},
    {workbench:true,host:'127.0.0.1',env:{URBANCOOL_CLASSIFIER_AUTOSTART:'0'}},{workbench:false,host:'127.0.0.1',env:{}}])
    assert.equal(canManageClassifier(settings),false);
});

test('readiness initiates background recovery and keeps collection disabled until the workflow is healthy',async()=>{
  let recoveries=0;
  const result=await checkCollectionReadiness('xhs',{env,fetchImpl:async url=>new URL(url).port==='19825'
    ?Response.json({extensionConnected:true}):new Response('',{status:503}),
    classifierService:{ensure(){recoveries++;return Promise.resolve();},check(check){return {...check,state:'starting',message:'正在自动启动判定服务。'};}},
  });
  assert.equal(recoveries,1);assert.equal(result.ready,false);assert.equal(result.checks[0].state,'starting');
});

test('the isolated MCP collector uses the configured classifier port before creating any job',async()=>{
  const previous=Object.fromEntries(['URBANCOOL_CLASSIFIER_ORIGIN','OPENCLI_ENTRY','URBANCOOL_COLLECTOR_MODE'].map(key=>[key,process.env[key]]));
  const paths=[];
  const server=createServer((request,response)=>{paths.push(request.url);response.writeHead(503);response.end();});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    process.env.URBANCOOL_CLASSIFIER_ORIGIN=`http://127.0.0.1:${server.address().port}`;
    process.env.OPENCLI_ENTRY=fileURLToPath(import.meta.url);process.env.URBANCOOL_COLLECTOR_MODE='local';
    await assert.rejects(requestHeatCollection(randomUUID(),'遮阴',{source:'xiaohongshu'}),error=>error.code==='xhs_n8n_unavailable');
    assert.deepEqual(paths,['/healthz']);
  }finally{
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    server.closeAllConnections();await new Promise(done=>server.close(done));
  }
});
