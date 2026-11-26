/** Read-only display summaries. These values do not run or admit a model. */
export const GRID_ROLES = [
  {key:'inside_full', name:'完整内格', color:'#65d9bd'},
  {key:'boundary_intersect', name:'边界相交格', color:'#efc483'},
  {key:'outer_context', name:'外围上下文格', color:'#7296ba'},
];

/** Keep absent, empty and non-finite source values distinct from a true zero. */
export function sourceNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Summarize one source's own denominator; never merge products or fill gaps. */
export function sourceCoverage(source) {
  const totals = source?.totals;
  const total = sourceNumber(totals?.pixels_inside_navigation_city);
  const known = sourceNumber(totals?.known_pixels);
  const green = sourceNumber(totals?.green_pixels);
  const missing = sourceNumber(totals?.unknown_or_nodata_pixels);
  const consistent = total !== null && known !== null && green !== null && missing !== null
    && known + missing === total && green <= known;
  return {
    total, known, green, missing,
    greenShare: consistent && known > 0 ? green / known : null,
    knownShare: consistent && total > 0 ? known / total : null,
    parts: consistent ? [green, known - green, missing] : null,
  };
}

/** Counts refer to the loaded grid records, including boundary and context cells. */
export function overviewSummary(data) {
  const features = data?.nodes?.features ?? [];
  const knownRoles = new Set(GRID_ROLES.map(role => role.key));
  const roles = GRID_ROLES.map(role => ({...role,
    value:features.filter(feature => feature.properties?.role === role.key).length,
  }));
  const unknown = features.filter(feature => !knownRoles.has(feature.properties?.role)).length;
  if (unknown) roles.push({key:'unknown',name:'未标明角色',color:'#a7aeb7',value:unknown});
  return {
    gridRecords:features.length,
    roles,
    receiverRecords:features.filter(feature => feature.properties?.receiver_candidate === true).length,
    areaKm2:sourceNumber(data?.studyBoundary?.features?.[0]?.properties?.area_km2_epsg32648),
    edges:sourceNumber(data?.scene?.counts?.macro_edges),
    clcd:sourceCoverage(data?.cityContext?.sources?.CLCD_2020),
    ubgg:sourceCoverage(data?.cityContext?.sources?.UBGG_3m),
  };
}
