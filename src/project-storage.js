import {STORAGE_KEY} from './project.js';
const DATABASE='dense-block-green-workspace',STORE='projects';
function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});}
export async function readSavedProjectText(){
 const db=await database();try{
  const text=await new Promise((resolve,reject)=>{const transaction=db.transaction(STORE);const request=transaction.objectStore(STORE).get(STORAGE_KEY);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  return typeof text==='string'?text:localStorage.getItem(STORAGE_KEY);
 }finally{db.close();}
}
export async function saveProjectText(text){
 const db=await database();try{
  await new Promise((resolve,reject)=>{const transaction=db.transaction(STORE,'readwrite');const store=transaction.objectStore(STORE);store.put(text,STORAGE_KEY);const readback=store.get(STORAGE_KEY);readback.onsuccess=()=>{if(readback.result!==text)transaction.abort();};transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error||new Error('本地写入失败。'));transaction.onabort=()=>reject(transaction.error||new Error('本地保存回读不一致。'));});
 }finally{db.close();}
 if(await readSavedProjectText()!==text)throw new Error('已保存工程读回不一致。');
}
