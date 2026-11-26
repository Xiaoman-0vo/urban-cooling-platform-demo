import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectionDraft,draftChanged,readInspectionDraft,writeInspectionDraft,filterInspections} from '../src/inspection-state.js';

const item={id:'record-a',revision:1,status:'pending',location_note:'',verification_note:'',
  clue:{topic:'遮阴不足',text:'成都公交站等车太晒',places:[{name:'成都'}]},
  source:{channel:'xhs',query:'公交 遮阴'}};
const storage=()=>{
  const values=new Map();
  return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
};

test('unsaved inspection drafts recover across view changes and remain scoped to the account and record',()=>{
  const tab=storage();
  const draft={...inspectionDraft(item),location_note:'测试站点东侧',verification_note:'验收草稿，未做现场调查'};
  assert.equal(writeInspectionDraft(tab,'alice',item,draft),true);
  assert.deepEqual(readInspectionDraft(tab,'alice',item),draft);
  assert.equal(readInspectionDraft(tab,'bob',item),null);
  assert.equal(readInspectionDraft(tab,'alice',{...item,id:'other'}),null);
  assert.equal(writeInspectionDraft(tab,'alice',item,inspectionDraft(item)),true);
  assert.equal(readInspectionDraft(tab,'alice',item),null);
});

test('recovering against a newer saved record keeps the original draft revision so it cannot silently overwrite changes',()=>{
  const tab=storage();
  const draft={...inspectionDraft(item),verification_note:'我的现场草稿'};
  writeInspectionDraft(tab,'alice',item,draft);
  const latest={...item,revision:2,location_note:'另一次保存的位置'};
  const restored=readInspectionDraft(tab,'alice',latest);
  assert.equal(restored.revision,1);
  assert.equal(restored.verification_note,draft.verification_note);
  assert.equal(draftChanged(restored,latest),true);
  const saved={...latest,...draft,revision:3};
  writeInspectionDraft(tab,'alice',saved,inspectionDraft(saved));
  assert.equal(readInspectionDraft(tab,'alice',saved),null);
});

test('site association drafts recover without replacing the saved association, including drafts from older clients',()=>{
  const tab=storage();
  const saved={...item,site:{site_id:'E4125_N33891'}};
  const removed={...inspectionDraft(saved),site_id:null};
  assert.equal(draftChanged(removed,saved),true);
  writeInspectionDraft(tab,'alice',saved,removed);
  assert.equal(readInspectionDraft(tab,'alice',saved).site_id,null);
  const older={revision:1,status:'pending',location_note:'',verification_note:'旧版草稿'};
  const recovered=readInspectionDraft({getItem:()=>JSON.stringify(older)},'alice',saved);
  assert.equal(recovered.verification_note,'旧版草稿');
  assert.equal(recovered.site_id,'E4125_N33891');
  assert.equal(readInspectionDraft({getItem:()=>JSON.stringify({...older,site_id:{bad:true}})},'alice',saved),null);
});

test('unavailable or malformed browser storage does not break the saved inspection list',()=>{
  for(const value of ['broken','null','{}',JSON.stringify({...inspectionDraft(item),status:'__proto__'}),
    JSON.stringify({...inspectionDraft(item),revision:0}),JSON.stringify({...inspectionDraft(item),verification_note:'x'.repeat(2001)})]){
    assert.equal(readInspectionDraft({getItem:()=>value},'alice',item),null);
  }
  assert.equal(readInspectionDraft(null,'alice',item),null);
  assert.equal(writeInspectionDraft(null,'alice',item,{...inspectionDraft(item),verification_note:'draft'}),false);
});

test('status and text filters compose across the saved location, source and field notes',()=>{
  const verified={...item,id:'record-b',status:'verified',location_note:'人民公园东门',verification_note:'照片 P02',source:{channel:'weibo',query:'高温'}};
  const all=[item,verified];
  assert.deepEqual(filterInspections(all,{keyword:' 人民公园 '}),[verified]);
  assert.deepEqual(filterInspections(all,{status:'pending',keyword:'人民公园'}),[]);
  assert.deepEqual(filterInspections(all,{status:'verified',keyword:'p02'}),[verified]);
  assert.deepEqual(filterInspections(all,{keyword:'小红书'}),[item]);
  assert.deepEqual(filterInspections(all,{status:'all',keyword:'成都'}),all);
});

test('site filters compose with status and keyword filters while leaving unassociated evidence visible in all sites',()=>{
  const linked={...item,id:'linked',site:{site_id:'E4125_N33891'}};
  const other={...item,id:'other',site:{site_id:'E4105_N33911'},status:'verified'};
  const all=[item,linked,other];
  assert.deepEqual(filterInspections(all,{siteId:'E4125_N33891'}),[linked]);
  assert.deepEqual(filterInspections(all,{siteId:'E4125_N33891',status:'verified'}),[]);
  assert.deepEqual(filterInspections(all,{keyword:'E4105_N33911'}),[other]);
  assert.deepEqual(filterInspections(all),all);
});
