import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// v6 ships a module worker plus its shared module. Serve the official, versioned
// files from this app: Vite's optimized dependency URL is not a worker asset,
// and a cross-origin worker would make MapLibre create a blob in embedded browsers.
const WORKER_PATH = `${import.meta.env.BASE_URL}maplibre/6.12.0/maplibre-gl-worker.mjs`;
const DEFAULT_CAMERA = { center: [103.943, 30.765], zoom: 8.6, pitch: 25, bearing: -12 };
const EMPTY = { type: 'FeatureCollection', features: [] };
const PREFIX = 'research-';
// Display emphasis only. These are not classification or scientific thresholds;
// every input point remains in the same source with its original G02 value.
export const GREEN_DISPLAY_RULES = Object.freeze({
  mediumHaloMinG02: 0.3, strongHaloMinG02: 0.5, breathingPeriodMs: 3000,
});
const GREEN_HALOS = ['halo', 'halo-strong', 'cluster-halo', 'point-halo'];
const GREEN_SOURCES = ['regional_green_points', 'city_green_points', 'urban_green_points'];
const CITY_EFFECT_SOURCES = ['city_effects', 'city_fx_boundary'];
const HALO_OPACITY_STOPS = {
  halo: [[4, 0.08, 0.16], [9, 0.1, 0.2], [11, 0.14, 0.28], [14, 0.1, 0.2], [18, 0.05, 0.1]],
  'halo-strong': [[4, 0.1, 0.2], [9, 0.14, 0.28], [11, 0.2, 0.4], [14, 0.16, 0.32], [16, 0.18, 0.36], [18, 0.15, 0.3]],
  'cluster-halo': [[4, 0.32, 0.78], [7, 0.3, 0.72], [9, 0.22, 0.44], [12, 0.18, 0.36], [18, 0.08, 0.16]],
  'cluster-ring': [[4, 0.2, 0.72], [7, 0.18, 0.65], [9, 0.08, 0.3], [10, 0.05, 0.2]],
  'point-halo': [[4, 0.025, 0.05], [9, 0.04, 0.08], [10, 0.08, 0.16], [12, 0.075, 0.15], [14, 0.08, 0.16], [16, 0.12, 0.24], [18, 0.15, 0.3], [20, 0.15, 0.3]],
};

/** Keep zoom at the top level, including during breathing paint updates. */
export function greenHaloOpacity(suffix, phase = 0.5) {
  return ['interpolate', ['linear'], ['zoom'], ...HALO_OPACITY_STOPS[suffix]
    .flatMap(([zoom, min, max]) => [zoom, min + phase * (max - min)])];
}

function greenRadius(radius) {
  return ['interpolate', ['linear'], ['zoom'], 4, ['*', radius, 0.3],
    7, ['*', radius, 0.45], 9, ['*', radius, 0.65],
    12, ['*', radius, 1.15], 14, ['*', radius, 1.25], 18, ['*', radius, 0.7]];
}

/** Animate original point halos without changing geometry or stable light cores. */
export function greenPointHaloRadius(suffix, phase = 0.5, field = 'G02') {
  const ratio = ['max', 0, ['min', 1, ['to-number', ['get', field], 0]]];
  const scale = 0.75 + phase * 0.5;
  let radius;
  if (suffix === 'point-halo') {
    radius = ['interpolate', ['linear'], ['zoom'], 4, 0.8, 7, ['+', 1, ['*', ratio, 0.8]],
      9, ['+', 1.8, ['*', ratio, 1]],
      10, ['+', ['*', ratio, 1.8], 2.4], 12, ['+', ['*', ratio, 1.8], 2.8],
      14, ['+', ['*', ratio, 1.8], 3.2], 18, ['+', ['*', ratio, 2], 6]];
  } else if (suffix === 'halo-strong') {
    radius = ['interpolate', ['linear'], ['zoom'],
      4, ['interpolate', ['linear'], ratio, 0.5, 0.7, 1, 1.1],
      7, ['interpolate', ['linear'], ratio, 0.5, 1, 1, 1.8],
      9, ['interpolate', ['linear'], ratio, 0.5, 1.9, 1, 2.7],
      12, ['interpolate', ['linear'], ratio, 0.5, 3.5, 1, 5.2],
      16, ['interpolate', ['linear'], ratio, 0.5, 5.5, 1, 9],
      18, ['interpolate', ['linear'], ratio, 0.5, 6, 1, 10]];
  } else {
    radius = greenRadius(['interpolate', ['linear'], ratio, 0.3, 1.7, 0.5, 2.5, 1, 3.5]);
  }
  // Zoom expressions must remain top-level, so scale each stop instead of
  // wrapping the whole expression in multiplication.
  return radius.map((value, index) => index >= 4 && index % 2 === 0 ? ['*', value, scale] : value);
}
const GREEN_CLUSTER_RADIUS = ['interpolate', ['linear'], ['to-number', ['get', 'point_count'], 2],
  2, 3, 25, 5, 200, 7, 1000, 9, 5868, 11];

/** Animated screen pixels only; this halo is never a geographic buffer or measurement. */
export function greenClusterHaloRadius(phase = 0.5, ring = false) {
  const far = ['*', ['+', GREEN_CLUSTER_RADIUS, ring ? 17 : 22], 0.8 + phase * 0.7];
  const city = ['*', ['+', GREEN_CLUSTER_RADIUS, ring ? 5 : 7], 0.9 + phase * 0.2];
  return ['interpolate', ['linear'], ['zoom'], 4, far, 7, far, 9, city, 12, city];
}

// Reuse the verified screen-light treatment while retaining different source
// fields. No broad-scale display share is written into an original G02 value.
function cityLightLayers(template, classificationSource) {
  const remap = value => Array.isArray(value) ? value.map(remap) : value && typeof value === 'object' ?
    Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remap(child)])) :
      value === 'G02' ? '__display_green_share' : value === '__display_g02_sum' ? '__display_green_sum' :
      value === '#effff7' || value === '#f3fff9' ? '#baffdf' : value;
  return template.map(({id, source, metadata, ...layer}) => ({
    ...remap(layer), id: id.slice(`${PREFIX}regional_green_points-`.length),
    metadata: { displayOnly: { purpose: 'classified_pixel_display_reference', classificationSource,
      metric: 'display_green_share_not_G02', countMeaning: 'source_display_blocks_not_green_spaces', scientificAdmission: false,
      radiusUnit: 'screen_pixels_not_geographic_buffer' } },
  }));
}

/** A moving decorative sweep in the city mask, with no changing geography. */
export function citySweepOpacity(progress = 0.5, grid = false) {
  const distance = ['abs', ['-', ['get', '__display_scan_position'], progress]];
  const cyclicDistance = ['min', distance, ['-', 1, distance]];
  const wave = ['max', 0, ['-', 1, ['/', cyclicDistance, grid ? 0.075 : 0.045]]];
  const value = amplitude => grid ? ['+', 0.1, ['*', wave, amplitude]] : ['*', wave, amplitude];
  return ['interpolate', ['linear'], ['zoom'],
    4, value(grid ? 0.5 : 0.11), 9, value(grid ? 0.65 : 0.2),
    12, value(grid ? 0.45 : 0.1), 16, value(grid ? 0.2 : 0.03), 20, value(grid ? 0.14 : 0.02)];
}
const HEIGHT = ['max', 0, ['to-number', ['coalesce',
  ['get', '__display_working_height_m'], ['get', 'height_m'], ['get', 'work_height_m'],
  ['get', 'Height_effective_working_m'], ['get', 'Height'], 0], 0]];

/** A source-free style: offline mode has no tiles, sprites, glyphs or terrain. */
export function localStyle() {
  return { version: 8, sources: {}, layers: [{
    id: 'local-background', type: 'background', paint: { 'background-color': '#07111a' },
  }] };
}

/** Standard OSM navigation tiles; viewport viewing only, with browser HTTP caching. */
export function osmNavigationStyle() {
  const style = localStyle();
  style.sources.osm = {
    type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256, maxzoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  };
  style.layers.push({
    id: 'osm-navigation', type: 'raster', source: 'osm', paint: {
      // MapLibre mixes these endpoints per RGB channel: reversed endpoints make
      // OSM's light background dark while keeping its text and roads readable.
      'raster-saturation': -0.85, 'raster-brightness-min': 0.56,
      'raster-brightness-max': 0.025, 'raster-contrast': 0.12,
      'raster-opacity': 0.7, 'raster-fade-duration': 0,
    },
  });
  return style;
}

function collection(value) {
  const data = value?.data ?? value;
  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) return data;
  if (data?.type === 'Feature') return { type: 'FeatureCollection', features: [data] };
  return EMPTY;
}

function coordinate(value) {
  const pair = Array.isArray(value) ? value : [value?.lng ?? value?.lon, value?.lat];
  if (pair.length < 2 || !pair.slice(0, 2).every(Number.isFinite)) return null;
  return Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 85.051129 ? pair.slice(0, 2) : null;
}

/** Preserve both snapshots when none, or an unknown snapshot, is selected. */
export function roadSnapshot(data, requested) {
  const labels = [...new Set(collection(data).features
    .map((feature) => feature.properties?.rr_snapshot_label)
    .filter((label) => label !== undefined && label !== null).map(String))];
  return { labels, selected: requested != null && labels.includes(String(requested)) ? String(requested) : null };
}

/** Build categorical input layers only; no generated trees, contours or heat output. */
export const GEOMETRY_SVF_STOPS = Object.freeze([[0, '#440154'], [0.25, '#3b528b'], [0.5, '#21918c'], [0.75, '#5ec962'], [1, '#fde725']]);
export function researchDescriptors({ sceneLayers = {}, regionalNodes, regionalGreenPoints, regionalRoads, cityGreenPoints, urbanGreenPoints, cityBoundary, cityEffects, browseRegion = '成都', provinceBoundary, provinceRivers, provincePlaces, studyBoundary, studyReferenceCenter, residenceCandidates, sourceReviewCollections = {}, geometryReviewCollections = {},
  center, stage = 'region', visible = {} }) {
  const items = [];
  const add = (key, data, layers, toggle = key) => {
    const active = visible[toggle] !== false && visible[key] !== false;
    items.push({ key, data: collection(data), layers: layers.map((layer) => ({
      ...layer, id: `${PREFIX}${key}-${layer.id}`, source: `${PREFIX}${key}`,
      metadata: { ...layer.metadata, researchLayerKey: key },
      layout: { ...layer.layout, visibility: active ? 'visible' : 'none' },
    })) });
  };
  const fill = (color, opacity) => ({ id: 'fill', type: 'fill', paint: {
    'fill-color': color, 'fill-opacity': opacity,
  } });
  const line = (color, width, dash) => ({ id: 'line', type: 'line', paint: {
    'line-color': color, 'line-width': width, ...(dash ? { 'line-dasharray': dash } : {}),
  } });

  // Generalized provincial navigation stays separate from the unsimplified
  // operational study polygon. Blue places do not represent green measurements.
  add('province_boundary', provinceBoundary, [{ ...fill('#194658', 0.14), paint: {
    'fill-color': '#194658', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.2, 8, 0.1, 11, 0],
  } }, { id: 'glow', type: 'line', paint: {
    'line-color': '#41c8e2', 'line-width': 9, 'line-blur': 5, 'line-opacity': 0.26,
  } }, { ...line('#63c9dc', 1.4), metadata: { navigationOnly: true }, paint: {
    'line-color': '#63c9dc', 'line-width': 1.4, 'line-opacity': 0.8,
  } }]);
  add('province_rivers', provinceRivers, [{ ...line('#38a7c5', 0.8), maxzoom: 10,
    metadata: { navigationOnly: true, physicalWaterMetric: false }, paint: {
      'line-color': '#38a7c5', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1.3], 'line-opacity': 0.55,
    } }]);
  add('province_places', provincePlaces, [{ id: 'halo', type: 'circle', maxzoom: 9, paint: {
    'circle-radius': 8, 'circle-color': '#70c7f5', 'circle-opacity': 0.18, 'circle-blur': 0.8,
  } }, { id: 'point', type: 'circle', maxzoom: 9,
    metadata: { navigationOnly: true, greenMeasurement: false, selectableSite: false }, paint: {
      'circle-radius': 2.2, 'circle-color': '#a1d9f5', 'circle-opacity': 0.86,
    } }]);
  if (browseRegion !== '四川') {
    for (const item of items.filter(item => item.key.startsWith('province_'))) {
      for (const layer of item.layers) layer.layout.visibility = 'none';
    }
  }
  add('city_boundary', cityBoundary, [{ ...fill('#1a3e38', 0.07), metadata: { navigationOnly: true, selectionBoundary: false } },
    { id: 'glow', type: 'line', paint: { 'line-color': '#57b8c8', 'line-width': 7, 'line-blur': 4, 'line-opacity': 0.3 } },
    line('#70c5d1', 1.1)]);
  const displayEffect = { displayOnly: { purpose: 'city_atmosphere', scientificAdmission: false,
    selectableSite: false, terrainOrRoadSource: false, researchGrid: false } };
  add('city_fx_boundary', cityBoundary, [{ ...fill('#21a787', 0.045), metadata: displayEffect, paint: {
    'fill-color': '#21a787', 'fill-opacity': 0.045, 'fill-opacity-transition': {duration:0,delay:0},
  } }, { id: 'glow', type: 'line', metadata: displayEffect, paint: {
    'line-color': '#69ffe0', 'line-width': 11, 'line-blur': 6, 'line-opacity': 0.4,
    'line-width-transition': {duration:0,delay:0}, 'line-opacity-transition': {duration:0,delay:0},
  } }, { ...line('#8dffdc', 1.8), metadata: displayEffect, paint: {
    'line-color': '#8dffdc', 'line-width': 1.8, 'line-opacity': 0.6,
    'line-opacity-transition': {duration:0,delay:0},
  } }], 'greenFx');
  add('city_effects', cityEffects, [{id:'scan',type:'fill',filter:['==',['get','__city_fx_kind'],'scan_band'],
    metadata: displayEffect,paint:{'fill-color':'#51ebcc','fill-opacity':citySweepOpacity(),
      'fill-opacity-transition':{duration:0,delay:0}}},
    {id:'grid-fine',type:'line',minzoom:10,filter:['==',['get','__city_fx_kind'],'grid_minor'],metadata:displayEffect,
      paint:{'line-color':'#328b90','line-width':0.55,'line-opacity':['interpolate',['linear'],['zoom'],10,0.04,12,0.18,16,0.08]}},
    {id:'grid-glow',type:'line',filter:['==',['get','__city_fx_kind'],'grid_major'],metadata:displayEffect,
      paint:{'line-color':'#48d9d0','line-width':4,'line-blur':2.5,'line-opacity':0.1}},
    {id:'grid',type:'line',filter:['==',['get','__city_fx_kind'],'grid_major'],metadata:displayEffect,
      paint:{'line-color':'#67dbcf','line-width':0.8,'line-opacity':citySweepOpacity(0.5,true),
        'line-opacity-transition':{duration:0,delay:0}}}], 'greenFx');

  add('regional', regionalNodes, [fill('#2a6170', 0.035), {
    ...line('#426f7c', ['interpolate', ['linear'], ['zoom'], 10, 0.15, 16, 0.7]),
    paint: { 'line-color': '#426f7c', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.15, 16, 0.7],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.12, 16, 0.5] },
  }]);
  // A controlled copy of historical source lines is a regional reference only.
  // Keep it separate from site roads and out of the object-picking priority.
  add('regional_roads', regionalRoads, [{
    id: 'line', type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': '#31aac4', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 14, 0.9],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.45, 14, 0.4, 18, 0.2],
    },
  }], 'greenFx');
  // Candidate green ratios describe existing macro input nodes, never heat output.
  // Use only supplied point geometry; no generated or randomly positioned lights.
  const ratio = ['max', 0, ['min', 1, ['to-number', ['get', 'G02'], 0]]];
  const rawPoint = ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'point_count']]];
  const clusterPoint = ['has', 'point_count'];
  const clusterRatio = ['max', 0, ['min', 1, ['/',
    ['to-number', ['get', '__display_g02_sum'], 0], ['max', 1, ['to-number', ['get', 'point_count'], 1]]]]];
  const clusterRadius = GREEN_CLUSTER_RADIUS;
  add('regional_green_points', regionalGreenPoints, [{
    id: 'cluster-halo', type: 'circle', filter: clusterPoint,
    metadata: { displayOnly: { purpose: 'source_point_display_aggregation', metric: 'mean_G02_for_color_only', animation: 'screen_radius_and_opacity', radiusUnit: 'screen_pixels_not_geographic_buffer' } },
    paint: {
      'circle-radius': greenClusterHaloRadius(),
      'circle-color': ['interpolate', ['linear'], clusterRatio, 0, '#20d98b', 0.5, '#78ffbc', 1, '#d5ffeb'],
      'circle-opacity': greenHaloOpacity('cluster-halo'), 'circle-blur': 0.7,
      'circle-opacity-transition': { duration: 0, delay: 0 },
      'circle-radius-transition': { duration: 0, delay: 0 },
    },
  }, {
    id: 'cluster-ring', type: 'circle', filter: clusterPoint,
    metadata: { displayOnly: { purpose: 'screen_space_breathing_reference', radiusUnit: 'screen_pixels_not_geographic_buffer' } },
    paint: {
      'circle-radius': greenClusterHaloRadius(0.5, true), 'circle-color': '#72ffc4', 'circle-opacity': 0,
      'circle-stroke-color': '#72ffc4', 'circle-stroke-width': 1.3,
      'circle-stroke-opacity': greenHaloOpacity('cluster-ring'), 'circle-blur': 0.12,
      'circle-radius-transition': { duration: 0, delay: 0 },
      'circle-stroke-opacity-transition': { duration: 0, delay: 0 },
    },
  }, {
    id: 'cluster', type: 'circle', filter: clusterPoint,
    metadata: { displayOnly: { purpose: 'source_point_display_aggregation', countMeaning: 'source_points_not_green_spaces', metric: 'mean_G02_for_color_only' } },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        4, ['+', 3, ['*', clusterRadius, 0.5]], 7, ['+', 3, ['*', clusterRadius, 0.5]],
        9, ['max', 2.6, ['*', clusterRadius, 0.55]], 12, ['max', 2.6, ['*', clusterRadius, 0.55]]],
      'circle-color': ['interpolate', ['linear'], clusterRatio, 0, '#55f6aa', 0.5, '#afffe0', 1, '#f3fff9'],
      'circle-opacity': 0.88, 'circle-blur': 0.22,
    },
  }, {
    id: 'point-halo', type: 'circle', filter: rawPoint,
    metadata: { displayOnly: { purpose: 'middle_and_near_scale_source_point_reference', animation: 'screen_radius_and_opacity', radiusUnit: 'screen_pixels_not_geographic_buffer' } },
    paint: {
      // Thin individual halos preserve the starfield at every scale.
      'circle-radius': greenPointHaloRadius('point-halo'),
      'circle-color': '#36efa3', 'circle-opacity': greenHaloOpacity('point-halo'), 'circle-blur': 0.65,
      'circle-opacity-transition': { duration: 0, delay: 0 },
      'circle-radius-transition': { duration: 0, delay: 0 },
    },
  }, {
    id: 'halo-strong', type: 'circle',
    filter: ['all', rawPoint, ['>=', ratio, GREEN_DISPLAY_RULES.strongHaloMinG02]],
    metadata: { displayOnly: { minG02: GREEN_DISPLAY_RULES.strongHaloMinG02, purpose: 'visual_emphasis', animation: 'screen_radius_and_opacity', radiusUnit: 'screen_pixels_not_geographic_buffer' } },
    paint: {
      'circle-radius': greenPointHaloRadius('halo-strong'),
      'circle-color': '#5cf9b3', 'circle-opacity': greenHaloOpacity('halo-strong'), 'circle-blur': 0.8,
      'circle-opacity-transition': { duration: 0, delay: 0 },
      'circle-radius-transition': { duration: 0, delay: 0 },
    },
  }, {
    id: 'halo', type: 'circle',
    filter: ['all', rawPoint, ['>=', ratio, GREEN_DISPLAY_RULES.mediumHaloMinG02]],
    metadata: { displayOnly: { minG02: GREEN_DISPLAY_RULES.mediumHaloMinG02, purpose: 'visual_emphasis', animation: 'screen_radius_and_opacity', radiusUnit: 'screen_pixels_not_geographic_buffer' } },
    paint: {
      'circle-radius': greenPointHaloRadius('halo'),
      'circle-color': '#2bea9b', 'circle-opacity': greenHaloOpacity('halo'), 'circle-blur': 0.65,
      'circle-opacity-transition': { duration: 0, delay: 0 },
      'circle-radius-transition': { duration: 0, delay: 0 },
    },
  }, {
    id: 'point', type: 'circle', filter: rawPoint, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        4, ['interpolate', ['linear'], ratio, 0, 0.32, 0.5, 0.42, 1, 0.55],
        6, ['interpolate', ['linear'], ratio, 0, 0.42, 0.5, 0.58, 1, 0.75],
        8.5, ['interpolate', ['linear'], ratio, 0, 0.6, 0.5, 0.8, 1, 1.1],
        10, ['interpolate', ['linear'], ratio, 0, 0.8, 0.3, 1.1, 0.5, 1.4, 1, 2.3],
        12, ['interpolate', ['linear'], ratio, 0, 0.9, 0.3, 1.2, 0.5, 1.5, 1, 2.3],
        16, ['interpolate', ['linear'], ratio, 0, 1.1, 0.5, 1.8, 1, 2.6],
        18, ['interpolate', ['linear'], ratio, 0, 1, 0.5, 1.9, 1, 3]],
      'circle-color': ['interpolate', ['linear'], ratio, 0, '#34d58c', 0.3, '#63ffb2', 0.5, '#adffdd', 1, '#effff7'],
      'circle-opacity': ['interpolate', ['linear'], ['zoom'],
        10, ['interpolate', ['linear'], ratio, 0, 0.62, 0.5, 0.9, 1, 0.98],
        12, ['interpolate', ['linear'], ratio, 0, 0.64, 0.5, 0.9, 1, 0.98],
        18, ['interpolate', ['linear'], ratio, 0, 0.6, 0.5, 0.8, 1, 0.95]],
      'circle-blur': 0.12,
    },
  }], 'greenFx');
  const greenItem = items.find((item) => item.key === 'regional_green_points');
  for (const layer of greenItem.layers) {
    // Screen pixels should remain screen pixels when the user tilts the view.
    // The default map pitch scaling makes distant points shrink away.
    layer.paint['circle-pitch-scale'] = 'viewport';
    layer.paint['circle-pitch-alignment'] = 'viewport';
  }
  // Keep every real source point at far zoom. Screen radii shrink continuously;
  // the city must never collapse into a handful of aggregate light bubbles.
  greenItem.sourceOptions = { cluster: false };
  for (const [key, data, source] of [
    ['city_green_points', cityGreenPoints, 'CLCD_2020'],
    ['urban_green_points', urbanGreenPoints, 'UBGG_3m'],
  ]) {
    add(key, data, cityLightLayers(greenItem.layers, source), 'greenFx');
    items.find(item => item.key === key).sourceOptions = { cluster: false };
  }
  add('class_surface', sceneLayers.class_surface, [{ ...fill('#334851', 0.26), paint: {
    'fill-color': ['match', ['to-string', ['coalesce', ['get', 'source_class'], ['get', 'class'], 'unknown']],
      '0', '#274c66', '1', '#334851', '2', '#1e654e', '3', '#477453', '4', '#79735b', '#46515d'],
    'fill-opacity': 0.26,
  } }], 'surface');
  add('hard_review', sceneLayers.hard_review, [fill('#7e8b94', 0.08), line('#7e8b94', 0.7, [2, 2])], 'review');
  add('overlap_review', sceneLayers.overlap_review, [fill('#e4ad69', 0.16), line('#e4ad69', 1, [2, 1])], 'review');
  add('buildings', sceneLayers.buildings, [fill('#758b99', 0.22), line('#91acb9', 1)], 'buildings');
  add('building_parts', sceneLayers.building_parts, [{
    id: 'extrusion', type: 'fill-extrusion', paint: {
      'fill-extrusion-color': '#779ba9', 'fill-extrusion-height': HEIGHT,
      'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.76,
    }, layout: { visibility: stage === 'site' ? 'visible' : 'none' },
  }], 'buildings');
  // Visibility is also a task rule: a toggle cannot enable region-stage extrusions.
  const parts = items.find((item) => item.key === 'building_parts');
  if (stage !== 'site') parts.layers[0].layout.visibility = 'none';
  // These full source polygons are publication-label candidates, with no
  // assigned population, service role or fairness outcome. Keep them separate
  // from the saved core scene and reveal them only in a matching adopted site.
  add('residence_candidates', residenceCandidates, [fill('#a593ce', 0.1),
    line('#c2a8ef', 2, [3, 1])], 'residenceCandidates');
  if (stage !== 'site') {
    for (const layer of items.find((item) => item.key === 'residence_candidates').layers) layer.layout.visibility = 'none';
  }
  add('vegetation', sceneLayers.vegetation, [fill('#37a978', 0.48), line('#79dfac', 1.05)]);
  const snapshot = roadSnapshot(sceneLayers.roads, visible.roads_snapshot);
  const roadLayer = { ...line('#85b8c3', 1.5), layout: { 'line-cap': 'round', 'line-join': 'round' } };
  if (snapshot.selected !== null) roadLayer.filter = ['==', ['to-string', ['get', 'rr_snapshot_label']], snapshot.selected];
  add('roads', sceneLayers.roads, [roadLayer]);
  add('receptors', sceneLayers.receptors, [{ id: 'point', type: 'circle', paint: {
    'circle-radius': 4.5, 'circle-color': '#d8e4ed', 'circle-stroke-color': '#567685', 'circle-stroke-width': 1.5,
  } }]);
  for (const [key, color, dash] of [
    ['context', '#9caebd', [4, 3]], ['macro_context300', '#47bbd1', [2, 2]], ['core', '#f1b756', null],
  ]) add(key, sceneLayers[key], [line(color, key === 'core' ? 2 : 1.2, dash)], 'bounds');
  add('study_boundary', studyBoundary, [{ ...fill('#45d9a1', 0.06), metadata: {
    selectionGate: { role: 'existing_operational_study_boundary', scientificAdmission: false },
  } }, { id: 'glow', type: 'line', paint: {
    'line-color': '#7ef1bf', 'line-width': 7, 'line-blur': 4, 'line-opacity': 0.28,
  } }, { ...line('#9ef7ce', 1.8), paint: {
    'line-color': '#9ef7ce', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.8, 13, 2.2],
    'line-opacity': 0.9,
  } }]);
  const studyPivot = coordinate(studyReferenceCenter);
  add('study_reference', studyPivot ? { type: 'FeatureCollection', features: [{
    type: 'Feature', properties: { role: 'screen_locator_for_study_boundary_not_geographic_buffer' },
    geometry: { type: 'Point', coordinates: studyPivot },
  }] } : EMPTY, [{ id: 'ring', type: 'circle', maxzoom: 10, metadata: {
    selectionGate: { role: 'display_navigation_to_study_boundary', radiusUnit: 'screen_pixels_not_research_area' },
  }, paint: {
    'circle-radius': 22, 'circle-color': '#77edbb', 'circle-opacity': 0,
    'circle-stroke-color': '#b8ffe0', 'circle-stroke-width': 1.3, 'circle-stroke-opacity': 0.65,
  } }]);
  // Source review is a separate display namespace. It never replaces the
  // research scene, assigns a surface, attaches receptors or creates routes.
  const sourceCategories = ['match', ['get', 'source_category'],
    'roof_and_hard_class', '#79a7df', 'roof_and_vegetation_class', '#f2b36d',
    'vegetation_without_roof', '#b2b8e8', 'hard_review_without_roof', '#aeb8c1', '#64717a'];
  add('source_cells', sourceReviewCollections.source_cells, [{ ...fill('#64717a', 0.4),
    paint: { 'fill-color': sourceCategories, 'fill-opacity': 0.4 },
    metadata: { sourceReview: { scientificAdoption: 'not_adopted', units: 'source_area_m2_in_EPSG32648', classification: 'four_source_coverage_categories' } },
  }, line('#d5e3ee', 1.3)]);
  add('source_partition_roads', sourceReviewCollections.source_partition_roads, [line('#f2b36d', 2.5)]);
  add('source_segments', sourceReviewCollections.source_segments, [line('#78b9ec', 2.7)]);
  add('source_nodes', sourceReviewCollections.source_nodes, [{ id: 'point', type: 'circle', paint: {
    'circle-radius': 4.2, 'circle-color': '#c7e9ff', 'circle-stroke-color': '#193c58', 'circle-stroke-width': 1.4,
  } }]);
  add('source_receptors', sourceReviewCollections.source_receptors, [{ id: 'point', type: 'circle', paint: {
    'circle-radius': 6, 'circle-color': '#f2b36d', 'circle-stroke-color': '#36271d', 'circle-stroke-width': 2,
  } }]);
  // The new geometry review namespace is independent of both the original
  // scene and the preceding source review. UI selections are display metadata,
  // never accepted physical heights, entrances, road connections or results.
  const selected = ['==', ['get', '__geometry_selected'], true];
  const componentColor = ['match', ['get', '__geometry_component'],
    'inside_component_01', '#81b9e8', 'inside_component_02', '#c1a0df',
    'outside_component_01', '#81b9e8', 'outside_component_02', '#c1a0df',
    'outside_component_03', '#e7bb86', 'outside_component_04', '#a7c6cd',
    'outside_component_05', '#be9c9f', 'outside_component_06', '#aab99c',
    'outside_component_07', '#e0ce9b', 'outside_component_08', '#b8b9d3',
    'full_partition_component_01', '#81b9e8', '#90a8b9'];
  add('geometry_buildings', geometryReviewCollections.geometry_buildings, [{ ...fill('#879fad', 0.2), paint: {
    'fill-color': ['case', selected, '#efc87d', '#879fad'], 'fill-opacity': ['case', selected, 0.36, 0.2],
  }, metadata: { geometryReview: { scope: 'complete_source_building_footprints', height: 'source_working_proxy_only', physicalSceneAdopted: false } } }, { ...line('#b0c5d1', 0.9), paint: {
    'line-color': ['case', selected, '#ffe1a4', '#b0c5d1'], 'line-width': ['case', selected, 2.8, 0.9],
  } }]);
  const svf = ['case', ['all', ['has', '__geometry_svf'], ['==', ['typeof', ['get', '__geometry_svf']], 'number']],
    ['interpolate', ['linear'], ['to-number', ['get', '__geometry_svf']], ...GEOMETRY_SVF_STOPS.flat()], '#7d8892'];
  add('geometry_receptors', geometryReviewCollections.geometry_receptors, [{ id: 'point', type: 'circle',
    metadata: { geometryReview: { metric: 'horizontal_building_SVF', fixedRange: [0, 1], unit: 'dimensionless', classification: 'continuous_shared_sequential', thermalComfortOrQualityJudgment: false, noDataColor: '#7d8892' } }, paint: {
      'circle-radius': ['case', selected, 8, 6], 'circle-color': svf,
      'circle-stroke-color': ['case', selected, '#fff2c1', '#d6e0e8'], 'circle-stroke-width': ['case', selected, 2.4, 1.4],
    } }]);
  for (const [key, dashed] of [['geometry_inside_fragments', false], ['geometry_outside_fragments', true]]) {
    add(key, geometryReviewCollections[key], [{ ...line('#81b9e8', 2.5, dashed ? [3, 1.5] : undefined),
      metadata: { geometryReview: { scope: 'saved_window_source_fragments', gradeOrPublicWalkConnectionAdopted: false } }, paint: {
        'line-color': ['case', selected, '#ffe1a4', componentColor], 'line-width': ['case', selected, 4, 2.5], ...(dashed ? { 'line-dasharray': [3, 1.5] } : {}),
      } }]);
  }
  add('geometry_original_nodes', geometryReviewCollections.geometry_original_nodes, [{ id: 'point', type: 'circle', paint: {
    'circle-radius': ['case', selected, 5.5, 3.2], 'circle-color': componentColor,
    'circle-stroke-color': ['case', selected, '#ffe1a4', '#163748'], 'circle-stroke-width': ['case', selected, 2, 1],
  } }]);
  add('geometry_boundary_cuts', geometryReviewCollections.geometry_boundary_cuts, [{ id: 'point', type: 'circle',
    metadata: { geometryReview: { role: 'derived_boundary_cut_not_OSM_node_or_public_entrance', generatedOSMIdentity: false } }, paint: {
      'circle-radius': ['case', selected, 6.5, 4.8], 'circle-color': '#213543', 'circle-opacity': 0.2,
      'circle-stroke-color': ['case', selected, '#ffe1a4', '#dfd1b5'], 'circle-stroke-width': ['case', selected, 2.7, 1.8],
    } }]);
  add('geometry_mark_areas', geometryReviewCollections.geometry_mark_areas, [{ ...fill('#879fcc', 0.16), paint: {
    'fill-color': ['case', selected, '#d5b780', '#879fcc'], 'fill-opacity': ['case', selected, 0.28, 0.16],
  } }, { ...line('#c2b6da', 1.3), paint: { 'line-color': ['case', selected, '#ffe1a4', '#c2b6da'], 'line-width': ['case', selected, 2.8, 1.3] } }]);
  add('geometry_mark_lines', geometryReviewCollections.geometry_mark_lines, [{ ...line('#c2b6da', 2),
    metadata: { geometryReview: { role: 'same_source_way_geometry_representation_not_second_park', actualEntranceAdopted: false } },
    paint: { 'line-color': ['case', selected, '#ffe1a4', '#c2b6da'], 'line-width': ['case', selected, 3.2, 2] } }]);
  add('geometry_mark_points', geometryReviewCollections.geometry_mark_points, [{ id: 'point', type: 'circle',
    metadata: { geometryReview: { role: 'source_tag_mark_only', actualEntranceOrLegalCrossingAdopted: false } }, paint: {
      'circle-radius': ['case', selected, 7, 5.5], 'circle-color': '#dcb583',
      'circle-stroke-color': ['case', selected, '#fff0c3', '#3c2e24'], 'circle-stroke-width': ['case', selected, 2.3, 1.5],
    } }]);
  const location = coordinate(center);
  add('location', location ? { type: 'FeatureCollection', features: [{
    type: 'Feature', properties: { role: 'position_reference_not_sensor' }, geometry: { type: 'Point', coordinates: location },
  }] } : EMPTY, [{ id: 'point', type: 'circle', paint: {
    'circle-radius': 5, 'circle-color': '#8fd7e5', 'circle-stroke-color': '#122631', 'circle-stroke-width': 2,
  } }]);
  return { items, snapshot };
}

/** Recolor navigation basemap geometry without inferring research data. */
export function navigationStyle(style) {
  if (style?.version !== 8 || !style.sources || !Array.isArray(style.layers)) throw new Error('在线底图样式格式不可读取。');
  return { ...style, terrain: undefined, layers: style.layers.map((layer) => {
    const id = `${layer.id} ${layer['source-layer'] ?? ''}`.toLowerCase();
    const copy = { ...layer, paint: { ...layer.paint } };
    if (layer.type === 'background') copy.paint['background-color'] = '#07111a';
    // Tint only vegetation categories already present in the navigation data;
    // a generic residential/commercial landuse layer must not become green.
    const vegetation = /park|grass|wood|forest|vegetation/.test(id)
      || (/landcover|landuse/.test(id) && /"(?:park|grass|wood|forest|meadow|scrub)"/.test(JSON.stringify(layer.filter ?? [])));
    if (layer.type === 'fill' && vegetation) {
      copy.paint['fill-color'] = '#176c4c';
      copy.paint['fill-opacity'] = 0.6;
    }
    if (layer.type === 'fill' && /building/.test(id)) {
      copy.paint['fill-color'] = '#263d49'; copy.paint['fill-outline-color'] = '#4b6673';
      copy.paint['fill-opacity'] = 0.48;
    }
    if (layer.type === 'line' && /road|transportation|bridge|tunnel/.test(id)) copy.paint['line-color'] = '#3b8298';
    return copy;
  }).filter((layer) => layer.type !== 'hillshade' && layer.type !== 'fill-extrusion') };
}

const PICK_PRIORITY = ['geometry_receptors', 'geometry_mark_points', 'geometry_boundary_cuts', 'geometry_original_nodes',
  'geometry_mark_lines', 'geometry_mark_areas', 'geometry_inside_fragments', 'geometry_outside_fragments', 'geometry_buildings',
  'source_receptors', 'source_nodes', 'source_partition_roads', 'source_segments', 'source_cells',
  'receptors', 'residence_candidates', 'building_parts', 'buildings', 'vegetation', 'roads',
  'overlap_review', 'hard_review', 'class_surface'];

/**
 * GeoJSON inputs use WGS84 lon/lat. `center` is a marker/orbit pivot, not a command
 * to recenter a user's navigation. Camera transitions belong to onReady(map).
 * onPick fires on clicks only; onSelect returns the original full input feature.
 */
export default function MapCanvas(props) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const current = useRef(props);
  const styleReady = useRef(false);
  const sourceData = useRef(new Map());
  const pendingSources = useRef(new Map());
  const descriptors = useRef([]);
  const reported = useRef(new Set());
  const onlineSources = useRef(new Set());
  const onlineActive = useRef(false);
  const alive = useRef(false);
  current.current = props;

  const report = (error, context, key = context) => {
    if (!alive.current || reported.current.has(key)) return;
    reported.current.add(key);
    const problem = error instanceof Error ? error : new Error(String(error?.message ?? error));
    problem.context = context;
    current.current.onMapError?.(problem);
  };

  const sync = () => {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    const next = researchDescriptors(current.current);
    descriptors.current = next.items;
    const requestedSnapshot = current.current.visible?.roads_snapshot;
    if (requestedSnapshot != null && String(requestedSnapshot).trim() !== ''
      && next.snapshot.selected === null && next.snapshot.labels.length) {
      report(new Error('所选道路期次不在来源中，已保留各期记录；合并记录数不代表独立道路数。'),
        'roads_snapshot', `roads_snapshot:${requestedSnapshot}`);
    }
    for (const item of next.items) {
      const sourceId = `${PREFIX}${item.key}`;
      try {
        let source = map.getSource(sourceId);
        const greenSource = GREEN_SOURCES.includes(item.key);
        if (source && greenSource && JSON.stringify(source.serialize().clusterProperties ?? null)
          !== JSON.stringify(item.sourceOptions.clusterProperties ?? null)) {
          // Remove legacy aggregation expressions locally, retaining the same raw FeatureCollection
          // and every unrelated source, scene property and camera setting.
          for (const layer of map.getStyle().layers) {
            if (layer.source === sourceId) map.removeLayer(layer.id);
          }
          map.removeSource(sourceId);
          sourceData.current.delete(sourceId);
          pendingSources.current.delete(sourceId);
          source = undefined;
        }
        const renderedUpdate = (operation) => {
          const revision = {};
          pendingSources.current.set(sourceId, revision);
          Promise.resolve(operation).then(() => {
            if (!alive.current || mapRef.current !== map) return;
            // Query only after the new data has rendered; array IDs from stale
            // tiles must never select an unrelated row in a newer collection.
            map.once('render', () => {
              if (pendingSources.current.get(sourceId) === revision) pendingSources.current.delete(sourceId);
            });
            map.triggerRepaint();
          }).catch((error) => {
            // Keep stale tiles unselectable, but retry the rejected update on
            // the next sync instead of leaving this source locked forever.
            if (pendingSources.current.get(sourceId) === revision) revision.failed = true;
            report(error, sourceId, sourceId);
          });
        };
        if (!source) {
          map.addSource(sourceId, { type: 'geojson', data: item.data, generateId: true, ...item.sourceOptions });
          sourceData.current.set(sourceId, item.data);
        } else if (sourceData.current.get(sourceId) !== item.data || pendingSources.current.get(sourceId)?.failed) {
          sourceData.current.set(sourceId, item.data);
          renderedUpdate(source.setData(item.data));
        }
        if (source && greenSource) {
          const actual = source.getClusterOptions();
          const { cluster } = item.sourceOptions;
          if (actual.cluster !== cluster) {
            renderedUpdate(source.setClusterOptions({ cluster }));
          }
        }
        for (const layer of item.layers) {
          if (!map.getLayer(layer.id)) map.addLayer(layer);
          else {
            map.setLayoutProperty(layer.id, 'visibility', layer.layout.visibility);
            // Filters must also be cleared when switching back to all source snapshots.
            if (item.key === 'roads' || greenSource || item.key.startsWith('geometry_')) map.setFilter(layer.id, layer.filter ?? null);
            if (greenSource || CITY_EFFECT_SOURCES.includes(item.key) || item.key === 'regional_roads' || item.key.startsWith('geometry_')) {
              // Existing map instances must receive the new visual descriptor,
              // rather than retaining paint from an earlier hot-loaded version.
              for (const [property, value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id, property, value);
            }
          }
        }
      } catch (error) { report(error, sourceId, sourceId); }
    }
    // Keep the light coating above filled site geometry, including after style
    // reloads and legacy source upgrades. Roads, receptors, range boundaries
    // and the explicit source-review overlays remain above the light display.
    const boundaryId = `${PREFIX}roads-line`;
    if (map.getLayer(boundaryId)) {
      for (const lights of next.items.filter(item => GREEN_SOURCES.includes(item.key))) {
        for (const layer of lights.layers) if (map.getLayer(layer.id)) map.moveLayer(layer.id, boundaryId);
      }
    }
  };

  const swapStyle = (style, online = false) => {
    const map = mapRef.current;
    if (!map) return;
    styleReady.current = false;
    sourceData.current.clear();
    pendingSources.current.clear();
    onlineActive.current = online;
    // Remember external source IDs to ignore late errors from a removed basemap.
    if (online) onlineSources.current = new Set(Object.keys(style.sources));
    map.setStyle(style, { diff: false });
  };

  useEffect(() => {
    alive.current = true;
    let readySent = false;
    let map;
    try {
      maplibregl.setWorkerUrl(new URL(WORKER_PATH, window.location.href).href);
      map = new maplibregl.Map({
        container: containerRef.current, style: localStyle(), ...DEFAULT_CAMERA,
        zoom: DEFAULT_CAMERA.zoom,
        attributionControl: { compact: false, customAttribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors | 植被分类：<a href="https://zenodo.org/records/18180184" target="_blank" rel="noopener">CLCD · Yang &amp; Huang</a> / <a href="https://zenodo.org/records/8352777" target="_blank" rel="noopener">UBGG · Xu &amp; Zhao</a>；空间预览，非热模拟' },
        dragPan: true, dragRotate: true, scrollZoom: true, touchZoomRotate: true,
        keyboard: true, trackResize: true, maxPitch: 80,
      });
      mapRef.current = map;
    } catch (error) {
      report(error, 'webgl', 'webgl');
      return () => { alive.current = false; };
    }
    const loaded = () => {
      styleReady.current = true;
      sync();
      if (!readySent) { readySent = true; current.current.onReady?.(map); }
    };
    const errorHandler = (event) => {
      const sourceId = event.sourceId ?? event.error?.sourceId;
      if (sourceId?.startsWith(PREFIX)) report(event.error, sourceId, sourceId);
      else if (onlineActive.current && (!sourceId || onlineSources.current.has(sourceId))) {
        report(event.error, 'online_basemap', 'online_basemap');
        // Rebuild with no external assets, then reattach the same research sources.
        try { swapStyle(localStyle()); } catch (error) { report(error, 'local_style', 'local_style'); }
      } else if (sourceId && onlineSources.current.has(sourceId)) return;
      else if (!sourceId && reported.current.has('online_basemap')) return;
      else report(event.error, sourceId ?? 'map', sourceId ?? 'map');
    };
    const query = (point, keys) => {
      const layers = descriptors.current.filter((item) => keys.includes(item.key) && !pendingSources.current.has(`${PREFIX}${item.key}`))
        .flatMap((item) => item.layers.map((layer) => layer.id)).filter((id) => map.getLayer(id));
      return layers.length && styleReady.current ? map.queryRenderedFeatures(point, { layers }) : [];
    };
    const original = (feature) => {
      const item = descriptors.current.find((entry) => `${PREFIX}${entry.key}` === feature.source);
      // generateId indexes the input array, so callback geometry is never tile-clipped.
      const features = item?.data.features;
      if (features) {
        const index = Number.isInteger(feature.id) && feature.id >= 0 ? features[feature.id] : null;
        if (index) return index;
        const field = item.key.startsWith('geometry_') ? '__geometry_key' : item.key.startsWith('source_') ? '__source_key' : '__platform_object_id';
        const key = feature.properties?.[field];
        const full = features.find(original => key != null ? original.properties?.[field] === key : original.id != null && original.id === feature.id);
        if (full) return full;
      }
      return feature.toJSON?.() ?? feature;
    };
    const clicked = (event) => {
      if (!styleReady.current) return;
      // Inspect real objects before any candidate-location action, including in
      // region-stage sample previews. Bounds, grids and display aggregates are
      // deliberately absent from this priority.
      const hits = query(event.point, PICK_PRIORITY);
      for (const key of PICK_PRIORITY) {
        const feature = hits.find((hit) => hit.source === `${PREFIX}${key}`);
        if (feature) { current.current.onSelect?.({ layerKey: key, feature: original(feature) }); return; }
      }
      // A temporarily unqueryable object is not a blank location. Ignore the
      // click while its replacement tiles render instead of clearing the scene.
      if (descriptors.current.some((item) => PICK_PRIORITY.includes(item.key)
        && item.data.features.length && pendingSources.current.has(`${PREFIX}${item.key}`))) return;
      // A fresh Chengdu choice uses the clicked coordinate, including over
      // a light, without substituting a display cluster's centre.
      if (current.current.stage !== 'site' && current.current.locationPicking && map.getZoom() >= 10) {
        const grid = query(event.point, ['regional'])[0];
        current.current.onPick?.([event.lngLat.lng, event.lngLat.lat], grid ? original(grid) : null);
        return;
      }
      // Green lights navigate the display; they must not turn a loaded scene
      // into a new empty site. A cluster centroid is not a research location.
      const x = event.point.x ?? event.point[0];
      const y = event.point.y ?? event.point[1];
      if (current.current.stage !== 'site' && map.getZoom() < 10 &&
        query([[x - 8, y - 8], [x + 8, y + 8]], ['study_reference']).length) {
        current.current.onStudyFocus?.();
        return;
      }
      const light = query([[x - 8, y - 8], [x + 8, y + 8]], GREEN_SOURCES)[0];
      if (light) {
        if (current.current.stage !== 'site') {
          const focus = coordinate(light.geometry?.coordinates) ?? [event.lngLat.lng, event.lngLat.lat];
          map.easeTo({ center: focus, zoom: Math.min(18, map.getZoom() + (light.properties?.point_count ? 2 : 1)), duration: 650 });
        }
        return;
      }
      // Site inspection must never replace the loaded scene with a new location.
      // Only the region stage interprets a map click as a location/grid pick.
      if (current.current.stage !== 'site') {
        const grid = query(event.point, ['regional'])[0];
        current.current.onPick?.([event.lngLat.lng, event.lngLat.lat], grid ? original(grid) : null);
      }
    };
    const hovered = (event) => {
      map.getCanvas().style.cursor = query(event.point, PICK_PRIORITY).length ? 'pointer' :
        current.current.locationPicking ? 'crosshair' : '';
    };
    map.on('style.load', loaded);
    map.on('error', errorHandler);
    map.on('click', clicked);
    map.on('mousemove', hovered);
    return () => {
      alive.current = false;
      styleReady.current = false;
      mapRef.current = null;
      map.off('style.load', loaded); map.off('error', errorHandler);
      map.off('click', clicked); map.off('mousemove', hovered);
      map.remove();
      sourceData.current.clear();
      pendingSources.current.clear();
    };
    // One map instance; events read the newest props through current.
  }, []);

  useEffect(() => {
    if (!mapRef.current) return undefined;
    reported.current.clear();
    try { swapStyle(props.offline ? localStyle() : osmNavigationStyle(), !props.offline); }
    catch (error) {
      report(error, props.offline ? 'local_style' : 'online_basemap');
      try { swapStyle(localStyle()); } catch (problem) { report(problem, 'local_style'); }
    }
  }, [props.offline]);

  const pivot = coordinate(props.center);
  useEffect(() => { sync(); }, [props.sceneLayers, props.regionalNodes, props.regionalGreenPoints, props.regionalRoads,
    props.cityGreenPoints, props.urbanGreenPoints, props.cityBoundary, props.cityEffects, props.browseRegion,
    props.provinceBoundary, props.provinceRivers, props.provincePlaces, props.studyBoundary, props.studyReferenceCenter,
    props.residenceCandidates, props.sourceReviewCollections, props.geometryReviewCollections,
    props.stage, props.visible, pivot?.[0], pivot?.[1]]);

  useEffect(() => {
    const map = mapRef.current;
    const hasPoints = [props.regionalGreenPoints, props.cityGreenPoints, props.urbanGreenPoints].some(data => collection(data).features.length > 0);
    const hasCity = collection(props.cityBoundary).features.length > 0;
    if (!map || props.visible?.greenFx === false || (!hasPoints && !hasCity)) return undefined;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = null;
    let started = null;
    let lastPaint = null;
    const paint = (phase, progress = 0.5) => {
      if (!alive.current || mapRef.current !== map || !styleReady.current) return;
      for (const key of GREEN_SOURCES) {
        const field = key === 'regional_green_points' ? 'G02' : '__display_green_share';
        for (const suffix of GREEN_HALOS) {
          const id = `${PREFIX}${key}-${suffix}`;
          if (map.getLayer(id)) map.setPaintProperty(id, 'circle-opacity', greenHaloOpacity(suffix, phase));
          if (suffix !== 'cluster-halo' && map.getLayer(id)) {
            map.setPaintProperty(id, 'circle-radius', greenPointHaloRadius(suffix, phase, field));
          }
        }
        const clusterHalo = `${PREFIX}${key}-cluster-halo`;
        if (map.getLayer(clusterHalo)) map.setPaintProperty(clusterHalo, 'circle-radius', greenClusterHaloRadius(phase));
        const clusterRing = `${PREFIX}${key}-cluster-ring`;
        if (map.getLayer(clusterRing)) {
          map.setPaintProperty(clusterRing, 'circle-radius', greenClusterHaloRadius(phase, true));
          map.setPaintProperty(clusterRing, 'circle-stroke-opacity', greenHaloOpacity('cluster-ring', phase));
        }
      }
      if (hasCity) for (const [id, property, value] of [
        ['city_fx_boundary-fill','fill-opacity',0.025+phase*0.04],
        ['city_fx_boundary-glow','line-opacity',0.24+phase*0.32],
        ['city_fx_boundary-glow','line-width',7+phase*8],
        ['city_fx_boundary-line','line-opacity',0.4+phase*0.4],
        ['city_effects-scan','fill-opacity',citySweepOpacity(progress)],
        ['city_effects-grid','line-opacity',citySweepOpacity(progress,true)],
      ]) if (map.getLayer(PREFIX+id)) map.setPaintProperty(PREFIX+id,property,value);
    };
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; started = null; lastPaint = null;
    };
    const tick = (time) => {
      if (!alive.current || media?.matches) { stop(); return; }
      started ??= time;
      // Ten paint updates per second animate opacity and screen halos at every scale.
      // Source geometry, G02, stable light cores and camera stay fixed.
      if (lastPaint === null || time - lastPaint >= 100) {
        const phase = (1 + Math.sin((time - started) / GREEN_DISPLAY_RULES.breathingPeriodMs * Math.PI * 2)) / 2;
        paint(phase, ((time-started)%12000)/12000); lastPaint = time;
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (!media?.matches && frame === null) frame = requestAnimationFrame(tick); };
    const preference = () => {
      if (media.matches) { stop(); paint(0.5); }
      else start();
    };
    media?.addEventListener?.('change', preference);
    start();
    return () => { stop(); media?.removeEventListener?.('change', preference); };
  }, [props.regionalGreenPoints, props.cityGreenPoints, props.urbanGreenPoints, props.cityBoundary, props.cityEffects, props.visible?.greenFx]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.orbit || !pivot) return undefined;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = null;
    let last = null;
    let pausedByUser = false;
    const stop = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; last = null; };
    const tick = (time) => {
      if (!alive.current || pausedByUser || media?.matches) { stop(); return; }
      const elapsed = last === null ? 0 : Math.min(time - last, 100);
      last = time;
      if (!map.isEasing?.()) map.jumpTo({ center: pivot, bearing: map.getBearing() + elapsed * 0.0022 });
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (!pausedByUser && !media?.matches && frame === null) frame = requestAnimationFrame(tick); };
    const gesture = (event) => { if (event.originalEvent) { pausedByUser = true; stop(); current.current.onOrbitPause?.(); } };
    const preference = () => { if (media.matches) stop(); else start(); };
    map.on('movestart', gesture);
    map.on('mousedown', gesture);
    map.on('touchstart', gesture);
    map.on('wheel', gesture);
    media?.addEventListener?.('change', preference);
    start();
    return () => { stop(); map.off('movestart', gesture); map.off('mousedown', gesture); map.off('touchstart', gesture); map.off('wheel', gesture); media?.removeEventListener?.('change', preference); };
  }, [props.orbit, pivot?.[0], pivot?.[1]]);

  return <div ref={containerRef} className="map-canvas" role="region"
    aria-label="成都全域植被光效与研究场地地图；仅高亮研究区可定位场地"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#07111a' }} />;
}
