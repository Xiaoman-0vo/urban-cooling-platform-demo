import proj4 from 'proj4';

// This adapter checks saved source relationships. It never creates a walk network.
const PREFIX = '共享接口/服务链准备/源线连通诊断_20261006/';
const NODE_FILE = PREFIX + '原节点.csv';
const SEGMENT_FILE = PREFIX + '原相邻段.csv';
const PAIR_FILE = PREFIX + '道路线关系.csv';
const RECEPTOR_FILE = PREFIX + '受体与道路线平面关系.csv';
const AUDIT_FILE = PREFIX + '源几何连通核查.json';
const INDEPENDENT_FILE = PREFIX + '独立回读核查.json';
const PBF_SHA = 'd83436cd414db196d164fc35990910d6369347c6c47192ed6d79ffcfb2335f78';
const LINE_SHA = '56f276ba8b8c69e52a0f70ceb7312d7900394da1dff41b5d1598b6fc163b18fb';
const RECEPTOR_SHA = '6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4';
const NODE_NAMESPACE = 'osm_snapshot@sha256:' + PBF_SHA + '/nodes';
const WAY_NAMESPACE = 'chengdu_highways_210101@sha256:' + LINE_SHA + '/features';
const RECEPTOR_NAMESPACE = 'micro_scene@sha256:' + RECEPTOR_SHA + '/receptor_candidates';
const BOUNDS = [412300, 3388900, 412800, 3389400];
const TOLERANCE_M = 1e-6;
const WAY_IDS = ['w100288826','w100288828','w100288832','w114412855','w116486217','w453873884','w587600580','w587601045','w665501095','w710790280','w710790281','w711177603','w711177604','w711177605','w711177606','w711177607','w711177615'];
const RECEPTOR_IDS = ['H1','H2','H3','V1','V2','V3'];
const EXPECTED_MINIMUMS = {H1:'3.98',H2:'30.80',H3:'27.60',V1:'16.97',V2:'14.42',V3:'7.10'};
const SOURCE_FINGERPRINTS = {
  'README.md': [6217,'cc0a573f8cd9098aa753826c1ce7ff8c85465f2cf9be6dfb75491cb0079d5cb9'],
  '原相邻段.csv': [64637,'5c9316d83182e385ff8fe5306b1fb0717cacd6f87daf998ec03207e914f85cf9'],
  '原节点.csv': [46209,'9175755c72fb21432c974c747c19ef7814778fc012adb5b8e2bb29dd7558d17b'],
  '受体与道路线平面关系.csv': [87491,'acea430e5dae9d35cd053753abf29c00da1c0d8adff6c2f2be2668a62dca517b'],
  '源几何连通核查.json': [9568,'3981d5962470dd2c6339fea9586b351bacf5278c5fd4921aa9a5857f93581da5'],
  '独立回读核查.json': [1409,'cadc3fc54ef5ccb14786a82275bc968df26843ec01183b44a632551d14c63778'],
  '独立回读核查.py': [9286,'443f7f40417942fa1783004af440605732fc5cb232ca9496158b1ce9d5a96fed'],
  '生成源几何诊断.py': [21556,'072f48459de5c3d53dd0fee0a74030dc0b0eb5c7a8a9b1c2b5f3ef09154df067'],
  '道路线关系.csv': [86382,'75325abb729a1914442029e4cd384f5e51d267c9d1417e5dcec2d2cc506e4866'],
};
export const ROAD_SOURCE_PATHS = Object.freeze(Object.keys(SOURCE_FINGERPRINTS).map(name => PREFIX + name));
const NODE_FIELDS = 'node_key source_osm_node_id source_pbf_path source_pbf_sha256 pbf_node_version node_last_edit_time_utc source_lon source_lat source_crs x_m y_m measurement_crs inside_or_on_context source_ways_json way_endpoint_of_json source_way_incidence_count source_segment_incidence_count distinct_source_node_neighbor_count source_component_id coordinate_consistency public_walk_node_verified grade_or_junction_verified service_node_state'.split(' ');
const SEGMENT_FIELDS = 'segment_key source_way_key source_feature_id source_segment_index_0based from_node_key to_node_key from_osm_node_id to_osm_node_id from_vertex_index_0based to_vertex_index_0based geometry_crs geometry_wkt source_segment_length_m context_positive_intersection_length_m geometry_scope highway_raw foot_raw access_raw bridge_raw tunnel_raw layer_raw source_ref_adjacency legal_walk_connection legal_walk_connection_state travel_time_min route_cost source_component_id'.split(' ');
const PAIR_FIELDS = 'relation_key left_way_key right_way_key left_source_feature_id right_source_feature_id relation_kind shared_osm_node_ids_json shared_source_node_count endpoint_endpoint_shared_ids_json shared_nodes_inside_context_json geometry_intersects intersection_geometry_type intersection_wkt intersection_crs intersection_length_m intersection_hits_context source_reference_graph_adjacency planar_intersection_auto_connected left_bridge_raw right_bridge_raw left_tunnel_raw right_tunnel_raw left_layer_raw right_layer_raw same_grade_or_legal_crossing_verified verified_public_connection grade_state'.split(' ');
const RECEPTOR_FIELDS = 'relation_key receptor_key receptor_id receptor_asset_path receptor_asset_sha256 receptor_layer source_way_key source_feature_id receptor_x_m receptor_y_m measurement_crs point_intersects_full_source_line_exact source_planar_point_line_distance_m distance_semantics role_public_destination role_resident_origin point_position_confirmed graph_attachment_node_key graph_attachment_accepted entrance_id legal_access stay_permission opening_time route_distance_m travel_time_min service_value'.split(' ');

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('道路来源核对：' + message); };
const expect = (actual,expected,label) => { if (actual !== expected) fail(label + '与原来源含义不一致。'); };
const require = (condition,label) => { if (!condition) fail(label + '无效。'); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value,label) => { require(record(value),label); return value; };
function setEqual(actual,expected,label) {
  require(Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length
    && actual.every(value => expected.includes(value)),label + '完整唯一集合');
}
function number(value,label) {
  require(typeof value === 'string' && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value),label + '原数值字符串');
  const result = Number(value); require(Number.isFinite(result),label + '有限数值'); return result;
}
function integer(value,label) {
  require(typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value),label + '原整数字符串');
  const result = Number(value); require(Number.isSafeInteger(result),label); return result;
}
function pythonBoolean(value,label) {
  require(value === 'True' || value === 'False',label + '必须保留显式 True/False 字符串');
  return value === 'True';
}
function close(actual,expected,label) {
  require(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= TOLERANCE_M,label + '源数值一致性');
}
function blank(row,fields,label) { for (const field of fields) expect(row[field],'',label + '.' + field + '未知空值'); }
function arrayCell(value,label) {
  let parsed; try { parsed = JSON.parse(value); } catch { fail(label + '原 JSON 单元无法读取。'); }
  require(Array.isArray(parsed) && parsed.every(v => typeof v === 'string') && new Set(parsed).size === parsed.length,label + '原唯一字符串列表');
  return parsed;
}
function csv(view,path,fields,count,key) {
  const table = object(view.files[path],path);
  require(Array.isArray(table.fields) && table.fields.length === fields.length && table.fields.every((f,i) => f === fields[i]),path + '全字段及原顺序');
  require(Array.isArray(table.rows) && table.rows.length === count,path + '完整行数');
  const rows = table.rows.map(cells => {
    require(Array.isArray(cells) && cells.length === fields.length && cells.every(c => typeof c === 'string'),path + '全单元原字符串');
    return Object.fromEntries(fields.map((field,i) => [field,cells[i]]));
  });
  require(rows.every(row => row[key] !== '') && new Set(rows.map(row => row[key])).size === count,path + '主键');
  return rows;
}
function sourceIndex(view) {
  object(view,'view'); object(view.files,'原文件视图'); require(Array.isArray(view.sources),'来源列表');
  setEqual(view.sources.map(s => s?.path),ROAD_SOURCE_PATHS,'9份来源');
  setEqual(Object.keys(view.files),ROAD_SOURCE_PATHS,'9份完整解码文件');
  const index = new Map();
  for (const s of view.sources) {
    object(s,'来源元数据'); const fingerprint = SOURCE_FINGERPRINTS[s.path.slice(PREFIX.length)];
    expect(s.bytes,fingerprint[0],s.path + '原字节长度'); expect(s.sha256,fingerprint[1],s.path + '版本 SHA'); index.set(s.path,s);
  }
  for (const name of ['README.md','独立回读核查.py','生成源几何诊断.py']) require(typeof view.files[PREFIX + name] === 'string',name + '原 text');
  return index;
}
function wktPair(value,type,label) {
  const expression = type === 'LineString' ? /^LINESTRING \(([^(),]+), ([^(),]+)\)$/ : /^POINT \(([^(),]+)\)$/;
  const match = expression.exec(value); require(match,label + '原 WKT');
  return match.slice(1).map(pair => { const cells = pair.trim().split(/\s+/); require(cells.length === 2,label); return cells.map(c => number(c,label)); });
}
const inside = xy => xy[0] >= BOUNDS[0] && xy[0] <= BOUNDS[2] && xy[1] >= BOUNDS[1] && xy[1] <= BOUNDS[3];
// Only verify the saved intersection measure; never emit clipped or split geometry.
function contextLength(a,b,length) {
  let lower = 0, upper = 1;
  for (let axis = 0; axis < 2; axis++) {
    const delta = b[axis] - a[axis];
    if (delta === 0) { if (a[axis] < BOUNDS[axis] || a[axis] > BOUNDS[axis+2]) return 0; }
    else { const first = (BOUNDS[axis] - a[axis]) / delta, second = (BOUNDS[axis+2] - a[axis]) / delta;
      lower = Math.max(lower,Math.min(first,second)); upper = Math.min(upper,Math.max(first,second)); }
  }
  return Math.max(0,upper-lower) * length;
}
function pointSegmentDistance(p,a,b) {
  const dx = b[0]-a[0], dy = b[1]-a[1];
  const fraction = Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p[0]-a[0]-fraction*dx,p[1]-a[1]-fraction*dy);
}
function segmentsIntersect(a,b,c,d) {
  const cross = (p,q,r) => (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const orientations = [cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b)];
  if (orientations[0]*orientations[1] < 0 && orientations[2]*orientations[3] < 0) return true;
  return pointSegmentDistance(a,c,d) <= TOLERANCE_M || pointSegmentDistance(b,c,d) <= TOLERANCE_M
    || pointSegmentDistance(c,a,b) <= TOLERANCE_M || pointSegmentDistance(d,a,b) <= TOLERANCE_M;
}
const collection = features => ({type:'FeatureCollection',features});
const feature = (id,geometry,row,path,typed) => ({type:'Feature',id,geometry,properties:{...row,__source_path:path,__typed:typed}});

/** Synchronous, immutable semantic validation of the nine saved road-source files.
 * The caller must separately verify their actual byte hashes and archive CRCs.
 * Returned display coordinates are source coordinates or a CRS transform only.
 */
export function validateRoadSource(view) {
  const sources = sourceIndex(view);
  const nodes = csv(view,NODE_FILE,NODE_FIELDS,81,'node_key');
  const segments = csv(view,SEGMENT_FILE,SEGMENT_FIELDS,87,'segment_key');
  const pairs = csv(view,PAIR_FILE,PAIR_FIELDS,136,'relation_key');
  const relations = csv(view,RECEPTOR_FILE,RECEPTOR_FIELDS,102,'relation_key');
  const audit = object(view.files[AUDIT_FILE],'源几何核查');
  const independent = object(view.files[INDEPENDENT_FILE],'独立核查');
  expect(audit.schema_version,'source-reference-geometry-diagnostic-v0.1','诊断 schema');
  expect(audit.site_id,'E4125_N33891','来源场地'); expect(audit.source_support_id,'micro_preparation_500','500米来源窗');
  expect(audit.context_crs,'EPSG:32648','准备窗坐标系');
  require(Array.isArray(audit.context_bounds) && audit.context_bounds.every((n,i) => n === BOUNDS[i]) && audit.context_bounds.length === 4,'准备窗原 bounds');
  expect(audit.context_area_m2,250000,'准备窗面积');
  expect(audit.source_time?.snapshot_timestamp_utc,'2021-01-01T21:42:03Z','原快照时点');
  expect(audit.source_time?.snapshot_basis,'prior_actual_PBF_header','原时点依据');
  expect(audit.source_time?.way_edit_time_is_not_snapshot,true,'最后编辑不可冒充快照');
  const declared = object(audit.summary,'源摘要');
  for (const [key,value] of Object.entries({source_ways:17,source_nodes:81,source_consecutive_segments:87,source_components:1,nodes_with_multiple_ways:22,source_shared_endpoint_pair_count:2,pair_relation_rows:136,receptor_relation_rows:102,public_walk_network_certified:null,routes_or_OD_or_service_computed:false})) expect(declared[key],value,'原摘要.' + key);
  expect(declared.source_component_node_counts?.source_component_01,81,'原分量节点数');
  expect(declared.full_way_pair_relation_counts?.shared_source_node,24,'原共节点对数');
  expect(declared.full_way_pair_relation_counts?.disjoint_in_source_plane,112,'原分离对数');
  for (const [key,value] of Object.entries({artifact:'source_diagnostic_saved',science:'not_assessed',walk_network:'not_certified',route_OD_service:'not_run',receptor_attachment:'not_accepted'})) expect(audit.states?.[key],value,'源声明.'+key);
  require(Array.isArray(audit.inputs) && audit.inputs.length === 7 && new Set(audit.inputs.map(s => s.path)).size === 7,'原7输入引用');
  for (const s of audit.inputs) require(typeof s.path === 'string' && hash(s.sha256_before) && s.sha256_before === s.sha256_after && Number.isSafeInteger(s.bytes) && s.bytes > 0,'原输入前后哈希声明');
  const pbf = audit.inputs.find(s => s.sha256_before === PBF_SHA), line = audit.inputs.find(s => s.sha256_before === LINE_SHA), receptor = audit.inputs.find(s => s.sha256_before === RECEPTOR_SHA);
  require(pbf && line && receptor,'三种独立原资产身份');
  require(Array.isArray(audit.outputs) && audit.outputs.length === 4,'原四 CSV 登记');
  for (const path of [NODE_FILE,SEGMENT_FILE,PAIR_FILE,RECEPTOR_FILE]) {
    const bound = audit.outputs.filter(o => o.path?.endsWith('/'+path)); expect(bound.length,1,'原 CSV 唯一引用');
    expect(bound[0].sha256,sources.get(path).sha256,path + '核查绑定'); expect(bound[0].rows,view.files[path].rows.length,path + '原输出行数');
  }
  const sourceChecks = object(audit.source_preparation_checks,'来源检查');
  require(Object.keys(sourceChecks).length === 8 && Object.values(sourceChecks).every(v => v === true),'原8项来源检查');
  expect(independent.source_manifest_sha256,sources.get(AUDIT_FILE).sha256,'独立核查所指版本');
  expect(independent.all_passed,true,'独立回读状态');
  const checks = object(independent.checks,'独立检查');
  require(Object.keys(checks).length === 14 && Object.values(checks).every(v => v === true),'实际保存的14项独立检查');
  expect(independent.independent_component_algorithm,'union_find_not_generator_BFS','原独立分量方法');
  for (const [key,value] of Object.entries({nodes:81,segments:87,way_pairs:136,receptor_pairs:102})) expect(independent.observed_counts?.[key],value,'独立计数.'+key);
  const notPerformed = ['road_repair','clipping_or_planar_noding','grade_imputation','public_rights_inference','receptor_snap_or_projection_attachment','width_speed_time_imputation','shortest_path','OD','thermal_service','model_Y_or_weights_read'];
  require(Array.isArray(audit.not_performed) && notPerformed.every(v => audit.not_performed.includes(v)),'原未执行边界');

  const nodeMap = new Map(), wayMap = new Map(WAY_IDS.map(id => [WAY_NAMESPACE+'/'+id,{id,key:WAY_NAMESPACE+'/'+id,segments:[],nodes:[],endpoints:[],pairs:[],receptor_relations:[]}]));
  for (const row of nodes) {
    expect(row.source_pbf_sha256,PBF_SHA,'节点 PBF 来源'); expect(row.source_pbf_path,pbf.path,'节点原 PBF 路径');
    require(/^\d+$/.test(row.source_osm_node_id),'原 OSM 节点 ID'); expect(row.node_key,NODE_NAMESPACE+'/'+row.source_osm_node_id,'完整节点身份');
    expect(row.source_crs,'EPSG:4326','节点源坐标系'); expect(row.measurement_crs,'EPSG:32648','节点量测坐标系');
    const lonLat = [number(row.source_lon,'节点经度'),number(row.source_lat,'节点纬度')], xy = [number(row.x_m,'节点x'),number(row.y_m,'节点y')];
    require(lonLat[0] >= 102 && lonLat[0] <= 108 && lonLat[1] >= 0 && lonLat[1] < 84,'节点原经纬度');
    const projected = proj4('EPSG:4326','EPSG:32648',lonLat); xy.forEach((n,i) => close(n,projected[i],'节点原双坐标'));
    expect(pythonBoolean(row.inside_or_on_context,'窗内节点'),inside(xy),'源窗节点判断');
    require(integer(row.pbf_node_version,'原节点版本') > 0 && Number.isFinite(Date.parse(row.node_last_edit_time_utc)) && Date.parse(row.node_last_edit_time_utc) <= Date.parse(audit.source_time.snapshot_timestamp_utc),'原节点编辑时间/版本（非观测时点）');
    expect(row.source_component_id,'source_component_01','节点来源分量'); expect(row.coordinate_consistency,'all_occurrences_exact_and_actual_PBF_coordinate_match','原坐标一致性声明');
    blank(row,['public_walk_node_verified','grade_or_junction_verified'],'节点'); expect(row.service_node_state,'not_certified','节点服务状态');
    nodeMap.set(row.node_key,{row,xy,lonLat,segments:[],ways:new Set(),neighbors:new Set(),endpoints:new Set()});
  }
  for (const row of segments) {
    const way = wayMap.get(row.source_way_key), from = nodeMap.get(row.from_node_key), to = nodeMap.get(row.to_node_key);
    require(way && from && to && from !== to,'原段完整主外键'); expect(row.source_feature_id,way.id,'原段源线 ID');
    const index = integer(row.source_segment_index_0based,'原段序号'); expect(row.segment_key,way.key+'/source_segment/'+index,'完整原段身份');
    expect(integer(row.from_vertex_index_0based,'from序号'),index,'原相邻 from 序号'); expect(integer(row.to_vertex_index_0based,'to序号'),index+1,'原相邻 to 序号');
    expect(row.from_osm_node_id,from.row.source_osm_node_id,'from原节点'); expect(row.to_osm_node_id,to.row.source_osm_node_id,'to原节点');
    expect(row.geometry_crs,'EPSG:32648','原段 WKT 坐标系');
    const coordinates = wktPair(row.geometry_wkt,'LineString','原相邻段');
    coordinates.forEach((point,i) => point.forEach((n,j) => close(n,[from.xy,to.xy][i][j],'原 WKT 端点')));
    const length = number(row.source_segment_length_m,'原段长度'); require(length > 0,'原段正长度'); close(length,Math.hypot(to.xy[0]-from.xy[0],to.xy[1]-from.xy[1]),'原段平面长度');
    const windowLength = number(row.context_positive_intersection_length_m,'原段窗内长度'); close(windowLength,contextLength(from.xy,to.xy,length),'原段窗交长度');
    expect(row.geometry_scope,'full_source_consecutive_vertices_no_clip_no_split_no_snap','原段几何保留'); expect(pythonBoolean(row.source_ref_adjacency,'原引用相邻'),true,'原段引用相邻');
    blank(row,['bridge_raw','tunnel_raw','layer_raw','legal_walk_connection','travel_time_min','route_cost'],'原段'); expect(row.legal_walk_connection_state,'unverified','原段合法通行状态');
    expect(row.source_component_id,'source_component_01','原段来源分量'); require(['footway','residential','tertiary','unclassified'].includes(row.highway_raw),'原 highway 标签');
    expect(row.foot_raw,way.id === 'w587601045' ? 'yes' : '','原 foot 标签'); expect(row.access_raw,way.id === 'w587601045' ? 'no' : '','原 access 标签');
    const value = {row,index,from,to,length,windowLength}; way.segments.push(value);
    from.segments.push(row); to.segments.push(row); from.ways.add(way.id); to.ways.add(way.id); from.neighbors.add(row.to_node_key); to.neighbors.add(row.from_node_key);
  }
  for (const way of wayMap.values()) {
    require(way.segments.length > 0,'17条完整源线'); way.segments.sort((a,b) => a.index-b.index);
    way.segments.forEach((s,i) => { expect(s.index,i,'完整原段连续序号'); if (i) expect(s.row.from_node_key,way.segments[i-1].row.to_node_key,'原way相邻引用链'); });
    way.nodes = [way.segments[0].from,...way.segments.map(s => s.to)]; way.endpoints = [way.nodes[0],way.nodes.at(-1)];
    way.endpoints.forEach(n => n.endpoints.add(way.id));
    require(new Set(way.segments.map(s => s.row.highway_raw)).size === 1,'同源线 highway 原标签');
  }
  for (const value of nodeMap.values()) {
    setEqual(arrayCell(value.row.source_ways_json,'节点原线引用'),[...value.ways],'节点所引用完整原线');
    setEqual(arrayCell(value.row.way_endpoint_of_json,'节点端点身份'),[...value.endpoints],'节点原端点身份');
    expect(integer(value.row.source_way_incidence_count,'节点原线次数'),value.ways.size,'节点源线引用次数');
    expect(integer(value.row.source_segment_incidence_count,'节点原段次数'),value.segments.length,'节点原段引用次数');
    expect(integer(value.row.distinct_source_node_neighbor_count,'节点邻接次数'),value.neighbors.size,'节点原引用邻居次数');
  }
  const visited = new Set(), pending = [nodes[0].node_key];
  while (pending.length) { const key = pending.pop(); if (visited.has(key)) continue; visited.add(key); pending.push(...nodeMap.get(key).neighbors); }
  expect(visited.size,81,'完整源引用唯一分量');
  expect(nodes.filter(n => pythonBoolean(n.inside_or_on_context,'窗内节点')).length,31,'窗内或边界31节点');
  expect(segments.filter(s => number(s.context_positive_intersection_length_m,'窗交长度') > 0).length,45,'45个正长度窗交原段');
  expect([...nodeMap.values()].filter(n => n.ways.size > 1).length,22,'22个多way原引用节点');

  let sharedCount = 0, endpointPairs = 0, contextPairs = 0;
  const pairKeys = new Set();
  for (const row of pairs) {
    const left = wayMap.get(row.left_way_key), right = wayMap.get(row.right_way_key);
    require(left && right && left.key < right.key,'源线对完整外键与顺序');
    expect(row.relation_key,left.key+'|'+right.key,'完整源线对身份'); pairKeys.add(row.relation_key);
    expect(row.left_source_feature_id,left.id,'左原线 ID'); expect(row.right_source_feature_id,right.id,'右原线 ID');
    const sharedNodes = [...new Set(left.nodes.filter(n => right.nodes.includes(n)))];
    const sharedIds = sharedNodes.map(n => n.row.source_osm_node_id), commonEndpoints = left.endpoints.filter(n => right.endpoints.includes(n)).map(n => n.row.source_osm_node_id);
    setEqual(arrayCell(row.shared_osm_node_ids_json,'共节点 ID'),sharedIds,'完整共源节点集');
    setEqual(arrayCell(row.endpoint_endpoint_shared_ids_json,'端点共节点'),commonEndpoints,'完整共端点集');
    setEqual(arrayCell(row.shared_nodes_inside_context_json,'窗内共节点'),sharedNodes.filter(n => inside(n.xy)).map(n => n.row.source_osm_node_id),'窗内共节点集');
    expect(integer(row.shared_source_node_count,'共节点数'),sharedIds.length,'源线共节点数'); require(sharedIds.length <= 1,'当前源对单一共同节点');
    const joined = sharedIds.length > 0;
    expect(row.relation_kind,joined ? 'shared_source_node' : 'disjoint_in_source_plane','源线关系');
    for (const field of ['geometry_intersects','source_reference_graph_adjacency']) expect(pythonBoolean(row[field],field),joined,'源线关系.'+field);
    expect(pythonBoolean(row.planar_intersection_auto_connected,'平面自动接通'),false,'不得自动几何接通');
    expect(row.intersection_crs,'EPSG:32648','源线交集坐标系'); close(number(row.intersection_length_m,'交集长度'),0,'原点交集长度');
    if (joined) {
      expect(row.intersection_geometry_type,'Point','源点交集类型'); wktPair(row.intersection_wkt,'Point','源点交集')[0].forEach((v,i) => close(v,sharedNodes[0].xy[i],'原点交集坐标')); sharedCount++;
    } else { expect(row.intersection_geometry_type,'LineString','空源交集原类型'); expect(row.intersection_wkt,'','空源交集原值'); }
    const touches = sharedNodes.some(n => inside(n.xy)); expect(pythonBoolean(row.intersection_hits_context,'交集触窗'),touches,'原交集触窗'); if (touches) contextPairs++;
    if (commonEndpoints.length) endpointPairs++;
    // Check the source plane without adding intersection nodes or graph edges.
    const actualIntersects = left.segments.some(a => right.segments.some(b => segmentsIntersect(a.from.xy,a.to.xy,b.from.xy,b.to.xy)));
    expect(actualIntersects,joined,'完整原线的源平面交集');
    blank(row,['left_bridge_raw','right_bridge_raw','left_tunnel_raw','right_tunnel_raw','left_layer_raw','right_layer_raw','same_grade_or_legal_crossing_verified','verified_public_connection'],'线对');
    expect(row.grade_state,'unknown_tags_missing_no_planar_noding','原同层级缺项'); left.pairs.push(row); right.pairs.push(row);
  }
  const allWays = [...wayMap.values()];
  allWays.forEach((left,i) => allWays.slice(i+1).forEach(right => require(pairKeys.has(left.key+'|'+right.key),'全136源线对覆盖')));
  expect(sharedCount,24,'24共节点对'); expect(pairs.length-sharedCount,112,'112源平面分离对'); expect(endpointPairs,2,'2共端点对'); expect(contextPairs,21,'21对交集触窗');

  require(Array.isArray(audit.receptor_planar_diagnostics) && audit.receptor_planar_diagnostics.length === 6,'原六受体诊断');
  setEqual(audit.receptor_planar_diagnostics.map(r => r.receptor_id),RECEPTOR_IDS,'六受体诊断身份');
  const receptorMap = new Map();
  for (const row of relations) {
    require(RECEPTOR_IDS.includes(row.receptor_id),'原候选受体 ID'); expect(row.receptor_key,RECEPTOR_NAMESPACE+'/'+row.receptor_id,'受体独立资产/图层身份');
    expect(row.receptor_asset_sha256,RECEPTOR_SHA,'受体源 GPKG'); expect(row.receptor_asset_path,receptor.path,'受体原资产路径'); expect(row.receptor_layer,'receptor_candidates','受体原层');
    const way = wayMap.get(row.source_way_key); require(way,'受体对原线外键'); expect(row.source_feature_id,way.id,'受体对原线 ID');
    expect(row.relation_key,row.receptor_key+'|'+way.key,'完整受体关系身份'); expect(row.measurement_crs,'EPSG:32648','受体量测坐标系');
    const xy = [number(row.receptor_x_m,'受体原x'),number(row.receptor_y_m,'受体原y')];
    let saved = receptorMap.get(row.receptor_key);
    if (!saved) { saved = {id:row.receptor_id,key:row.receptor_key,xy,rows:[],distances:[]}; receptorMap.set(row.receptor_key,saved); }
    else xy.forEach((v,i) => expect(v,saved.xy[i],'受体重复坐标原值'));
    for (const field of ['point_intersects_full_source_line_exact','point_position_confirmed','graph_attachment_accepted']) expect(pythonBoolean(row[field],field),false,'受体未确认/未接纳.'+field);
    blank(row,['role_public_destination','role_resident_origin','graph_attachment_node_key','entrance_id','legal_access','stay_permission','opening_time','route_distance_m','travel_time_min','service_value'],'受体');
    expect(row.distance_semantics,'recorded_geometry_separation_not_walk_distance_access_or_snap','源平面距离语义');
    const distance = number(row.source_planar_point_line_distance_m,'原受体平面间距'); require(distance > 0,'原点未相交的正间距');
    close(distance,Math.min(...way.segments.map(s => pointSegmentDistance(xy,s.from.xy,s.to.xy))),'原102点线距离');
    saved.rows.push(row); saved.distances.push(distance); way.receptor_relations.push(row);
  }
  expect(receptorMap.size,6,'完整六受体');
  const minimums = [];
  for (const value of receptorMap.values()) {
    setEqual(value.rows.map(r => r.source_way_key),[...wayMap.keys()],'每受体全部17线');
    const minimum = Math.min(...value.distances), nearest = value.rows.filter((r,i) => value.distances[i] === minimum).map(r => r.source_feature_id);
    expect(minimum.toFixed(2),EXPECTED_MINIMUMS[value.id],'原六最小平面间距显示值');
    const declaredMinimum = audit.receptor_planar_diagnostics.find(r => r.receptor_id === value.id);
    expect(declaredMinimum.receptor_key,value.key,'最小诊断独立身份'); close(declaredMinimum.minimum_source_planar_distance_m,minimum,'原最小距离诊断');
    setEqual(declaredMinimum.nearest_held_line_ids,nearest,'原最近持有线'); expect(declaredMinimum.intersects_any_held_line_exact,false,'原受体不相交声明'); expect(declaredMinimum.graph_attachment_accepted,false,'原受体未接纳声明');
    minimums.push({receptor_key:value.key,receptor_id:value.id,minimum_source_planar_distance_m:minimum,display_distance_m:minimum.toFixed(2),nearest_held_line_ids:nearest,distance_semantics:'recorded_geometry_separation_not_walk_distance_access_or_snap'});
  }
  expect(audit.tag_exception_preserved?.way_id,'w587601045','原权限例外身份'); expect(audit.tag_exception_preserved?.foot_raw,'yes','例外 foot'); expect(audit.tag_exception_preserved?.access_raw,'no','例外 access'); expect(audit.tag_exception_preserved?.legal_public_access,null,'例外公共权限未知');

  const nodeFeatures = [...nodeMap.values()].map(n => feature(n.row.node_key,{type:'Point',coordinates:n.lonLat},n.row,NODE_FILE,{inside_or_on_context:pythonBoolean(n.row.inside_or_on_context,'窗内显示'),public_walk_node_verified:null,grade_or_junction_verified:null}));
  const segmentFeatures = segments.map(row => feature(row.segment_key,{type:'LineString',coordinates:[nodeMap.get(row.from_node_key).lonLat,nodeMap.get(row.to_node_key).lonLat]},row,SEGMENT_FILE,{source_ref_adjacency:true,legal_walk_connection:null,bridge_raw:null,tunnel_raw:null,layer_raw:null,travel_time_min:null,route_cost:null}));
  const receptorFeatures = [...receptorMap.values()].map(r => feature(r.key,{type:'Point',coordinates:proj4('EPSG:32648','EPSG:4326',r.xy)},r.rows[0],RECEPTOR_FILE,{point_intersects_full_source_line_exact:false,point_position_confirmed:false,graph_attachment_accepted:false,role_public_destination:null,role_resident_origin:null,route_distance_m:null,travel_time_min:null,service_value:null}));
  const uniqueRows = rows => [...new Map(rows.map(r => [r.relation_key,r])).values()];
  const selectionLookup = {
    nodes:Object.fromEntries([...nodeMap.values()].map(n => [n.row.node_key,{source_row:n.row,segment_rows:n.segments,way_keys:[...n.ways].map(id => WAY_NAMESPACE+'/'+id),way_relation_rows:uniqueRows([...n.ways].flatMap(id => wayMap.get(WAY_NAMESPACE+'/'+id).pairs)),receptor_relation_rows:uniqueRows([...n.ways].flatMap(id => wayMap.get(WAY_NAMESPACE+'/'+id).receptor_relations))}])),
    segments:Object.fromEntries(segments.map(r => [r.segment_key,{source_row:r,from_node_row:nodeMap.get(r.from_node_key).row,to_node_row:nodeMap.get(r.to_node_key).row,way_relation_rows:wayMap.get(r.source_way_key).pairs,receptor_relation_rows:wayMap.get(r.source_way_key).receptor_relations}])),
    ways:Object.fromEntries([...wayMap.values()].map(w => [w.key,{source_feature_id:w.id,segment_rows:w.segments.map(s => s.row),node_rows:w.nodes.map(n => n.row),way_relation_rows:w.pairs,receptor_relation_rows:w.receptor_relations}])),
    receptors:Object.fromEntries([...receptorMap.values()].map(r => [r.key,{receptor_id:r.id,relation_rows:r.rows}])),
  };
  return {
    group_id:'road-source-connectivity',site_id:'E4125_N33891',scientific_adoption:'not_adopted',
    source_identity:{node_namespace:NODE_NAMESPACE,way_namespace:WAY_NAMESPACE,receptor_namespace:RECEPTOR_NAMESPACE,source_time:audit.source_time,source_inputs:audit.inputs,sources:view.sources},
    counts:{nodes:81,segments:87,ways:17,way_pairs:136,receptor_pairs:102,receptors:6,nodes_inside_or_on_context:31,segments_with_positive_context_length:45,source_components:1,shared_source_node_pairs:24,disjoint_in_source_plane_pairs:112,intersections_touching_context_pairs:21},
    source_states:audit.states,source_independent_verification:independent,source_planar_minimums:minimums,
    operation_gates:{prediction:false,physical_simulation:false,walk_network:false,routing:false,OD:false,service_evaluation:false,actual_use:false,fairness_evaluation:false,candidate_generation:false,ranking:false},
    unknown_values:{public_walk_network_certified:null,bridge:null,tunnel:null,layer:null,legal_walk_connection:null,receptor_attachment:null,role_public_destination:null,role_resident_origin:null,travel_time_min:null,route_cost:null,service_value:null},
    display_layers:{nodes:collection(nodeFeatures),segments:collection(segmentFeatures),receptors:collection(receptorFeatures)},
    display_geometry_scope:'81_original_nodes_87_original_consecutive_segments_six_candidate_points_no_snap_no_split_no_connection',
    display_coordinate_policy:'nodes_and_segment_endpoints_original_WGS84; receptors_source_EPSG32648_to_WGS84_display_transform_only; original_UTM_coordinates_and_WKT_preserved',
    selection_lookup:selectionLookup,
    software_validation_scope:'full_saved_keys_and_raw_cells_source_reference_adjacency_source_coordinate_and_measure_consistency_only; no_external_asset_reread_no_routing_no_scientific_adoption',
  };
}
