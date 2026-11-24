import JSZip from 'jszip';
import {planningReportIsStale,pilotGeoJson,pilotTemperatureGeoJson} from './pilot-map.js';
import {scenarioConstraintCheck,temperatureResultSummary} from './scenario-checks.js';
import {currentPilotProtection} from './protected-areas.js';
import {currentPilotPriority,priorityComparison,priorityMarkdown} from './priority-areas.js';
import {pilotSearchGeoJson,pilotSearchMarkdown,pilotSearchIsCurrent} from './pilot-search-state.js';
import {candidateDecision,candidateDecisionMarkdown} from './candidate-decision.js';
import {evaluationReadiness} from './evaluation-readiness.js';

const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const ordered=value=>value&&typeof value==='object'&&!Array.isArray(value)
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const hasValues=scenario=>Boolean(scenario?.result?.run_id)&&['baseline_lst_c','scenario_lst_c','predicted_delta_lst_c'].every(key=>finite(scenario.result[key]));

function comparisonKey(scenario) {
  const r=scenario.result;
  const rasters=scenario.raster_sha256,features=r?.compiled_features;
  if(!hasValues(scenario)||!hash(r.model_sha256)||!hash(r.dataset_sha256)||!hash(scenario.area_sha256)||
    !scenario.reference_date||!scenario.grid_id||scenario.source_cover_class==null||scenario.scenario_cover_class==null||
    !rasters||!Object.keys(rasters).length||!Object.values(rasters).every(hash)||
    !['baseline_center','neighbor_mean'].every(key=>Array.isArray(features?.[key])&&features[key].length&&features[key].every(finite))||
    (r.grid_id&&r.grid_id!==scenario.grid_id)||(r.date&&r.date!==scenario.reference_date))return null;
  return JSON.stringify([scenario.grid_id,scenario.reference_date,scenario.area_sha256,ordered(scenario.raster_sha256),
    scenario.source_cover_class,scenario.scenario_cover_class,r.model_sha256,r.dataset_sha256,r.baseline_lst_c,features.baseline_center,features.neighbor_mean]);
}

export function temperatureVersionRows(scenarios=[]) {
  const anchor=scenarios.findLast(scenario=>comparisonKey(scenario));
  const anchorKey=anchor&&comparisonKey(anchor);
  return scenarios.map((scenario,index)=>{
    const key=comparisonKey(scenario),r=scenario.result,values=hasValues(scenario),constraints=scenarioConstraintCheck(scenario);
    const passed=id=>['passed','failed'].includes(constraints.checks.find(c=>c.id===id)?.state)?constraints.checks.find(c=>c.id===id).state==='passed':null;
    return {id:scenario.id,version:scenario.version,goal_version:scenario.goal_version,is_current:index===scenarios.length-1,
      area_m2:scenario.area_m2,cost_rmb:scenario.estimated_construction_cost_rmb??null,
      budget_check_passed:passed('budget'),capacity_check_passed:passed('area'),
      baseline_lst_c:values?r.baseline_lst_c:null,scenario_lst_c:values?r.scenario_lst_c:null,delta_lst_c:values?r.predicted_delta_lst_c:null,
      run_id:r?.run_id||null,reference_version:anchor?.version??null,
      constraints,result_summary:r?temperatureResultSummary(r):null,
      change:scenario.change??null,
      comparison:!r?'等待运行':!values?'结果资料不完整':!key?'基准资料不完整':key===anchorKey?'同基准':'基准不同'};
  });
}

export function compareTemperatureVersions(scenarios,leftId,rightId) {
  const left=scenarios.find(item=>item.id===leftId),right=scenarios.find(item=>item.id===rightId);
  const leftKey=left&&comparisonKey(left),rightKey=right&&comparisonKey(right);
  const comparable=Boolean(leftKey&&leftKey===rightKey);
  return {comparable,reason:!left||!right?'请选择两个已保存版本':!hasValues(left)||!hasValues(right)?'所选版本尚无完整运行结果':
    !leftKey||!rightKey?'结果基准资料不完整':comparable?'同一模型与数据基准，可比较温度结果':'模型、数据或参考基准不同，温度不可直接比较',
    deltaDifference:comparable?right.result.predicted_delta_lst_c-left.result.predicted_delta_lst_c:null};
}

export function planningWorkflowState({siteReady=false,scene,session,inspections=[],health}={}) {
  const versions=session?.pilot_temperature_scenarios||[],latest=versions.at(-1);
  const options=(session?.scenarios||[]).filter(option=>!option.is_stale&&option.goal_version===session?.goal?.version);
  const report=session?.reports?.at(-1);
  const reportState=!report?'missing':planningReportIsStale(report,session)?'stale':'current';
  const linked=inspections.filter(item=>item.site?.site_id===scene?.site_id);
  const goalReady=finite(session?.goal?.budget_rmb)&&session.goal.budget_rmb>=0&&finite(session?.goal?.unit_cost_rmb_per_m2)&&session.goal.unit_cost_rmb_per_m2>0;
  const evaluated=latest&&latest.goal_version===session?.goal?.version&&comparisonKey(latest);
  const geometryOnly=scene?.scenario_type==='geometry_candidate';
  const spatialSearch=session?.pilot_searches?.at(-1),searchReady=pilotSearchIsCurrent(spatialSearch,session);
  const decision=candidateDecision(session);
  const constraints=scenarioConstraintCheck(latest,session?.goal?.version);
  const steps=[
    {id:'project',title:'创建项目',state:siteReady?(geometryOnly?'位置已预览':'资料已载入'):'待选场地',detail:siteReady?`当前场地 ${scene.site_id}${geometryOnly?'，需补充地物数据':''}`:'选择研究范围，或载入成都真实示范区。',action:siteReady?'保存当前工程':'载入成都示范区'},
    {id:'diagnose',title:'现状诊断',state:siteReady?(geometryOnly?'待补地物资料':'可审阅'):'待载入资料',detail:`检查地物与资料时相；已关联现场核查记录 ${linked.length} 条。`,action:'查看场地资料'},
    {id:'goals',title:'设定目标',state:goalReady?`目标 v${session.goal.version}`:'待填写约束',detail:'填写预算、假设建设单价及面积上限，保留建筑约束。',action:'填写目标与约束'},
    {id:'edit',title:'建立方案',state:latest?`情景 v${latest.version}`:searchReady?spatialSearch.candidates.length?`${spatialSearch.candidates.length} 个约束候选`:'当前条件无可行候选':options.length?`${options.length} 个讨论范围`:'待建立情景',detail:'按预算、保留区和优先区域生成候选，选中后保存为新情景；也可直接在地图编辑。',action:'生成或编辑改造范围'},
    {id:'evaluate',title:'运行评价',state:decision.comparable?'候选已评价':decision.completed>0?`候选已完成 ${decision.completed}/${decision.total}`:evaluated?'当前版已运行':latest?'当前版待运行':searchReady&&spatialSearch.candidates.length?'候选待评价':'待建立候选或情景',detail:decision.comparable?decision.title:'可先手动评价本轮候选，比较费用与模型效果，再决定是否采用；也可评价已保存的地图情景。',action:'查看并手动评价'},
    {id:'revise',title:'协同修改',state:versions.length>1?`保留 ${versions.length} 个情景版本`:'可继续修改',detail:'修改预算或范围后保存新版本；旧结果保留，当前版重新评价。',action:'修改并保留旧版'},
    {id:'results',title:'比较与输出',state:reportState==='current'?'已有当前报告':reportState==='stale'?'报告对应旧版':'待生成报告',detail:'核对同基准版本、费用与运行依据，再导出规划进度包。',action:'查看版本与成果'},
  ];
  const nextId=!siteReady?'project':geometryOnly?'diagnose':!goalReady?'goals':!latest?
    searchReady&&spatialSearch.candidates.length?decision.comparable?reportState!=='current'?'results':'revise':'evaluate':'edit':
    latest.goal_version!==session?.goal?.version||constraints.status==='failed'?'edit':!evaluated?'evaluate':reportState!=='current'?'results':'revise';
  const nextStep=steps.find(step=>step.id===nextId);
  const statuses={project:siteReady?'saved':'pending',diagnose:siteReady&&!geometryOnly?'available':'pending',goals:goalReady?'saved':'pending',
    edit:latest?latest.goal_version!==session?.goal?.version||constraints.status==='failed'?'attention':'saved':searchReady&&spatialSearch.candidates.length?'available':'pending',
    evaluate:decision.comparable||evaluated?'saved':'pending',revise:versions.length>1?'saved':'available',results:reportState==='current'?'saved':reportState==='stale'?'attention':'pending'};
  return {steps:steps.map(step=>({...step,status:statuses[step.id]})),nextStep,goalReady,
    search:{state:!spatialSearch?'missing':!searchReady?'stale':spatialSearch.feasible_count?'current':'empty',count:searchReady?spatialSearch.candidates.length:0},
    reportState,linkedInspections:linked,currentVersion:latest?.version??null,protection:currentPilotProtection(session),priority:currentPilotPriority(session),currentConstraints:constraints,rows:temperatureVersionRows(versions),
    active:Boolean(session?.active_run_id),modelAvailable:health?.model_available};
}

const md=value=>String(value??'').replaceAll('|','\\|').replace(/[\r\n]/g,' ');
const number=(value,digits=2)=>finite(value)?value.toFixed(digits):'—';

export function planningProgressMarkdown({scene,session,state}) {
  return ['# UrbanCool 规划进度记录','',`研究场地：${md(scene.site_id)}`,
    `情景基线：${md(scene.scenario_id)}；会话：${session?.id||'尚未建立'}。`,
    '本记录按当前已保存资料生成。地表温度情景是指定覆盖假设下的模型试算，现场条件与实际改造效果待核。','',
    '## 计划书操作路径','',...state.steps.map((step,index)=>`${index+1}. ${step.title}：${step.state}。${step.detail}`),'',
    '## 温度情景版本对照','',
    '| 情景 | 目标 | 面积㎡ | 假设建设费元 | 基线℃ | 情景℃ | 基线减情景℃ | 对照状态 | 数值约束 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...state.rows.map(row=>`| v${row.version}${row.is_current?' 当前':''} | v${row.goal_version??'未登记'} | ${number(row.area_m2)} | ${number(row.cost_rmb)} | ${number(row.baseline_lst_c,3)} | ${number(row.scenario_lst_c,3)} | ${number(row.delta_lst_c,3)} | ${row.comparison} | ${row.constraints.label} |`),
    ...(state.rows.length?[]:['尚未保存温度情景。']),
    '',`当前数值约束：${state.currentConstraints.label}。`,...state.currentConstraints.checks.map(check=>`- ${check.detail}。`),
    '',...state.rows.filter(row=>row.result_summary).map(row=>`- 情景 v${row.version}：${row.result_summary}`),
    '', '## 修改来源','',...state.rows.map(row=>`- 情景 v${row.version}：${row.change?`${row.change.type}；来源 ${row.change.source_scenario_id||'地图新建'}；前一版本 ${row.change.previous_scenario_id||'无'}`:'历史记录未提供修改来源'}。`),
    ...priorityMarkdown(session),
    ...pilotSearchMarkdown(session),
    ...candidateDecisionMarkdown(session),
    '',`报告状态：${{current:'对应当前版本',stale:'对应旧版本',missing:'尚未生成'}[state.reportState]}。`,
    `当前场地人工关联核查记录：${state.linkedInspections.length} 条。关联用于组织调查，具体发生位置另见核查记录。`,
    '', '## 后续验证条件','',
    '- AI 空间对话与协同问答需连接语言模型，并以实际对话记录验收。',
    '- 单矩形搜索按费用、面积和优先覆盖比较；降温排名、多地块布局、自动地点匹配与跨模块优化仍需验证。',
    '- 现场权属、通道、既有用途及建筑高度资料仍需核查。',
    '- 华为环境集成与竞赛部署记录仍待完成。',''].join('\n');
}

export async function createPlanningProgressArchive({scene,session=null,inspections=[],health,siteReady=true}) {
  if(!scene?.site_id)throw new Error('请先载入研究场地。');
  if(!globalThis.crypto?.subtle)throw new Error('请通过本机 127.0.0.1 或 HTTPS 打开工作台后导出。');
  if(session?.active_run_id)throw new Error('本轮协作任务仍在运行，请结束后重新读取进度。');
  if(session&&(session.context?.site_id!==scene.site_id||session.context?.scenario_id!==scene.scenario_id))
    throw new Error('会话与当前场地或基线不一致，请重新读取流程状态。');
  const state=planningWorkflowState({siteReady,scene,session,inspections,health});
  const files={
    '规划进度.md':planningProgressMarkdown({scene,session,state}),
    '规划会话.json':JSON.stringify(session,null,2),
    '温度情景.geojson':JSON.stringify(pilotTemperatureGeoJson(session?.pilot_temperature_scenarios||[]),null,2),
    '讨论范围.geojson':JSON.stringify(pilotGeoJson(session?.scenarios||[]),null,2),
    '场地核查记录.json':JSON.stringify(state.linkedInspections,null,2),
    '情景约束检查.json':JSON.stringify({scope:'numeric_and_user_declared_protection_checks',current:state.currentConstraints,versions:state.rows.map(row=>({id:row.id,version:row.version,constraints:row.constraints}))},null,2),
    '情景修改记录.json':JSON.stringify((session?.pilot_temperature_scenarios||[]).map(s=>({id:s.id,version:s.version,goal_version:s.goal_version??null,created_at:s.created_at??null,change:s.change??null})),null,2),
    '保留范围版本.json':JSON.stringify(session?.pilot_protection_versions||[],null,2),
    '优先区域版本.json':JSON.stringify(session?.pilot_priority_versions||[],null,2),
    '优先覆盖比较.json':JSON.stringify(priorityComparison(session),null,2),
    '空间候选搜索.json':JSON.stringify(session?.pilot_searches||[],null,2),
    '候选评价记录.json':JSON.stringify((session?.pilot_searches||[]).map(batch=>({search_id:batch.id,evaluations:batch.evaluations||[]})),null,2),
    '候选比较与判断.json':JSON.stringify(candidateDecision(session),null,2),
    '评价适用性.json':JSON.stringify(evaluationReadiness(candidateDecision(session)),null,2),
    '搜索候选.geojson':JSON.stringify(pilotSearchGeoJson(session),null,2),
    '用户优先区.geojson':JSON.stringify({type:'FeatureCollection',features:currentPilotPriority(session).areas.map(area=>({type:'Feature',id:area.id,geometry:area.geometry,
      properties:{id:area.id,label:area.label,source:area.source,priority_version:currentPilotPriority(session).version,area_sha256:area.area_sha256}}))},null,2),
    '用户保留区.geojson':JSON.stringify({type:'FeatureCollection',features:currentPilotProtection(session).areas.map(area=>({type:'Feature',id:area.id,geometry:area.geometry,
      properties:{id:area.id,label:area.label,source:area.source,protection_version:currentPilotProtection(session).version,area_sha256:area.area_sha256}}))},null,2),
  };
  const report=session?.reports?.at(-1);
  if(report)files[state.reportState==='current'?'当前讨论报告.md':'旧版讨论报告.md']=report.markdown;
  const zip=new JSZip(),members=[];
  for(const [name,text] of Object.entries(files)){
    const bytes=new TextEncoder().encode(text);
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
    zip.file(name,bytes);members.push({name,bytes:bytes.length,sha256});
  }
  const manifest={schema:'urbancool-planning-progress/1',created_at:new Date().toISOString(),site_id:scene.site_id,
    scenario_id:scene.scenario_id,session_id:session?.id||null,baseline:session?.baseline||null,
    goal_version:session?.goal?.version??null,current_temperature_scenario_id:session?.pilot_temperature_scenarios?.at(-1)?.id||null,
    report_status:state.reportState,protection_version:currentPilotProtection(session).version,priority_version:currentPilotPriority(session).version,spatial_search_id:session?.pilot_searches?.at(-1)?.id??null,candidate_evaluation_id:candidateDecision(session).evaluation_id??null,model_available:health?.model_available??null,
    inspection_scope:'manually_associated_current_site_only',scientific_status:'scenario_trial_and_field_verification_pending',members};
  zip.file('manifest.json',JSON.stringify(manifest,null,2)+'\n');
  return {bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),manifest};
}
