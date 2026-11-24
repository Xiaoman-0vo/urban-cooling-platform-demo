import {createHash,randomUUID} from 'node:crypto';
import {AgentError} from './agent-tools.mjs';
import {createHeatCollection} from './heat-collection.mjs';
import {heatClues} from './heat-perception-contract.mjs';
import proj4 from 'proj4';

export async function inspectionFromCollection(accountId,body) {
  if(!body||Object.keys(body).some(key=>!['channel','job_id','item_id'].includes(key))||
    !['xhs','weibo'].includes(body.channel)||typeof body.item_id!=='string')
    throw new AgentError('invalid_inspection_source','请从采集结果的线索卡加入核查清单。');
  const platform=body.channel==='xhs'?'xiaohongshu':'weibo';
  const {job,snapshot,sha256}=await createHeatCollection(accountId,platform).readSnapshot(body.job_id);
  const clue=heatClues(snapshot,platform).find(item=>item.item_id===body.item_id);
  if(!clue)throw new AgentError('clue_not_found','这批采集结果中没有该条市内线索。',404);
  const original=snapshot.items.find(item=>item.item_id===body.item_id);
  const identity=JSON.stringify([platform,original.source_url,original.kind,original.text||original.text_full||original.excerpt]);
  const now=new Date().toISOString();
  return {
    evidenceKey:createHash('sha256').update(identity).digest('hex'),
    item:{id:randomUUID(),revision:1,status:'pending',location_note:'',verification_note:'',
      created_at:now,updated_at:now,clue,
      source:{channel:body.channel,job_id:job.id,query:job.query,sha256,collected_at:snapshot.source.fetched_at,item_id:clue.item_id}},
  };
}

function linkedSite(siteId,current,catalog) {
  if(siteId===null)return null;
  if(typeof siteId!=='string'||!catalog?.nodes?.has(siteId))
    throw new AgentError('inspection_site_unknown','请选择已登记的研究网格。当前场地未登记时，可先保留为未关联。');
  if(current.site?.site_id===siteId)return current.site;
  const node=catalog.nodes.get(siteId);
  const {center_e_m:e,center_n_m:n}=node.properties;
  if(!Number.isFinite(e)||!Number.isFinite(n))
    throw new AgentError('inspection_site_center_missing','该研究网格缺少地图参考中心，请先保留为未关联。');
  return {site_id:siteId,center_lon_lat:proj4('+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs','EPSG:4326',[e,n]),
    association:'user_selected',linked_at:new Date().toISOString(),
    source:'public/data/macro_nodes.geojson',source_sha256:catalog.baseline.grid_sha256};
}

export function editInspectionItem(current,body,catalog) {
  const fields=['revision','status','location_note','verification_note'];
  if(!body||Object.keys(body).some(key=>![...fields,'site_id'].includes(key))||fields.some(key=>!Object.hasOwn(body,key))||
    !Number.isSafeInteger(body.revision)||body.revision<1||!['pending','verified','dismissed'].includes(body.status)||
    typeof body.location_note!=='string'||body.location_note.length>500||
    typeof body.verification_note!=='string'||body.verification_note.length>2000)
    throw new AgentError('invalid_inspection_update','请填写有效的核查状态、位置和现场记录。');
  if(body.revision!==current.revision)
    throw new AgentError('inspection_changed','核查记录已有更新，请重新读取后再保存。',409);
  if(body.status==='verified'&&(!body.location_note.trim()||!body.verification_note.trim()))
    throw new AgentError('inspection_details_required','标记为已核查时，请填写核实位置和现场记录。');
  const site=Object.hasOwn(body,'site_id')?linkedSite(body.site_id,current,catalog):(current.site||null);
  return {...current,site,revision:current.revision+1,status:body.status,location_note:body.location_note.trim(),
    verification_note:body.verification_note.trim(),updated_at:new Date().toISOString()};
}
