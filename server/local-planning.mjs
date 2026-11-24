import {AgentError} from './agent-tools.mjs';

const labels={
  budget_rmb:['预算','元'],
  candidate_area_m2:['候选面积上限','平方米'],
  unit_cost_rmb_per_m2:['建设单价','元/平方米'],
};
const decimal=new Intl.NumberFormat('en-US',{useGrouping:false,maximumFractionDigits:15});

export function localPlanningAction(action) {
  if(action?.type==='evaluate_spatial_candidates'){
    if(Object.keys(action).some(k=>!['type','search_id'].includes(k))||typeof action.search_id!=='string'||!action.search_id||action.search_id.length>64)
      throw new AgentError('invalid_planning_action','请从本轮候选比较面板手动启动评价。');
    return {type:action.type,text:'手动评价本轮全部空间候选，保存固定输入和结果，先比较再决定采用。',args:{search_id:action.search_id}};
  }
  if(action?.type==='generate_spatial_candidates'){
    if(Object.keys(action).some(k=>!['type','minimum_area_m2','expected_area_sha256'].includes(k))||
      !Number.isSafeInteger(action.minimum_area_m2)||action.minimum_area_m2<1||action.minimum_area_m2>1e6||
      !/^[a-f0-9]{64}$/.test(action.expected_area_sha256))
      throw new AgentError('invalid_planning_action','请填写大于零的整数最低面积，并从候选生成面板提交。');
    const {type,...args}=action;
    return {type,text:`按当前预算、保留区和优先区域生成空间候选，最低改造面积 ${action.minimum_area_m2}㎡；不运行温度预测。`,args};
  }
  if(action?.type==='adopt_spatial_candidate'){
    if(Object.keys(action).some(k=>!['type','search_id','candidate_id','expected_current_scenario_id'].includes(k))||
      ![action.search_id,action.candidate_id].every(v=>typeof v==='string'&&v.length>0&&v.length<=64)||
      !(action.expected_current_scenario_id===null||typeof action.expected_current_scenario_id==='string'&&action.expected_current_scenario_id.length<=64))
      throw new AgentError('invalid_planning_action','请从已生成候选中选择要采用的范围。');
    const {type,...args}=action;
    return {type,text:'采用已选空间候选为新情景，保留历史，等待手动温度评价。',args};
  }
  if(action?.type==='update_priority'){
    const allowed=['type','operation','bounds_utm','label','area_id','expected_priority_version','expected_area_sha256'];
    const required=action.operation==='add'?['bounds_utm','label']:['area_id'];
    if(Object.keys(action).some(key=>!allowed.includes(key))||!['add','remove'].includes(action.operation)||
      !Number.isSafeInteger(action.expected_priority_version)||action.expected_priority_version<0||
      !/^[a-f0-9]{64}$/.test(action.expected_area_sha256)||required.some(key=>!Object.hasOwn(action,key))||
      (action.operation==='add'&&Object.hasOwn(action,'area_id'))||
      (action.operation==='remove'&&(typeof action.area_id!=='string'||action.area_id.length>64||Object.hasOwn(action,'bounds_utm')||Object.hasOwn(action,'label'))))
      throw new AgentError('invalid_planning_action','请从优先区域面板提交明确的修改。');
    const {type,...args}=action;
    return {type,text:action.operation==='add'?'登记用户指定的优先区域，仅更新覆盖比较，不运行预测。':'移除用户指定的优先区域，保留历史和温度结果。',args};
  }
  if(action?.type==='update_protection'){
    const allowed=['type','operation','bounds_utm','label','area_id','expected_protection_version','expected_current_scenario_id'];
    if(Object.keys(action).some(key=>!allowed.includes(key))||!['add','remove'].includes(action.operation)||
      !Number.isSafeInteger(action.expected_protection_version)||action.expected_protection_version<0||
      !(action.expected_current_scenario_id===null||typeof action.expected_current_scenario_id==='string'&&action.expected_current_scenario_id.length<=64))
      throw new AgentError('invalid_planning_action','请从保留范围面板提交明确的修改。');
    const {type,...args}=action;
    return {type,text:action.operation==='add'?'登记用户指定的保留范围，不运行预测。':'解除用户指定的保留约束，保留历史，不运行预测。',args};
  }
  if(action?.type==='export')return {type:'export',text:'导出当前及旧版的规划讨论记录。'};
  if(action?.type==='save_temperature_scenario')
    return {type:action.type,text:'保存地图上选择的覆盖变化情景。',args:{bounds_utm:action.bounds_utm}};
  if(action?.type==='evaluate_temperature_scenario')
    return {type:action.type,text:'手动运行当前地表温度情景试算。',args:{scenario_id:action.scenario_id}};
  if(action?.type==='restore_temperature_scenario'){
    if(Object.keys(action).some(key=>!['type','scenario_id','expected_current_scenario_id'].includes(key))||
      ![action.scenario_id,action.expected_current_scenario_id].every(id=>typeof id==='string'&&id.length<=64))
      throw new AgentError('invalid_planning_action','请从旧版范围列表发起恢复。');
    return {type:action.type,text:'按当前目标恢复指定旧范围为新版本，保留历史，不运行预测。',
      args:{scenario_id:action.scenario_id,expected_current_scenario_id:action.expected_current_scenario_id}};
  }
  const fields=action?.fields;
  if(!['compare','set_conditions'].includes(action?.type)||!fields||typeof fields!=='object'||Array.isArray(fields))
    throw new AgentError('invalid_planning_action','请通过落图试点的表单提交讨论条件。');
  const entries=Object.entries(fields);
  if(!entries.length||entries.some(([key,value])=>!Object.hasOwn(labels,key)||!Number.isFinite(value)||value<0||value>1e10))
    throw new AgentError('invalid_planning_action','预算、面积和单价应填写有效数值。');
  const quote=entries.map(([key,value])=>{
    const [label,unit]=labels[key];
    return `${label}${decimal.format(value)}${unit}`;
  }).join('，');
  return {type:action.type,text:`${action.type==='set_conditions'?'保存本轮目标条件。':'按讨论条件比较 A、B。'}\n${quote}。`,args:{...fields,evidence_quote:quote}};
}
