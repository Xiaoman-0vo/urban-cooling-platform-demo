import proj4 from 'proj4';
import {currentPilotProtection} from './protected-areas.js';
import {currentPilotPriority} from './priority-areas.js';
import {candidateEvaluationId} from './candidate-evaluation-state.js';

const UTM='+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs';
const WGS='EPSG:4326';

export function pilotBoxGeometry([x,y,X,Y]) {
  const ring=[[x,y],[X,y],[X,Y],[x,Y],[x,y]].map(point=>proj4(UTM,WGS,point));
  return {type:'Polygon',coordinates:[ring]};
}

export function pilotMapPoint(point) {
  return proj4(WGS,UTM,point).map(Math.round);
}

export function pilotBoxWithin(box,area) {
  return Array.isArray(box)&&box.length===4&&box.every(Number.isSafeInteger)&&
    box[0]<box[2]&&box[1]<box[3]&&box[0]>=area[0]&&box[1]>=area[1]&&box[2]<=area[2]&&box[3]<=area[3];
}

export function pilotGeoJson(scenarios) {
  return {type:'FeatureCollection',features:scenarios.filter(s=>s.kind==='mapped_pilot_option'&&s.geometry).map(s=>({
    type:'Feature',id:s.id,geometry:s.geometry,
    properties:{candidate_id:s.candidate_id,goal_version:s.goal_version,area_m2:s.added_green_area_m2,
      budget_rmb:s.budget_rmb,cost_rmb:s.estimated_construction_cost_rmb,
      comparison_status:s.comparison_status,review_status:s.review_status,source_review_id:s.source_review_id,
      pilot_sha256:s.pilot_sha256,prediction_status:s.prediction_status},
  }))};
}

export function pilotTemperatureGeoJson(scenarios) {
  return {type:'FeatureCollection',features:scenarios.map(({id,geometry,...record},index)=>({
    type:'Feature', id, geometry, properties:{...record,id,is_current:index===scenarios.length-1},
  }))};
}

export function temperatureReportScope(scenarios=[],protectionVersion=0,priorityVersion=0,searchId=null) {
  const latest=scenarios.at(-1);
  return {temperature_scenario_id:latest?.id??null,temperature_run_id:latest?.result?.run_id??null,protection_version:protectionVersion,priority_version:priorityVersion,spatial_search_id:searchId};
}

export function planningReportIsStale(report,session) {
  const {temperature_scenario_id,temperature_run_id}=temperatureReportScope(session.pilot_temperature_scenarios);
  return report.goal_version!==session.goal.version||(report.protection_version??0)!==currentPilotProtection(session).version||
    (report.priority_version??0)!==currentPilotPriority(session).version||
    (report.spatial_search_id??null)!==(session.pilot_searches?.at(-1)?.id??null)||
    (report.temperature_scenario_id??null)!==temperature_scenario_id||
    (report.temperature_run_id??null)!==temperature_run_id||
    (report.candidate_evaluation_id??null)!==candidateEvaluationId(session);
}
