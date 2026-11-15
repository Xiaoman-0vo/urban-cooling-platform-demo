import {readFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {publicTasks} from './agent-task-state.mjs';
import {goalValueMentioned,predictionRequested,pilotPredictionRequested} from './goal-evidence.mjs';
import {loadPlanningPilot,pilotOptions} from './planning-pilot.mjs';

export class AgentError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message) => { throw new AgentError(code, message); };
const clone = value => structuredClone(value);
const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
const round = value => Math.round(value * 100) / 100;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const GOAL_FIELDS = ['budget_rmb','candidate_area_m2','unit_cost_rmb_per_m2','added_green_target_m2','target_delta_lst_c'];
const GOAL_NAMES = {budget_rmb:'建设预算',candidate_area_m2:'用户声明的候选面积',unit_cost_rmb_per_m2:'假设建设单价',added_green_target_m2:'新增绿量目标',target_delta_lst_c:'期望地表降温'};

export async function loadProjectCatalog(root) {
  const read = async name => {
    const bytes = await readFile(resolve(root, 'public/data', name));
    return {data: JSON.parse(bytes.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex')};
  };
  const [scene, nodes] = await Promise.all([read('scene.json'), read('macro_nodes.geojson')]);
  const byId = new Map(nodes.data.features.map(feature => [feature.properties.grid_id, feature]));
  const pilot=await loadPlanningPilot(root,scene.data);
  return {scene: scene.data, nodes: byId, pilot, baseline: {scene_sha256: scene.sha256, grid_sha256: nodes.sha256,
    case_id: scene.data.case_id, scenario_id: scene.data.scenario_id, source: 'public/data/scene.json'}};
}

export function sanitizeContext(context = {}, catalog) {
  if (!context || typeof context!=='object' || Array.isArray(context)) fail('invalid_context','场地上下文无效。');
  const text = (value, max = 100) => typeof value === 'string' ? value.slice(0, max) : '';
  const siteId = text(context.site_id) || catalog.scene.site_id;
  const scenarioId=text(context.scenario_id);
  const mapped=context.planning_mode==='mapped_pilot';
  if(mapped&&(catalog.pilot?.site_id!==siteId||catalog.pilot?.scenario_id!==scenarioId))
    fail('pilot_scope_mismatch','落图试点仅支持已载入的 E4125_N33891 样例基线。');
  return {site_id: siteId, scenario_id: scenarioId,
    ...(mapped?{planning_mode:'mapped_pilot'}:{}),
    selection: {layer: text(context.selection?.layer, 60), id: text(context.selection?.id)},
    data_scope: siteId === catalog.scene.site_id ? 'loaded_research_example' : 'other_location_metadata_only'};
}

export function newSession(context, catalog) {
  const scope=sanitizeContext(context,catalog);
  return {id: randomUUID(), schema_version: 'urbancool-agent/1', created_at: new Date().toISOString(),
    context:scope, baseline: clone(catalog.baseline), revision: 0,
    ...(scope.planning_mode==='mapped_pilot'?{pilot:clone(catalog.pilot)}:{}),
    messages: [], goal: {version: 0, preserve_buildings: true, assumptions: {}}, scenarios: [], reports: [], traces: [],
    tasks:[],event_version:0,active_run_id:null};
}

export function capabilities(pilot=null) {
  return {project_query: true, goal_drafts: true, assumption_based_scenarios: true, report_export: true,multi_agent:true,
    temperature_prediction: false, spatial_intervention_compiler: false, construction_feasibility: false,
    ...(pilot?{mapped_discussion_pilot:true}:{}),
    note: pilot?'试点支持候选范围落图与面积费用核查。现场条件待核实，温度服务待接入。':'支持真实资料查询与配置目标草案；草案面积和费用依赖用户声明，未落实到地块，未计算温度。'};
}

function objectArguments(args, allowed, required = []) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('invalid_arguments', '工具参数必须是对象。');
  if (Object.keys(args).some(key => !allowed.includes(key)) || required.some(key => !own(args, key)))
    fail('invalid_arguments', '工具参数不符合已登记接口。');
}

function gridContext(catalog, gridId) {
  if (typeof gridId !== 'string' || !catalog.nodes.has(gridId))
    return {status: 'no_data', grid_id: gridId, note: '本地索引中没有该网格；不沿用示例场地的指标。', temperature_prediction: null};
  const node = catalog.nodes.get(gridId);
  const p = node.properties;
  const points = node.geometry?.type === 'Polygon' ? node.geometry.coordinates[0] : [];
  const lons = points.map(point => point[0]), lats = points.map(point => point[1]);
  const location = points.length ? [(Math.min(...lons) + Math.max(...lons))/2, (Math.min(...lats) + Math.max(...lats))/2] : null;
  const result = {status: 'source_metadata', grid_id: gridId, area_m2: finite(p.area_m2), role: p.role,
    location, location_role: 'saved_grid_geometry_reference_center',
    references: ['public/data/macro_nodes.geojson'], temperature_prediction: null};
  if (gridId !== catalog.scene.site_id) return {...result, note: '只有网格位置和索引资料，没有该格完整指标或可用预测结果。'};
  const scene = catalog.scene;
  const record = scene.records.find(row => row.variant === 'c4_min0') || scene.records[0] || {};
  return {...result, status: 'research_preparation_evidence', sample_status: scene.sample_status,
    scientific_scope: scene.scientific_scope, source_scenario_id: scene.scenario_id,
    classified_green_projection_area_m2: scene.counts.classified_projection_area_m2,
    classified_green_projection_percent: result.area_m2 ? round(scene.counts.classified_projection_area_m2/result.area_m2*100) : null,
    green_fragments: scene.counts.vegetation_fragment_count,
    green_source_groups: scene.counts.source_green_group_count,
    source_buildings_in_preparation_window: scene.counts.building_source_count,
    working_building_parts: scene.counts.building_part_count,
    core_source_buildings: scene.counts.core_building_source_objects,
    source_classification_variant: record.variant,
    remaining_buildable_area_m2: null,
    observed_temperature: null,
    note: '分类绿色投影是现有来源描述；不能据总面积减建筑和绿地推断可改造面积。未调用温度模型。',
    references: ['public/data/scene.json#counts','public/data/scene.json#records','public/data/macro_nodes.geojson']};
}

function setGoal(session, args, catalog) {
  objectArguments(args, [...GOAL_FIELDS, 'evidence_quote'], ['evidence_quote']);
  const latestUserText = session.messages.findLast(message => message.role === 'user')?.content;
  if (typeof args.evidence_quote !== 'string' || args.evidence_quote.length < 2 ||
      !latestUserText?.includes(args.evidence_quote))
    fail('missing_user_evidence', '请引用本轮用户原话登记目标，不能自行补充或恢复旧预算、候选面积或单价。');
  const changed = GOAL_FIELDS.filter(field => own(args, field));
  if (!changed.length) fail('empty_goal', '没有可登记的数值目标。');
  for (const field of changed) {
    const value = args[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e10 ||
        (field === 'unit_cost_rmb_per_m2' && value <= 0)) fail('invalid_goal_value', `${GOAL_NAMES[field]}数值无效。`);
    if (!goalValueMentioned(field,value,args.evidence_quote) || !goalValueMentioned(field,value,latestUserText))
      fail('unsupported_goal_value', `${GOAL_NAMES[field]}未与引用原话中的对应数值匹配；请先向用户确认。`);
  }
  const area = finite(catalog.nodes.get(session.context.site_id)?.properties.area_m2);
  if (own(args,'candidate_area_m2') && area !== null && args.candidate_area_m2 > area)
    fail('candidate_exceeds_grid', `声明面积超出当前网格总面积 ${area}㎡；请核对单位或研究范围。`);
  const next = clone(session.goal);
  next.version += 1;
  for (const field of changed) { next[field] = args[field]; next.assumptions[field] = {source:'user_declared', evidence_quote:args.evidence_quote}; }
  session.goal = next;
  session.revision += 1;
  return {status:'goal_draft_saved', goal:clone(next), stale_scenario_ids:session.scenarios.filter(s => s.goal_version !== next.version).map(s => s.id),
    note:session.pilot?'已登记本轮讨论约束。候选范围和来源按试点记录保留。':'目标配置草案已保存；候选面积和单价是用户声明，未完成地块核查或模型转换。'};
}

function generateScenarios(session) {
  const goal = session.goal;
  const required = session.pilot?['budget_rmb','unit_cost_rmb_per_m2']:['budget_rmb','candidate_area_m2','unit_cost_rmb_per_m2'];
  const missing = required.filter(field => typeof goal[field] !== 'number');
  if (missing.length) return {status:'needs_inputs', missing:missing.map(field => ({field, name:GOAL_NAMES[field]})),
    note:session.pilot?'请补充预算及假设单价。试点范围来自已登记讨论多边形。':'请用户提供预算、声明候选面积和假设单价；不从现状绿量推断可施工空间。'};
  const existing=session.scenarios.filter(s=>s.goal_version===goal.version&&s.kind===(session.pilot?'mapped_pilot_option':'configuration_target_not_spatial_layout'));
  if(existing.length)return {status:'draft_options_reused',scenarios:clone(existing),note:'复用当前目标版本的固定配置模板，不重复创建相同草案。'};
  if(session.pilot){
    const scenarios=pilotOptions(session).map(option=>({...option,id:randomUUID(),site_id:session.context.site_id,
      goal_version:goal.version,baseline:clone(session.baseline),pilot_sha256:session.pilot.sha256,
      budget_rmb:goal.budget_rmb,declared_candidate_area_m2:goal.candidate_area_m2??null,
      assumed_unit_cost_rmb_per_m2:goal.unit_cost_rmb_per_m2,preserve_buildings:true,
      added_green_target_met:goal.added_green_target_m2==null?null:option.added_green_area_m2>=goal.added_green_target_m2,
      added_green_target_gap_m2:goal.added_green_target_m2==null?null:round(Math.max(0,goal.added_green_target_m2-option.added_green_area_m2)),
      predicted_delta_lst_c:null,prediction_status:'not_run',implementation_status:'not_verified',
      assumption_evidence:clone(goal.assumptions),created_at:new Date().toISOString()}));
    session.scenarios.push(...scenarios);session.revision++;
    return {status:'draft_options_created',scenarios:clone(scenarios),
      generation_method:'分别核算两块固定候选范围的面积与假设费用',
      note:'两个讨论方案分别比较。资料几何已检查，权属、道路宽度和现场条件待组员核实。'};
  }
  const bound = Math.min(goal.candidate_area_m2, goal.budget_rmb/goal.unit_cost_rmb_per_m2,
    goal.added_green_target_m2 ?? Infinity);
  if (bound <= 0) return {status:'no_positive_allocation', note:'当前声明条件下没有正的面积配置空间。'};
  const labels = ['基础投入','中等投入','较高投入'];
  const scenarios = [0.5,0.75,1].map((share, index) => {
    const area = Math.floor(bound*share*100)/100;
    return {id:randomUUID(), title:labels[index], kind:'configuration_target_not_spatial_layout',
      site_id:session.context.site_id, goal_version:goal.version, baseline:clone(session.baseline),
      added_green_area_m2:area, estimated_construction_cost_rmb:round(area*goal.unit_cost_rmb_per_m2),
      declared_candidate_area_m2:goal.candidate_area_m2, budget_rmb:goal.budget_rmb,
      assumed_unit_cost_rmb_per_m2:goal.unit_cost_rmb_per_m2, preserve_buildings:true,
      capacity_check_passed:area <= goal.candidate_area_m2, budget_check_passed:area*goal.unit_cost_rmb_per_m2 <= goal.budget_rmb,
      added_green_target_met:goal.added_green_target_m2 == null ? null : area>=goal.added_green_target_m2,
      added_green_target_gap_m2:goal.added_green_target_m2 == null ? null : round(Math.max(0,goal.added_green_target_m2-area)),
      geometry:null, predicted_delta_lst_c:null, prediction_status:'not_run', implementation_status:'not_verified',
      assumption_evidence:clone(goal.assumptions), created_at:new Date().toISOString()};
  });
  session.scenarios.push(...scenarios);
  session.revision += 1;
  return {status:'draft_options_created', scenarios, generation_method:'固定预算与声明容量下的50%/75%/100%配置模板，未执行最优化或温度模型',
    note:'仅配置目标，位置未落实；不能按面积大小直接排序降温、热舒适或公平收益。'};
}

function compareScenarios(session) {
  const current = session.scenarios.filter(scenario => scenario.goal_version === session.goal.version);
  return {status:current.length?'comparison_ready':'no_current_options', goal_version:session.goal.version,
    scenarios:clone(current), stale_scenario_count:session.scenarios.length-current.length,
    comparison_scope:session.pilot?'按两块候选范围核算面积与假设建设费。超预算或超声明面积者保留原形并标明。':'仅比较用户声明条件下的新增面积和假设建设费；未计养护费，不能评价降温排名。'};
}

function makeReport(session, catalog) {
  const comparison = compareScenarios(session);
  const id = randomUUID();
  const facts = gridContext(catalog, session.context.site_id);
  const lines = ['# UrbanCool AI 规划讨论记录','',`场地：${session.context.site_id}`,`目标草案版本：${session.goal.version}`,
    `基线资料 SHA-256：${session.baseline.scene_sha256}`,'', '## 已有资料',
    facts.classified_green_projection_area_m2 == null ? '该位置仅有索引或缺少本地资料。' :
      `来源分类绿色投影面积：${facts.classified_green_projection_area_m2}㎡，比例 ${facts.classified_green_projection_percent}%。`,
    '', '## 目标与声明假设', ...GOAL_FIELDS.filter(field=>own(session.goal,field)).map(field=>`- ${GOAL_NAMES[field]}：${session.goal[field]}；原话：${session.goal.assumptions[field]?.evidence_quote}`),
    '', '## 当前配置目标草案','| 草案 | 新增面积（㎡） | 假设建设费（元） | 新增绿量目标 | 预测地表降温 |','|---|---:|---:|---|---|',
    ...comparison.scenarios.map(s=>`| ${s.title} | ${s.added_green_area_m2} | ${s.estimated_construction_cost_rmb} | ${s.added_green_target_met == null ? '未声明' : s.added_green_target_met ? '已达到声明目标' : `未达到，缺口${s.added_green_target_gap_m2}㎡`} | 未计算 |`),
    '', '## 依据与适用范围','- public/data/scene.json','- public/data/macro_nodes.geojson',
    session.pilot?'- 候选面积按已登记的米制多边形量测，费用按用户声明单价核算。可施工性待核实。':'- 现状引用的是已保存的研究准备资料；草案费用和容量来自用户声明，未核实可施工性。',
    '- 未运行冻结温度模型、情景编译器、物理模拟、公平性联算或可达性分析。',
    session.pilot?'- 候选多边形为原资料审阅面内的讨论范围，现场与管控条件待核实。':'- 草案没有地物几何，不能当作实际布局或施工方案。',
    '', '## 本轮协作记录（生成报告时的快照）',
    ...(session.tasks || []).filter(t=>t.run_id===session.active_run_id && t.parent_task_id).map(t=>`- ${t.agent_name}：${t.status}；任务 ${t.id}；工具依据 ${t.trace_ids.join('、') || '无'}。`),
    '- 协作任务完成不代表温度模型执行；模型摘要与程序计算结果分别保留。'];
  if(session.pilot)lines.push('', '## 落图方案版本对比',`试点 ${session.pilot.id} · ${session.pilot.sha256}`,
    '| 目标版本 | 候选 | 范围面积（㎡） | 预算（元） | 假设费用（元） | 费用及面积检查 |', '|---|---|---:|---:|---:|---|',
    ...session.scenarios.filter(s=>s.kind==='mapped_pilot_option').map(s=>`| v${s.goal_version} | ${s.candidate_id}（${s.source_review_id}） | ${s.added_green_area_m2} | ${s.budget_rmb} | ${s.estimated_construction_cost_rmb} | ${s.budget_check_passed?'预算内':'超预算'} / ${s.capacity_check_passed?'面积条件通过':'超声明面积'} |`),
    '', '可从目标与草案页导出带版本的地图 GeoJSON。当前版本和旧版各自保留原始条件。',
    ...session.pilot.references.map(({path,sha256})=>`- ${path} · ${sha256}`),
    ...session.pilot.outstanding.map(item=>`- 待组员核实：${item}`),
    ...session.traces.filter(t=>t.tool==='request_temperature_prediction'&&t.result.status!=='rejected').map(t=>`- 预测检查 ${t.result.scenario_id}：${t.result.status}，${t.result.execution_status}。`));
  const report = {id, goal_version:session.goal.version, created_at:new Date().toISOString(), markdown:lines.join('\n')};
  session.reports.push(report);
  session.revision += 1;
  return {status:'report_created', report:clone(report)};
}

export const TOOL_DEFINITIONS = [
  ['get_project_overview','读取项目真实能力、当前场地、资料版本与预测接入状态。',{},[]],
  ['get_grid_context','查询已保存网格的位置和已有指标；非示例网格通常只有索引，不能复用示例数值。',{grid_id:{type:'string'}},['grid_id']],
  ['get_input_gaps','读取真实场地缺项与接入温度服务所需移交清单。',{},[]],
  ['set_planning_goal','将用户明确给出的数字登记为目标草案；预算/候选面积/单价不得自行假设。金额单位元，面积㎡。',{...Object.fromEntries(GOAL_FIELDS.map(field=>[field,{type:'number',description:GOAL_NAMES[field]}])),evidence_quote:{type:'string',description:'包含所登记数字的用户原话，必须逐字引用'}},['evidence_quote']],
  ['generate_scenario_options','根据已登记预算、用户声明候选面积与假设单价生成三档配置目标；不是空间布局或降温优化。',{},[]],
  ['compare_scenario_options','比较当前目标版本的草案面积和假设费用，旧版本单独标记。',{},[]],
  ['request_temperature_prediction','用户明确要求预测时检查接入状态。当前必定返回未接通与空值，不会调用或虚构温度模型。',{scenario_id:{type:'string'}},['scenario_id']],
  ['export_planning_report','将真实资料、当前目标及方案比较导出为带依据和假设的Markdown记录。',{},[]],
].map(([name,description,properties,required])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}}));

export function executeTool(name, args, session, catalog) {
  const definition = TOOL_DEFINITIONS.find(tool=>tool.function.name===name);
  if (!definition) fail('unknown_tool','未登记的工具，未执行。');
  objectArguments(args, Object.keys(definition.function.parameters.properties), definition.function.parameters.required);
  if (name === 'get_project_overview') return {status:'source_query', context:clone(session.context), capabilities:capabilities(session.pilot),
    baseline:clone(session.baseline), current_site:gridContext(catalog,session.context.site_id),
    ...(session.pilot?{pilot:{id:session.pilot.id,candidates:session.pilot.candidates.map(({id,area_m2,review_status})=>({id,area_m2,review_status})),outstanding:session.pilot.outstanding}}:{}),
    research_lines:[{id:'02',name:'冻结温度预测与函数目标反推',online_service:false},{id:'03',name:'独立增绿需求与土地负担',joint_contract_aligned:false},{id:'04',name:'潜在冷机会与人口分配',joint_contract_aligned:false}],
    note:'各研究线保持独立，现有来源登记不代表当前模型已执行。'};
  if (name === 'get_grid_context') return gridContext(catalog,args.grid_id);
  if (name === 'get_input_gaps') return {status:'missing_inputs',
    site_scope:session.context.site_id,
    site_items_analysis_scope:'以下site_items来自微观/物理分析准备表，不等于02宏观冻结预测的逐项前置条件；宏观推理移交项单列于model_service_missing。',
    site_items:session.context.site_id === catalog.scene.site_id ? catalog.scene.tables.micro_missing_inputs.rows.map(row=>({group:row.group,item:row.item,status:row.status,required_evidence:row.required_evidence,value:row.value===''?null:row.value})):[],
    model_service_missing:['冻结推理代码与权重','训练时的标准化和状态编码器','同口径特征与完整图邻域','固定样例和依赖环境','受支持干预到模型特征的转换规则','在线推理接口与适用性检查'],
    references:['public/data/scene.json#tables.micro_missing_inputs','README.md#模型服务另行整理的范围']};
  if (name === 'set_planning_goal') return setGoal(session,args,catalog);
  if (name === 'generate_scenario_options') return generateScenarios(session);
  if (name === 'compare_scenario_options') return compareScenarios(session);
  if (name === 'request_temperature_prediction') {
    const original=session.messages.filter(m=>m.role==='user').at(-1)?.content || '';
    if (!(session.pilot?pilotPredictionRequested(original):predictionRequested(original)))
      fail('prediction_not_requested','当前用户未明确提出计算请求。');
    const scenario = session.scenarios.find(item=>item.id===args.scenario_id);
    if (!scenario) fail('unknown_scenario','未找到该会话中的草案。');
    if(session.pilot&&scenario.goal_version===session.goal.version&&scenario.comparison_status==='outside_declared_limits')
      return {status:'candidate_blocked',execution_status:'not_run',scenario_id:scenario.id,predicted_delta_lst_c:null,
        blockers:['该候选超出本轮预算或声明面积'],note:'当前候选未满足本轮条件。'};
    return {status:scenario.goal_version!==session.goal.version?'stale_scenario':'not_connected',
      execution_status:'not_run',scenario_id:scenario.id,predicted_delta_lst_c:null,
      blockers:scenario.goal_version!==session.goal.version?['草案引用旧目标版本']:['冻结模型与输入未接通',session.pilot?'候选用地待人工核查，干预特征编译待接通':'配置目标尚无地物几何与完整特征编译'],
      note:'没有执行预测，没有生成降温数值。'};
  }
  return makeReport(session,catalog);
}

export function publicSession(session) {
  return {id:session.id, revision:session.revision,event_version:session.event_version || 0,active_run_id:session.active_run_id || null,
    tasks:publicTasks(session),context:clone(session.context), baseline:clone(session.baseline),
    ...(session.pilot?{pilot:clone(session.pilot)}:{}),
    messages:clone(session.messages), goal:clone(session.goal),
    scenarios:session.scenarios.map(s=>({...clone(s),is_stale:s.goal_version!==session.goal.version})),
    reports:clone(session.reports), traces:clone(session.traces.slice(-40)), capabilities:capabilities(session.pilot)};
}
