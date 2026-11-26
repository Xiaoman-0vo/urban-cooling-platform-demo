/** Frame the registered polygons, leaving room for the header, map tools and preview card. */
export function pilotPreviewCamera(collection,{width=1280,height=800,reducedMotion=false}={}) {
  const points=(collection?.features||[]).flatMap(feature=>feature.geometry?.type==='Polygon'?feature.geometry.coordinates.flat():[])
    .filter(point=>Array.isArray(point)&&point.length>=2&&point.slice(0,2).every(Number.isFinite));
  if(!points.length)return null;
  const bounds=[0,1].map(axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);
  if(bounds[0][0]===bounds[0][1]||bounds[1][0]===bounds[1][1])return null;
  return {bounds:[[bounds[0][0],bounds[1][0]],[bounds[0][1],bounds[1][1]]],options:{
    padding:{top:Math.min(180,height*.25),bottom:Math.min(240,height*.34),
      left:Math.min(width<=800?82:126,width*.22),right:Math.min(width<=800?28:106,width*.15)},
    maxZoom:22,pitch:0,bearing:0,duration:reducedMotion?0:800,absolutePadding:true,
  }};
}

/** Exact selection geometry above asynchronous WebGL tiles; never a temperature surface. */
export function attachPilotPreviewOverlay(map,collection) {
  const host=map.getContainer(),doc=host.ownerDocument,ns='http://www.w3.org/2000/svg';
  const features=(collection?.features||[]).filter(f=>f.geometry?.type==='Polygon');
  const svg=doc.createElementNS(ns,'svg');
  svg.setAttribute('class','pilot-vector-preview');svg.setAttribute('role','img');
  svg.setAttribute('aria-label','登记范围与候选边界；空间范围预览，非温度场');
  Object.assign(svg.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2',overflow:'hidden'});
  const colors={temperature_area:'#edc474',temperature_selection:'#a6fadd',protection_area:'#f197ae',protection_conflict:'#ff7871',priority_area:'#8dbdff'};
  const paths=features.map(feature=>{
    const kind=feature.properties?.pilot_display,color=feature.properties?.comparison_status==='outside_declared_limits'?'#ffb457':colors[kind]||'#5de8e3';
    const casing=doc.createElementNS(ns,'path'),path=doc.createElementNS(ns,'path');
    casing.setAttribute('fill','none');casing.setAttribute('stroke','#06171f');casing.setAttribute('stroke-width','8');
    path.setAttribute('data-pilot-display',kind||'discussion_range');
    path.setAttribute('fill',color);path.setAttribute('fill-opacity',kind==='temperature_area'?'0.10':'0.22');
    path.setAttribute('fill-rule','evenodd');path.setAttribute('stroke',color);path.setAttribute('stroke-width','4');
    if(kind==='temperature_area')path.setAttribute('stroke-dasharray','8 5');
    svg.appendChild(casing);svg.appendChild(path);return {feature,casing,path};
  });
  const draw=()=>{
    for(const {feature,casing,path} of paths){
      const rings=feature.geometry.coordinates.map(ring=>ring.map(point=>map.project(point)));
      const valid=rings.every(ring=>ring.length>=4&&ring.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
      const d=valid?rings.map(ring=>ring.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')+' Z').join(' '):'';
      casing.setAttribute('d',d);path.setAttribute('d',d);
    }
  };
  host.appendChild(svg);draw();map.on('move',draw);map.on('resize',draw);
  return ()=>{map.off('move',draw);map.off('resize',draw);svg.remove();};
}
