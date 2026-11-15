export function pilotGeoJson(scenarios) {
  return {type:'FeatureCollection',features:scenarios.filter(s=>s.kind==='mapped_pilot_option'&&s.geometry).map(s=>({
    type:'Feature',id:s.id,geometry:s.geometry,
    properties:{candidate_id:s.candidate_id,goal_version:s.goal_version,area_m2:s.added_green_area_m2,
      budget_rmb:s.budget_rmb,cost_rmb:s.estimated_construction_cost_rmb,
      comparison_status:s.comparison_status,review_status:s.review_status,source_review_id:s.source_review_id,
      pilot_sha256:s.pilot_sha256,prediction_status:s.prediction_status},
  }))};
}
