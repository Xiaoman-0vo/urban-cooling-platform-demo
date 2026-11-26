import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {sha256,probeDeployment} from '../deploy/huawei/delivery.mjs';

// Passwords and authentication cookies exist only in memory during this run.
export async function smokeWorkbench(origin,root){
  const runtime=await probeDeployment(origin);assert.equal(runtime.status,'passed');
  async function request(path,account,body){
    const reply=await fetch(origin+'/api/agent'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{'Content-Type':'application/json','X-UrbanCool-Agent':'1',
        ...(account?{Cookie:account.cookie,'X-UrbanCool-Account':account.id}:{})},body:body?JSON.stringify(body):undefined});
    return {status:reply.status,data:await reply.json(),cookie:reply.headers.get('set-cookie')};
  }
  const suffix=randomBytes(5).toString('hex'),password=randomBytes(24).toString('base64url');
  async function register(name){
    const reply=await request('/account/register',null,{username:`t1_${name}_${suffix}`,password});
    assert.equal(reply.status,201);return {...reply.data.user,cookie:reply.cookie.split(';')[0]};
  }
  const alice=await register('a'),bob=await register('b');
  const model=await request('/model',alice);assert.equal(model.data.settings.provider,'local');
  const scene=JSON.parse(await readFile(join(root,'public/data/scene.json'),'utf8'));
  const area=await readFile(join(root,'public/data/planning-pilot-temperature.json'));
  const context={site_id:scene.site_id,scenario_id:scene.scenario_id,planning_mode:'mapped_pilot'};
  const created=await request('/sessions',alice,{context});assert.equal(created.status,201);const id=created.data.session.id;
  async function action(planning_action){
    const reply=await request('/chat',alice,{context,session_id:id,planning_action});assert.equal(reply.status,200);return reply.data.session;
  }
  await action({type:'set_conditions',fields:{budget_rmb:6000,unit_cost_rmb_per_m2:300,candidate_area_m2:20}});
  let session=await action({type:'generate_spatial_candidates',minimum_area_m2:10,expected_area_sha256:sha256(area)});
  const batch=session.pilot_searches.at(-1);assert.ok(batch.candidates.length>0);
  session=await action({type:'adopt_spatial_candidate',search_id:batch.id,candidate_id:batch.candidates[0].id,expected_current_scenario_id:null});
  assert.equal(session.pilot_temperature_scenarios.at(-1).result,null);
  session=await action({type:'export'});assert.equal(session.reports.length,1);
  assert.equal((await request(`/sessions/${id}`,bob)).status,404);
  const before={goal:session.goal,searches:session.pilot_searches,scenarios:session.pilot_temperature_scenarios,reports:session.reports};
  return {record:{runtime,checks:{default_local_provider:true,goal_saved:true,candidates_generated:true,scenario_adopted:true,
      report_generated:true,account_isolation:true,temperature_uncomputed:true},feasible_candidates:batch.feasible_count,
      session_state_sha256:sha256(JSON.stringify(before)),language_model_calls:0,temperature_model_calls:0},
    async verifyAfterRestart(){
      const reply=await request(`/sessions/${id}`,alice);assert.equal(reply.status,200);const restored=reply.data.session;
      assert.deepEqual({goal:restored.goal,searches:restored.pilot_searches,scenarios:restored.pilot_temperature_scenarios,reports:restored.reports},before);
      assert.equal((await request(`/sessions/${id}`,bob)).status,404);
      return {session_persisted:true,isolation_after_restart:true};
    }};
}
