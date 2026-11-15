import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createQwenClient} from './qwen-client.mjs';
import {loadProjectCatalog} from './agent-tools.mjs';
import {createAgentServer,SessionStore} from './agent-server.mjs';
import {createHistoricalTemperature} from './historical-lst.mjs';

export async function startQwenAgentServer({port=Number(process.env.AGENT_PORT||5181),baseUrl=process.env.QWEN_BASE_URL||'http://127.0.0.1:18083/v1',model=process.env.QWEN_MODEL||'active',specialistModel=process.env.QWEN_SPECIALIST_MODEL||'base',apiKey=process.env.QWEN_API_KEY||''}={}) {
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('AGENT_PORT must be a valid local port');
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const catalog=await loadProjectCatalog(root);
  const client=createQwenClient({baseUrl,model,specialistModel,apiKey});
  const store=new SessionStore(resolve(root,'.runtime/agent-qwen/sessions'));
  const server=createAgentServer({catalog,client,store,port,historicalTemperature:createHistoricalTemperature()});
  server.listen(port,'127.0.0.1',()=>console.log(`UrbanCool Qwen Agent: http://127.0.0.1:${port}`));
  server.on('error',error=>{console.error(`Qwen Agent service could not start (${error.code||'error'}).`);process.exitCode=1;});
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await startQwenAgentServer();
