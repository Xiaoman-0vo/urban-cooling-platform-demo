export const TOOL_NAMES={
  get_project_overview:'查询项目与能力',
  get_grid_context:'查询网格资料',
  get_input_gaps:'检查缺失条件',
  set_planning_goal:'登记目标',
  generate_scenario_options:'生成方案草案',
  compare_scenario_options:'比较面积与费用',
  request_temperature_prediction:'检查方案预测条件',
  estimate_historical_surface_temperature:'估计历史地表温度',
  get_chengdu_heat_perception:'读取成都微博热感知快照',
  export_planning_report:'生成规划讨论记录',
  delegate_data_audit:'委派资料核查',
  delegate_plan_exploration:'委派方案探索',
  delegate_prediction_evaluation:'委派预测评估',
};

export function executionLabel(task) {
  if(task.execution_kind==='historical_temperature')
    return task.temperature_model||'历史地表温度';
  if(task.execution_kind==='local_planning')return '本地规划工具';
  if(task.execution_kind==='prediction_check')return '程序核查';
  if(task.execution_kind==='mcp_read')return 'MCP 只读查询';
  if(task.execution_kind==='llm'&&task.usage?.model_requests)return task.language_model;
  return null;
}

export function activeStep(task) {
  if(!task)return '正在准备本轮请求';
  if(task.current_tool)return TOOL_NAMES[task.current_tool]||'正在执行工具';
  if(task.phase==='model')return task.language_model?`正在请求 ${task.language_model}`:'正在请求语言模型';
  if(task.phase==='review')return '正在核对本轮结果';
  return `${task.agent_name}正在处理`;
}
