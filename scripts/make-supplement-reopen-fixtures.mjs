import {readFile,writeFile,mkdir} from 'node:fs/promises';
import JSZip from 'jszip';
const p=JSON.parse(await readFile('/Users/wangyanbo/Downloads/街区交接_E4125_N33891_2026-10-05T21-38-32-234Z.json','utf8'));
await mkdir('evidence/五组拒绝重开样例',{recursive:true});
const dir='evidence/五组拒绝重开样例/';
const variants={schema:v=>v.supplementRegistrations[0].schema_version='unknown',duplicate:v=>v.supplementRegistrations.push(structuredClone(v.supplementRegistrations[0])),unknown_field:v=>v.supplementRegistrations[0].unknown_scientific_ready=true,source_hash:v=>v.supplementRegistrations[0].sources[0].sha256='0'.repeat(64),unit_mismatch:v=>v.supplementRegistrations[0].sources.find(s=>s.mime_type==='text/csv').unit_raw='percent'};
for(const [name,edit] of Object.entries(variants)){const v=structuredClone(p);edit(v);await writeFile(dir+name+'.json',JSON.stringify(v));}
const b=await readFile('/Users/wangyanbo/Downloads/街区交接_E4125_N33891_2026-10-05T21-39-09-879Z.zip');
for(const name of ['sidecar_mismatch','missing_dependency']){const z=await JSZip.loadAsync(b);if(name==='sidecar_mismatch')z.file('supplements/registrations.json',JSON.stringify(p.supplementRegistrations.slice(1)));else z.remove('supplements/focal-neighbor.zip');await writeFile(dir+name+'.zip',await z.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));}
await writeFile(dir+'duplicate_json_key.json','{"supplementRegistrations":[],"supplementRegistrations":[],"test":"strict parser sample"}');
console.log('8 local negative reopen fixtures created; real source files unchanged.');
