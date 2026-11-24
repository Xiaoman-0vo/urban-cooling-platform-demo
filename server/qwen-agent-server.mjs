import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createQwenClient} from './qwen-client.mjs';
import {loadProjectCatalog} from './agent-tools.mjs';
import {createAgentServer,SessionStore,loadLocalEnvironment} from './agent-server.mjs';
import {createHistoricalTemperature} from './historical-lst.mjs';
import {qwenConfig} from './qwen-config.mjs';

export async function startQwenAgentServer(options={}) {
  await loadLocalEnvironment();
  const {port=Number(process.env.AGENT_PORT||5181),...overrides}=options;
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('AGENT_PORT must be a valid local port');
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const catalog=await loadProjectCatalog(root);
  const client=createQwenClient({...qwenConfig(),...overrides});
  const store=new SessionStore(resolve(root,'.runtime/agent-qwen/sessions'));
  const server=createAgentServer({catalog,client,store,port,historicalTemperature:createHistoricalTemperature()});
  server.listen(port,'127.0.0.1',()=>console.log(`UrbanCool Qwen Agent: http://127.0.0.1:${port}`));
  server.on('error',error=>{console.error(`Qwen Agent service could not start (${error.code||'error'}).`);process.exitCode=1;});
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await startQwenAgentServer();
