import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {verifyGeometrySourceRegistrations} from '../src/source-geometry-state.js';

const registration=JSON.parse(readFileSync(new URL('../public/data/source-geometry-state.json',import.meta.url),'utf8'));
const views=await verifyGeometrySourceRegistrations(registration);
const built=buildSync({entryPoints:[fileURLToPath(new URL('../src/GeometrySourceEvidence.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','proj4'],target:'es2022'});
const module={exports:{}};
vm.runInNewContext(built.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,structuredClone,console});
const api=module.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const callbacks={onLocate(){},onSelectReference(){},onOptions(){},onShowGroup(){},onHideMap(){},onAdopt(){},onOpen(){},onExportJson(){},onError(){}};

test('building review copies original features, maps six saved SVF values and every selected contribution without changing source fields',()=>{
  const view=views.building_geometry_svf,first=Object.values(view.selectionLookup.receptors)[0];
  const before=JSON.stringify(view.displayCollections),options={receptorKey:first.key,samplingN:'360',directionIndex:'0'};
  const result=api.geometryReviewCollectionsFor(view,options),direction=view.selectionLookup.directions[first.key+'|360|0'];
  assert.equal(result.geometry_buildings.features.length,53);assert.equal(result.geometry_receptors.features.length,6);
  const highlights=result.geometry_buildings.features.filter(f=>f.properties.__geometry_selected).map(f=>f.properties.source_object_key);
  assert.deepEqual(new Set(highlights),new Set(direction.contributing_building_keys));
  for(const feature of result.geometry_receptors.features){const row=view.selectionLookup.svf[feature.properties.__geometry_key+'|360'].raw;assert.equal(feature.properties.__geometry_svf,Number(row.horizontal_building_SVF));}
  for(const feature of result.geometry_buildings.features){const source=view.displayCollections.buildings.features.find(f=>f.id===feature.id);assert.equal(feature.geometry,source.geometry);for(const key of Object.keys(source.properties))assert.equal(feature.properties[key],source.properties[key]);}
  const noWinner=Object.values(view.selectionLookup.directions).find(v=>v.raw.winning_source_object_key==='');assert.ok(noWinner);
  const empty=api.geometryReviewCollectionsFor(view,{receptorKey:noWinner.raw.receptor_key,samplingN:noWinner.raw.sampling_N,directionIndex:noWinner.raw.direction_index_0based});
  assert.equal(empty.geometry_buildings.features.filter(f=>f.properties.__geometry_selected).length,0);
  assert.equal(noWinner.raw.winning_source_object_key,'');assert.equal(JSON.stringify(view.displayCollections),before);
  const location=api.geometryLocationFor(view,{group_id:'building_geometry_svf',kind:'directions',key:direction.key},options);
  assert.equal(location.collection.features[0],first.display_feature);assert.equal(location.collection.features.length,1+direction.contributing_building_keys.length);
});

test('saved window scope and full-key locators retain two/one/eight source components and distinguish cuts from original nodes',()=>{
  const view=views.window_source_connectivity,before=JSON.stringify(view.displayCollections);
  for(const [scope,inside,outside,components] of [['inside',45,0,2],['full',45,53,1],['outside',0,53,8]]){
    const result=api.geometryReviewCollectionsFor(view,{windowScope:scope});
    assert.equal(result.geometry_inside_fragments.features.length,inside);assert.equal(result.geometry_outside_fragments.features.length,outside);
    const groups=new Set([...result.geometry_inside_fragments.features,...result.geometry_outside_fragments.features].map(f=>f.properties.__geometry_component));assert.equal(groups.size,components);
    for(const f of result.geometry_boundary_cuts.features){assert.equal(f.properties.node_kind,'derived_boundary_clip_point_not_OSM_node');assert.equal(f.properties.source_osm_node_id,null);assert.equal(f.properties.__geometry_kind,'boundaries');}
  }
  const sourceNode=Object.values(view.selectionLookup.nodes).find(v=>v.row.source_osm_node_id==='3538911123');
  const nodeLocation=api.geometryLocationFor(view,{group_id:'window_source_connectivity',kind:'nodes',key:sourceNode.row.derived_node_key},{windowScope:'inside'});
  assert.equal(nodeLocation.options.windowScope,'full');assert.equal(nodeLocation.collection.features.length,1);
  for(const label of ['B05','B06']){const cut=view.displayCollections.boundaryCuts.features.find(f=>f.properties.boundary_display_label===label);const locate=api.geometryLocationFor(view,{group_id:'window_source_connectivity',kind:'boundaries',key:cut.id},{windowScope:'full'});assert.equal(locate.collection.features[0],cut);}
  const outside=Object.keys(view.selectionLookup.outsideComponents)[0];assert.ok(api.geometryLocationFor(view,{group_id:'window_source_connectivity',kind:'outsideComponents',key:outside},{}).collection.features.length>0);
  const bridge=Object.keys(view.selectionLookup.bridgeEvidence)[0];assert.equal(api.geometryLocationFor(view,{group_id:'window_source_connectivity',kind:'bridgeEvidence',key:bridge},{}).collection.features.length,3);
  assert.equal(JSON.stringify(view.displayCollections),before);assert.equal(view.summary.strict_checks.passed,21);assert.equal(view.summary.strict_checks.failed,1);
});

test('park line and polygon share one original object; no geometry is generated for six alias-only candidate relations',()=>{
  const view=views.OSM_source_marks,before=JSON.stringify(view.displayCollections),park=Object.values(view.selectionLookup.objects).find(v=>v.row.object_type==='way');
  const ref={group_id:'OSM_source_marks',kind:'objects',key:park.row.source_object_key};
  const result=api.geometryReviewCollectionsFor(view,{},ref),location=api.geometryLocationFor(view,ref,{});
  assert.equal(result.geometry_mark_points.features.length,2);assert.equal(result.geometry_mark_lines.features.length,1);assert.equal(result.geometry_mark_areas.features.length,1);
  assert.equal(result.geometry_mark_lines.features[0].properties.__geometry_selected,true);assert.equal(result.geometry_mark_areas.features[0].properties.__geometry_selected,true);
  assert.equal(location.collection.features.length,2);assert.equal(result.geometry_receptors.features.length,0);
  assert.equal(Object.keys(view.selectionLookup.receptors).length,6);assert.equal(view.aliases.length,6);
  assert.equal(JSON.stringify(view.displayCollections),before);assert.equal(view.sources.filter(s=>s.role==='retained_unaccepted_schema_history').length,4);
});

test('all sixteen main tables expose counts/full fields while direction DOM is capped at 100 rows; failures and histories remain readable',()=>{
  let tables=0,rows=0;
  for(const view of Object.values(views)){
    for(const [path,table] of Object.entries(view.tables)){
      const html=renderToStaticMarkup(React.createElement(api.GeometryRecords,{path,table,view,options:{},...callbacks})),pageSize=table.fields.includes('direction_index_0based')?100:50;
      assert.ok(html.includes('data-row-count="'+table.rows.length+'"'));assert.ok(html.includes('data-field-count="'+table.fields.length+'"'));assert.ok(html.includes('data-page-size="'+pageSize+'"'));
      assert.equal((html.match(/data-source-row=/g)||[]).length,Math.min(table.rows.length,pageSize));
      for(const field of table.fields)assert.ok(html.includes('>'+field+'</th>'),field);
      if(pageSize===100){assert.ok(html.includes('1 / 324'));assert.ok(html.includes('方向表候选点'));assert.ok(html.includes('方向表采样级别'));assert.ok(html.includes('方向表原方向序号'));}
      tables++;rows+=table.rows.length;
    }
    const group=view.registration.group_id,html=renderToStaticMarkup(React.createElement(api.default,{registrations:[view.registration],views:{[group]:view},mode:'full',reviewGroup:group,options:{},...callbacks}));
    assert.equal((html.match(/data-geometry-source=/g)||[]).length,view.sources.length);
    assert.ok(html.includes('原组声明与独立软件接入回执'));
    if(group==='building_geometry_svf'){assert.ok(html.includes('精确角点1例失败'));assert.ok(html.includes('水平建筑几何SVF'));}
    if(group==='window_source_connectivity'){assert.ok(html.includes('11父段strict-equals失败'));assert.ok(html.includes('定位 B05'));assert.ok(html.includes('定位 B06'));assert.ok(html.includes('定位 3538911123'));}
    if(group==='OSM_source_marks'){assert.ok(html.includes('未接受历史版本'));assert.equal((html.match(/data-source-role="retained_unaccepted_schema_history"/g)||[]).length,4);for(const source of view.sources.filter(s=>s.role==='retained_unaccepted_schema_history'&&s.format==='csv')){const history=renderToStaticMarkup(React.createElement(api.GeometryRecords,{path:source.path,table:view.files[source.path],view,options:{},historical:true,...callbacks}));assert.ok(history.includes('历史原字段，不联查当前地图'));assert.equal(history.includes('定位来源并联查'),false);}}
  }
  assert.equal(tables,16);assert.equal(rows,32834);
});
