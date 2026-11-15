import {isDeepStrictEqual} from 'node:util';

const steps=[
  {name:'new_revision_baseline',text:'先按预算10.5万元、候选面积上限320平方米、建设单价275元/平方米比较这两块地。',
    change:{budget_rmb:105000,candidate_area_m2:320,unit_cost_rmb_per_m2:275}},
  {name:'revise_unit_cost',text:'报价更新了，单价从275元/平方米调到360元/平方米。其他条件照旧，再算一下两案费用。',
    change:{unit_cost_rmb_per_m2:360}},
  {name:'revise_area_cap',text:'用地这项改一下，候选面积最多260平方米。预算和单价照前一版，再比一遍。',
    change:{candidate_area_m2:260}},
  {name:'revise_budget_and_export',text:'把预算从10.5万元改到11.5万元，面积上限和单价沿用。重新比较并导出四版对照，先不做温度预测。',
    change:{budget_rmb:115000},export:true},
];
export const revisions=steps.map((step,index)=>({...step,version:index+1,
  goal:Object.assign({},...steps.slice(0,index+1).map(({change})=>change))}));

export function revisionChecks(step, before, after, traces) {
  const saved=traces.filter(t=>t.tool==='set_planning_goal'&&t.result.status==='goal_draft_saved');
  const options=after.scenarios.filter(s=>s.goal_version===step.version);
  const {budget_rmb:budget,candidate_area_m2:cap,unit_cost_rmb_per_m2:unit}=step.goal;
  return {
    goal_and_version:after.goal.version===step.version&&Object.entries(step.goal).every(([k,value])=>after.goal[k]===value),
    only_intended_write:saved.length===1&&isDeepStrictEqual(
      Object.fromEntries(Object.entries(saved[0].arguments).filter(([key])=>key!=='evidence_quote')),step.change),
    current_cost_and_limits:isDeepStrictEqual(options.map(s=>[
      s.candidate_id,s.estimated_construction_cost_rmb,s.budget_check_passed,s.capacity_check_passed
    ]),[['A',144*unit,144*unit<=budget,144<=cap],['B',300*unit,300*unit<=budget,300<=cap]]),
    old_versions_preserved:after.scenarios.length===before.scenarios.length+2&&before.scenarios.every(old=>
      after.scenarios.some(s=>s.id===old.id&&s.is_stale&&isDeepStrictEqual(s.geometry,old.geometry))),
    no_temperature_check:traces.every(t=>t.tool!=='request_temperature_prediction'),
    ...(step.export?{report_has_all_versions:after.reports.some(r=>r.goal_version===step.version&&
      [1,2,3,4].every(version=>r.markdown.includes(`| v${version} | B`)))}:{}),
  };
}
