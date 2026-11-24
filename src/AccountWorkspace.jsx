import React,{useEffect,useRef,useState} from 'react';
import {Gear,Leaf,X} from '@phosphor-icons/react';
import {App} from './App.jsx';
import {ACCOUNT_CHANGED,accountRequest,accountStatus} from './account-api.js';
import './account.css';

const modelChoices=[
  ['tuned','UrbanCool Qwen 微调版'],
  ['base','Qwen 基座版'],
  ['local','本地规划工具'],
  ['deepseek','DeepSeek API'],
  ['maas','华为云 MaaS'],
  ['compatible','兼容 API'],
];

function AccountLogin({onLogin}) {
  const [register,setRegister]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(event) {
    event.preventDefault();
    if(busy)return;
    const values=Object.fromEntries(new FormData(event.currentTarget));
    if(register&&values.password!==values.confirm){
      setError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);setError('');
    try {
      const {user}=await accountRequest(register?'/account/register':'/account/login',{
        method:'POST',body:{username:values.username,password:values.password}
      });
      onLogin(user);
    }catch(error){setError(error.message);}
    finally{setBusy(false);}
  }
  return <main className="account-page">
    <section className="account-card" aria-labelledby="account-heading">
      <div className="account-brand"><Leaf size={26} weight="fill"/>UrbanCool AI</div>
      <h1 id="account-heading">{register?'创建账户':'登录规划工作台'}</h1>
      <p>在自己的账户中保存场地工程、对话和模型设置。</p>
      <form key={String(register)} onSubmit={submit}>
        <label>用户名<input name="username" autoComplete="username" minLength={3} maxLength={32} required/></label>
        <label>密码<input name="password" type="password" autoComplete={register?'new-password':'current-password'}
          minLength={register?12:undefined} maxLength={128} placeholder={register?'至少 12 个字符':undefined} required/></label>
        {register&&<label>确认密码<input name="confirm" type="password" autoComplete="new-password" required/></label>}
        {error&&<p className="account-error" role="alert">{error}</p>}
        <button className="account-primary" disabled={busy} type="submit">{busy?'正在提交…':register?'注册并登录':'登录'}</button>
      </form>
      <button className="account-link" type="button" disabled={busy} onClick={()=>{setRegister(!register);setError('');}}>
        {register?'已有账户，去登录':'注册新账户'}
      </button>
    </section>
  </main>;
}

function McpSettings({accountId}) {
  const [settings,setSettings]=useState(null),[selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const requestRef=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();
    requestRef.current=controller;
    accountRequest('/mcp-settings',{accountId,signal:controller.signal}).then(({settings})=>{
      if(!controller.signal.aborted){setSettings(settings);setSelected(settings.selected);}
    }).catch(err=>{if(!controller.signal.aborted)setError(err.message);});
    return ()=>{controller.abort();requestRef.current?.abort();};
  },[accountId]);

  async function submit(check) {
    if(busy||!settings)return;
    const controller=new AbortController();
    requestRef.current=controller;
    setBusy(true);setError('');setNotice('');
    try{
      const data=await accountRequest(check?'/mcp-settings/check':'/mcp-settings',{
        accountId,method:check?'POST':'PUT',body:{preset_id:selected},signal:controller.signal,
      });
      if(controller.signal.aborted)return;
      if(check)setNotice(`连接通过，可用工具 ${data.tools.join('、')}。`);
      else{
        setSettings(data.settings);
        setNotice(selected?'已启用。对话可用「用团队 MCP 查询……」发起资料核查。':'已停用团队 MCP。');
      }
    }catch(err){if(!controller.signal.aborted)setError(err.message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }

  return <section className="account-mcp" aria-label="MCP 工具设置">
    <p>AI 规划助手可以查询微博和小红书归档，也可以提交新采集。下方可为当前账户选择一个团队服务。</p>
    {!settings&&!error&&<p role="status">正在读取 MCP 设置…</p>}
    {settings?.presets.length===0&&<p>团队服务登记后会出现在这里。请将 MCP 服务地址和只读工具名称交给维护者。</p>}
    {settings?.presets.length>0&&<form onSubmit={event=>{event.preventDefault();submit(false);}}>
      <label>团队 MCP 服务<select value={selected} onChange={event=>{setSelected(event.target.value);setNotice('');setError('');}} disabled={busy}>
        <option value="">停用</option>
        {settings.presets.map(preset=><option key={preset.id} value={preset.id}>{preset.label}</option>)}
      </select></label>
      {selected&&<><p>登记工具 {settings.presets.find(preset=>preset.id===selected)?.tools.join('、')}</p>
        <p>发起团队 MCP 查询时，查询参数会发送到所选服务。</p></>}
      <div className="account-mcp-actions">
        <button type="button" className="account-link" disabled={!selected||busy} onClick={()=>submit(true)}>测试连接</button>
        <button type="submit" className="account-primary" disabled={busy||selected===settings.selected}>保存 MCP 设置</button>
      </div>
    </form>}
    {error&&<p className="account-error" role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}

function ModelSettings({user,onClose,onSaved,onLogout}) {
  const dialog=useRef(null);
  const [tab,setTab]=useState('model');
  const [settings,setSettings]=useState(null);
  const [provider,setProvider]=useState('tuned'),[model,setModel]=useState('');
  const [endpoint,setEndpoint]=useState(''),[apiKey,setApiKey]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    const modal=dialog.current;
    modal.showModal();
    const controller=new AbortController();
    accountRequest('/model',{accountId:user.id,signal:controller.signal}).then(({settings})=>{
      setSettings(settings);setProvider(settings.provider);setModel(settings.model);setEndpoint(settings.endpoint);
    }).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    return ()=>{controller.abort();modal.close();};
  },[user.id]);
  const external=['deepseek','compatible','maas'].includes(provider);
  const keyStored=Boolean(settings?.key_configured&&settings.provider===provider&&settings.endpoint===endpoint);
  function changeProvider(value) {
    setProvider(value);setApiKey('');setError('');
    setModel(value===settings.provider?settings.model:value==='deepseek'?'deepseek-flash':value==='maas'?settings.maas_model||'':'');
    setEndpoint(value===settings.provider?settings.endpoint:value==='deepseek'?'https://api.deepseek.com':value==='maas'?settings.maas_endpoint:settings.compatible_endpoints[0]||'');
  }
  async function save(event) {
    event.preventDefault();
    if(busy||!settings)return;
    setBusy(true);setError('');
    try {
      await accountRequest('/model',{accountId:user.id,method:'PUT',body:{provider,model,endpoint,api_key:apiKey}});
      onSaved();
    }catch(error){setError(error.message);}
    finally{setBusy(false);}
  }
  async function logout() {
    if(busy)return;
    setBusy(true);setError('');
    try {await accountRequest('/account/logout',{accountId:user.id,method:'POST'});onLogout();}
    catch(error){setError(error.message);}
    finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="account-dialog" aria-labelledby="account-settings-heading"
    onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <header><div><h2 id="account-settings-heading">工作台设置</h2><p>{user.username}</p></div>
      <button type="button" className="account-close" aria-label="关闭设置" disabled={busy} onClick={onClose}><X size={21}/></button>
    </header>
    <nav className="account-settings-nav" aria-label="设置分类">
      <button type="button" aria-pressed={tab==='model'} disabled={busy} onClick={()=>setTab('model')}>模型设置</button>
      <button type="button" aria-pressed={tab==='mcp'} disabled={busy} onClick={()=>setTab('mcp')}>MCP 工具</button>
    </nav>
    {tab==='mcp'?<McpSettings accountId={user.id}/>:settings?<form onSubmit={save}>
      <label>对话模型<select value={provider} onChange={event=>changeProvider(event.target.value)} disabled={busy}>
        {modelChoices.filter(([id])=>id!=='compatible'||settings.compatible_endpoints.length>0||settings.provider===id)
          .map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select></label>
      {provider==='local'&&<p>使用表单比较方案，也可以查询历史地表温度。</p>}
      {['tuned','base'].includes(provider)&&<p>对话调用项目组的 Qwen 推理服务。</p>}
      {external&&<>
        {provider==='maas'&&<p>服务地址：{settings.maas_endpoint}。填写控制台已开通且支持工具调用的模型 ID 与自己的 MaaS API Key。</p>}
        {provider==='compatible'&&<label>API 地址<select value={endpoint} onChange={event=>{setEndpoint(event.target.value);setApiKey('');}} required>
          <option value="">选择地址</option>
          {settings.compatible_endpoints.map(url=><option key={url}>{url}</option>)}
        </select></label>}
        <label>模型 ID<input value={model} onChange={event=>setModel(event.target.value)} maxLength={128} required/></label>
        <label>API Key<input type="password" value={apiKey} onChange={event=>setApiKey(event.target.value)} autoComplete="off"
          placeholder={keyStored?'已保存，留空继续使用':'输入 API Key'} required={!keyStored}/></label>
        <p>使用此模型对话时，问句及规划上下文会发送到 {provider==='deepseek'?'DeepSeek API':endpoint||'你选择的 API'}。</p>
      </>}
      {error&&<p role="alert" className="account-error">{error}</p>}
      <button type="submit" className="account-primary" disabled={busy}>{busy?'正在保存…':'保存模型设置'}</button>
    </form>:<p role={error?'alert':'status'}>{error||'正在读取设置…'}</p>}
    <button type="button" className="account-link" disabled={busy} onClick={logout}>退出登录</button>
  </dialog>;
}

export function AccountWorkspace() {
  const [status,setStatus]=useState(null),[bootError,setBootError]=useState('');
  const [settingsOpen,setSettingsOpen]=useState(false),[modelRevision,setModelRevision]=useState(0);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    accountStatus(controller.signal).then(data=>{if(!controller.signal.aborted)setStatus(data);})
      .catch(error=>{if(!controller.signal.aborted)setBootError(error.message);});
    return ()=>controller.abort();
  },[attempt]);
  useEffect(()=>{
    const refresh=()=>{setSettingsOpen(false);setStatus(null);setAttempt(value=>value+1);};
    window.addEventListener(ACCOUNT_CHANGED,refresh);
    return ()=>window.removeEventListener(ACCOUNT_CHANGED,refresh);
  },[]);
  if(bootError)return <main className="account-page"><section className="account-card"><p role="alert">{bootError}</p>
    <button className="account-primary" onClick={()=>{setBootError('');setAttempt(value=>value+1);}}>重试</button></section></main>;
  if(!status)return <main className="account-page"><p role="status">正在连接 UrbanCool…</p></main>;
  if(!status.enabled)return <App/>;
  if(!status.user)return <AccountLogin onLogin={user=>setStatus({enabled:true,user})}/>;
  const {user}=status;
  return <>
    <App key={user.id} account={user} modelRevision={modelRevision} onModelSettings={()=>setSettingsOpen(true)}
      accountControl={<button type="button" aria-label="账户与模型设置" title={`${user.username} · 账户与模型设置`}
        onClick={()=>setSettingsOpen(true)}><Gear size={21}/></button>}/>
    {settingsOpen&&<ModelSettings user={user} onClose={()=>setSettingsOpen(false)}
      onSaved={()=>{setSettingsOpen(false);setModelRevision(value=>value+1);}}
      onLogout={()=>{setSettingsOpen(false);setStatus({enabled:true,user:null});}}/>}
  </>;
}
