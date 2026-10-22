import JSZip from 'jszip';
import {SUPPLEMENT_CATALOG} from './supplement-catalog.js';
import {parseStrictPreparationJson} from './preparation-state.js';
import {validatePlanningSourceDescription,validatePlanningDevelopment} from './supplement-planning.js';
import {validateCandidateResource,validateModifiableEvidence} from './supplement-candidates.js';
import {validateFocalNeighborDescription} from './supplement-neighbor.js';
export {SUPPLEMENT_CATALOG};
export const READ_ONLY_SUPPLEMENT_GATES=Object.freeze({prediction:false,physical_simulation:false,service_evaluation:false,fairness_evaluation:false,candidate_generation:false,ranking:false});
const validators={'planning-description':validatePlanningSourceDescription,'planning-development':validatePlanningDevelopment,'candidate-resource':validateCandidateResource,'modifiable-evidence':validateModifiableEvidence,'focal-neighbor':validateFocalNeighborDescription};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=m=>{throw new Error('成果资料核对：'+m);};
export const canonicalSupplement=value=>Array.isArray(value)?'['+value.map(canonicalSupplement).join(',')+']':record(value)?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalSupplement(value[k])).join(',')+'}':JSON.stringify(value);
const same=(a,b,label)=>{if(canonicalSupplement(a)!==canonicalSupplement(b))fail(label+'与已登记的原版本不一致。');};
export function validateSupplementRegistrations(registrations){
 if(!Array.isArray(registrations)||registrations.length>5)fail('五组登记结构无效。');
 const seen=new Set();
 for(const r of registrations){
  if(!record(r))fail('登记必须为对象。');
  const expected=SUPPLEMENT_CATALOG.find(x=>x.group_id===r.group_id);
  if(!expected||seen.has(r.group_id))fail('未知或重复的组身份。');seen.add(r.group_id);
  same(Object.keys(r).sort(),[...Object.keys(expected),'archive_base64'].sort(),'登记字段');
  for(const k of Object.keys(expected))same(r[k],expected[k],r.group_id+' / '+k);
  if(typeof r.archive_base64!=='string'||r.archive_base64.length!==Math.ceil(r.archive.bytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.archive_base64))fail('原字节编码无效。');
 }
 return registrations;
}
export function supplementArchiveBytes(r){return Uint8Array.from(atob(r.archive_base64),c=>c.charCodeAt(0));}
async function hash(b){const v=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(v),x=>x.toString(16).padStart(2,'0')).join('');}
const utf8=new TextDecoder('utf-8',{fatal:true});
/** Strict central directory inspection before JSZip loses duplicate entries. */
export function inspectZipMembers(bytes,expectedFiles=null,{archiveBytes=32_000_000,memberBytes=30_000_000,totalBytes=80_000_000,maxEntries=200}={}){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),d=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.length<22||b.length>archiveBytes)fail('ZIP大小超出限额。');
 let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(d.getUint32(i,true)===0x06054b50&&i+22+d.getUint16(i+20,true)===b.length){end=i;break;}
 if(end<0)fail('ZIP尾目录无效。');
 const count=d.getUint16(end+10,true),start=d.getUint32(end+16,true),length=d.getUint32(end+12,true);
 if(d.getUint16(end+4,true)||d.getUint16(end+6,true)||d.getUint16(end+8,true)!==count||count>maxEntries||start+length!==end)fail('ZIP目录、卷数或成员数量无效。');
 const entries=[],seen=new Set();let offset=start,total=0;
 for(let i=0;i<count;i++){
  if(offset+46>end||d.getUint32(offset,true)!==0x02014b50)fail('ZIP中央目录损坏。');
  const flags=d.getUint16(offset+8,true),method=d.getUint16(offset+10,true),size=d.getUint32(offset+24,true),n=d.getUint16(offset+28,true),extra=d.getUint16(offset+30,true),comment=d.getUint16(offset+32,true),local=d.getUint32(offset+42,true);
  const next=offset+46+n+extra+comment;if(next>end)fail('ZIP目录越界。');
  const name=utf8.decode(b.subarray(offset+46,offset+46+n));
  if(!name||seen.has(name)||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||flags&1||![0,8].includes(method)||((d.getUint32(offset+38,true)>>>16)&0xf000)===0xa000||size>memberBytes)fail('ZIP成员重复、路径不安全、加密、链接或大小无效。');
  if(local+30>start||d.getUint32(local,true)!==0x04034b50)fail('ZIP本地目录无效。');
  const ln=d.getUint16(local+26,true),le=d.getUint16(local+28,true),compressed=d.getUint32(offset+20,true);
  if(local+30+ln+le+compressed>start||utf8.decode(b.subarray(local+30,local+30+ln))!==name||d.getUint16(local+8,true)!==method||d.getUint16(local+6,true)!==flags)fail('ZIP本地路径或压缩信息不一致。');
  const directory=name.endsWith('/');if(directory&&size!==0)fail('ZIP目录包含数据。');
  if(expectedFiles){
   if(directory){if(![...expectedFiles.keys()].some(p=>p.startsWith(name)))fail('ZIP含未知目录。');}
   else if(!expectedFiles.has(name)||expectedFiles.get(name)!==null&&expectedFiles.get(name)!==size)fail('ZIP含未知成员或原字节长度变化：'+name);
  }
  total+=size;if(total>totalBytes)fail('ZIP解压总量超出限额。');
  seen.add(name);entries.push({path:name,bytes:size,directory});offset=next;
 }
 if(offset!==end)fail('ZIP目录长度不符。');
 if(expectedFiles)for(const p of expectedFiles.keys())if(!seen.has(p))fail('ZIP缺少成员：'+p);
 return entries;
}
/** Preserve every CSV cell as its original string, including empty cells and signs. */
export function parseSupplementCsv(text){
 // O(text length). Slice each original cell once; escaped quotes use chunks.
 // Appending every character builds large temporary rope trees for full keys.
 const cells=[],rows=[];let start=0,chunks=null,quoted=false,closed=false,quoteEnd=-1;
 text=text.replace(/^\uFEFF/,'');
 const emit=end=>{const part=text.slice(start,closed?quoteEnd:end);if(chunks){chunks.push(part);cells.push(chunks.join(''));}else cells.push(part);chunks=null;closed=false;quoteEnd=-1;};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){(chunks??=[]).push(text.slice(start,i),'"');i++;start=i+1;}else{quoted=false;closed=true;quoteEnd=i;}}continue;}
  if(c==='"'){if(i!==start||closed)fail('CSV引号位置无效。');quoted=true;start=i+1;continue;}
  if(c===','||c==='\n'||c==='\r'){emit(i);if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(cells.splice(0));}start=i+1;continue;}
  if(closed)fail('CSV闭合引号后有非法字符。');
 }
 if(quoted)fail('CSV引号未闭合。');
 if(start<text.length||cells.length||closed){emit(text.length);rows.push(cells.splice(0));}
 const fields=rows.shift();if(!fields?.length||fields.some(x=>!x)||new Set(fields).size!==fields.length)fail('CSV字段为空或重复。');
 if(rows.some(r=>r.length!==fields.length))fail('CSV行宽与原字段不一致。');
 return {fields,rows};
}
export async function verifySupplementRegistration(r){
 validateSupplementRegistrations([r]);
 const bytes=supplementArchiveBytes(r);if(bytes.length!==r.archive.bytes||await hash(bytes)!==r.archive.sha256)fail('原压缩包SHA256不一致。');
 inspectZipMembers(bytes,new Map(r.sources.map(s=>[s.path,s.bytes])));
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});const files={},raw={};
 for(const s of r.sources){
  const b=await zip.file(s.path).async('uint8array');if(b.length!==s.bytes||await hash(b)!==s.sha256)fail('源件字节或SHA256不一致：'+s.path);
  raw[s.path]=b;
  if(s.mime_type.startsWith('text/')||s.mime_type==='application/json'){
   const text=utf8.decode(b);files[s.path]=s.mime_type==='application/json'?parseStrictPreparationJson(text):s.mime_type==='text/csv'?parseSupplementCsv(text):text;
  }
 }
 const view={sources:r.sources,files};
 const summary=validators[r.group_id](view);
 return {...view,raw,summary,registration_id:r.registration_id,group_id:r.group_id};
}
export async function verifySupplementRegistrations(registrations=[]){
 validateSupplementRegistrations(registrations);
 const pairs=await Promise.all(registrations.map(async r=>[r.registration_id,await verifySupplementRegistration(r)]));return Object.fromEntries(pairs);
}
