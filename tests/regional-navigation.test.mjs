import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import vm from 'node:vm';
import proj4 from 'proj4';
import {OUTSIDE_STUDY_MESSAGE,requireStudyLocation,studyCoversLocation,validateStudyBoundary} from '../src/regional-navigation.js';

const load = name => JSON.parse(readFileSync(new URL('../public/data/'+name,import.meta.url),'utf8'));
const collection = geometry => ({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry}]});
const polygon = rings => collection({type:'Polygon',coordinates:rings});
const square = (x,y,w=1) => [[x,y],[x+w,y],[x+w,y+w],[x,y+w],[x,y]];
const study = load('study_selection_boundary.geojson');
const context = load('regional_map_context.json');

test('selection uses the exact existing operational boundary, never a province or its bounding box',()=>{
  const raw=readFileSync(new URL('../public/data/study_selection_boundary.geojson',import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'),context.sources.study.sha256);
  assert.equal(context.sources.study.primary_boundary,'2021_counterclockwise');
  assert.equal(context.sources.study.protocol_version,'domain_v1_20261005');
  assert.ok(studyCoversLocation([104.0874739045911,30.63178077683709],study),'Existing prepared example is inside');
  assert.ok(studyCoversLocation(context.study_reference_center,study));
  for(const point of [[102.8,30.1],[104.25,30.68],[104.07,30.78],[104.07,30.5]]) {
    assert.equal(studyCoversLocation(point,study),false);
    assert.throws(()=>requireStudyLocation(point,study),{message:OUTSIDE_STUDY_MESSAGE});
  }
  const b=context.study_bounds;
  assert.equal(studyCoversLocation([b[0]+0.00001,b[1]+0.00001],study),false,'A bbox corner is not the polygon');
  const before=JSON.stringify(study);
  for(const point of study.features[0].geometry.coordinates[0])assert.ok(studyCoversLocation(point,study),'Closed boundary vertices are covered');
  assert.equal(JSON.stringify(study),before);
});

test('nonconvex areas, holes, closed edges and multiple components use polygon coverage',()=>{
  const concave=polygon([[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3],[0,0]]]);
  assert.equal(studyCoversLocation([2,2],concave),false);
  assert.equal(studyCoversLocation([0.5,2],concave),true);
  const holes=polygon([square(0,0,4),square(1,1)]);
  assert.equal(studyCoversLocation([1.5,1.5],holes),false);
  assert.equal(studyCoversLocation([1,1.5],holes),true);
  assert.equal(studyCoversLocation([4,3],holes),true);
  assert.equal(studyCoversLocation([4.000001,3],holes),false);
  const multipart=collection({type:'MultiPolygon',coordinates:[[square(0,0)],[square(3,3)]]});
  assert.equal(studyCoversLocation([3.5,3.5],multipart),true);
  assert.equal(studyCoversLocation([2,2],multipart),false);
});

test('missing, unclosed, nonpolygonal or invalid study data never opens unrestricted picking',()=>{
  for(const value of [null,{type:'FeatureCollection',features:[]},collection({type:'Point',coordinates:[0,0]}),
    polygon([[[0,0],[1,0],[1,1],[0,1]]]),polygon([[[0,0],[1,0],[2,0],[0,0]]]),
    {type:'FeatureCollection',features:[null]}]) {
    assert.equal(studyCoversLocation([0,0],value),false);
    assert.throws(()=>validateStudyBoundary(value),/可选研究范围/);
  }
  for(const point of [null,[NaN,30],[104,Infinity],[181,30],['104','30']])assert.equal(studyCoversLocation(point,study),false);
});

test('provincial reference points and river lines retain navigation-only semantics',()=>{
  assert.equal(context.province_data_admitted,false);
  assert.equal(context.research_admission_changed,false);
  assert.equal(load('sichuan_boundary.geojson').features.length,1);
  assert.equal(load('sichuan_rivers.geojson').features.length,9);
  const places=load('sichuan_places.geojson');
  assert.equal(places.features.length,17);
  for(const f of places.features) {
    assert.equal(f.properties.navigation_only,true);
    assert.equal(f.properties.role,'navigation_place_not_green_or_selectable_site');
    assert.equal(Object.hasOwn(f.properties,'G02'),false);
  }
});

test('whole-city light artifacts retain native classifications and missingness without widening eligibility',()=>{
  const city=load('chengdu_navigation_boundary.geojson'),metadata=load('chengdu_green_context.json');
  assert.equal(metadata.default_region,'成都');assert.equal(metadata.display_share_is_G02,false);
  assert.equal(metadata.selectable_boundary_changed,false);assert.equal(metadata.research_admission_changed,false);
  assert.equal(city.features[0].properties.selection_boundary,false);
  for(const asset of metadata.assets){
    const bytes=readFileSync(new URL('../public/data/'+asset.file,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    assert.equal(bytes.byteLength,asset.bytes);assert.equal(load(asset.file).features.length,asset.features);
  }
  for(const [name,key,count,codes] of [['chengdu_city_green_points.geojson','CLCD_2020',4392,[2,3,4]],['chengdu_urban_green_points.geojson','UBGG_3m',2492,[2,3]]]){
    const points=load(name),provenance=metadata.sources[key];let green=0;
    assert.equal(points.features.length,count);assert.equal(provenance.native_pixels_resampled,false);
    for(const f of points.features){
      const p=f.properties;assert.equal(f.geometry.type,'Point');assert.equal(p.classification_source,key);
      assert.equal(p.display_only,true);assert.equal(p.research_admitted,false);assert.equal(Object.hasOwn(p,'G02'),false);
      assert.ok(codes.includes(p.native_sample_class));assert.ok(p.native_green_pixels>0&&p.native_green_pixels<=p.native_valid_pixels);
      assert.equal(p.__display_green_share,p.native_green_pixels/p.native_valid_pixels);
      assert.ok(p.source_row>=p.block_row&&p.source_row<p.block_row+p.block_size_px);
      assert.ok(p.source_col>=p.block_col&&p.source_col<p.block_col+p.block_size_px);
      assert.ok(studyCoversLocation(f.geometry.coordinates,city));green+=p.native_green_pixels;
    }
    assert.equal(green,provenance.totals.green_pixels);
    assert.equal(provenance.totals.known_pixels+provenance.totals.unknown_or_nodata_pixels,provenance.totals.pixels_inside_navigation_city);
  }
  assert.ok(metadata.sources.UBGG_3m.totals.unknown_or_nodata_pixels>0,'Unknown UBGG pixels remain counted as unknown');
  const effects=load('chengdu_city_effects.geojson');
  assert.equal(effects.features.filter(f=>f.properties.__city_fx_kind==='scan_band').length,64);
  assert.equal(metadata.city_effects.scan_covers_entire_city,true);assert.equal(metadata.city_effects.not_roads_or_terrain,true);
  for(const f of effects.features){assert.equal(f.properties.display_only,true);assert.equal(f.properties.research_admitted,false);assert.equal(Object.hasOwn(f.properties,'G02'),false);}
});

test('all 6567 held node centres match the independently audited 2021 boundary inclusion field',()=>{
  const nodes=load('macro_nodes.geojson');
  assert.equal(nodes.features.length,6567);
  for(const {properties:p} of nodes.features) {
    const point=proj4('+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs','EPSG:4326',[p.center_e_m,p.center_n_m]);
    assert.equal(studyCoversLocation(point,study),p.audit_2021_ccw_center_inside,p.grid_id);
  }
});

test('the live location action rejects outside centres before changing any project field or loading a scope',()=>{
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const action=source.slice(source.indexOf('  function locateAt('),source.indexOf('\n  function locate()'));
  const effects=[];
  const bindings={data:{studyBoundary:study},requireStudyLocation,scopesFor:()=>effects.push('scope'),openExample:()=>effects.push('example')};
  for(const name of new Set(action.match(/set[A-Z][A-Za-z]+/g)))bindings[name]=()=>effects.push(name);
  const locate=vm.runInNewContext(`(${action})`,bindings);
  assert.throws(()=>locate([103,30]),{message:OUTSIDE_STUDY_MESSAGE});
  assert.deepEqual(effects,[]);
  const pickLine=source.slice(source.indexOf('  const pick='),source.indexOf('\n\n  if(bootError)')).trim();
  const notices=[];
  const pick=vm.runInNewContext(`(${pickLine.slice('const pick='.length,-1)})`,{
    ...bindings,stage:'region',preview:true,notify:(...args)=>notices.push(args),locateAt:()=>effects.push('locate'),
  });
  pick([103,30],null);
  assert.equal(notices[0][0],OUTSIDE_STUDY_MESSAGE);
  assert.deepEqual(effects,[],'An already previewed scene also survives an outside click');
});
