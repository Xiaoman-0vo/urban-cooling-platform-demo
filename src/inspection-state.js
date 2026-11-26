export const inspectionStatuses={pending:'待核查',verified:'已核查',dismissed:'暂不采用'};

const draftKey=(accountId,itemId)=>`urbancool-inspection-draft-v1:${accountId}:${itemId}`;

export function inspectionDraft(item) {
  return {revision:item.revision,status:item.status,location_note:item.location_note,verification_note:item.verification_note,
    site_id:Object.hasOwn(item,'site_id')?item.site_id:(item.site?.site_id||null)};
}

export function draftChanged(draft,item) {
  const saved=inspectionDraft(item);
  return ['status','location_note','verification_note','site_id'].some(field=>draft[field]!==saved[field]);
}

export function readInspectionDraft(storage,accountId,item) {
  try{
    const draft=JSON.parse(storage.getItem(draftKey(accountId,item.id)));
    if(!draft||!Number.isSafeInteger(draft.revision)||draft.revision<1||!Object.hasOwn(inspectionStatuses,draft.status)||
      typeof draft.location_note!=='string'||draft.location_note.length>500||
      typeof draft.verification_note!=='string'||draft.verification_note.length>2000||
      (Object.hasOwn(draft,'site_id')&&draft.site_id!==null&&(typeof draft.site_id!=='string'||!draft.site_id||draft.site_id.length>100)))return null;
    const restored=inspectionDraft({...draft,...(!Object.hasOwn(draft,'site_id')?{site_id:item.site?.site_id||null}:{})});
    return draftChanged(restored,item)?restored:null;
  }catch{return null;}
}

export function writeInspectionDraft(storage,accountId,item,draft) {
  try{
    if(draftChanged(draft,item))storage.setItem(draftKey(accountId,item.id),JSON.stringify(inspectionDraft(draft)));
    else storage.removeItem(draftKey(accountId,item.id));
    return true;
  }catch{return false;}
}

export function filterInspections(items,{status='all',keyword='',siteId=null}={}) {
  const query=keyword.trim().toLocaleLowerCase('zh-CN');
  return items.filter(item=>{
    if(status!=='all'&&item.status!==status)return false;
    if(siteId&&item.site?.site_id!==siteId)return false;
    const text=[item.clue.topic,item.clue.text,item.location_note,item.verification_note,item.source.query,item.site?.site_id||'',
      item.source.channel==='xhs'?'小红书':'微博',...item.clue.places.map(place=>place.name)].join('\n');
    return !query||text.toLocaleLowerCase('zh-CN').includes(query);
  });
}
