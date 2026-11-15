import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import proj4 from 'proj4';
import {pilotPredictionCancelled,pilotPredictionRequested} from './goal-evidence.mjs';

const UTM='+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs';
const WGS='EPSG:4326';
const FILES={core:'micro_scene_core.geojson',surface:'micro_scene_surface_review_core.geojson',
  buildings:'micro_scene_buildings_uncut.geojson',green:'micro_scene_vegetation_core.geojson',
  roads2020:'micro_roads_roads_2020.geojson',roads2021:'micro_roads_roads_2021.geojson'};
const outstanding=['用地权属和管控红线','道路宽度、边缘及现况','现场可改范围和植栽适宜性'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const project=line=>line.map(point=>proj4(WGS,UTM,point.slice(0,2)));

function projectGeometry(geometry) {
  const {type,coordinates}=geometry;
  if(type==='Polygon')return {polygons:[coordinates.map(project)],lines:[]};
  if(type==='MultiPolygon')return {polygons:coordinates.map(polygon=>polygon.map(project)),lines:[]};
  if(type==='LineString')return {polygons:[],lines:[project(coordinates)]};
  if(type==='MultiLineString')return {polygons:[],lines:coordinates.map(project)};
  throw new Error('试点资料包含未支持的几何类型');
}

function segmentTouchesBox(a,b,box) {
  let start=0,end=1;
  for(let axis=0;axis<2;axis++) {
    const delta=b[axis]-a[axis];
    if(delta===0) {
      if(a[axis]<box[axis]||a[axis]>box[axis+2])return false;
    } else {
      const p=(box[axis]-a[axis])/delta,q=(box[axis+2]-a[axis])/delta;
      start=Math.max(start,Math.min(p,q));end=Math.min(end,Math.max(p,q));
      if(start>end)return false;
    }
  }
  return true;
}

const edgesTouch=(line,box)=>line.some((point,i)=>i>0&&segmentTouchesBox(line[i-1],point,box));
function ringContains([x,y],ring) {
  let inside=false;
  for(let i=1;i<ring.length;i++) {
    const [ax,ay]=ring[i-1],[bx,by]=ring[i];
    if((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}
const polygonContains=(point,[outer,...holes])=>ringContains(point,outer)&&!holes.some(hole=>ringContains(point,hole));
const midpoint=([x,y,X,Y])=>[(x+X)/2,(y+Y)/2];
const within=(box,shape)=>shape.polygons.some(polygon=>polygonContains(midpoint(box),polygon)&&!polygon.some(ring=>edgesTouch(ring,box)));
const touches=(box,shape)=>shape.lines.some(line=>edgesTouch(line,box))||shape.polygons.some(polygon=>polygonContains(midpoint(box),polygon)||polygon.some(ring=>edgesTouch(ring,box)));

export async function readPilotSources(root) {
  const rows=await Promise.all(Object.entries(FILES).map(async ([key,name])=>{
    const path=`public/data/${name}`,bytes=await readFile(resolve(root,path));
    const {features}=JSON.parse(bytes);
    return [key,{path,sha256:hash(bytes),features:features.map(f=>({...projectGeometry(f.geometry),properties:f.properties}))}];
  }));
  return Object.fromEntries(rows);
}

export function checkPilotBox(box,reviewId,sources) {
  const review=sources.surface.features.find(f=>f.properties.review_id===reviewId);
  return {inside_grid:sources.core.features.some(shape=>within(box,shape)),
    inside_review_surface:Boolean(review&&within(box,review)),
    outside_saved_buildings:!sources.buildings.features.some(shape=>touches(box,shape)),
    outside_saved_green:!sources.green.features.some(shape=>touches(box,shape)),
    no_saved_road_centerline_crossing:![...sources.roads2020.features,...sources.roads2021.features].some(shape=>touches(box,shape))};
}

export async function loadPlanningPilot(root,scene) {
  let bytes;
  try{bytes=await readFile(resolve(root,'public/data/planning-pilot.json'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  const seed=JSON.parse(bytes),sources=await readPilotSources(root);
  if(seed.site_id!==scene.site_id||seed.scenario_id!==scene.scenario_id)throw new Error('试点与样例基线不一致');
  const references=Object.values(sources).map(({path,sha256})=>({path,sha256}));
  const candidates=seed.candidates.map(({id,review_id,bounds_utm:box})=>{
    if(box.length!==4||!box.every(Number.isSafeInteger)||box[0]>=box[2]||box[1]>=box[3])throw new Error('试点矩形坐标无效');
    const checks=checkPilotBox(box,review_id,sources);
    if(Object.values(checks).some(ok=>!ok))throw new Error(`试点 ${id} 未通过来源几何检查`);
    const [x,y,X,Y]=box;
    const ring=[[x,y],[X,y],[X,Y],[x,Y],[x,y]].map(point=>proj4(UTM,WGS,point));
    return {id,review_id,area_m2:(X-x)*(Y-y),bounds_utm:box,checks,
      geometry:{type:'Polygon',coordinates:[ring]},review_status:'pending_team_review'};
  });
  return {id:seed.id,site_id:seed.site_id,scenario_id:seed.scenario_id,
    sha256:hash(JSON.stringify([hash(bytes),references])),measurement_crs:'EPSG:32648',
    review_status:'pending_team_review',outstanding,references,candidates};
}

export function pilotOptions(session) {
  const {goal,pilot}=session;
  return pilot.candidates.map(candidate=>{
    const rawCost=candidate.area_m2*goal.unit_cost_rmb_per_m2;
    const cost=Math.round(rawCost*100)/100;
    const capacity=goal.candidate_area_m2==null||candidate.area_m2<=goal.candidate_area_m2;
    const budget=rawCost<=goal.budget_rmb;
    return {kind:'mapped_pilot_option',candidate_id:candidate.id,title:`候选 ${candidate.id}`,
      added_green_area_m2:candidate.area_m2,estimated_construction_cost_rmb:cost,
      budget_check_passed:budget,capacity_check_passed:capacity,
      comparison_status:budget&&capacity?'within_declared_limits':'outside_declared_limits',
      geometry:structuredClone(candidate.geometry),spatial_checks:{...candidate.checks},
      review_status:candidate.review_status,source_review_id:candidate.review_id};
  });
}

function limitsLabel(option) {
  const limits=[];
  if(!option.budget_check_passed)limits.push('超预算');
  if(!option.capacity_check_passed)limits.push('超声明面积');
  return limits.length?limits.join('、'):'预算及面积条件通过';
}

export function summarizePilotTurn(session,runId,text) {
  if(!session.pilot)return null;
  const traces=session.traces.filter(t=>t.turn_id===runId&&t.result.status!=='rejected');
  const saved=traces.some(t=>t.tool==='set_planning_goal'&&t.result.status==='goal_draft_saved');
  const checks=traces.filter(t=>t.tool==='request_temperature_prediction');
  const compared=traces.some(t=>t.tool==='generate_scenario_options'||(!checks.length&&t.tool==='compare_scenario_options'));
  const current=session.scenarios.filter(s=>s.goal_version===session.goal.version);
  const parts=[];
  if(saved)parts.push(`已保存目标 v${session.goal.version}。`);
  if(saved||compared){
    const missing=[];
    if(session.goal.budget_rmb==null)missing.push('预算');
    if(session.goal.unit_cost_rmb_per_m2==null)missing.push('假设建设单价（元/㎡）');
    if(missing.length)parts.push(`请补充${missing.join('和')}。`);
    if(compared&&current.length){
      for(const option of current)parts.push(`候选 ${option.candidate_id} 面积 ${option.added_green_area_m2}㎡，假设费用 ${option.estimated_construction_cost_rmb} 元，${limitsLabel(option)}。`);
      if(session.scenarios.length>current.length)parts.push('旧版草案和边界已保留。');
      parts.push('候选范围的现场条件待核实。');
    }
  }
  for(const {result} of checks){
    const option=session.scenarios.find(s=>s.id===result.scenario_id);
    if(!option)continue;
    const label=`候选 ${option.candidate_id} v${option.goal_version}`;
    if(result.status==='not_connected')parts.push(`${label} 的温度服务未接通。`);
    if(result.status==='stale_scenario')parts.push(`${label} 是旧版草案，请选择当前版本。`);
    if(result.status==='candidate_blocked')parts.push(`${label} ${limitsLabel(option)}。`);
  }
  if(checks.length)parts.push('温度预测未执行。');
  else if(pilotPredictionCancelled(text))parts.push('本轮按要求未发起预测检查。');
  else if(pilotPredictionRequested(text))parts.push('当前没有匹配的候选草案可供检查，温度预测未执行。');
  if(traces.some(t=>t.tool==='export_planning_report'&&t.result.status==='report_created'))parts.push('已保存本轮对照报告。');
  return parts.length?parts.join(''):null;
}
