import React,{useState} from 'react';
const LABELS={'planning-description':'来源内现状描述','planning-development':'配置开发信息','candidate-resource':'候选资源与窗口','modifiable-evidence':'可改空间证据','focal-neighbor':'本格与周边描述'};
const COUNTS={'planning-description':'6项指标 × 3种来源角色，共18条统计；主位置5,871格。','planning-development':'80条配置、70条有符号配对；分档与C/R总体分别保留。','candidate-resource':'18条资源支持、45条几何重叠、6条窗口变化、45条份额顺序诊断。','modifiable-evidence':'21项接纳证据、48项来源版本、104项对象记录；33项物理接受值仍为空。','focal-neighbor':'5,871条逐格对照、6项支持摘要、3个案例；八邻均值和差值保留完整缺项。'};
const LIMITS={'planning-description':'不同来源角色的分布描述，尚未给出空间配置与温度的关系。','planning-development':'误差变化反映可辨别的开发信息；四折标准差不是置信区间，模型宽度32不是米。','candidate-resource':'75、150、300米均为候选半径。完整窗口不裁至场地；顺序反转不是服务或公平性优先级。','modifiable-evidence':'设计可改范围与实施权限分别待核。对象数量不等于已获准的改造场地。','focal-neighbor':'只比较来源指标比例。独立审核已通过并记录上游数值精度说明；温度响应尚无结果。'};
function download(bytes,path,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=path.split('/').at(-1);a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function VerifiedImage({bytes,name}) {const [url,setUrl]=useState('');React.useEffect(()=>{const u=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));setUrl(u);return()=>URL.revokeObjectURL(u);},[bytes]);return url?<a href={url} target="_blank" rel="noreferrer"><img className="supplement-image" src={url} alt={name}/></a>:null;}
function SourceTable({table}){
 const [page,setPage]=useState(0),[query,setQuery]=useState('');
 const rows=query?table.rows.filter(row=>row.some(v=>v.includes(query))):table.rows;
 const pages=Math.max(1,Math.ceil(rows.length/20)),active=Math.min(page,pages-1);
 return <div className="supplement-table"><label>按原对象编号或内容查找<input aria-label="查找资料记录" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><p>{rows.length.toLocaleString('zh-CN')}条记录 · 空格保留为空，真零显示0</p><div className="supplement-scroll"><table><thead><tr>{table.fields.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{rows.slice(active*20,(active+1)*20).map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell===''?<span className="missing-cell">空值</span>:cell}</td>)}</tr>)}</tbody></table></div><div className="supplement-pager"><button disabled={active===0} onClick={()=>setPage(active-1)}>上一页</button><span>{active+1} / {pages}</span><button disabled={active+1===pages} onClick={()=>setPage(active+1)}>下一页</button></div></div>;
}
export default function SupplementEvidence({registrations,views,currentRegistrations,error,onAdopt,onOpen,onExportJson,mode='summary',busy}){
 const [selected,setSelected]=useState('planning-description');
 const adopted=new Set(registrations.map(r=>r.registration_id));
 const pending=currentRegistrations.some(r=>!adopted.has(r.registration_id));
 const r=registrations.find(r=>r.group_id===selected)||registrations[0],v=r&&views[r.registration_id];
 return <section className="supplement-evidence"><h3>规划与场地成果资料</h3><p>{registrations.length} / 5组已接纳，可随工程保存、导出和重开。</p>{error&&<p role="alert" className="evidence-note">资料未接纳：{error}</p>}{pending&&<button className="secondary full" disabled={busy||!!error} onClick={onAdopt}>接纳五组成果资料</button>}
 {mode==='summary'?<><p className="evidence-note">现状描述、配置开发信息、候选资源、可改证据、本格与周边对照。科研计算条件分别保留。</p><button className="text-button" onClick={onOpen}>查看五组资料与原始记录</button></>:<>
 <div className="supplement-tabs" aria-label="成果资料分组">{Object.entries(LABELS).map(([id,label])=><button key={id} aria-pressed={r?.group_id===id} disabled={!registrations.some(x=>x.group_id===id)} onClick={()=>setSelected(id)}>{label}</button>)}</div>
 {v?<><h3>{LABELS[r.group_id]}</h3><p>{COUNTS[r.group_id]}</p><p className="evidence-note">{LIMITS[r.group_id]}</p>{['candidate-resource','modifiable-evidence'].includes(r.group_id)&&<p>本组未包含完整源几何。其他准备包里的展示面保持独立身份。</p>}
 {r.group_id==='focal-neighbor'&&<p className="evidence-note">格号用于位置对照；本组来源身份独立于旧场景和14件冻结准备包。同格号不自动合并。共同案例G02：本格19.89%，周边65.50%，差值−45.61个百分点。B02周边不足时，均值与差值保持空值。两个极值案例不代表典型或优先位置。</p>}
 {r.sources.filter(s=>s.mime_type==='image/png').map(s=><VerifiedImage key={s.path} name={s.path.split('/').at(-1)} bytes={v.raw[s.path]}/>)}
 <h3>原件与逐条审阅</h3><p className="muted">下方保留原字段、版本和核查状态。来源核对不升级科学接纳；完整源数据、标签和权重的引用不表示已读取。</p>
 <div className="source-list">{r.sources.map(s=><details key={s.path}><summary>{s.path.split('/').at(-1)}<small>{s.bytes.toLocaleString('zh-CN')} bytes</small></summary><p className="source-path">{s.path}</p><dl><dt>源SHA256</dt><dd>{s.sha256}</dd><dt>独立登记</dt><dd>{r.registration_id}</dd><dt>登记版本</dt><dd>{r.schema_version}</dd></dl><button className="text-button" onClick={()=>download(v.raw[s.path],s.path,s.mime_type)}>下载原字节副本</button>{s.mime_type==='text/csv'?<SourceTable key={s.path} table={v.files[s.path]}/>:s.mime_type==='application/json'?<pre>{JSON.stringify(v.files[s.path],null,2)}</pre>:s.mime_type==='text/markdown'?<pre>{v.files[s.path]}</pre>:null}</details>)}</div>
 <details><summary>软件审阅范围与原状态摘要</summary><pre>{JSON.stringify(v.summary,null,2)}</pre><pre>{JSON.stringify(r.adapter_receipt,null,2)}</pre></details>
 </>:<p className="empty-note">尚未接纳成果资料。接纳后可审阅完整来源记录。</p>}
 <p className="evidence-note">新场地预测、物理仿真、舒适度、实际服务、公平性、最少面积搜索和排序仍未开放。天气、地形和道路候选保持原状态。</p><button className="secondary full" disabled={busy} onClick={onExportJson}>导出工程JSON</button>
 </>}
 </section>;
}
