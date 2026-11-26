import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {pilotGeoJson} from '../src/pilot-map.js';
import {revisions,revisionChecks} from '../tests/fixtures/agent-revisions.mjs';
import {loadLocalEnvironment} from '../server/agent-server.mjs';
import {qwenConfig} from '../server/qwen-config.mjs';

await loadLocalEnvironment();
const modelConfig=qwenConfig();
const modelHealth=new URL(modelConfig.baseUrl);
modelHealth.pathname=modelHealth.pathname.replace(/\/v1\/?$/,'').replace(/\/$/,'')+'/health';

const api=process.env.URBANCOOL_VERIFY_API||'http://127.0.0.1:5173/api/agent';
const inference=process.env.URBANCOOL_VERIFY_INFERENCE||modelHealth.href;
const outputDir=process.env.URBANCOOL_VERIFY_OUTPUT;
const destination=name=>outputDir?resolve(outputDir,name):new URL(`../verification/${name}`,import.meta.url);
const revisionRun=process.argv.includes('--revisions');
const accountRun=process.argv.includes('--account');
const baseRun=process.argv.includes('--base');
if(baseRun&&!accountRun)throw new Error('--base requires --account.');
if(accountRun&&!outputDir)throw new Error('Set URBANCOOL_VERIFY_OUTPUT to a fresh output directory for an account run.');
if(outputDir)await mkdir(outputDir,{recursive:true});
const expectedModel=baseRun?modelConfig.specialistModel:modelConfig.model;
let accountHeaders={};

async function request(url,data,method=data?'POST':'GET') {
  const headers=url.startsWith(api+'/')?{...accountHeaders}:{};
  if(data)Object.assign(headers,{'Content-Type':'application/json','X-UrbanCool-Agent':'1'});
  const response=await fetch(url,{method,headers,redirect:'error',signal:AbortSignal.timeout(200000),body:data?JSON.stringify(data):undefined});
  return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
}

const remoteResponse=await fetch(inference,{signal:AbortSignal.timeout(5000)});
const remote=await remoteResponse.json();
if(!remoteResponse.ok||!remote.base_ready||remote.model!=='Qwen3-8B')throw new Error('Qwen V4 is unavailable.');
if(accountRun){
  const credentials={username:`pilot-qa-${randomUUID().slice(0,12)}`,password:randomUUID()};
  const {status,body,cookie}=await request(`${api}/account/register`,credentials);
  if(status!==201||!body.user?.id||!cookie)throw new Error(`Could not register a temporary test account: ${status}`);
  accountHeaders={Cookie:cookie.split(';')[0],'X-UrbanCool-Account':body.user.id};
  const configured=await request(`${api}/model`,{provider:baseRun?'base':'tuned'},'PUT');
  if(configured.status!==200)throw new Error(`Could not select the evaluation model: ${configured.status}`);
}
const health=(await request(`${api}/health`)).body;
if(!health.provider?.includes('Qwen')||health.model!==expectedModel||!health.pilot)
  throw new Error('Qwen V4 or the mapped pilot is unavailable.');
const context={site_id:health.pilot.site_id,scenario_id:health.pilot.scenario_id,planning_mode:'mapped_pilot'};
const result={started_at:new Date().toISOString(),provider:health.provider,model:health.model,base_model:remote.model,
  context,account_workspace:accountRun,
  scope:'Live Qwen orchestration with tool-grounded pilot summaries. Assistant-authored test prompts. Team and field review pending.',cases:[]};
const save=()=>writeFile(destination(revisionRun?'成都落图试点_Qwen多轮改参.json':'成都落图试点_Qwen实测记录.json'),JSON.stringify(result,null,2));
async function fresh(){
  const response=await request(`${api}/sessions`,{context});
  if(response.status!==201)throw new Error(`Could not create pilot session: ${response.status}`);
  return response.body.session;
}
const current=session=>session.scenarios.filter(s=>s.goal_version===session.goal.version);
const prediction=traces=>traces.filter(t=>t.tool==='request_temperature_prediction');
const shapeOptions=scenarios=>scenarios.map(s=>[s.candidate_id,s.added_green_area_m2,s.estimated_construction_cost_rmb,s.budget_check_passed]);
const unchanged=(before,after)=>isDeepStrictEqual(before.scenarios,after.scenarios);

async function turn(name,text,before,check) {
  const {status,body}=await request(`${api}/chat`,{context,session_id:before.id,message:text});
  const after=body.session||before;
  const last=after.messages.at(-1);
  const traces=after.traces.filter(t=>!before.traces.some(old=>old.id===t.id));
  const root=after.tasks.findLast(t=>t.agent_id==='coordinator');
  const checks={completed:status===200&&last?.role==='assistant',real_model_requests:(last?.usage?.model_requests||0)>0,
    correct_model:root?.language_model===expectedModel,
    no_temperature_values:after.scenarios.every(s=>s.predicted_delta_lst_c===null&&s.prediction_status==='not_run'),
    ...check(after,traces,last)};
  const record={name,text,http_status:status,session_id:after.id,checks,passed:Object.values(checks).every(Boolean),error:body.error||null,
    goal:after.goal,shown_reply:last?.content||null,reply_source:root?.result?.summary_source||null,
    model_reply:root?.result?.model_summary||last?.content||null,traces,scenarios:after.scenarios,reports:after.reports,tasks:after.tasks};
  result.cases.push(record);await save();
  console.log(JSON.stringify({case:name,passed:record.passed,http_status:status,failed:Object.keys(checks).filter(k=>!checks[k]),
    model_requests:last?.usage?.model_requests||0,tools:traces.map(t=>[t.tool,t.result.status])}));
  return after;
}

let exportedTwoVersions=false;
if(revisionRun){
  let before=await fresh();
  for(const step of revisions){
    before=await turn(step.name,step.text,before,(after,traces)=>revisionChecks(step,before,after,traces));
  }
}else{
const v1=await turn('initial_comparison','请先核查这个场地。预算10万元、候选面积上限300平方米、建设单价300元/平方米。比较候选A和B的面积与费用，这轮先不预测温度。',await fresh(),(session,traces,last)=>({
  goal_registered:session.goal.budget_rmb===100000&&session.goal.candidate_area_m2===300&&session.goal.unit_cost_rmb_per_m2===300,
  correct_two_candidates:isDeepStrictEqual(shapeOptions(current(session)),[['A',144,43200,true],['B',300,90000,true]]),
  candidates_have_geometry:current(session).length===2&&current(session).every(s=>s.geometry?.type==='Polygon'),
  reply_matches_result:/候选 A.*43200/.test(last?.content||'')&&/候选 B.*90000/.test(last?.content||'')&&!/拒绝/.test(last?.content||''),
  no_prediction_check:prediction(traces).length===0,
}));

const v2=await turn('budget_revision_and_export','把预算上限改到5万元，其他两项继续沿用。帮我重新比一次，旧版留着。先别做温度预测，导出对照报告。',v1,(session,traces,last)=>({
  only_budget_changed:session.goal.budget_rmb===50000&&session.goal.candidate_area_m2===v1.goal.candidate_area_m2&&
    session.goal.unit_cost_rmb_per_m2===v1.goal.unit_cost_rmb_per_m2&&session.goal.version===v1.goal.version+1&&
    traces.some(t=>t.tool==='set_planning_goal'&&t.result.status==='goal_draft_saved'&&Object.keys(t.arguments).sort().join(',')==='budget_rmb,evidence_quote'),
  old_geometry_and_ids_preserved:v1.scenarios.length===2&&v1.scenarios.every(old=>session.scenarios.some(s=>s.id===old.id&&s.is_stale&&isDeepStrictEqual(s.geometry,old.geometry))),
  correct_budget_change:isDeepStrictEqual(shapeOptions(current(session)),[['A',144,43200,true],['B',300,90000,false]]),
  report_matches_current_version:session.reports.some(r=>r.goal_version===session.goal.version&&/v1 \| B.*预算内/.test(r.markdown)&&/v2 \| B.*超预算/.test(r.markdown)),
  reply_mentions_over_budget_and_history:/候选 B[^。]*超预算/.test(last?.content||'')&&/旧版.*保留/.test(last?.content||''),
  no_prediction_check:prediction(traces).length===0,
}));

function expectPrediction(before,candidate,version,expected){
  return (after,traces,last)=>{
    const checks=prediction(traces);
    const target=before.scenarios.find(s=>s.candidate_id===candidate&&s.goal_version===version);
    return {one_scoped_check:checks.length===1&&Boolean(target)&&checks[0].result.scenario_id===target.id,
      correct_status:checks[0]?.result.status===expected&&checks[0].result.execution_status==='not_run',
      reply_matches_status:(last?.content||'').includes({not_connected:'温度服务未接通',candidate_blocked:'超预算',stale_scenario:'旧版草案'}[expected])&&/温度预测未执行/.test(last?.content||''),
      options_unchanged:unchanged(before,after)};
  };
}

const a=await turn('explicit_temperature_check','请对候选A运行温度预测，并告诉我运行状态。',v2,expectPrediction(v2,'A',v2.goal.version,'not_connected'));
const b=await turn('over_budget_candidate','请对候选B尝试运行温度模型。',a,expectPrediction(a,'B',a.goal.version,'candidate_blocked'));
const old=await turn('old_version_refusal','请对上一版候选A运行温度预测。',b,expectPrediction(b,'A',v1.goal.version,'stale_scenario'));
await turn('cancel_prediction','不要再做温度预测了，这轮只查费用。',old,(session,traces)=>({
  no_prediction_check:prediction(traces).length===0,options_unchanged:unchanged(old,session),
}));
await turn('missing_unit_cost','先登记预算5万元，单价还没确定。你看看还缺什么，别编数字。',await fresh(),(session,traces,last)=>({
  budget_registered:session.goal.budget_rmb===50000,missing_unit_cost_preserved:session.goal.unit_cost_rmb_per_m2===undefined,
  asks_for_unit_cost:/单价|每平|单位成本/.test(last?.content||''),no_unpriced_options:session.scenarios.length===0,
  no_prediction_check:prediction(traces).length===0,
}));

const report=v2.reports.findLast(r=>r.goal_version===v2.goal.version);
if(report&&result.cases[1].passed){
  await writeFile(destination('成都落图试点_Qwen实测对照.md'),'> 由真实 Qwen V4 第 2 轮调度项目工具生成。关键状态取自工具记录，候选现场条件待组员核实。\n\n'+report.markdown+'\n');
  await writeFile(destination('成都落图试点_Qwen实测对照.geojson'),JSON.stringify(pilotGeoJson(v2.scenarios),null,2));
  exportedTwoVersions=true;
}
}
result.finished_at=new Date().toISOString();
result.passed=result.cases.filter(c=>c.passed).length;
await save();
console.log(JSON.stringify({passed:result.passed,total:result.cases.length,...(!revisionRun?{exported_two_version_report:exportedTwoVersions}:{})}));
if(result.passed!==result.cases.length)process.exitCode=1;
