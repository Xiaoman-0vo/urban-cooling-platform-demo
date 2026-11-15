import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {goalValueMentioned,predictionRequested} from '../server/goal-evidence.mjs';
import {loadProjectCatalog,newSession,executeTool} from '../server/agent-tools.mjs';

test('goal evidence binds numbers to their fields and rejects an old amount',()=>{
 const text='预算123000元，候选面积812平方米，单价109元/平方米，只保存条件。';
 for(const [field,value] of [['budget_rmb',123000],['candidate_area_m2',812],['unit_cost_rmb_per_m2',109]]) assert.equal(goalValueMentioned(field,value,text),true);
 assert.equal(goalValueMentioned('budget_rmb',812,text),false);
 assert.equal(goalValueMentioned('candidate_area_m2',109,text),false);
 assert.equal(goalValueMentioned('added_green_target_m2',812,text),false);
 assert.equal(goalValueMentioned('budget_rmb',100000,'旧预算10万元不用了，本轮预算以5万元为准。'),false);
 assert.equal(goalValueMentioned('budget_rmb',50000,'旧预算10万元不用了，本轮预算以5万元为准。'),true);
});

test('goal evidence supports units, postfixed labels and explicit optional goals',()=>{
 const text='请把１０万元预算、８００平方米候选地、１００元/平方米的假设单价记住。新增绿量目标500平方米，期望地表降温1.5度。';
 for(const [field,value] of [['budget_rmb',100000],['candidate_area_m2',800],['unit_cost_rmb_per_m2',100],['added_green_target_m2',500],['target_delta_lst_c',1.5]]) assert.equal(goalValueMentioned(field,value,text),true,field);
 assert.equal(goalValueMentioned('budget_rmb',22500,'只改钱：22,500元。面积与单价不变。'),true);
 assert.equal(goalValueMentioned('unit_cost_rmb_per_m2',97,'只更新每平方米建设费：97元；原预算与面积照旧。'),true);
 assert.equal(goalValueMentioned('candidate_area_m2',2,'候选面积812㎡。'),false);
});

test('temperature service invocation is authorized while cancellation remains binding',()=>{
 for(const text of ['按已有条件走完核查到导出流程，温度服务也请尝试调用。','请尝试调用温度模型。','请运行这个方案的温度预测。']) assert.equal(predictionRequested(text),true,text);
 for(const text of ['只登记预算10万元。','不要调用温度服务。','取消温度计算，只比较已有方案。','先别预测降温。','这轮不要运行预测，只看费用。']) assert.equal(predictionRequested(text),false,text);
});

test('production tools reject a swapped budget and permit a natural service request',async()=>{
 const catalog=await loadProjectCatalog(fileURLToPath(new URL('../',import.meta.url)));
 const session=newSession({site_id:catalog.scene.site_id},catalog);
 const quote='预算123000元，候选面积812平方米，单价109元/平方米，只保存条件。';
 session.messages.push({role:'user',content:quote});
 assert.throws(()=>executeTool('set_planning_goal',{budget_rmb:812,evidence_quote:quote},session,catalog),error=>error.code==='unsupported_goal_value');
 assert.equal(session.goal.version,0);
 executeTool('set_planning_goal',{budget_rmb:123000,candidate_area_m2:812,unit_cost_rmb_per_m2:109,evidence_quote:quote},session,catalog);
 const scenario=executeTool('generate_scenario_options',{},session,catalog).scenarios[0];
 session.messages.push({role:'user',content:'按已有条件走完核查到导出流程，温度服务也请尝试调用。'});
 const result=executeTool('request_temperature_prediction',{scenario_id:scenario.id},session,catalog);
 assert.equal(result.status,'not_connected');assert.equal(result.execution_status,'not_run');assert.equal(result.predicted_delta_lst_c,null);
 session.messages.push({role:'user',content:'不要调用温度服务。'});
 assert.throws(()=>executeTool('request_temperature_prediction',{scenario_id:scenario.id},session,catalog),error=>error.code==='prediction_not_requested');
});
