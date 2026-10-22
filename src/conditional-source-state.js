import JSZip from 'jszip';
import {CONDITIONAL_SOURCE_CATALOG} from './conditional-source-catalog.js';
import {canonicalSupplement,inspectZipMembers,parseSupplementCsv} from './supplement-state.js';
import {parseStrictPreparationJson} from './preparation-state.js';

const utf8 = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const fail = text => {throw new Error('条件来源核对：'+text);};
const same = (a,b,label) => {if(canonicalSupplement(a)!==canonicalSupplement(b))fail(label+'与冻结原件不同。');};
export async function conditionalHash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function decode(value,spec) {
  if(typeof value!=='string'||value.length!==Math.ceil(spec.bytes/3)*4||/[^A-Za-z0-9+/=]/.test(value))fail('原件编码或长度无效。');
  let str;try{str=atob(value);}catch{fail('原件编码无效。');}
  if(str.length!==spec.bytes||btoa(str)!==value)fail('原件编码不是完整的规范表示。');
  const bytes=new Uint8Array(str.length);for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);return bytes;
}
export const conditionalArchiveBytes = r => decode(r.archive_base64,r.archive);
export const conditionalManifestBytes = r => decode(r.manifest_base64,r.manifest_source);
export function validateConditionalSources(registrations=[]) {
  if(!Array.isArray(registrations)||registrations.length>3)fail('登记必须是最多三组的列表。');
  const seen=new Set();for(const r of registrations){
    const expected=CONDITIONAL_SOURCE_CATALOG.find(item=>item.group_id===r?.group_id);
    if(!expected||seen.has(r.group_id))fail('未知或重复组身份。');seen.add(r.group_id);
    same(Object.keys(r).sort(),[...Object.keys(expected),'archive_base64','manifest_base64'].sort(),'登记字段');
    for(const key of Object.keys(expected))same(r[key],expected[key],key);
    conditionalArchiveBytes(r);conditionalManifestBytes(r);
  }return registrations;
}
/** Authenticate immutable snapshots before allowing any UI or saved-project adoption. */
export async function verifyConditionalSources(registrations=[]) {
  const snapshot=structuredClone(registrations);validateConditionalSources(snapshot);const views={};
  if(!snapshot.length)return views;
  const first=snapshot[0],archive=conditionalArchiveBytes(first),manifestBytes=conditionalManifestBytes(first);
  if(await conditionalHash(archive)!==first.archive.sha256||await conditionalHash(manifestBytes)!==first.manifest_source.sha256)fail('原ZIP或清单指纹不符。');
  const manifest=parseStrictPreparationJson(utf8.decode(manifestBytes));
  const all=manifest.groups.flatMap(g=>g.files);
  inspectZipMembers(archive,new Map([[first.manifest_source.path,manifestBytes.length],...all.map(f=>[f.path,f.bytes])]));
  const zip=await JSZip.loadAsync(archive,{checkCRC32:true});
  const savedManifest=await zip.file(first.manifest_source.path).async('uint8array');
  if(savedManifest.some((b,i)=>b!==manifestBytes[i]))fail('原包内清单不一致。');
  const raw={};for(const f of all){
    const bytes=await zip.file(f.path).async('uint8array');
    if(bytes.length!==f.bytes||await conditionalHash(bytes)!==f.sha256)fail('原件指纹不符：'+f.path);
    if(Boolean(bytes[0]===239&&bytes[1]===187&&bytes[2]===191)!==f.raw_UTF8_BOM)fail('原BOM变化。');
    raw[f.path]={spec:f,bytes,text:utf8.decode(bytes)};
  }
  for(const r of snapshot){
    same(r.manifest_base64,first.manifest_base64,'原清单');same(r.archive_base64,first.archive_base64,'原ZIP');
    same(r.source_group,manifest.groups.find(g=>g.group_id===r.group_id),'来源组');
    if(await conditionalHash(new TextEncoder().encode(canonicalSupplement(r.source_group.files)))!==r.source_group.source_set_sha256)fail('来源组原身份不符。');
    const files=Object.fromEntries(r.source_group.files.map(f=>[f.path,raw[f.path]]));
    const find=tail=>Object.values(files).find(f=>f.spec.role!=='retained_superseded_history'&&f.spec.path.endsWith('/'+tail));
    const json=tail=>find(tail)?parseStrictPreparationJson(find(tail).text):null;
    const tableFile=find('官方证据索引.csv');const table=tableFile?parseSupplementCsv(tableFile.text):null;
    if(table){const spec=tableFile.spec.csv;same(table.fields,spec.header,'CSV字段');if(table.rows.length!==7||table.rows.flat().length!==119||table.rows.flat().filter(c=>c==='').length!==39)fail('当前CSV原字符串或空项变化。');}
    views[r.group_id]={registration:r,files,table,park:json('官方分区与开放事件证据.json'),preview:json('公开年度目录行.json'),temperatureAcquisition:json('公开目录取得记录.json'),definition:json('统一开放与现实条件_产品情景定义_20261006.json')};
  }
  return views;
}
