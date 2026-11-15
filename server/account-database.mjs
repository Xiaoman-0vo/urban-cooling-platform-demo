import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {AgentError} from './agent-tools.mjs';
import {recoverInterruptedTasks} from './agent-task-state.mjs';

const derive=promisify(scrypt);
const PASSWORD_COST={N:32768,r:8,p:3,maxmem:64*1024*1024};
const SESSION_SECONDS=7*24*60*60;
const COOKIE='urbancool_account';
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const sessionMissing=()=>new AgentError('session_not_found','该账户下没有这次 Agent 会话。',404);

export function credentials(body) {
  const username=typeof body.username==='string'?body.username.normalize('NFKC').trim():'';
  const password=body.password;
  if(!/^[\p{L}\p{N}_-]{3,32}$/u.test(username))
    throw new AgentError('invalid_username','用户名需为 3 至 32 个字母、数字、下划线或连字符。');
  if(typeof password!=='string'||password.length<12||password.length>128)
    throw new AgentError('invalid_password','密码需为 12 至 128 个字符。');
  return {username,login:username.toLowerCase(),password};
}

function readKey(filename) {
  const path=filename+'.key';
  if(!existsSync(path)){
    if(existsSync(filename))throw new Error('Account database key is missing.');
    try {writeFileSync(path,randomBytes(32),{mode:0o600,flag:'wx'});}
    catch(error) {if(error.code!=='EEXIST')throw error;}
  }
  const key=readFileSync(path);
  if(key.length!==32)throw new Error('Invalid account database key.');
  return key;
}

export function openAccountDatabase(filename) {
  mkdirSync(dirname(filename),{recursive:true,mode:0o700});
  const key=readKey(filename);
  const db=new DatabaseSync(filename);
  db.exec(`
    PRAGMA busy_timeout=5000;
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, login TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, snapshot TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL,
      model TEXT NOT NULL, endpoint TEXT NOT NULL, encrypted_key TEXT
    );
    CREATE TABLE IF NOT EXISTS mcp_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, preset_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site TEXT NOT NULL, scenario TEXT NOT NULL, mode TEXT NOT NULL, updated INTEGER NOT NULL,
      snapshot TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS agent_sessions_scope ON agent_sessions(user_id,site,scenario,mode,updated);
  `);
  const busy=new Set();
  const dummySalt=randomBytes(16);
  let hashing=0;
  async function hash(password,salt) {
    if(hashing>=3)throw new AgentError('auth_busy','登录请求较多，请稍后再试。',429);
    hashing++;
    try {return await derive(password,salt,32,PASSWORD_COST);}
    finally {hashing--;}
  }
  function readAgent(userId,id) {
    const row=db.prepare('SELECT snapshot FROM agent_sessions WHERE id=? AND user_id=?').get(id,userId);
    if(!row)throw sessionMissing();
    return JSON.parse(row.snapshot);
  }
  function saveAgent(userId,session) {
    const c=session.context;
    const change=db.prepare(`INSERT INTO agent_sessions(id,user_id,site,scenario,mode,updated,snapshot)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,snapshot=excluded.snapshot
      WHERE agent_sessions.user_id=excluded.user_id`).run(
      session.id,userId,c.site_id,c.scenario_id,c.planning_mode||'',Date.now(),JSON.stringify(session));
    if(!change.changes)throw sessionMissing();
  }
  function seal(value,userId) {
    const iv=randomBytes(12);
    const cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(userId));
    const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
  }
  function unseal(value,userId) {
    const bytes=Buffer.from(value,'base64url');
    const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
    cipher.setAAD(Buffer.from(userId));
    cipher.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');
  }
  return {
    close:()=>db.close(),
    async register({username,login,password}) {
      const id=randomUUID(),salt=randomBytes(16);
      const hashed=await hash(password,salt);
      const insert=db.prepare('INSERT INTO users VALUES(?,?,?,?,?) ON CONFLICT(login) DO NOTHING')
        .run(id,username,login,salt.toString('hex'),hashed.toString('hex'));
      if(!insert.changes)throw new AgentError('username_taken','这个用户名已注册。',409);
      return {id,username};
    },
    async login({login,password}) {
      const row=db.prepare('SELECT * FROM users WHERE login=?').get(login);
      const actual=await hash(password,row?Buffer.from(row.salt,'hex'):dummySalt);
      if(!row||!timingSafeEqual(Buffer.from(row.password_hash,'hex'),actual))
        throw new AgentError('invalid_login','用户名或密码不正确。',401);
      return {id:row.id,username:row.username};
    },
    startSession(userId) {
      const token=randomBytes(32).toString('base64url');
      db.prepare('DELETE FROM login_sessions WHERE expires<=?').run(Date.now());
      db.prepare('INSERT INTO login_sessions VALUES(?,?,?)').run(tokenHash(token),userId,Date.now()+SESSION_SECONDS*1000);
      return token;
    },
    currentUser(token) {
      return token?db.prepare(`SELECT users.id,username FROM users JOIN login_sessions ON users.id=user_id
        WHERE token_hash=? AND expires>?`).get(tokenHash(token),Date.now()):null;
    },
    endSession(token) {
      if(token)db.prepare('DELETE FROM login_sessions WHERE token_hash=?').run(tokenHash(token));
    },
    readProject(userId) {
      return db.prepare('SELECT snapshot FROM projects WHERE user_id=?').get(userId)?.snapshot||null;
    },
    saveProject(userId,snapshot) {
      db.prepare(`INSERT INTO projects VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET snapshot=excluded.snapshot`).run(userId,snapshot);
    },
    readModel(userId) {
      return db.prepare('SELECT provider,model,endpoint,encrypted_key FROM model_settings WHERE user_id=?').get(userId);
    },
    saveModel(userId,{provider,model,endpoint,apiKey}) {
      const secret=apiKey?seal(apiKey,userId):null;
      db.prepare(`INSERT INTO model_settings VALUES(?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,
          endpoint=excluded.endpoint,encrypted_key=excluded.encrypted_key`).run(userId,provider,model,endpoint,secret);
    },
    readModelKey(userId,row) {
      return row?.encrypted_key?unseal(row.encrypted_key,userId):'';
    },
    readMcpPreset(userId) {
      return db.prepare('SELECT preset_id FROM mcp_settings WHERE user_id=?').get(userId)?.preset_id||'';
    },
    saveMcpPreset(userId,presetId) {
      db.prepare('INSERT INTO mcp_settings VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET preset_id=excluded.preset_id').run(userId,presetId);
    },
    agentStore(userId) {
      return {
        busy,
        async get(id) {
          if(typeof id!=='string')throw sessionMissing();
          const session=readAgent(userId,id);
          if(!busy.has(id)&&recoverInterruptedTasks(session))saveAgent(userId,session);
          return session;
        },
        async save(session) {saveAgent(userId,session);},
        async latest(scope) {
          const row=db.prepare(`SELECT id FROM agent_sessions WHERE user_id=? AND site=? AND scenario=? AND mode=?
            ORDER BY updated DESC,id DESC LIMIT 1`).get(userId,scope.site_id,scope.scenario_id,scope.planning_mode||'');
          return row?this.get(row.id):null;
        },
      };
    },
  };
}

export function loginToken(request) {
  const item=request.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith(COOKIE+'='));
  const token=item?.slice(COOKIE.length+1);
  return /^[\w-]{43}$/.test(token||'')?token:null;
}

export function sessionCookie(token,secure) {
  return `${COOKIE}=${token||''}; Path=/api/agent; HttpOnly; SameSite=Strict; Max-Age=${token?SESSION_SECONDS:0}${secure?'; Secure':''}`;
}
