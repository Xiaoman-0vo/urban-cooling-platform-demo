import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {overviewSummary,sourceCoverage,sourceNumber} from '../src/overview/overview-data.js';

test('overview keeps unavailable and inconsistent source coverage out of charts',()=>{
  for(const value of [null,undefined,'',NaN,Infinity,-1,'0'])assert.equal(sourceNumber(value),null);
  assert.equal(sourceNumber(0),0);
  assert.equal(sourceCoverage().greenShare,null);
  const invalid=sourceCoverage({totals:{pixels_inside_navigation_city:10,known_pixels:8,green_pixels:9,unknown_or_nodata_pixels:2}});
  assert.equal(invalid.parts,null);
  assert.equal(invalid.greenShare,null);
  const zero=sourceCoverage({totals:{pixels_inside_navigation_city:10,known_pixels:10,green_pixels:0,unknown_or_nodata_pixels:0}});
  assert.equal(zero.greenShare,0);
  assert.deepEqual(zero.parts,[0,10,0]);
  assert.equal(sourceCoverage({totals:{pixels_inside_navigation_city:0,known_pixels:0,green_pixels:0,unknown_or_nodata_pixels:0}}).knownShare,null);
});

test('overview retains unrecognized roles and never treats string flags as accepted candidates',()=>{
  const summary=overviewSummary({nodes:{features:[{properties:{role:'inside_full',receiver_candidate:true}},{properties:{role:'new_role',receiver_candidate:'true'}},{properties:{}}]}});
  assert.equal(summary.gridRecords,3);
  assert.equal(summary.receiverRecords,1);
  assert.equal(summary.roles.find(role=>role.key==='unknown').value,2);
  assert.equal(summary.areaKm2,null);
  assert.equal(summary.edges,null);
});

test('overview counts and denominator match the existing source package without mutating it',async()=>{
  const load=async name=>JSON.parse(await readFile(new URL(`../public/data/${name}`,import.meta.url),'utf8'));
  const data={nodes:await load('macro_nodes.geojson'),studyBoundary:await load('study_selection_boundary.geojson'),scene:await load('scene.json'),cityContext:await load('chengdu_green_context.json')};
  const original=JSON.stringify(data);
  const summary=overviewSummary(data);
  assert.equal(summary.gridRecords,6567);
  assert.equal(summary.receiverRecords,6215);
  assert.deepEqual(summary.roles.map(role=>role.value),[5871,344,352]);
  assert.equal(summary.edges,58215);
  assert.equal(summary.areaKm2,60.418467040341156);
  assert.equal(summary.clcd.greenShare,3731909/15925294);
  assert.equal(summary.ubgg.greenShare,16732801/51621678);
  assert.equal(summary.ubgg.knownShare,51621678/114793080);
  assert.notEqual(summary.clcd.total,summary.ubgg.total);
  assert.equal(JSON.stringify(data),original);
});
