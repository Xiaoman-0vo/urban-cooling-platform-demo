import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { validateStyleMin, createExpression, createPropertyExpression, featureFilter, latest } from '@maplibre/maplibre-gl-style-spec';
import { Supercluster } from '@maplibre/geojson-vt';

const source = readFileSync(new URL('../src/MapCanvas.jsx', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022',
  define: { 'import.meta.env.BASE_URL': '"/"' } }).code;
const fc = (features = []) => ({ type: 'FeatureCollection', features });
const polygon = (properties = {}) => ({ type: 'Feature', properties, geometry: {
  type: 'Polygon', coordinates: [[[104.08, 30.63], [104.081, 30.63], [104.081, 30.631], [104.08, 30.63]]],
} });
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const evaluatePaint = (value, property, zoom, properties = {}) => {
  const parsed = createPropertyExpression(plain(value), `paint.${property}`, latest.paint_circle[property]);
  assert.equal(parsed.result, 'success', JSON.stringify(parsed.value));
  return parsed.value.evaluate({ zoom }, { type: 1, properties });
};

test('geometry review uses an independent namespace, fixed SVF range and original full-key features', async () => {
  const h=harness(), selected=[];let picks=0;
  const key='sha256:original/receptor_candidates/H1';
  const receptor={type:'Feature',id:key,properties:{accepted_physical_SVF:null,__geometry_group:'building_geometry_svf',__geometry_kind:'receptors',__geometry_key:key,__geometry_svf:0.735,__geometry_selected:true},geometry:{type:'Point',coordinates:[104.08,30.63]}};
  const building=polygon({source_object_key:'original/buildings_uncut/151730',source_properties:{Height_effective_working_m:12.933,accepted_ground_elevation_m:null},__geometry_key:'original/buildings_uncut/151730'});
  building.id='original/buildings_uncut/151730';
  const geometryReviewCollections={geometry_receptors:fc([receptor]),geometry_buildings:fc([building])};
  const sourceReviewCollections={source_cells:fc([polygon({cell_id:'S014'})])},sceneLayers={core:fc([polygon()]),buildings:fc([polygon({merged_id:'keep-original-scene'})])};
  const before=JSON.stringify({geometryReviewCollections,sourceReviewCollections,sceneLayers});
  const props={offline:true,stage:'region',geometryReviewCollections,sourceReviewCollections,sceneLayers,onSelect:item=>selected.push(item),onPick:()=>picks++};
  try {
    h.render(props);await flush();const map=h.instances[0],descriptors=h.api.researchDescriptors(props),style=h.api.localStyle();
    for(const item of descriptors.items){style.sources['research-'+item.key]={type:'geojson',data:item.data,generateId:true,...item.sourceOptions};style.layers.push(...item.layers);}
    assert.deepEqual(validateStyleMin(style).map(e=>e.message),[]);
    const point=descriptors.items.find(i=>i.key==='geometry_receptors').layers[0];
    assert.deepEqual(plain(point.metadata.geometryReview.fixedRange),[0,1]);
    assert.equal(point.metadata.geometryReview.thermalComfortOrQualityJudgment,false);
    assert.equal(evaluatePaint(point.paint['circle-color'],'circle-color',16,{__geometry_svf:null}).toString(),'rgba(125,136,146,1)');
    assert.notEqual(evaluatePaint(point.paint['circle-color'],'circle-color',16,{__geometry_svf:0}).toString(),evaluatePaint(point.paint['circle-color'],'circle-color',16,{__geometry_svf:1}).toString());
    for(const [slot,feature,suffix] of [['geometry_receptors',receptor,'point'],['geometry_buildings',building,'fill']]){
      map.hits=[{id:feature.id,properties:{__geometry_key:feature.properties.__geometry_key},source:'research-'+slot,layer:{id:'research-'+slot+'-'+suffix}}];
      map.emit('click',{point:[12,20],lngLat:{lng:104.08,lat:30.63}});
      assert.equal(selected.at(-1).feature,feature);assert.equal(selected.at(-1).layerKey,slot);assert.equal(picks,0);
    }
    h.render({...props,geometryReviewCollections:{}});await flush();
    assert.equal(map.getSource('research-geometry_receptors').data.features.length,0);
    assert.equal(map.getSource('research-source_cells').data,sourceReviewCollections.source_cells);
    assert.equal(map.getSource('research-buildings').data,sceneLayers.buildings);
    assert.equal(map.getSource('research-core').data,sceneLayers.core);assert.equal(map.jumps.length,0);
    assert.equal(JSON.stringify({geometryReviewCollections,sourceReviewCollections,sceneLayers}),before);
  } finally {h.dispose();}
});

test('window cut and park representations remain source symbols with explicit unknown application roles', () => {
  const h=harness();try {
    const descriptor=h.api.researchDescriptors({offline:true,geometryReviewCollections:{}}).items;
    const cut=descriptor.find(i=>i.key==='geometry_boundary_cuts').layers[0];
    assert.equal(cut.metadata.geometryReview.role,'derived_boundary_cut_not_OSM_node_or_public_entrance');
    assert.equal(cut.metadata.geometryReview.generatedOSMIdentity,false);
    assert.equal(cut.paint['circle-opacity'],0.2);assert.ok(cut.paint['circle-stroke-width']);
    const line=descriptor.find(i=>i.key==='geometry_mark_lines').layers[0];
    assert.equal(line.metadata.geometryReview.actualEntranceAdopted,false);
    assert.equal(line.metadata.geometryReview.role,'same_source_way_geometry_representation_not_second_park');
    const fragment=descriptor.find(i=>i.key==='geometry_outside_fragments').layers[0];
    assert.deepEqual(plain(fragment.paint['line-dasharray']),[3,1.5]);
    assert.equal(fragment.metadata.geometryReview.gradeOrPublicWalkConnectionAdopted,false);
  } finally {h.dispose();}
});

test('source review selects original multi-part support and cells without moving or adopting the research scene', async () => {
  const h = harness();
  const base = new URL('../../共享接口/微观试验准备/研究范围来源叠合_20261006/', import.meta.url);
  const cells = JSON.parse(readFileSync(new URL('来源叠合分区_WGS84.geojson', base), 'utf8'));
  const roads = JSON.parse(readFileSync(new URL('道路分区线支持_WGS84.geojson', base), 'utf8'));
  const sourceReviewCollections = { source_cells: cells, source_partition_roads: roads };
  const sceneLayers = { buildings: fc([polygon({ merged_id: 'preserved' })]), core: fc([polygon()]) };
  const before = JSON.stringify({ cells, roads, sceneLayers });
  let picks = 0; const selected = [];
  const props = { offline: true, stage: 'region', sceneLayers, sourceReviewCollections,
    onPick: () => picks++, onSelect: (item) => selected.push(item) };
  try {
    h.render(props); await flush(); const map = h.instances[0];
    const style = h.api.localStyle();
    for (const item of h.api.researchDescriptors(props).items) {
      style.sources[`research-${item.key}`] = { type: 'geojson', data: item.data, generateId: true, ...item.sourceOptions };
      style.layers.push(...item.layers);
    }
    assert.deepEqual(validateStyleMin(style).map((error) => error.message), []);
    assert.equal(map.getSource('research-source_cells').data.features.length, 16);
    assert.equal(map.getSource('research-source_partition_roads').data.features.length, 12);
    assert.equal(roads.features.filter((f) => f.geometry.type === 'MultiLineString').length, 4);
    for (const [key, data, suffix, index] of [
      ['source_cells', cells, 'fill', 0], ['source_cells', cells, 'fill', 7],
      ['source_partition_roads', roads, 'line', roads.features.findIndex((f) => f.geometry.type === 'MultiLineString')],
    ]) {
      map.hits = [{ id: index, source: `research-${key}`, layer: { id: `research-${key}-${suffix}` } }];
      map.emit('click', { point: [10, 20], lngLat: { lng: 104.08, lat: 30.63 } });
      assert.equal(selected.at(-1).feature, data.features[index]);
      assert.equal(selected.at(-1).layerKey, key);
      assert.equal(picks, 0);
    }
    h.render({ ...props, sourceReviewCollections: {} }); await flush();
    assert.equal(map.getSource('research-source_cells').data.features.length, 0);
    assert.equal(map.getSource('research-source_partition_roads').data.features.length, 0);
    assert.equal(map.getSource('research-buildings').data, sceneLayers.buildings);
    assert.equal(map.getSource('research-core').data, sceneLayers.core);
    assert.equal(map.jumps.length, 0);
    assert.equal(JSON.stringify({ cells, roads, sceneLayers }), before);
  } finally { h.dispose(); }
});

test('adopted residence source polygons are isolated, selectable and hide without replacing the core scene', async () => {
  const h = harness();
  const housing = JSON.parse(readFileSync(new URL('../../共享接口/公平性输入准备/共同试点住宅源对象_展示准备.geojson', import.meta.url), 'utf8'));
  assert.equal(housing.features.length, 6);
  const sceneLayers = { buildings: fc([polygon({ merged_id: 'core-building' })]), vegetation: fc([polygon()]), core: fc([polygon()]) };
  const before = JSON.stringify({ housing, sceneLayers });
  const selected = []; let picks = 0;
  const props = { offline: true, stage: 'site', sceneLayers, residenceCandidates: housing,
    onSelect: (item) => selected.push(item), onPick: () => picks++ };
  try {
    h.render(props); await flush(); const map = h.instances[0];
    const id = 'research-residence_candidates';
    assert.equal(map.getSource(id).data, housing);
    map.hits = [{ id: 0, source: id, layer: { id: `${id}-fill` } }];
    map.emit('click', { point: [10, 20], lngLat: { lng: 104.08, lat: 30.63 } });
    assert.equal(picks, 0); assert.equal(selected[0].layerKey, 'residence_candidates');
    assert.equal(selected[0].feature, housing.features[0]);
    h.render({ ...props, visible: { residenceCandidates: false } }); await flush();
    assert.equal(map.getLayer(`${id}-fill`).layout.visibility, 'none');
    assert.equal(map.getSource(id).data, housing);
    for (const key of ['buildings', 'vegetation', 'core']) assert.equal(map.getSource(`research-${key}`).data, sceneLayers[key]);
    h.render({ ...props, stage: 'region', visible: { residenceCandidates: true } }); await flush();
    assert.equal(map.getLayer(`${id}-line`).layout.visibility, 'none');
    h.render({ ...props, residenceCandidates: fc() }); await flush();
    assert.equal(map.getSource(id).data.features.length, 0);
    assert.equal(JSON.stringify({ housing, sceneLayers }), before);
  } finally { h.dispose(); }
});

/** Small API mock checks lifecycle contracts, not WebGL or rendered geography. */
function harness() {
  const instances = [];
  const hooks = [];
  let index = 0;
  let effects = [];
  const fetchCalls = [];
  const workerUrls = [];
  const frames = new Map();
  let frameId = 0;
  const mediaListeners = new Set();
  const media = { matches: false,
    addEventListener(_name, fn) { mediaListeners.add(fn); },
    removeEventListener(_name, fn) { mediaListeners.delete(fn); },
  };
  class FakeMap {
    constructor(options) {
      this.options = options; this.sources = new Map(); this.layers = new Map();
      this.events = new Map(); this.bearing = options.bearing; this.jumps = []; this.paintChanges = [];
      this.clusterChanges = []; this.removedSources = []; this.removedLayers = [];
      this.camera = { center: options.center, zoom: options.zoom, pitch: options.pitch, bearing: options.bearing };
      this.canvas = { style: {} }; this.hits = []; this.removed = false;
      instances.push(this); this.setStyle(options.style);
    }
    on(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); }
    off(name, fn) { this.events.get(name)?.delete(fn); }
    once(name, fn) { const wrapped = (event) => { this.off(name, wrapped); fn(event); }; this.on(name, wrapped); }
    emit(name, event = {}) { for (const fn of this.events.get(name) ?? []) fn(event); }
    setStyle(style) {
      this.style = style; this.sources.clear(); this.layers.clear();
      for (const [id, spec] of Object.entries(style.sources)) this.addSource(id, spec);
      for (const layer of style.layers) this.addLayer(layer);
      queueMicrotask(() => { if (!this.removed) this.emit('style.load'); });
    }
    addSource(id, spec) {
      const map = this;
      this.sources.set(id, { ...spec,
        setData(data) { this.data = data; return Promise.resolve(); },
        serialize() {
          const { setData, serialize, getClusterOptions, setClusterOptions, ...specification } = this;
          return specification;
        },
        getClusterOptions() { return { cluster: this.cluster, clusterMaxZoom: this.clusterMaxZoom, clusterRadius: this.clusterRadius }; },
        setClusterOptions(options) {
          Object.assign(this, options); map.clusterChanges.push({ id, options }); return Promise.resolve();
        },
      });
    }
    getSource(id) { return this.sources.get(id); }
    removeSource(id) { this.sources.delete(id); this.removedSources.push(id); }
    getStyle() { return { ...this.style, layers: [...this.layers.values()] }; }
    addLayer(layer) { this.layers.set(layer.id, structuredClone(layer)); }
    getLayer(id) { return this.layers.get(id); }
    removeLayer(id) { this.layers.delete(id); this.removedLayers.push(id); }
    setLayoutProperty(id, key, value) { this.layers.get(id).layout ??= {}; this.layers.get(id).layout[key] = value; }
    setPaintProperty(id, key, value) { this.layers.get(id).paint[key] = value; this.paintChanges.push({ id, key, value }); }
    setFilter(id, filter) { this.layers.get(id).filter = filter; }
    getCanvas() { return this.canvas; }
    queryRenderedFeatures(_point, { layers }) {
      return this.hits.filter((hit) => layers.includes(hit.layer.id) && this.getLayer(hit.layer.id)?.layout?.visibility !== 'none');
    }
    getBearing() { return this.bearing; }
    isEasing() { return false; }
    jumpTo(options) { this.bearing = options.bearing; this.camera = { ...this.camera, ...options }; this.jumps.push(options); }
    triggerRepaint() { queueMicrotask(() => { if (!this.removed) this.emit('render'); }); }
    remove() { this.removed = true; }
  }
  const useRef = (value) => {
    const position = index++; hooks[position] ??= { current: value }; return hooks[position];
  };
  const useEffect = (fn, deps) => {
    const position = index++; const old = hooks[position];
    if (!old || deps.some((item, i) => !Object.is(item, old.deps[i]))) {
      effects.push(() => { old?.cleanup?.(); hooks[position] = { deps, cleanup: fn() }; });
    }
  };
  const context = vm.createContext({ module: { exports: {} }, console, Error, AbortController, URL,
    setTimeout, clearTimeout, queueMicrotask, window: { matchMedia: () => media,
      location: { href: 'http://localhost:5173/' } },
    requestAnimationFrame: (fn) => { const id = ++frameId; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    fetch: (url, options) => new Promise((resolve, reject) => fetchCalls.push({ url, options, resolve, reject })),
    require: (name) => {
      if (name === 'react') return { useRef, useEffect };
      if (name === 'react/jsx-runtime') return { jsx: (_tag, props) => { props.ref.current = {}; return props; } };
      if (name === 'maplibre-gl') return { Map: FakeMap, setWorkerUrl: (url) => workerUrls.push(url) };
      if (name.endsWith('.css')) return {};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  vm.runInContext(code, context);
  const api = context.module.exports;
  return { api, instances, fetchCalls, workerUrls, frames, media,
    reducedMotion(matches) { media.matches = matches; for (const listener of mediaListeners) listener({ matches }); },
    render(props) { index = 0; effects = []; api.default(props); for (const effect of effects) effect(); },
    dispose() { for (const hook of hooks) hook?.cleanup?.(); },
    frame(time) { const scheduled = [...frames]; frames.clear(); for (const [, fn] of scheduled) fn(time); },
  };
}

test('local style has no network assets, and research layers pass the installed style validator', () => {
  const h = harness(); const style = h.api.localStyle();
  assert.deepEqual(plain(style.sources), {});
  assert.equal(style.glyphs, undefined); assert.equal(style.sprite, undefined); assert.equal(style.terrain, undefined);
  const { items } = h.api.researchDescriptors({ sceneLayers: { buildings: fc([polygon()]) }, stage: 'site' });
  for (const item of items) {
    style.sources[`research-${item.key}`] = { type: 'geojson', data: item.data, generateId: true, ...item.sourceOptions };
    style.layers.push(...item.layers);
  }
  assert.deepEqual(validateStyleMin(style).map((error) => error.message), []);
  const surface = items.find((item) => item.key === 'class_surface').layers[0];
  assert.match(JSON.stringify(surface.paint['fill-color']), /source_class/);
});

test('stage and visibility cannot expose region extrusions; no geometry or field mutation', () => {
  const h = harness(); const building = polygon({ merged_id: 'b1', __display_working_height_m: 13.6, Height: 9 });
  const data = fc([building]); const before = structuredClone(data);
  const region = h.api.researchDescriptors({ sceneLayers: { building_parts: data }, stage: 'region' });
  assert.equal(region.items.find((item) => item.key === 'building_parts').layers[0].layout.visibility, 'none');
  const site = h.api.researchDescriptors({ sceneLayers: { building_parts: data }, stage: 'site', visible: { buildings: false } });
  assert.equal(site.items.find((item) => item.key === 'building_parts').layers[0].layout.visibility, 'none');
  const expression = site.items.find((item) => item.key === 'building_parts').layers[0].paint['fill-extrusion-height'];
  assert.match(JSON.stringify(expression), /__display_working_height_m.*height_m.*work_height_m.*Height_effective_working_m.*Height/);
  assert.deepEqual(data, before);
});

test('snapshot selection filters one real period, with unknown selection retaining both', () => {
  const h = harness(); const roads = fc([polygon({ rr_snapshot_label: '2020' }), polygon({ rr_snapshot_label: '2021' })]);
  const one = h.api.researchDescriptors({ sceneLayers: { roads }, visible: { roads_snapshot: '2021' } });
  const both = h.api.researchDescriptors({ sceneLayers: { roads }, visible: { roads_snapshot: 'unknown' } });
  assert.equal(one.snapshot.selected, '2021'); assert.equal(both.snapshot.selected, null);
  assert.equal(one.items.find((item) => item.key === 'roads').layers[0].filter[2], '2021');
  assert.equal(both.items.find((item) => item.key === 'roads').layers[0].filter, undefined);
  assert.equal(both.items.find((item) => item.key === 'roads').data, roads);
});

test('site clicks inspect full features; neither blank clicks nor dragging replace the scene', async () => {
  const h = harness(); const picks = []; const selected = []; const ready = [];
  const original = polygon({ merged_id: 'source-b', __part_index: 1 });
  try {
    h.render({ offline: true, stage: 'site', sceneLayers: { building_parts: fc([original]) },
      onReady: (map) => ready.push(map), onPick: (...args) => picks.push(args), onSelect: (item) => selected.push(item) });
    await flush(); const map = h.instances[0];
    assert.equal(h.fetchCalls.length, 0); assert.equal(ready.length, 1);
    assert.deepEqual(h.workerUrls, ['http://localhost:5173/maplibre/6.12.0/maplibre-gl-worker.mjs']);
    map.hits = [{ id: 0, source: 'research-building_parts', geometry: {}, properties: {}, layer: { id: 'research-building_parts-extrusion' } }];
    map.emit('movestart', { originalEvent: {} }); assert.equal(picks.length, 0);
    map.emit('click', { point: [10, 20], lngLat: { lng: 104.08, lat: 30.63 } });
    assert.equal(picks.length, 0);
    assert.equal(selected[0].layerKey, 'building_parts'); assert.equal(selected[0].feature, original);
    map.hits = []; map.emit('click', { point: [20, 30], lngLat: { lng: 104.09, lat: 30.64 } });
    assert.equal(picks.length, 0); assert.equal(selected.length, 1);
  } finally { h.dispose(); }
});

test('region clicks pick locations and return the original grid feature', async () => {
  const h = harness(); const picks = []; const grid = polygon({ grid_id: 'g1' });
  try {
    h.render({ offline: true, stage: 'region', regionalNodes: fc([grid]), onPick: (...args) => picks.push(args) });
    await flush(); const map = h.instances[0];
    map.hits = [{ id: 0, source: 'research-regional', layer: { id: 'research-regional-fill' } }];
    map.emit('click', { point: [10, 20], lngLat: { lng: 104.08, lat: 30.63 } });
    assert.deepEqual(plain(picks[0][0]), [104.08, 30.63]); assert.equal(picks[0][1], grid);
    map.hits = []; map.emit('click', { point: [20, 30], lngLat: { lng: 104.09, lat: 30.64 } });
    assert.equal(picks[1][1], null);
  } finally { h.dispose(); }
});

test('updated props change data and toggles, without moving the user camera', async () => {
  const h = harness();
  try {
    h.render({ offline: true, stage: 'region', center: [104.08, 30.63] }); await flush();
    const map = h.instances[0]; const data = fc([polygon({ source_component_ids: [17696] })]);
    h.render({ offline: true, stage: 'site', center: [104.09, 30.64], sceneLayers: { vegetation: data }, visible: { vegetation: false } });
    assert.equal(map.getSource('research-vegetation').data, data);
    assert.equal(map.getLayer('research-vegetation-fill').layout.visibility, 'none');
    assert.equal(map.getLayer('research-building_parts-extrusion').layout.visibility, 'visible');
    assert.equal(map.jumps.length, 0);
  } finally { h.dispose(); }
});

test('queries do not select a different input row while an updated GeoJSON source is rendering', async () => {
  const h = harness(); const selected = [];
  const first = polygon({ merged_id: 'first' }); const next = polygon({ merged_id: 'next' });
  const callbacks = { offline: true, onSelect: (item) => selected.push(item) };
  try {
    h.render({ ...callbacks, sceneLayers: { buildings: fc([first]) } }); await flush();
    const map = h.instances[0];
    map.hits = [{ id: 0, source: 'research-buildings', layer: { id: 'research-buildings-fill' } }];
    h.render({ ...callbacks, sceneLayers: { buildings: fc([next]) } });
    const click = { point: [10, 20], lngLat: { lng: 104.08, lat: 30.63 } };
    map.emit('click', click); assert.equal(selected.length, 0);
    await flush(); map.emit('click', click); assert.equal(selected[0].feature, next);
  } finally { h.dispose(); }
});

test('default online navigation uses valid OSM raster with visible attribution; offline removes external assets', async () => {
  const h = harness();
  try {
    h.render({ offline: false, sceneLayers: { core: fc([polygon()]) } }); await flush();
    assert.equal(h.fetchCalls.length, 0);
    const map = h.instances[0]; assert.ok(map.getSource('osm')); assert.ok(map.getLayer('research-core-line'));
    assert.deepEqual(plain(map.style.sources.osm.tiles), ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']);
    assert.match(map.style.sources.osm.attribution, /https:\/\/www.openstreetmap.org\/copyright/);
    assert.equal(map.options.attributionControl.compact, false);
    assert.deepEqual(validateStyleMin(plain(map.style)).map((error) => error.message), []);
    h.render({ offline: true, sceneLayers: { core: fc([polygon()]) } }); await flush();
    assert.equal(map.getSource('osm'), undefined); assert.equal(map.style.sprite, undefined); assert.equal(map.style.glyphs, undefined);
    assert.ok(map.getLayer('research-core-line')); assert.equal(h.fetchCalls.length, 0);
  } finally { h.dispose(); }
});

test('remote tile failure keeps local layers, reports once, and ignores late failures after offline', async () => {
  const h = harness(); const errors = [];
  try {
    h.render({ offline: false, onMapError: (error) => errors.push(error) }); await flush();
    const map = h.instances[0];
    map.emit('error', { sourceId: 'osm', error: new Error('Tile failed') });
    map.emit('error', { sourceId: 'osm', error: new Error('Another tile failed') }); await flush();
    assert.equal(errors.length, 1); assert.equal(map.getSource('osm'), undefined); assert.ok(map.getLayer('research-core-line'));
    h.render({ offline: true }); await flush(); h.render({ offline: false }); await flush();
    h.render({ offline: true }); await flush();
    map.emit('error', { sourceId: 'osm', error: new Error('Late tile failure') }); await flush();
    assert.equal(map.getSource('osm'), undefined); assert.equal(h.fetchCalls.length, 0);
  } finally { h.dispose(); }
});

test('scope styles stay distinct, and an empty road snapshot retains both periods without a warning', async () => {
  const h = harness(); const errors = [];
  try {
    const roads = fc([polygon({ rr_snapshot_label: '2020年初' }), polygon({ rr_snapshot_label: '2021年初' })]);
    h.render({ offline: true, sceneLayers: { roads }, visible: { roads_snapshot: '' }, onMapError: (error) => errors.push(error) });
    await flush(); const map = h.instances[0];
    assert.equal(errors.length, 0); assert.equal(map.getLayer('research-roads-line').filter ?? null, null);
    assert.equal(map.getLayer('research-core-line').paint['line-color'], '#f1b756');
    assert.equal(map.getLayer('research-core-line').paint['line-dasharray'], undefined);
    assert.equal(map.getLayer('research-macro_context300-line').paint['line-color'], '#47bbd1');
    assert.deepEqual(plain(map.getLayer('research-macro_context300-line').paint['line-dasharray']), [2, 2]);
    assert.equal(map.getLayer('research-context-line').paint['line-color'], '#9caebd');
    assert.deepEqual(plain(map.getLayer('research-context-line').paint['line-dasharray']), [4, 3]);
    h.render({ offline: true, sceneLayers: { roads }, visible: { roads_snapshot: '不存在期次' }, onMapError: (error) => errors.push(error) });
    assert.equal(errors.length, 1); assert.equal(errors[0].context, 'roads_snapshot');
  } finally { h.dispose(); }
});

test('regional green circles and historical roads persist across stage; greenFx toggles visibility without clearing sources', async () => {
  const h = harness(); const picks = []; const selected = [];
  const point = { type: 'Feature', properties: { grid_id: 'g2', G02: 0.25, filtered_green_ratio: 0, science_status: 'not_validated' },
    geometry: { type: 'Point', coordinates: [104.08, 30.63] } };
  const data = fc([point]); const original = structuredClone(data);
  try {
    const roads = fc([{ type: 'Feature', properties: { source_year: 2021 }, geometry: { type: 'LineString', coordinates: [[104.08, 30.63], [104.081, 30.631]] } }]);
    const props = { offline: true, regionalGreenPoints: data, regionalRoads: roads, onPick: (...args) => picks.push(args), onSelect: (feature) => selected.push(feature) };
    h.render({ ...props, stage: 'region' }); await flush(); const map = h.instances[0];
    const circles = map.getLayer('research-regional_green_points-point');
    assert.equal(circles.layout.visibility, 'visible'); assert.match(JSON.stringify(circles.paint['circle-opacity']), /G02/);
    assert.equal(circles.paint['circle-blur'], 0.12); assert.match(JSON.stringify(circles.paint['circle-radius']), /G02/);
    assert.doesNotMatch(JSON.stringify(circles.paint['circle-radius']), /filtered_green_ratio/);
    assert.deepEqual(validateStyleMin(plain(map.style)).map((error) => error.message), []);
    map.hits = [{ id: 0, source: 'research-regional_green_points', layer: { id: circles.id } }];
    map.emit('click', { point: [10, 20], lngLat: { lng: 104.08, lat: 30.63 } });
    assert.equal(selected.length, 0); assert.equal(picks.length, 1); assert.equal(picks[0][1], null);
    h.render({ ...props, stage: 'site' }); await flush();
    assert.equal(map.getLayer(circles.id).layout.visibility, 'visible');
    assert.equal(map.getLayer('research-regional_roads-line').layout.visibility, 'visible');
    assert.equal(map.getSource('research-regional_green_points').data, data);
    assert.equal(map.getSource('research-regional_roads').data, roads);
    h.render({ ...props, stage: 'site', visible: { greenFx: false } }); await flush();
    for (const suffix of ['point', 'point-halo', 'halo', 'halo-strong', 'cluster', 'cluster-halo', 'cluster-ring']) {
      assert.equal(map.getLayer(`research-regional_green_points-${suffix}`).layout.visibility, 'none');
    }
    assert.equal(map.getLayer('research-regional_roads-line').layout.visibility, 'none');
    assert.equal(map.getSource('research-regional_green_points').data, data);
    assert.equal(map.getSource('research-regional_roads').data, roads);
    assert.equal(h.frames.size, 0);
    h.render({ ...props, stage: 'site', visible: { greenFx: true } }); await flush();
    assert.equal(map.getLayer(circles.id).layout.visibility, 'visible');
    assert.equal(map.getLayer('research-regional_roads-line').layout.visibility, 'visible');
    assert.deepEqual(data, original);
  } finally { h.dispose(); }
});

test('green display thresholds emphasize higher ratios without dropping any source point', () => {
  const h = harness();
  const data = fc([0.05, 0.3, 0.5, 1].map((value, index) => ({ type: 'Feature', properties: { G02: String(value), grid_id: index },
    geometry: { type: 'Point', coordinates: [104.08 + index / 1000, 30.63] } })));
  const before = structuredClone(data);
  const item = h.api.researchDescriptors({ regionalGreenPoints: data }).items.find((entry) => entry.key === 'regional_green_points');
  assert.equal(item.data, data); assert.equal(item.data.features.length, 4); assert.deepEqual(data, before);
  assert.equal(item.layers.find((layer) => layer.id === 'research-regional_green_points-halo').metadata.displayOnly.minG02, 0.3);
  assert.equal(item.layers.find((layer) => layer.id.endsWith('-halo-strong')).metadata.displayOnly.minG02, 0.5);
  const point = item.layers.find((layer) => layer.id.endsWith('-point'));
  assert.match(JSON.stringify(point.filter), /point_count/);
  const filter = featureFilter(plain(point.filter), 'point.filter');
  assert.equal(filter.filter({ zoom: 16 }, { type: 1, properties: { G02: 0.5 } }), true);
  assert.equal(filter.filter({ zoom: 6 }, { type: 1, properties: { point_count: 20 } }), false);
  assert.match(JSON.stringify(point.paint['circle-color']), /#effff7/);
});

test('green breathing preserves zoom expressions, continues into site, and stops for greenFx, reduced motion and cleanup', async () => {
  const h = harness();
  const data = fc([{ type: 'Feature', properties: { G02: '0.75', science_status: 'not_validated' },
    geometry: { type: 'Point', coordinates: [104.08, 30.63] } }]);
  const before = structuredClone(data);
  const props = { offline: true, stage: 'region', regionalGreenPoints: data };
  try {
    h.render(props); await flush(); const map = h.instances[0];
    map.paintChanges = [];
    assert.equal(h.frames.size, 1);
    h.frame(0); const count = map.paintChanges.length;
    h.frame(50); assert.equal(map.paintChanges.length, count);
    const opacity = () => map.getLayer('research-regional_green_points-halo-strong').paint['circle-opacity'];
    h.frame(750); assert.ok(Math.abs(evaluatePaint(opacity(), 'circle-opacity', 11) - 0.4) < 1e-9);
    h.frame(2250); assert.ok(Math.abs(evaluatePaint(opacity(), 'circle-opacity', 11) - 0.2) < 1e-9);
    assert.ok(map.paintChanges.every((change) =>
      (change.key === 'circle-opacity' && /-halo(?:-strong)?$/.test(change.id)) ||
      (change.key === 'circle-radius' && /-cluster-(?:halo|ring)$/.test(change.id)) ||
      (change.key === 'circle-stroke-opacity' && /-cluster-ring$/.test(change.id))));
    for (const change of map.paintChanges) assert.deepEqual(plain(change.value.slice(0, 3)), ['interpolate', ['linear'], ['zoom']]);
    const clusterHalo = () => map.getLayer('research-regional_green_points-cluster-halo').paint['circle-radius'];
    const haloMin = evaluatePaint(clusterHalo(), 'circle-radius', 6.2, { point_count: 5868 });
    h.frame(3750);
    const haloMax = evaluatePaint(clusterHalo(), 'circle-radius', 6.2, { point_count: 5868 });
    assert.ok(haloMax > haloMin * 1.4, 'far halo has visible screen-radius breathing');
    assert.equal(map.jumps.length, 0); assert.deepEqual(data, before);
    h.reducedMotion(true); assert.equal(h.frames.size, 0);
    assert.deepEqual(plain(opacity()), plain(h.api.greenHaloOpacity('halo-strong', 0.5)));
    assert.deepEqual(plain(clusterHalo()), plain(h.api.greenClusterHaloRadius(0.5)));
    h.reducedMotion(false); assert.equal(h.frames.size, 1);
    h.render({ ...props, stage: 'site' }); assert.equal(h.frames.size, 1);
    h.render({ ...props, stage: 'site', visible: { greenFx: false } }); assert.equal(h.frames.size, 0);
    h.render({ ...props, stage: 'site', visible: { greenFx: true } }); assert.equal(h.frames.size, 1);
  } finally { h.dispose(); assert.equal(h.frames.size, 0); }
  const reduced = harness();
  try { reduced.media.matches = true; reduced.render(props); await flush(); assert.equal(reduced.frames.size, 0); }
  finally { reduced.dispose(); }
});

test('region sample objects inspect first and never invoke destructive candidate-location callbacks', async () => {
  const h = harness(); const selected = []; let picks = 0;
  const layers = { buildings: fc([polygon({ merged_id: 'b1' })]), vegetation: fc([polygon({ source_component_ids: '17696' })]),
    roads: fc([{ type: 'Feature', properties: { rr_snapshot_label: '2021年初' }, geometry: { type: 'LineString', coordinates: [[104.08, 30.63], [104.081, 30.631]] } }]) };
  const before = structuredClone(layers);
  try {
    h.render({ offline: true, stage: 'region', sceneLayers: layers,
      onPick: () => { picks++; throw new Error('This would clear the active sample'); }, onSelect: (item) => selected.push(item) });
    await flush(); const map = h.instances[0];
    for (const [key, suffix] of [['buildings', 'fill'], ['vegetation', 'fill'], ['roads', 'line']]) {
      map.hits = [{ id: 0, source: `research-${key}`, layer: { id: `research-${key}-${suffix}` } }];
      map.emit('click', { point: [10, 20], lngLat: { lng: 104.08, lat: 30.63 } });
      assert.equal(selected.at(-1).layerKey, key); assert.equal(selected.at(-1).feature, layers[key].features[0]);
      assert.equal(map.getSource(`research-${key}`).data, layers[key]);
    }
    assert.equal(picks, 0); assert.deepEqual(layers, before);
  } finally { h.dispose(); }
});

test('cluster and original-point filters are exclusive; legal zoom expressions keep near points visible', () => {
  const h = harness();
  const item = h.api.researchDescriptors({}).items.find((entry) => entry.key === 'regional_green_points');
  assert.equal(item.sourceOptions.cluster, true); assert.equal(item.sourceOptions.clusterMaxZoom, 9);
  assert.equal(item.sourceOptions.clusterRadius, 46);
  const cluster = item.layers.find((layer) => layer.id.endsWith('-cluster'));
  const point = item.layers.find((layer) => layer.id.endsWith('-point'));
  const clusterFilter = featureFilter(plain(cluster.filter), 'cluster.filter');
  assert.equal(clusterFilter.filter({ zoom: 6 }, { type: 1, properties: { point_count: 20 } }), true);
  assert.equal(clusterFilter.filter({ zoom: 16 }, { type: 1, properties: { G02: '0.1' } }), false);
  const farRadius = evaluatePaint(cluster.paint['circle-radius'], 'circle-radius', 6.2, { point_count: 5868 });
  assert.ok(farRadius >= 8 && farRadius < 10, 'province view retains a readable stable light core');
  assert.equal(cluster.paint['circle-blur'], 0.22);
  const ring = item.layers.find((layer) => layer.id.endsWith('-cluster-ring'));
  assert.equal(ring.paint['circle-opacity'], 0);
  assert.ok(evaluatePaint(ring.paint['circle-stroke-opacity'], 'circle-stroke-opacity', 6.2) > 0.2);
  assert.ok(evaluatePaint(ring.paint['circle-radius'], 'circle-radius', 6.2, { point_count: 5868 }) > farRadius * 2);
  assert.ok(evaluatePaint(point.paint['circle-radius'], 'circle-radius', 16, { G02: '0.05' }) >= 1.1);
  assert.ok(evaluatePaint(point.paint['circle-opacity'], 'circle-opacity', 16, { G02: '0.05' }) > 0.5);
  const nearHalo = item.layers.find((layer) => layer.id.endsWith('-point-halo'));
  assert.ok(evaluatePaint(nearHalo.paint['circle-radius'], 'circle-radius', 16, { G02: '0.05' }) > 4);
  assert.ok(evaluatePaint(nearHalo.paint['circle-opacity'], 'circle-opacity', 16) >= 0.18);
  const strongHalo = item.layers.find((layer) => layer.id.endsWith('-halo-strong'));
  assert.equal(evaluatePaint(strongHalo.paint['circle-radius'], 'circle-radius', 18, { G02: '1' }), 10);
  assert.equal(evaluatePaint(h.api.greenHaloOpacity('halo-strong', 0), 'circle-opacity', 18), 0.15);
  assert.equal(evaluatePaint(h.api.greenHaloOpacity('halo-strong', 1), 'circle-opacity', 18), 0.3);
});

test('low-ratio points retain breathing halos through cluster expansion and middle scales without mutating actual source data', () => {
  const h = harness();
  const data = JSON.parse(readFileSync(new URL('../public/data/regional_green_points.geojson', import.meta.url), 'utf8'));
  const before = JSON.stringify(data);
  const lowPoints = data.features.filter((feature) => Number(feature.properties.G02) < 0.3);
  assert.equal(data.features.length, 5868); assert.equal(lowPoints.length, 4035);
  const item = h.api.researchDescriptors({ regionalGreenPoints: data }).items.find((entry) => entry.key === 'regional_green_points');
  assert.equal(item.sourceOptions.clusterMaxZoom, 9);
  const point = item.layers.find((layer) => layer.id.endsWith('-point'));
  const halo = item.layers.find((layer) => layer.id.endsWith('-point-halo'));
  const style = h.api.localStyle();
  style.sources['research-regional_green_points'] = { type: 'geojson', data, ...item.sourceOptions };
  style.layers.push(...item.layers);
  assert.deepEqual(validateStyleMin(style).map((error) => error.message), []);
  // Check the darkest real input as well as the limiting zero and threshold edge.
  const darkest = lowPoints.reduce((lowest, feature) => Number(feature.properties.G02) < Number(lowest.properties.G02) ? feature : lowest);
  for (const zoom of [10, 11.6, 12]) {
    for (const properties of [darkest.properties, { G02: '0' }, { G02: '0.2999' }]) {
      assert.ok(evaluatePaint(point.paint['circle-radius'], 'circle-radius', zoom, properties) >= 0.8);
      assert.ok(evaluatePaint(point.paint['circle-opacity'], 'circle-opacity', zoom, properties) >= 0.62);
      const radius = evaluatePaint(halo.paint['circle-radius'], 'circle-radius', zoom, properties);
      assert.ok(radius >= 2.4 && radius < 3.4, `thin low-ratio halo at zoom ${zoom}: ${radius}`);
      const minOpacity = evaluatePaint(h.api.greenHaloOpacity('point-halo', 0), 'circle-opacity', zoom, properties);
      const maxOpacity = evaluatePaint(h.api.greenHaloOpacity('point-halo', 1), 'circle-opacity', zoom, properties);
      assert.ok(minOpacity >= 0.075 && maxOpacity > minOpacity && maxOpacity <= 0.16);
    }
  }
  for (const zoom of [9, 9.25, 9.75, 13, 14, 15]) {
    const properties = darkest.properties;
    assert.ok(evaluatePaint(halo.paint['circle-radius'], 'circle-radius', zoom, properties) >= 1.8);
    assert.ok(evaluatePaint(h.api.greenHaloOpacity('point-halo', 0), 'circle-opacity', zoom) >= 0.04);
    assert.ok(evaluatePaint(point.paint['circle-opacity'], 'circle-opacity', zoom, properties) >= 0.6);
  }
  assert.ok(evaluatePaint(halo.paint['circle-radius'], 'circle-radius', 14, darkest.properties)
    >= evaluatePaint(halo.paint['circle-radius'], 'circle-radius', 12, darkest.properties));
  assert.equal(item.data, data); assert.equal(JSON.stringify(data), before);
});

test('the installed native cluster engine aggregates actual 5868 points through zoom9 and expands unchanged points from zoom10', () => {
  const h = harness();
  const data = JSON.parse(readFileSync(new URL('../public/data/regional_green_points.geojson', import.meta.url), 'utf8'));
  const before = JSON.stringify(data);
  const item = h.api.researchDescriptors({ regionalGreenPoints: data }).items.find((entry) => entry.key === 'regional_green_points');
  const [operator, mapInput] = item.sourceOptions.clusterProperties.__display_g02_sum;
  const mapExpression = createExpression(plain(mapInput), 'cluster.map');
  const reduceExpression = createExpression([operator, ['accumulated'], ['get', '__display_g02_sum']], 'cluster.reduce');
  assert.equal(mapExpression.result, 'success'); assert.equal(reduceExpression.result, 'success');
  const index = new Supercluster({ maxZoom: item.sourceOptions.clusterMaxZoom, radius: item.sourceOptions.clusterRadius,
    map: (properties) => ({ __display_g02_sum: mapExpression.value.evaluate({ zoom: 0 }, { properties }) }),
    reduce: (accumulated, properties) => { accumulated.__display_g02_sum = reduceExpression.value.evaluate({ zoom: 0, accumulated: accumulated.__display_g02_sum }, { properties }); },
  });
  index.load(data.features);
  const far = index.getClusters([-180, -85, 180, 85], 6);
  const middle = index.getClusters([-180, -85, 180, 85], 9);
  const city = index.getClusters([-180, -85, 180, 85], 10);
  const near = index.getClusters([-180, -85, 180, 85], 16);
  for (const scale of [far, middle]) {
    assert.ok(scale.some((feature) => feature.properties.cluster));
    assert.equal(scale.reduce((count, feature) => count + (feature.properties.point_count ?? 1), 0), 5868);
    for (const feature of scale.filter((feature) => feature.properties.cluster)) {
      const ratio = feature.properties.__display_g02_sum / feature.properties.point_count;
      assert.ok(ratio >= 0 && ratio <= 1);
    }
  }
  assert.ok(middle.length > far.length); assert.equal(city.length, 5868); assert.equal(near.length, 5868);
  assert.ok(city.every((feature) => !feature.properties.cluster));
  assert.ok(near.every((feature) => !feature.properties.cluster));
  assert.equal(index.getClusters([80, 0, 81, 1], 6).length, 0);
  assert.equal(JSON.stringify(data), before); assert.equal(item.data, data);
});

test('sync upgrades an existing zoom12 cluster source and stale paint in the same map without changing data or camera', async () => {
  const h = harness();
  const points = fc([{ type: 'Feature', properties: { G02: '0.75', science_status: 'not_validated' },
    geometry: { type: 'Point', coordinates: [104.08, 30.63] } }]);
  const buildings = fc([polygon({ merged_id: 'retained', science_status: 'not_validated' })]);
  const before = JSON.stringify({ points, buildings });
  const props = { offline: true, stage: 'region', sceneLayers: { buildings }, regionalGreenPoints: points };
  try {
    h.media.matches = true; h.render(props); await flush(); const map = h.instances[0];
    const id = 'research-regional_green_points'; const source = map.getSource(id);
    const otherSource = map.getSource('research-buildings'); const otherLayer = map.getLayer('research-buildings-fill');
    source.clusterMaxZoom = 12; source.clusterRadius = 50;
    const layer = map.getLayer(`${id}-point`);
    layer.paint['circle-radius'] = 99; layer.paint['circle-color'] = '#000000';
    layer.filter = ['==', ['geometry-type'], 'Point'];
    map.jumpTo({ center: [103.9, 30.8], zoom: 7.5, bearing: 31 });
    const camera = structuredClone(map.camera); const jumps = map.jumps.length;
    h.render({ ...props, stage: 'site' }); await flush();
    assert.equal(h.instances.length, 1); assert.equal(map.removed, false);
    assert.equal(map.getSource(id), source); assert.equal(source.data, points);
    assert.deepEqual(plain(source.getClusterOptions()), { cluster: true, clusterMaxZoom: 9, clusterRadius: 46 });
    assert.equal(map.clusterChanges.length, 1); assert.deepEqual(map.removedSources, []);
    const expected = h.api.researchDescriptors({ ...props, stage: 'site' }).items.find((item) => item.key === 'regional_green_points').layers.find((item) => item.id === layer.id);
    assert.deepEqual(plain(layer.paint), plain(expected.paint)); assert.deepEqual(plain(layer.filter), plain(expected.filter));
    assert.equal(map.getSource('research-buildings'), otherSource); assert.equal(map.getLayer('research-buildings-fill'), otherLayer);
    assert.deepEqual(map.camera, camera); assert.equal(map.jumps.length, jumps); assert.equal(JSON.stringify({ points, buildings }), before);
    h.render({ ...props, stage: 'site', visible: { greenFx: true } }); await flush();
    assert.equal(map.clusterChanges.length, 1);
  } finally { h.dispose(); }
});

test('sync rebuilds only a legacy green source when aggregation properties are absent or incompatible', async () => {
  for (const properties of [undefined, { wrong_sum: ['+', ['get', 'wrong_metric']] }]) {
    const h = harness();
    const points = fc([{ type: 'Feature', properties: { G02: '0.25', original_id: 'p1', science_status: 'not_validated' },
      geometry: { type: 'Point', coordinates: [104.08, 30.63] } }]);
    const buildings = fc([polygon({ merged_id: 'retained' })]);
    const props = { offline: true, stage: 'region', regionalGreenPoints: points, sceneLayers: { buildings } };
    const before = JSON.stringify({ points, buildings });
    try {
      h.media.matches = true; h.render(props); await flush(); const map = h.instances[0];
      const id = 'research-regional_green_points'; const legacy = map.getSource(id);
      legacy.cluster = false; legacy.clusterProperties = properties;
      const otherSource = map.getSource('research-buildings'); const otherLayer = map.getLayer('research-buildings-fill');
      map.addLayer({ id: `${id}-legacy`, source: id, type: 'circle', paint: { 'circle-radius': 9 } });
      map.jumpTo({ center: [103.9, 30.8], zoom: 16, bearing: 21 });
      const camera = structuredClone(map.camera); const jumps = map.jumps.length;
      h.render({ ...props, visible: { greenFx: true } }); await flush();
      const replacement = map.getSource(id);
      assert.notEqual(replacement, legacy); assert.equal(replacement.data, points);
      assert.deepEqual(plain(replacement.getClusterOptions()), { cluster: true, clusterMaxZoom: 9, clusterRadius: 46 });
      const expected = h.api.researchDescriptors(props).items.find((item) => item.key === 'regional_green_points');
      assert.deepEqual(plain(replacement.serialize().clusterProperties), plain(expected.sourceOptions.clusterProperties));
      assert.deepEqual(map.removedSources, [id]); assert.equal(map.getLayer(`${id}-legacy`), undefined);
      assert.equal([...map.layers.values()].filter((layer) => layer.source === id).length, expected.layers.length);
      assert.equal(map.getSource('research-buildings'), otherSource); assert.equal(map.getLayer('research-buildings-fill'), otherLayer);
      assert.equal(h.instances.length, 1); assert.equal(map.removed, false); assert.equal(map.jumps.length, jumps);
      assert.deepEqual(map.camera, camera); assert.equal(JSON.stringify({ points, buildings }), before);
    } finally { h.dispose(); }
  }
});

test('rejected cluster updates report once while preserving the source data and map', async () => {
  const h = harness(); const errors = [];
  const points = fc([{ type: 'Feature', properties: { G02: '0.25' }, geometry: { type: 'Point', coordinates: [104.08, 30.63] } }]);
  const props = { offline: true, regionalGreenPoints: points, onMapError: (error) => errors.push(error) };
  try {
    h.media.matches = true; h.render(props); await flush(); const map = h.instances[0];
    const source = map.getSource('research-regional_green_points'); source.clusterMaxZoom = 12;
    source.setClusterOptions = () => Promise.reject(new Error('Cluster worker rejected'));
    h.render({ ...props, visible: { bounds: false } }); await flush();
    h.render({ ...props, visible: { bounds: true } }); await flush();
    assert.equal(errors.length, 1); assert.equal(errors[0].context, 'research-regional_green_points');
    assert.equal(source.data, points); assert.equal(h.instances.length, 1); assert.equal(map.removed, false);
  } finally { h.dispose(); }
});

test('orbit is interruptible and honors reduced motion', async () => {
  let pauses = 0;
  const h = harness(); const props = { offline: true, center: [104.08, 30.63], orbit: true, onOrbitPause: () => pauses++ };
  try {
    h.media.matches = true; h.render(props); await flush(); assert.equal(h.frames.size, 0);
    h.render({ ...props, orbit: false }); h.media.matches = false; h.render(props);
    h.frame(0); h.frame(100); const map = h.instances[0]; assert.equal(map.jumps.length, 2);
    map.emit('mousedown', { originalEvent: {} }); assert.equal(h.frames.size, 0); assert.equal(pauses, 1);
    h.render({ ...props, orbit: false }); h.render(props);
    map.emit('movestart', { originalEvent: {} }); assert.equal(h.frames.size, 0); assert.equal(pauses, 2);
    assert.equal(map.options.zoom, 11.6); assert.equal(map.options.pitch, 42); assert.equal(map.options.bearing, -12);
  } finally { h.dispose(); }
});
