// UV mapping adapted from knight-L/sc-datav Demo0/map/shape.tsx,
// Apache-2.0. Modified 2026-10-25: projected Chengdu study geometry,
// native Three.js lifecycle, polygon holes and a non-WebGL fallback.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import proj4 from 'proj4';
import {ArrowCounterClockwise} from '@phosphor-icons/react';
import {GRID_ROLES} from './overview-data.js';

function projectedRings(boundary) {
  const polygons = (boundary?.features ?? []).flatMap(feature => {
    const geometry = feature.geometry;
    return geometry?.type === 'Polygon' ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  });
  return polygons.map(rings => rings.map(ring => ring.map(coordinate => proj4('EPSG:4326', 'EPSG:32648', coordinate))));
}

export default function StudyMap3D({boundary, nodes}) {
  const host = useRef(null);
  const reset = useRef(() => {});
  const toggleGrid = useRef(() => {});
  const [error, setError] = useState('');
  const [gridVisible, setGridVisible] = useState(true);
  const polygons = useMemo(() => projectedRings(boundary), [boundary]);
  const bounds = useMemo(() => polygons.flat(2).reduce((box, [x,y]) => [
    Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y),
  ],[Infinity,Infinity,-Infinity,-Infinity]), [polygons]);
  const span = Math.max(bounds[2]-bounds[0], bounds[3]-bounds[1]);
  const scale = span > 0 && Number.isFinite(span) ? 160 / span : 0;
  const cx = (bounds[0]+bounds[2])/2;
  const cy = (bounds[1]+bounds[3])/2;
  const local = ([x,y]) => [(x-cx)*scale,(y-cy)*scale];
  const fallbackPath = polygons.map(rings => rings.map(ring => ring.map((coordinate,index) => {
    const [x,y] = local(coordinate); return `${index?'L':'M'}${x},${-y}`;
  }).join(' ')+' Z').join(' ')).join(' ');

  useEffect(() => {
    if (!scale) {setError('研究区轮廓尚未提供。'); return;}
    let renderer;
    try {renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});}
    catch {setError('当前环境使用平面轮廓预览。'); return;}
    const container = host.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38,1,0.1,1500);
    camera.position.set(95,155,155);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.5));
    renderer.setClearColor(0x000000,0);
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera,renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 120;
    controls.maxDistance = 420;
    controls.maxPolarAngle = Math.PI * 0.46;
    const render = () => renderer.render(scene,camera);
    controls.addEventListener('change',render);
    scene.add(new THREE.AmbientLight(0xcce9e2,2));
    const light = new THREE.DirectionalLight(0xb1f7e6,3);
    light.position.set(-50,120,60);
    scene.add(light);
    for (const rings of polygons) {
      const outer = rings[0].map(coordinate => new THREE.Vector2(...local(coordinate)));
      const shape = new THREE.Shape(outer);
      shape.holes = rings.slice(1).map(ring => new THREE.Path(ring.map(coordinate => new THREE.Vector2(...local(coordinate)))));
      const geometry = new THREE.ExtrudeGeometry(shape,{depth:2.5,bevelEnabled:false});
      // Preserve the upstream bounding-box UV mapping for future source textures.
      const positions = geometry.attributes.position;
      const uv = [];
      for (let index=0; index<positions.count; index++) uv.push((positions.getX(index)+80)/160,(positions.getY(index)+80)/160);
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      const mesh = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x164f48,roughness:0.75,metalness:0.25}));
      mesh.rotation.x = -Math.PI/2;
      scene.add(mesh);
      for (const ring of rings) {
        const points = ring.map(coordinate => {const [x,y]=local(coordinate); return new THREE.Vector3(x,2.7,-y);});
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xa3f1d3})));
      }
    }
    const grid = new THREE.Group();
    const palette = Object.fromEntries(GRID_ROLES.map(role => [role.key,role.color]));
    const features = (nodes?.features ?? []).filter(feature => Number.isFinite(feature.properties?.center_e_m) && Number.isFinite(feature.properties?.center_n_m));
    if (features.length) {
      const geometry = new THREE.PlaneGeometry(100*scale*0.82,100*scale*0.82);
      const cells = new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({transparent:true,opacity:0.65,side:THREE.DoubleSide}),features.length);
      const transform = new THREE.Object3D();
      features.forEach((feature,index) => {
        const properties = feature.properties;
        const [x,y] = local([properties.center_e_m,properties.center_n_m]);
        transform.position.set(x,2.85,-y);transform.rotation.x=-Math.PI/2;transform.updateMatrix();
        cells.setMatrixAt(index,transform.matrix);
        cells.setColorAt(index,new THREE.Color(palette[properties.role] ?? '#a7aeb7'));
      });
      grid.add(cells);
    }
    scene.add(grid);
    const floor = new THREE.GridHelper(260,26,0x245048,0x12312f);
    floor.position.y=-1;scene.add(floor);
    const resize = () => {
      const width=container.clientWidth, height=container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();render();
    };
    const observer=new ResizeObserver(resize);observer.observe(container);resize();
    reset.current=() => {camera.position.set(95,155,155);controls.target.set(0,0,0);controls.update();render();};
    toggleGrid.current=visible => {grid.visible=visible;render();};
    const lost=event => {event.preventDefault();setError('三维绘制已暂停，显示平面轮廓。');};
    renderer.domElement.addEventListener('webglcontextlost',lost);
    return () => {
      observer.disconnect();controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost',lost);
      const geometries=new Set(),materials=new Set();
      scene.traverse(object => {if(object.geometry)geometries.add(object.geometry);if(object.material)(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material));});
      geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
      renderer.dispose();renderer.domElement.remove();reset.current=()=>{};toggleGrid.current=()=>{};
    };
  }, [boundary,nodes]);

  return <div className="uc-study-map">
    <div className="uc-three-host" ref={host} role="img" aria-label="成都二环研究区三维轮廓与网格角色。高度统一用于展示，不表示建筑或温度。"/>
    {error && <div className="uc-map-fallback"><svg viewBox="-100 -100 200 200" role="img" aria-label="成都二环研究区平面轮廓"><path d={fallbackPath} fillRule="evenodd"/></svg><p>{error}</p></div>}
    <div className="uc-map-controls"><label><input type="checkbox" checked={gridVisible} onChange={event=>{setGridVisible(event.target.checked);toggleGrid.current(event.target.checked);}}/>网格角色</label><button aria-label="重置总览视角" onClick={()=>reset.current()}><ArrowCounterClockwise size={15}/>重置视角</button></div>
    <div className="uc-map-key">{GRID_ROLES.map(role=><span key={role.key}><i style={{background:role.color}}/>{role.name}</span>)}</div>
    <p className="uc-map-caption">2021 OSM 来源边界 · 米制投影 EPSG:32648<br/>高度统一用于展示 · 拖动旋转 / 滚轮缩放</p>
  </div>;
}
