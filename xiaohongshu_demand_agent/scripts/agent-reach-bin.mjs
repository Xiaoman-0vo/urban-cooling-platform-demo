import {accessSync,constants} from 'node:fs';
import {homedir} from 'node:os';
import {delimiter,isAbsolute,join} from 'node:path';

export function findAgentReach(env=process.env){
  const name=process.platform==='win32'?'agent-reach.exe':'agent-reach';
  const command=env.AGENT_REACH||name;
  const paths=isAbsolute(command)?[command]:[
    join(homedir(),'.local','bin',command),
    ...(env.PATH||'').split(delimiter).filter(Boolean).map(dir=>join(dir,command)),
  ];
  return paths.find(candidate=>{
    try{accessSync(candidate,constants.X_OK);return true;}
    catch{return false;}
  });
}
