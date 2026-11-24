import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {pilotBoxGeometry} from '../src/pilot-map.js';
import {pilotPreviewCamera,attachPilotPreviewOverlay} from '../src/pilot-preview.js';

// Exercise the installed MapLibre camera and projection, without a WebGL renderer.
// Prior camera padding must not accumulate when moving between planning views.
const bundle=buildSync({stdin:{contents:"export {Camera} from './node_modules/maplibre-gl/src/ui/camera.ts';",
  resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'cjs',write:false});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);

test('real MapLibre camera replaces previous view padding and keeps every candidate corner inside the unobscured viewport',()=>{
  const geometry=pilotBoxGeometry([412541,3389123,412550,3389140]);
  const collection={type:'FeatureCollection',features:[{type:'Feature',geometry}]};
  for(const [width,height] of [[1280,900],[600,760],[390,844]]){
    const camera=new module.exports.Camera({maxZoom:22});camera.transform.resize(width,height);
    camera.jumpTo({center:[104.087474,30.631781],zoom:18,pitch:55,bearing:-18,
      padding:{top:170,bottom:130,left:100,right:430}});
    const frame=pilotPreviewCamera(collection,{width,height,reducedMotion:true});
    camera.fitBounds(frame.bounds,{...frame.options,essential:true});
    assert.deepEqual(camera.getPadding(),frame.options.padding);
    assert.equal(camera.getPitch(),0);assert.equal(camera.getBearing(),0);
    for(const [lng,lat] of geometry.coordinates[0]){
      const point=camera.transform.locationToScreenPoint({lng,lat}),p=frame.options.padding;
      assert.ok(point.x>=p.left-1&&point.x<=width-p.right+1,`${width}: x=${point.x}`);
      assert.ok(point.y>=p.top-1&&point.y<=height-p.bottom+1,`${height}: y=${point.y}`);
    }
  }
});

test('selection outlines render before any WebGL source is ready, follow navigation and disappear on cleanup',()=>{
  class Element {
    constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.style={};this.attributes={};this.children=[];}
    setAttribute(key,value){this.attributes[key]=value;}
    appendChild(child){child.parent=this;this.children.push(child);}
    remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
  }
  const doc={createElementNS:(_ns,tag)=>new Element(tag,doc)},host=new Element('div',doc),listeners=new Map();let offset=0;
  const map={getContainer:()=>host,project:([x,y])=>({x:x*10+offset,y:y*10}),
    on:(name,handler)=>listeners.set(name,handler),off:(name,handler)=>{assert.equal(listeners.get(name),handler);listeners.delete(name);}};
  const feature={type:'Feature',properties:{pilot_display:'temperature_selection'},geometry:{type:'Polygon',coordinates:[[[1,1],[2,1],[2,3],[1,1]]]}};
  const collection={type:'FeatureCollection',features:[feature]},before=JSON.stringify(collection);
  const cleanup=attachPilotPreviewOverlay(map,collection),svg=host.children[0],path=svg.children[1];
  assert.equal(svg.style.pointerEvents,'none');assert.match(svg.attributes['aria-label'],/非温度场/);
  assert.equal(path.attributes.d,'M10.00,10.00 L20.00,10.00 L20.00,30.00 L10.00,10.00 Z');
  offset=20;listeners.get('move')();assert.match(path.attributes.d,/^M30.00,10.00/);
  listeners.get('resize')();assert.equal(JSON.stringify(collection),before);
  cleanup();assert.equal(host.children.length,0);assert.equal(listeners.size,0);
});
