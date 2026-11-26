import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {createAccountService} from '../server/account-service.mjs';
import {createAgentServer} from '../server/agent-server.mjs';
import {loadProjectCatalog} from '../server/agent-tools.mjs';

test('same-host workbenches keep independent browser sessions across login, logout and restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'urbancool-cookie-isolation-'));
  const instances=[];
  const catalog=await loadProjectCatalog(fileURLToPath(new URL('../',import.meta.url)));
  const jar=new Map([['urbancool_account','L'.repeat(43)]]);
  async function close(instance){
    if(instance.closed)return;
    instance.closed=true;
    await new Promise(resolve=>{instance.server.close(resolve);instance.server.closeAllConnections();});
    instance.accounts.close();
  }
  t.after(async()=>{for(const instance of instances)await close(instance);await rm(directory,{recursive:true,force:true});});
  async function start(name,port){
    const accounts=createAccountService({filename:join(directory,name+'.sqlite'),cookieScope:`http://127.0.0.1:${port}`});
    const server=createAgentServer({accounts,catalog,port:0});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const instance={accounts,server,base:`http://127.0.0.1:${server.address().port}/api/agent`};
    instances.push(instance);return instance;
  }
  async function request(instance,path,{body,accountId}={}){
    const response=await fetch(instance.base+path,{method:body?'POST':'GET',
      headers:{Cookie:[...jar].map(([key,value])=>`${key}=${value}`).join('; '),
        ...(body?{'Content-Type':'application/json','X-UrbanCool-Agent':'1'}:{}),
        ...(accountId?{'X-UrbanCool-Account':accountId}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    for(const cookie of response.headers.getSetCookie()){
      const [pair]=cookie.split(';'),index=pair.indexOf('='),name=pair.slice(0,index),value=pair.slice(index+1);
      if(/Max-Age=0(?:;|$)/.test(cookie))jar.delete(name);else jar.set(name,value);
      assert.match(cookie,/HttpOnly; SameSite=Strict/);
    }
    return {status:response.status,data:await response.json()};
  }
  const a=await start('daily',5181),b=await start('trial',5312);
  const userA=await request(a,'/account/register',{body:{username:'daily_user',password:'fixture-account-session-pass'}});
  const userB=await request(b,'/account/register',{body:{username:'trial_user',password:'fixture-account-session-pass'}});
  assert.equal(userA.status,201);assert.equal(userB.status,201);
  assert.equal(jar.size,3);
  // 旧试用容器仍可能重写共享 Cookie；新的工作台只读取自己实例的 Cookie。
  jar.set('urbancool_account','Q'.repeat(43));
  assert.equal((await request(a,'/account')).data.user.id,userA.data.user.id);
  assert.equal((await request(b,'/account')).data.user.id,userB.data.user.id);
  assert.equal((await request(b,'/account/logout',{body:{},accountId:userB.data.user.id})).status,200);
  assert.equal((await request(b,'/account')).data.user,null);
  assert.equal((await request(a,'/account')).data.user.id,userA.data.user.id);
  await close(a);
  const restarted=await start('daily',5181);
  assert.equal((await request(restarted,'/account')).data.user.id,userA.data.user.id);
  const login=await request(restarted,'/account/login',{body:{username:'daily_user',password:'fixture-account-session-pass'}});
  assert.equal(login.status,200);assert.equal(login.data.user.id,userA.data.user.id);
});
