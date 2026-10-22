import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, ArrowLeft, ArrowClockwise, ArrowsOut, Buildings, CheckCircle, Compass, DownloadSimple, FileArrowUp, FloppyDisk, FolderOpen, Info, Leaf, MapPin, Minus, MoonStars, Pause, Play, Plus, Sparkle, Stack, WarningCircle, X} from '@phosphor-icons/react';
import MapCanvas from './MapCanvas.jsx';
import ResearchEvidence from './ResearchEvidence.jsx';
import PreparationEvidence from './PreparationEvidence.jsx';
import SupplementEvidence from './SupplementEvidence.jsx';
import SourcePreparationEvidence from './SourcePreparationEvidence.jsx';
import GeometrySourceEvidence, {GEOMETRY_GROUP_NAMES, EMPTY_GEOMETRY_REVIEW, geometryReviewCollectionsFor, geometryLocationFor} from './GeometrySourceEvidence.jsx';
import {validateGeometrySourceRegistrations,verifyGeometrySourceRegistrations} from './source-geometry-state.js';
import {verifySupplementRegistrations} from './supplement-state.js';
import {validateSourcePreparationRegistrations,verifySourcePreparationRegistrations} from './source-preparation-state.js';
import {readSavedProjectText,saveProjectText} from './project-storage.js';
import {parseStrictPreparationJson} from './preparation-state.js';
import {validateResearchRegistration} from './research-state.js';
import {verifyPreparationRegistration} from './preparation-state.js';
import {PROJECT_MAX_FILE_BYTES, EMPTY_COLLECTION, STORAGE_KEY, boundsOf, createProject, deepCopy, digest, makeArchive, parseArchive, parseProjectJson, scopesFor, validateCollection, validateProject} from './project.js';

const FORMAT = new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2});
const countText = value => value == null ? '未记录' : FORMAT.format(value);
const showValue = value => value === null ? '未计算 / 空值' : value === '' ? '缺失 / 空值' : value === undefined ? '不适用' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const LAYER_NAMES = {core:'100米研究核心',macro_context300:'300米宏观邻域',context:'500米微观准备窗',buildings:'来源建筑',building_parts:'工作体块',vegetation:'核心植被裁片',class_surface:'周边地表分类',overlap_review:'投影重叠待核',hard_review:'硬质空间待核',receptors:'候选观测点',roads:'两期道路源线',residence_candidates:'住宅标签候选',user_import:'用户导入资料'};
const RESIDENCE_SOURCE_PATH = '共享接口/公平性输入准备/共同试点住宅源对象_展示准备.geojson';
const layerSubset = layers => Object.fromEntries(Object.entries(layers || {}).filter(([,layer])=>layer?.type==='FeatureCollection'));
const tableRows = (scene,key) => scene?.tables?.[key]?.rows || [];
const DEFAULT_VISIBLE = {bounds:true,buildings:true,vegetation:true,roads:true,receptors:false,regional:false,greenFx:true,residenceCandidates:true};
const SOURCE_GROUP_NAMES = {'micro-source-overlay':'核心来源覆盖','weather-cross-format':'天气表示候选','road-source-connectivity':'2021道路来源参考'};
const EMPTY_SOURCE_REVIEW = {source_cells:EMPTY_COLLECTION,source_partition_roads:EMPTY_COLLECTION,source_nodes:EMPTY_COLLECTION,source_segments:EMPTY_COLLECTION,source_receptors:EMPTY_COLLECTION};
function sourceDisplay(collection,group,kind) {
  if(!collection) return EMPTY_COLLECTION;
  return {...collection,features:collection.features.map(feature=>{
    const p=feature.properties || {};
    const key=kind==='cells'?p.cell_id:kind==='roads'?`${p.source_key}|${p.cell_id}`:kind==='nodes'?p.node_key:kind==='segments'?p.segment_key:p.receptor_key;
    return {...feature,properties:{...p,__source_group:group,__source_kind:kind,__source_key:key}};
  })};
}

// These entries come only from completed byte/CRC/table/semantic verification.
// A weak identity cache avoids a second 32,400-direction decode at adoption;
// equal IDs or declared hashes alone never establish a cache hit.
const verifiedGeometryViews = new WeakMap();
function freezeGeometrySnapshot(value) {
  if(value && typeof value==='object' && !Object.isFrozen(value)) {
    for(const child of Object.values(value))freezeGeometrySnapshot(child);
    Object.freeze(value);
  }
  return value;
}
export function retainVerifiedGeometryViews(views) {
  const registrations=Object.values(views).map(view=>{
    freezeGeometrySnapshot(view.registration);
    verifiedGeometryViews.set(view.registration,view);
    return view.registration;
  });
  return Object.freeze(registrations);
}
export async function geometryViewsForAdoption(registrations,verify=verifyGeometrySourceRegistrations) {
  const seen=new Set(),views={};
  for(const registration of registrations) {
    if(seen.has(registration.group_id))throw new Error('来源几何登记的组身份重复，未改变当前工程。');
    seen.add(registration.group_id);
    const view=verifiedGeometryViews.get(registration);
    if(!view || !Object.isFrozen(registration)) {
      // Foreign/restored or changed objects undergo the complete verification,
      // including joint group aliases. No partial proof is promoted to a pass.
      const checked=await verify(registrations);
      retainVerifiedGeometryViews(checked);
      return checked;
    }
    views[registration.group_id]=view;
  }
  return views;
}

export function App() {
  const [data,setData] = useState(null);
  const [bootError,setBootError] = useState('');
  const [stage,setStage] = useState('region');
  const [region,setRegion] = useState('成都');
  const [center,setCenter] = useState([104.0874739045911,30.63178077683709]);
  const [location,setLocation] = useState('');
  const [siteScene,setSiteScene] = useState(null);
  const [siteLayers,setSiteLayers] = useState({});
  const [imports,setImports] = useState([]);
  const [researchRegistrations,setResearchRegistrations] = useState([]);
  const [researchError,setResearchError] = useState('');
  const [preparationRegistrations,setPreparationRegistrations] = useState([]);
  const [preparationViews,setPreparationViews] = useState({});
  const [preparationError,setPreparationError] = useState('');
  const [supplementRegistrations,setSupplementRegistrations]=useState([]);
  const [supplementViews,setSupplementViews]=useState({});
  const [supplementError,setSupplementError]=useState('');
  const [supplementsFieldPresent,setSupplementsFieldPresent]=useState(true);
  const [sourcePreparationRegistrations,setSourcePreparationRegistrations]=useState([]);
  const [sourcePreparationViews,setSourcePreparationViews]=useState({});
  const [sourcePreparationError,setSourcePreparationError]=useState('');
  const [sourcePreparationsFieldPresent,setSourcePreparationsFieldPresent]=useState(false);
  const [sourceReviewGroup,setSourceReviewGroup]=useState('');
  const [sourceSelectedRef,setSourceSelectedRef]=useState(null);
  const [geometrySourceRegistrations,setGeometrySourceRegistrations]=useState([]);
  const [geometrySourceViews,setGeometrySourceViews]=useState({});
  const [geometrySourceError,setGeometrySourceError]=useState('');
  const [geometrySourcesFieldPresent,setGeometrySourcesFieldPresent]=useState(false);
  const [geometryReviewGroup,setGeometryReviewGroup]=useState('');
  const [geometrySelectedRef,setGeometrySelectedRef]=useState(null);
  const [geometryReviewOptions,setGeometryReviewOptions]=useState({samplingN:'2880',directionIndex:'0',windowScope:'inside'});
  const exportSnapshotRef=useRef(null);
  const [preview,setPreview] = useState(false);
  const [drawer,setDrawer] = useState('');
  const [selected,setSelected] = useState(null);
  const [visible,setVisible] = useState(DEFAULT_VISIBLE);
  const [offline,setOffline] = useState(false);
  const [orbit,setOrbit] = useState(false);
  const [notice,setNotice] = useState(null);
  const [saved,setSaved] = useState(false);
  const [saveState,setSaveState] = useState('本地首版');
  const [dirty,setDirty] = useState(false);
  const [modal,setModal] = useState(false);
  const [importRole,setImportRole] = useState('buildings');
  const [declaredCrs,setDeclaredCrs] = useState(false);
  const [loadingFile,setLoadingFile] = useState(false);
  const [lastExport,setLastExport] = useState(null);
  const mapRef = useRef(null);
  const restoringRef = useRef(false);
  const preparationScopeRef = useRef(null);
  const projectStateRef = useRef(null);
  const uploadRef = useRef(null);
  const reopenRef = useRef(null);
  const noticeTimer = useRef(null);

  const notify = (text,error=false) => {
    clearTimeout(noticeTimer.current);
    setNotice({text,error});
    noticeTimer.current=setTimeout(()=>setNotice(null),8000);
  };

  useEffect(()=>{
    let active=true;
    async function load() {
      try {
        const files=['manifest.json','scene.json','macro_nodes.geojson','regional_green_points.geojson','regional_roads_2021.geojson'];
        const [sourcePackage,scene,nodes,greenPoints,regionalRoads] = await Promise.all(files.map(async name=>{
          const r=await fetch(`/data/${name}`);
          if (!r.ok) throw new Error(`展示资料${name}尚未准备完成。`);
          return r.json();
        }));
        let currentResearchRegistration = null;
        let registrationError = '';
        try {
          const response = await fetch('/data/research-state.json');
          if (!response.ok) throw new Error('本轮科研登记文件尚未接入。');
          currentResearchRegistration = validateResearchRegistration(await response.json());
        } catch (error) { registrationError = error.message; }
        let currentPreparationRegistration = null;
        let currentPreparationView = null;
        let preparationLoadError = '';
        try {
          const response = await fetch('/data/preparation-state.json');
          if (!response.ok) throw new Error('试点准备资料尚未接入。');
          currentPreparationRegistration = await response.json();
          currentPreparationView = await verifyPreparationRegistration(currentPreparationRegistration);
        } catch (error) { preparationLoadError = error.message; currentPreparationRegistration = null; }
        let currentSupplementRegistrations=[],supplementLoadError='';
        try {const response=await fetch('/data/supplement-state.json');if(!response.ok)throw new Error('五组成果资料尚未接入。');currentSupplementRegistrations=parseStrictPreparationJson(await response.text());await verifySupplementRegistrations(currentSupplementRegistrations);}catch(error){supplementLoadError=error.message;currentSupplementRegistrations=[];}
        let currentSourcePreparationRegistrations=[],currentSourcePreparationViews={},sourcePreparationLoadError='';
        try {
          const response=await fetch('/data/source-preparation-state.json');
          if(!response.ok)throw new Error('三组来源准备资料尚未接入。');
          currentSourcePreparationRegistrations=parseStrictPreparationJson(await response.text());
          validateSourcePreparationRegistrations(currentSourcePreparationRegistrations);
          currentSourcePreparationViews=await verifySourcePreparationRegistrations(currentSourcePreparationRegistrations);
        } catch(error) {sourcePreparationLoadError=error.message;currentSourcePreparationRegistrations=[];currentSourcePreparationViews={};}
        let currentGeometrySourceRegistrations=[],currentGeometrySourceViews={},geometrySourceLoadError='';
        try {
          const response=await fetch('/data/source-geometry-state.json');
          if(!response.ok)throw new Error('来源几何与对象资料尚未接入。');
          currentGeometrySourceRegistrations=parseStrictPreparationJson(await response.text());
          validateGeometrySourceRegistrations(currentGeometrySourceRegistrations);
          currentGeometrySourceViews=await verifyGeometrySourceRegistrations(currentGeometrySourceRegistrations);
          currentGeometrySourceRegistrations=retainVerifiedGeometryViews(currentGeometrySourceViews);
        } catch(error) {geometrySourceLoadError=error.message;currentGeometrySourceRegistrations=[];currentGeometrySourceViews={};}
        if (!active) return;
        setGeometrySourceError(geometrySourceLoadError);
        setSupplementError(supplementLoadError);
        setSourcePreparationError(sourcePreparationLoadError);
        setData({sourcePackage,scene,nodes,greenPoints,regionalRoads,currentResearchRegistration,currentPreparationRegistration,currentPreparationView,currentSupplementRegistrations,currentSourcePreparationRegistrations,currentSourcePreparationViews,currentGeometrySourceRegistrations,currentGeometrySourceViews});
        setResearchRegistrations(currentResearchRegistration ? [deepCopy(currentResearchRegistration)] : []);
        setResearchError(registrationError);
        setPreparationError(preparationLoadError);
        setSiteScene(scene);
        setSiteLayers(layerSubset(scene.layers));
        setSaved(!!await readSavedProjectText());
      } catch(error) { if(active) setBootError(error.message); }
    }
    load();
    return ()=>{active=false;clearTimeout(noticeTimer.current);};
  },[]);

  const counts = siteScene?.counts || {};
  const native = Boolean(siteScene && data?.scene && siteScene.site_id === data.scene.site_id);
  const centerLabel = `${center[0].toFixed(6)}°E, ${center[1].toFixed(6)}°N`;
  const currentName = native ? `工程样例 ${siteScene.site_id}` : siteScene?.site_id || '尚未确认场地';
  const changes = siteScene?.version_alignment?.joined_diagnostics;
  const snapshotLabels = [...new Set((siteLayers.roads?.features || []).map(f=>f.properties?.rr_snapshot_label).filter(Boolean))];
  const preparationEligible = Boolean(preview && native && imports.length === 0
    && siteScene.scenario_id === data.scene.scenario_id
    && JSON.stringify(siteScene.center_lon_lat) === JSON.stringify(data.scene.center_lon_lat)
    && JSON.stringify(siteLayers.core) === JSON.stringify(data.scene.layers.core));
  const adoptedPreparation = preparationRegistrations.at(-1);
  const adoptedPreparationView = adoptedPreparation && preparationViews[adoptedPreparation.registration_id];
  const residenceCandidates = preparationEligible && adoptedPreparationView
    ? adoptedPreparationView.inputs[RESIDENCE_SOURCE_PATH] : EMPTY_COLLECTION;
  const activeSourceRegistration=sourcePreparationRegistrations.find(item=>item.group_id===sourceReviewGroup)
    || data?.currentSourcePreparationRegistrations?.find(item=>item.group_id===sourceReviewGroup);
  const activeSourceView=activeSourceRegistration && (sourcePreparationViews[sourceReviewGroup]?.registration?.registration_id===activeSourceRegistration.registration_id
    ? sourcePreparationViews[sourceReviewGroup] : data?.currentSourcePreparationViews?.[sourceReviewGroup]?.registration?.registration_id===activeSourceRegistration.registration_id ? data.currentSourcePreparationViews[sourceReviewGroup] : null);
  const sourceReviewCollections=useMemo(()=>{
    const value=activeSourceView?.summary;
    if(sourceReviewGroup==='micro-source-overlay' && value) return {...EMPTY_SOURCE_REVIEW,source_cells:sourceDisplay(value.displayCollections.cells,sourceReviewGroup,'cells'),source_partition_roads:sourceDisplay(value.displayCollections.roads,sourceReviewGroup,'roads')};
    if(sourceReviewGroup==='road-source-connectivity' && value) return {...EMPTY_SOURCE_REVIEW,source_nodes:sourceDisplay(value.display_layers.nodes,sourceReviewGroup,'nodes'),source_segments:sourceDisplay(value.display_layers.segments,sourceReviewGroup,'segments'),source_receptors:sourceDisplay(value.display_layers.receptors,sourceReviewGroup,'receptors')};
    return EMPTY_SOURCE_REVIEW;
  },[sourceReviewGroup,activeSourceView]);
  const activeGeometryRegistration=geometrySourceRegistrations.find(item=>item.group_id===geometryReviewGroup) || data?.currentGeometrySourceRegistrations?.find(item=>item.group_id===geometryReviewGroup);
  const activeGeometryView=activeGeometryRegistration && (geometrySourceViews[geometryReviewGroup]?.registration?.registration_id===activeGeometryRegistration.registration_id?geometrySourceViews[geometryReviewGroup]:data?.currentGeometrySourceViews?.[geometryReviewGroup]?.registration?.registration_id===activeGeometryRegistration.registration_id?data.currentGeometrySourceViews[geometryReviewGroup]:null);
  const geometryReviewCollections=useMemo(()=>activeGeometryView?geometryReviewCollectionsFor(activeGeometryView,geometryReviewOptions,geometrySelectedRef):EMPTY_GEOMETRY_REVIEW,[activeGeometryView,geometryReviewOptions,geometrySelectedRef]);
  preparationScopeRef.current = {scene:siteScene,layers:siteLayers,preview,imports,eligible:preparationEligible};
  // Persisted state plus user choices only: loading and notifications must not
  // invalidate the operation that produced them.
  projectStateRef.current = {sourcePackage:data?.sourcePackage,scene:siteScene,layers:siteLayers,
    imports,researchRegistrations,preparationRegistrations,supplementRegistrations,supplementsFieldPresent,sourcePreparationRegistrations,sourcePreparationsFieldPresent,geometrySourceRegistrations,geometrySourcesFieldPresent,stage,region,center,location,
    visible,offline,preview,drawer,selected,orbit,importRole,declaredCrs};

  function openExample() {
    if(!data) return;
    setSiteScene(deepCopy(data.scene));
    setSiteLayers(layerSubset(data.scene.layers));
    setImports([]);
    setCenter(data.scene.center_lon_lat);
    setLocation(data.scene.site_id);
    setPreview(true);
    setSelected(null);setLastExport(null);
    setSourceReviewGroup('');setSourceSelectedRef(null);
    setGeometryReviewGroup('');setGeometrySelectedRef(null);
    setDirty(true);
    mapRef.current?.flyTo({center:data.scene.center_lon_lat,zoom:14.5,pitch:35,padding:0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1400});
    notify('已定位工程样例，请核对核心、周边与原准备窗。');
  }

  function locateAt(nextCenter,gridFeature=null) {
    const gridId=gridFeature?.properties?.grid_id;
    if (gridId===data?.scene.site_id) {openExample();return;}
    const scopes=scopesFor(nextCenter);
    if(gridFeature) scopes.core={type:'FeatureCollection',features:[deepCopy(gridFeature)]};
    const nextScene={site_id:gridId || '用户位置预览',scenario_id:`${gridId || nextCenter.map(v=>v.toFixed(6)).join('_')}_geometry_preview`,scenario_type:'geometry_candidate',sample_status:'user_location_preview_not_research_sample',center_lon_lat:nextCenter,scope_registry:[{support_id:'core_100',role:gridId?'candidate_macro_grid':'user_core_preview',width_m:100,status:'display_derivative_not_research_admission'},{support_id:'macro_neighborhood_300',role:gridId?'one_ring_macro_neighborhood':'surrounding_view_preview',width_m:300,status:'display_derivative_not_solver_domain'},{support_id:'physical_solver_domain',role:'solver_domain',width_m:null,status:'not_defined'}],counts:{},tables:{},records:[],version_alignment:{}};
    setPreparationRegistrations([]);
    setSourceReviewGroup('');setSourceSelectedRef(null);
    setGeometryReviewGroup('');setGeometrySelectedRef(null);
    setCenter(nextCenter);
    setSiteLayers(scopes);
    setSiteScene(nextScene);
    setImports([]);
    setLocation(gridId || `${nextCenter[0].toFixed(6)}, ${nextCenter[1].toFixed(6)}`);
    setPreview(true);
    setSelected(null);setLastExport(null);
    setDirty(true);
    notify('位置已预览，此处尚未载入建筑与植被包；可以导入自己的资料。');
  }

  function locate() {
    try {
      const text=location.trim();
      if(!text) throw new Error('请先输入位置、在地图上点选，或选择“浏览真实工程样例”。');
      const node=data.nodes.features.find(f=>f.properties.grid_id===text);
      let cameraCenter;
      if(node) {
        const b=boundsOf({type:'FeatureCollection',features:[node]});
        cameraCenter=[(b[0]+b[2])/2,(b[1]+b[3])/2];
        locateAt(cameraCenter,node);
      } else {
        const values=text.replace(/[，；;]/g,',').split(/[,\s]+/).map(Number);
        if(values.length!==2 || values.some(v=>!Number.isFinite(v)) || Math.abs(values[0])>180 || Math.abs(values[1])>90) throw new Error('请输入已有网格编号，或“经度, 纬度”。地址检索尚未接入。');
        cameraCenter=values;
        locateAt(values);
      }
      mapRef.current?.flyTo({center:cameraCenter,zoom:14.5,pitch:35,padding:0,duration:1000});
    } catch(error) {notify(error.message,true);}
  }

  function enterSite() {
    if(!preview && stage==='region') {locate();return;}
    const compact=window.matchMedia('(max-width:700px)').matches;
    setStage('site');setDrawer(compact?'':'overview');setOrbit(false);setDirty(true);
    const b=boundsOf(siteLayers.context || siteLayers.macro_context300 || siteLayers.core);
    if(b && mapRef.current) mapRef.current.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:compact?{top:175,bottom:165,left:75,right:40}:{top:170,bottom:130,left:100,right:430},pitch:55,bearing:-18,maxZoom:18.4,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1800});
  }

  function goRegion(next=region) {
    setStage('region');setRegion(next);setDrawer('');setOrbit(false);setDirty(true);
    const map=mapRef.current;
    if(map) map.flyTo({center:next==='四川'?[103.8,30.8]:[104.075,30.66],zoom:next==='四川'?6.2:window.innerWidth<700?10.8:11.6,pitch:next==='四川'?25:42,bearing:-12,padding:0,duration:1400});
  }

  function project() {
    if(!data || !siteScene) throw new Error('尚未载入场地资料。');
    const map=mapRef.current;
    const camera=map?{center:map.getCenter().toArray(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()}:null;
    return createProject(data.sourcePackage,siteScene,{stage,region,center,location,visible,offline,camera,preview,drawer:['source-preparations','geometry-sources'].includes(drawer)?'':drawer,selectedReference:selected?{layerKey:selected.layerKey,id:selected.feature.id,platformId:selected.feature.properties?.__platform_object_id}:null},siteLayers,imports,researchRegistrations,preparationRegistrations,supplementsFieldPresent?supplementRegistrations:undefined,sourcePreparationsFieldPresent?sourcePreparationRegistrations:undefined,geometrySourcesFieldPresent?geometrySourceRegistrations:undefined);
  }

  function projectSnapshot() {
    const map=mapRef.current;
    const camera=map?{center:map.getCenter().toArray(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()}:null;
    return {state:projectStateRef.current,camera:JSON.stringify(camera)};
  }

  function requireUnchangedProject(snapshot) {
    const current=projectSnapshot();
    if(Object.keys(snapshot.state).some(key=>snapshot.state[key]!==current.state[key]) || snapshot.camera!==current.camera) {
      throw new Error('等待期间工程或视图已更新，已保留当前工程，请重试。');
    }
  }

  async function verifiedPreparationViews(registrations = []) {
    const pairs = await Promise.all(registrations.map(async registration =>
      [registration.registration_id,await verifyPreparationRegistration(registration)]));
    return Object.fromEntries(pairs);
  }

  async function adoptPreparationRegistration() {
    const registration = data?.currentPreparationRegistration;
    if (!preparationEligible || !registration || preparationRegistrations.some(item => item.registration_id === registration.registration_id)) return;
    try {
      setLoadingFile(true);
      const scope = preparationScopeRef.current;
      const view = await verifyPreparationRegistration(registration);
      const currentScope = preparationScopeRef.current;
      if (!currentScope.eligible || currentScope.scene !== scope.scene || currentScope.layers !== scope.layers || currentScope.imports !== scope.imports) throw new Error('场地已改变，请在对应试点重新确认。');
      setPreparationRegistrations(items => items.some(item => item.registration_id === registration.registration_id)
        ? items : [...items,deepCopy(registration)]);
      setPreparationViews(views => ({...views,[registration.registration_id]:view}));
      setDirty(true);
      notify('已接纳对应试点的准备资料，原场景和科研登记保留。住宅标签候选可独立显隐；科学分析条件仍待补。');
    } catch (error) { notify(`准备资料未接纳：${error.message}`,true); }
    finally { setLoadingFile(false); }
  }

  async function adoptSupplements(){
    const snapshot=projectSnapshot();
    try{setLoadingFile(true);const current=data.currentSupplementRegistrations;const merged=[...supplementRegistrations,...current.filter(r=>!supplementRegistrations.some(old=>old.registration_id===r.registration_id))];const views=await verifySupplementRegistrations(merged);requireUnchangedProject(snapshot);setSupplementRegistrations(deepCopy(merged));setSupplementViews(views);setSupplementsFieldPresent(true);setDirty(true);notify('五组成果资料已接纳，原场景、两轮科研登记和冻结准备包分别保留。当前开放资料审阅。');}catch(error){notify('成果资料未接纳：'+error.message,true);}finally{setLoadingFile(false);}
  }

  async function adoptSourcePreparations() {
    const current=data?.currentSourcePreparationRegistrations || [];
    if(!current.length) return;
    const snapshot=projectSnapshot();
    try {
      setLoadingFile(true);
      const merged=[...sourcePreparationRegistrations,...current.filter(item=>!sourcePreparationRegistrations.some(old=>old.registration_id===item.registration_id))];
      validateSourcePreparationRegistrations(merged);
      const views=await verifySourcePreparationRegistrations(merged);
      requireUnchangedProject(snapshot);
      setSourcePreparationRegistrations(deepCopy(merged));setSourcePreparationViews(views);setSourcePreparationsFieldPresent(true);setDirty(true);
      notify('三组来源准备已接纳为只读审阅副本，原场景、五组成果、科研登记和冻结准备包分别保留。');
    } catch(error) {notify('来源准备未接纳：'+error.message,true);} finally {setLoadingFile(false);}
  }

  async function adoptGeometrySources() {
    const current=data?.currentGeometrySourceRegistrations || [];
    if(!current.length)return;
    const snapshot=projectSnapshot();
    try {
      setLoadingFile(true);
      const merged=[...geometrySourceRegistrations,...current.filter(item=>!geometrySourceRegistrations.some(old=>old.registration_id===item.registration_id))];
      const views=await geometryViewsForAdoption(merged);
      requireUnchangedProject(snapshot);
      setGeometrySourceRegistrations(retainVerifiedGeometryViews(views));setGeometrySourceViews(views);setGeometrySourcesFieldPresent(true);setDirty(true);
      notify('三组来源几何与对象已接纳为只读审阅副本，原场景、历史登记、五组成果与31件来源准备分别保留。');
    } catch(error) {notify('来源几何未接纳：'+error.message,true);} finally {setLoadingFile(false);}
  }

  function locateGeometry(collection,reference,options=geometryReviewOptions) {
    try {
      const b=boundsOf(collection);if(!b)throw new Error('此完整来源键没有本组显示几何。');
      setGeometryReviewGroup(reference.group_id);setGeometrySelectedRef(reference.kind==='group'?null:reference);setGeometryReviewOptions(options);setDrawer('geometry-sources');setOrbit(false);
      const compact=window.matchMedia('(max-width:700px)').matches;
      mapRef.current?.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:compact?{top:160,bottom:170,left:45,right:60}:{top:160,bottom:130,left:110,right:455},maxZoom:19,pitch:25,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:850});
    } catch(error) {notify('来源几何定位未完成：'+error.message,true);}
  }

  function showGeometryGroup(group) {
    const registration=geometrySourceRegistrations.find(item=>item.group_id===group) || data?.currentGeometrySourceRegistrations?.find(item=>item.group_id===group);
    const view=registration && (geometrySourceViews[group]?.registration?.registration_id===registration.registration_id?geometrySourceViews[group]:data?.currentGeometrySourceViews?.[group]?.registration?.registration_id===registration.registration_id?data.currentGeometrySourceViews[group]:null);
    const target=view&&geometryLocationFor(view,{group_id:group,kind:'group',key:group},geometryReviewOptions);
    if(!target){notify('本组尚未完成原字节与语义核验。',true);return;}
    locateGeometry(target.collection,target.reference,target.options);
  }

  function selectGeometryReference(reference) {
    setGeometrySelectedRef(reference);
    const registration=geometrySourceRegistrations.find(item=>item.group_id===reference.group_id)||data?.currentGeometrySourceRegistrations?.find(item=>item.group_id===reference.group_id);
    const view=registration&&(geometrySourceViews[reference.group_id]?.registration?.registration_id===registration.registration_id?geometrySourceViews[reference.group_id]:data?.currentGeometrySourceViews?.[reference.group_id]);
    const value=view?.selectionLookup?.[reference.kind]?.[reference.key],raw=value?.raw;
    if(reference.group_id==='building_geometry_svf' && (reference.kind==='receptors'||raw?.receptor_key))setGeometryReviewOptions(previous=>({...previous,receptorKey:reference.kind==='receptors'?reference.key:raw.receptor_key,...(raw?.sampling_N?{samplingN:raw.sampling_N}:{}),...(raw?.direction_index_0based!==undefined?{directionIndex:raw.direction_index_0based}:{})}));
  }

  function locateSource(collection,reference) {
    try {
      const b=boundsOf(collection);
      if(!b)throw new Error('此来源记录没有本组显示几何。');
      setSourceReviewGroup(reference.group_id);setSourceSelectedRef(reference.kind==='group'?null:reference);setDrawer('source-preparations');setOrbit(false);
      const compact=window.matchMedia('(max-width:700px)').matches;
      mapRef.current?.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:compact?{top:170,bottom:180,left:45,right:60}:{top:160,bottom:130,left:110,right:455},maxZoom:18.5,pitch:30,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:900});
    } catch(error) {notify('来源定位未完成：'+error.message,true);}
  }

  function showSourceGroup(group) {
    const registration=sourcePreparationRegistrations.find(item=>item.group_id===group) || data?.currentSourcePreparationRegistrations?.find(item=>item.group_id===group);
    const view=registration && (sourcePreparationViews[group]?.registration?.registration_id===registration.registration_id?sourcePreparationViews[group]:data?.currentSourcePreparationViews?.[group]?.registration?.registration_id===registration.registration_id?data.currentSourcePreparationViews[group]:null);
    if(!view) {notify('此来源组尚未完成原字节与语义核验。',true);return;}
    const display=group==='micro-source-overlay'?view.summary.displayCollections.cells:group==='road-source-connectivity'?{type:'FeatureCollection',features:Object.values(view.summary.display_layers).flatMap(layer=>layer.features)}:null;
    setSourceSelectedRef(null);
    if(display)locateSource(display,{group_id:group,kind:'group',key:group});
  }

  function selectMapObject(item) {
    if(item.layerKey.startsWith('geometry_')) {
      const p=item.feature.properties || {};
      if(!GEOMETRY_GROUP_NAMES[p.__geometry_group] || !p.__geometry_kind || !p.__geometry_key){notify('来源几何缺少完整组内身份，已保留当前场地。',true);return;}
      selectGeometryReference({group_id:p.__geometry_group,kind:p.__geometry_kind,key:p.__geometry_key});setDrawer('geometry-sources');return;
    }
    if(item.layerKey.startsWith('source_')) {
      const p=item.feature.properties || {};
      if(!SOURCE_GROUP_NAMES[p.__source_group] || !p.__source_kind || !p.__source_key) {notify('来源显示要素缺少完整组内身份，已保留当前场地。',true);return;}
      setSourceSelectedRef({group_id:p.__source_group,kind:p.__source_kind,key:p.__source_key});setDrawer('source-preparations');
      return;
    }
    setSelected(item);changeDrawer('object');
  }

  function adoptResearchRegistration() {
    const registration = data?.currentResearchRegistration;
    if (!registration) return;
    if (researchRegistrations.some(item => item.registration_id === registration.registration_id)) return;
    setResearchRegistrations(items => [...items,deepCopy(registration)]);
    setDirty(true);
    notify('已追加当前科研登记，原场景、历史来源和先前登记均保留。保存后可随交接包重开。');
  }

  async function restore(value,snapshot=projectSnapshot()) {
    validateProject(value);
    const restoredPreparationViews = await verifiedPreparationViews(value.preparationRegistrations || []);
    const restoredSupplementViews=await verifySupplementRegistrations(value.supplementRegistrations||[]);
    const restoredSourcePreparationViews=await verifySourcePreparationRegistrations(value.sourcePreparationRegistrations||[]);
    const restoredGeometrySourceViews=await verifyGeometrySourceRegistrations(value.geometrySourceRegistrations||[]);
    requireUnchangedProject(snapshot);
    const camera=value.uiState.camera;
    if(camera && mapRef.current){
      const map=mapRef.current,previous={center:map.getCenter().toArray(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()};
      restoringRef.current=true;
      try{map.jumpTo(camera);}catch(error){try{map.jumpTo(previous);}catch{}throw new Error('相机恢复失败，已保留原工程：'+error.message);}finally{restoringRef.current=false;}
    }
    setSupplementRegistrations(deepCopy(value.supplementRegistrations||[]));setSupplementViews(restoredSupplementViews);setSupplementsFieldPresent(Object.hasOwn(value,'supplementRegistrations'));
    setSourcePreparationRegistrations(deepCopy(value.sourcePreparationRegistrations||[]));setSourcePreparationViews(restoredSourcePreparationViews);setSourcePreparationsFieldPresent(Object.hasOwn(value,'sourcePreparationRegistrations'));
    setGeometrySourceRegistrations(retainVerifiedGeometryViews(restoredGeometrySourceViews));setGeometrySourceViews(restoredGeometrySourceViews);setGeometrySourcesFieldPresent(Object.hasOwn(value,'geometrySourceRegistrations'));
    setGeometryReviewOptions({samplingN:'2880',directionIndex:'0',windowScope:'inside'});
    setSourceReviewGroup('');setSourceSelectedRef(null);
    setGeometryReviewGroup('');setGeometrySelectedRef(null);
    setLastExport(null);
    setData(prev=>({...prev,sourcePackage:value.sourcePackage}));
    setSiteScene(value.scene);setSiteLayers(value.layers);setImports(value.imports || []);
    setResearchRegistrations(deepCopy(value.researchRegistrations || []));
    setPreparationRegistrations(deepCopy(value.preparationRegistrations || []));
    setPreparationViews(restoredPreparationViews);
    setStage(value.uiState.stage);setRegion(value.uiState.region || '成都');
    setCenter(value.uiState.center);setLocation(value.uiState.location || value.scene.site_id);
    setVisible({...DEFAULT_VISIBLE,...value.uiState.visible});setOffline(!!value.uiState.offline);
    const ref=value.uiState.selectedReference;
    const preparation = value.preparationRegistrations?.at(-1);
    const housing = preparation && restoredPreparationViews[preparation.registration_id]?.inputs[RESIDENCE_SOURCE_PATH];
    const selectedLayer = ref?.layerKey === 'residence_candidates' ? housing : ref && value.layers[ref.layerKey];
    const feature=ref && selectedLayer?.features.find(f=>ref.id!=null?f.id===ref.id:ref.platformId!=null && f.properties?.__platform_object_id===ref.platformId);
    setSelected(feature?{layerKey:ref.layerKey,feature}:null);
    setPreview(!!value.uiState.preview);setDrawer(value.uiState.drawer==='object'&&!feature?'overview':value.uiState.drawer || '');setOrbit(false);setDirty(false);
  }

  async function save() {
    try {
      setLoadingFile(true);
      const snapshot=projectSnapshot();
      const value=project();
      validateProject(value);
      await verifiedPreparationViews(value.preparationRegistrations || []);
      await verifySupplementRegistrations(value.supplementRegistrations||[]);
      await verifySourcePreparationRegistrations(value.sourcePreparationRegistrations||[]);
      await verifyGeometrySourceRegistrations(value.geometrySourceRegistrations||[]);
      requireUnchangedProject(snapshot);
      await saveProjectText(JSON.stringify(value));
      const readback=parseProjectJson(await readSavedProjectText());
      if(JSON.stringify(readback)!==JSON.stringify(value)) throw new Error('本地保存读回不一致。');
      requireUnchangedProject(snapshot);
      setSaved(true);setSaveState('已保存');setDirty(false);
      notify(`已保存并读回核对：科研登记 ${researchRegistrations.length} 份，冻结准备 ${preparationRegistrations.length} 份，成果 ${supplementRegistrations.length} 组，来源准备 ${sourcePreparationRegistrations.length} 组，来源几何 ${geometrySourceRegistrations.length} 组。原科学状态保留。`);
    } catch(error) {notify(`保存失败：${error.message}。可改用导出交接包。`,true);}
    finally {setLoadingFile(false);}
  }

  async function restoreSaved() {
    try {
      setLoadingFile(true);
      const snapshot=projectSnapshot();
      const text=await readSavedProjectText();
      if(!text) throw new Error('此浏览器没有已保存的场地。');
      await restore(parseProjectJson(text),snapshot);setSaveState('已保存');notify('已恢复本地保存的场地、准备资料与视图；科学状态保持原值。');
    } catch(error) {notify(error.message,true);}
    finally {setLoadingFile(false);}
  }

  async function exportProject(format = 'zip') {
    try {
      setLoadingFile(true);
      const snapshot=projectSnapshot();
      const previous=exportSnapshotRef.current;
      const unchanged=previous&&Object.keys(snapshot.state).every(k=>snapshot.state[k]===previous.snapshot.state[k])&&snapshot.camera===previous.snapshot.camera;
      const value=unchanged?previous.value:project();
      await verifiedPreparationViews(value.preparationRegistrations || []);
      await verifySupplementRegistrations(value.supplementRegistrations||[]);
      await verifySourcePreparationRegistrations(value.sourcePreparationRegistrations||[]);
      await verifyGeometrySourceRegistrations(value.geometrySourceRegistrations||[]);
      requireUnchangedProject(snapshot);
      exportSnapshotRef.current={snapshot,value};
      const isJson = format === 'json';
      const bytes=isJson ? new TextEncoder().encode(JSON.stringify(value,null,2)) : await makeArchive(value);
      const readback=isJson ? parseProjectJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) : await parseArchive(bytes);
      if(JSON.stringify(readback)!==JSON.stringify(value)) throw new Error('导出内容读回不一致。');
      const sha256=await digest(bytes);
      requireUnchangedProject(snapshot);
      const url=URL.createObjectURL(new Blob([bytes],{type:isJson?'application/json':'application/zip'}));
      const link=document.createElement('a');
      link.href=url;link.download=`街区交接_${value.scene.site_id}_${new Date().toISOString().replace(/[:.]/g,'-')}.${isJson?'json':'zip'}`;
      link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
      setLastExport({sha256,bytes:bytes.length,filename:link.download});
      notify('交接包已生成并触发下载，内存读回一致。下载后可用“重开交接包”核对磁盘文件。');
    } catch(error) {notify(`导出失败：${error.message}`,true);} finally {setLoadingFile(false);}
  }

  async function reopenFile(event) {
    const file=event.target.files?.[0];event.target.value='';
    if(!file) return;
    try {
      setLoadingFile(true);
      const snapshot=projectSnapshot();
      if(file.size>PROJECT_MAX_FILE_BYTES) throw new Error('文件超过工程96MB读取限额。');
      const bytes=await file.arrayBuffer();
      const value=file.name.toLowerCase().endsWith('.zip')?await parseArchive(bytes):parseProjectJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      const sha256=await digest(bytes);
      await restore(value,snapshot);setSaveState('已重开');notify(`已从文件重开${value.scene.site_id}；来源哈希、空值与四类状态已保留。`);
      setLastExport({filename:file.name,sha256,bytes:file.size,reopened:true});
    } catch(error) {notify(`无法重开：${error.message}`,true);} finally {setLoadingFile(false);}
  }

  async function importGeometry(event) {
    const file=event.target.files?.[0];event.target.value='';
    if(!file) return;
    try {
      setLoadingFile(true);
      const snapshot=projectSnapshot();
      if(!declaredCrs) throw new Error('先确认此文件的坐标是WGS84经纬度；首版不猜测坐标系。');
      if(file.size>20000000) throw new Error('GeoJSON超过首版20MB限额。');
      const bytes=await file.arrayBuffer();
      const collection=validateCollection(JSON.parse(new TextDecoder().decode(bytes)));
      if(!collection.features.length) throw new Error('文件没有可浏览要素。');
      const sha256=await digest(bytes);
      const b=boundsOf(collection);
      const nextCenter=[(b[0]+b[2])/2,(b[1]+b[3])/2];
      const scopes=scopesFor(nextCenter);
      const imported=deepCopy(collection);
      imported.features=imported.features.map((f,i)=>({...f,properties:{...f.properties,__platform_object_id:`import_${sha256.slice(0,10)}_${i}`,__source_file:file.name,__declared_crs:'EPSG:4326',__science_state:'not_assessed'}}));
      const layers={...scopes,[importRole]:imported};
      const caseId=`用户场地_${sha256.slice(0,8)}`;
      const item={file_name:file.name,sha256,bytes:file.size,feature_count:imported.features.length,declared_crs:'EPSG:4326',declared_role:importRole,file_acceptance:{state:'accepted_for_browse',scope:'json_structure_and_coordinate_range_only'},science_validation:{state:'not_assessed'},integration:{state:'local_geometry_browse'},execution:{state:'imported_not_research_run'}};
      requireUnchangedProject(snapshot);
      setSiteScene({site_id:caseId,scenario_id:`${caseId}_geometry`,scenario_type:'geometry_candidate',center_lon_lat:nextCenter,sample_status:'user_provided_geometry_not_verified',scope_registry:[{support_id:'core_100',role:'user_core_preview',width_m:100,status:'platform_derived_preview'},{support_id:'surrounding_view_300',role:'surrounding_view_preview',width_m:300,status:'platform_derived_preview_not_macro_node_admission'},{support_id:'physical_solver_domain',role:'solver_domain',width_m:null,status:'not_defined'}],counts:{imported_feature_count:imported.features.length},tables:{},records:[],version_alignment:{}});
      setSiteLayers(layers);setCenter(nextCenter);setLocation(caseId);setImports([item]);setPreview(true);setStage('region');setModal(false);setLastExport(null);setDirty(true);
      setPreparationRegistrations([]);
      setSourceReviewGroup('');setSourceSelectedRef(null);
    setGeometryReviewGroup('');setGeometrySelectedRef(null);
      mapRef.current?.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:150,maxZoom:17,duration:1200});
      notify(`已读取${imported.features.length}个来源要素，可确认范围后进入场地。`);
    } catch(error) {notify(`导入失败：${error.message}`,true);} finally {setLoadingFile(false);}
  }

  const changeDrawer=next=>{setDrawer(next);if(!['source-preparations','geometry-sources'].includes(next) && !['source-preparations','geometry-sources'].includes(drawer))setDirty(true);};
  const toggleLayer=key=>{setVisible(v=>({...v,[key]:!(v[key] ?? DEFAULT_VISIBLE[key])}));setDirty(true);};
  const pick=(lonlat,feature)=>{if(stage!=='region' || preview)return;try{setLocation(feature?.properties?.grid_id || `${lonlat[0].toFixed(6)}, ${lonlat[1].toFixed(6)}`);locateAt(lonlat,feature);}catch(error){notify(error.message,true);}};

  if(bootError) return <main className="boot"><WarningCircle size={40}/><h1>资料展示包尚未载入</h1><p>{bootError}</p><button onClick={()=>window.location.reload()}>重新载入</button></main>;
  if(!data) return <main className="boot"><Stack size={40}/><h1>正在读取本地研究资料</h1><p>核对来源、范围与场地图层</p></main>;
  const researchEvidence = mode => <ResearchEvidence registrations={researchRegistrations} currentRegistration={data.currentResearchRegistration} error={researchError} mode={mode} onOpen={()=>changeDrawer('research')} onAdopt={adoptResearchRegistration} onExportJson={()=>exportProject('json')}/>;
  const supplementEvidence=mode=><SupplementEvidence registrations={supplementRegistrations} views={supplementViews} currentRegistrations={data.currentSupplementRegistrations||[]} error={supplementError} onAdopt={adoptSupplements} onOpen={()=>changeDrawer('supplements')} onExportJson={()=>exportProject('json')} mode={mode} busy={loadingFile}/>;
  const preparationEvidence = mode => <PreparationEvidence registrations={preparationRegistrations} currentRegistration={data.currentPreparationRegistration} currentView={data.currentPreparationView} views={preparationViews} error={preparationError} eligible={preparationEligible} mode={mode} onOpen={()=>changeDrawer('preparation')} onAdopt={adoptPreparationRegistration} onExportJson={()=>exportProject('json')}/>;
  const sourcePreparationEvidence=mode=><SourcePreparationEvidence registrations={sourcePreparationRegistrations} views={sourcePreparationViews} currentRegistrations={data.currentSourcePreparationRegistrations||[]} currentViews={data.currentSourcePreparationViews||{}} error={sourcePreparationError} mode={mode} busy={loadingFile} onAdopt={adoptSourcePreparations} onOpen={()=>changeDrawer('source-preparations')} onExportJson={()=>exportProject('json')} onShowGroup={showSourceGroup} onHideMap={()=>{setSourceReviewGroup('');setSourceSelectedRef(null);
    setGeometryReviewGroup('');setGeometrySelectedRef(null);}} onLocate={locateSource} onError={message=>notify(message,true)} reviewGroup={sourceReviewGroup} selectedReference={sourceSelectedRef}/>;

  const geometrySourceEvidence=mode=><GeometrySourceEvidence registrations={geometrySourceRegistrations} views={geometrySourceViews} currentRegistrations={data.currentGeometrySourceRegistrations||[]} currentViews={data.currentGeometrySourceViews||{}} error={geometrySourceError} mode={mode} busy={loadingFile} onAdopt={adoptGeometrySources} onOpen={()=>changeDrawer('geometry-sources')} onExportJson={()=>exportProject('json')} onShowGroup={showGeometryGroup} onHideMap={()=>{setGeometryReviewGroup('');setGeometrySelectedRef(null);}} onLocate={locateGeometry} onError={message=>notify(message,true)} onOptions={setGeometryReviewOptions} onSelectReference={selectGeometryReference} reviewGroup={geometryReviewGroup} selectedReference={geometrySelectedRef} options={geometryReviewOptions}/>;

  return <main className={`workspace ${stage}`}>
    <MapCanvas sceneLayers={siteLayers} regionalNodes={data.nodes} regionalGreenPoints={data.greenPoints} regionalRoads={data.regionalRoads} residenceCandidates={residenceCandidates} sourceReviewCollections={sourceReviewCollections} geometryReviewCollections={geometryReviewCollections} center={center} stage={stage} visible={visible} offline={offline} orbit={orbit} onOrbitPause={()=>setOrbit(false)} onPick={pick} onSelect={selectMapObject} onReady={map=>{mapRef.current=map;map.on('moveend',()=>{if(!restoringRef.current)setDirty(true);});}} onMapError={error=>notify(error?.message || String(error),true)}/>
    <header className="masthead">
      <button className="brand" onClick={()=>goRegion('成都')} aria-label="回到成都区域地图"><Stack size={34} weight="duotone"/><span>街区绿色空间研究<small>城市尺度 · 精细场地 · 科学分析</small></span></button>
      <nav className="steps" aria-label="研究路径"><button className={stage==='region'?'active':''} onClick={()=>goRegion()}><span>1</span>定位场地</button><ArrowRight size={15}/><button className={stage==='site'&&drawer!=='capabilities'?'active':''} onClick={()=>{if(stage==='region')enterSite();else changeDrawer('overview');}}><span>2</span>检查资料</button><ArrowRight size={15}/><button className={drawer==='capabilities'?'active':''} onClick={()=>changeDrawer('capabilities')}><span>3</span>分析条件</button></nav>
      <div className="header-actions"><select aria-label="区域视野" value={region} onChange={e=>goRegion(e.target.value)}><option>成都</option><option>四川</option></select><button title="恢复本地保存" aria-label="恢复本地保存" onClick={restoreSaved} disabled={!saved || loadingFile}><FolderOpen size={21}/></button><button title="重开交接包" aria-label="重开交接包" disabled={loadingFile} onClick={()=>reopenRef.current.click()}><FileArrowUp size={21}/></button><button title="保存场地" aria-label="保存场地" disabled={loadingFile} onClick={save}><FloppyDisk size={21}/></button><span className="save-status">{dirty?'有未保存设置':saveState}</span></div>
    </header>

    <aside className="map-tools" aria-label="地图控制"><button aria-label="地图放大" onClick={()=>mapRef.current?.zoomIn()}><Plus size={21}/></button><button aria-label="地图缩小" onClick={()=>mapRef.current?.zoomOut()}><Minus size={21}/></button><button aria-label="回到北向" onClick={()=>mapRef.current?.easeTo({bearing:0,duration:600})}><Compass size={23}/></button><button aria-label="切换俯视与倾斜" onClick={()=>mapRef.current?.easeTo({pitch:mapRef.current.getPitch()>10?0:55,duration:600})}><ArrowsOut size={22}/></button><button className={orbit?'on':''} aria-label={orbit?'暂停环视':'开始环视'} onClick={()=>setOrbit(v=>!v)}>{orbit?<Pause size={22}/>:<Play size={22}/>}</button><button className={visible.greenFx!==false?'on':''} aria-label="绿色光效" title="绿色光效随缩放展开" aria-pressed={visible.greenFx!==false} onClick={()=>toggleLayer('greenFx')}><Sparkle size={22}/></button><button className={offline?'on':''} aria-label={offline?'启用在线导航底图':'只用本地图层'} onClick={()=>{setOffline(v=>!v);setDirty(true);}}><MoonStars size={22}/></button><button className={drawer==='source-preparations'?'on':''} aria-label="来源准备审阅" title="审阅三组来源准备" onClick={()=>changeDrawer('source-preparations')}><Info size={22}/></button><button className={drawer==='geometry-sources'?'on':''} aria-label="来源几何与对象审阅" title="审阅三组来源几何与对象" onClick={()=>changeDrawer('geometry-sources')}><Buildings size={22}/></button></aside>

    {stage==='region' && <>
      <div className="map-caption"><span className="eyebrow">{region}区域浏览</span><h1>从城市，进入你的场地</h1><p>自由探索区域 · 定位核心与周边 · 以真实资料开展研究</p></div>
      <section className={`entry-dock ${preview?'has-preview':''}`} aria-label="场地定位">
        <div className="dock-title"><MapPin size={28} weight="duotone"/><div><h2>{preview?'确认位置与范围':'定位你的研究场地'}</h2><p>{preview?`${currentName} · ${centerLabel}`:'输入经纬度、已有网格编号，或在地图上点选'}</p></div></div>
        <div className="dock-controls"><label className="location-field"><MapPin size={20}/><input aria-label="场地位置" value={location} onChange={e=>{setLocation(e.target.value);setPreview(false);setDirty(true);}} onKeyDown={e=>{if(e.key==='Enter')locate();}} placeholder="经纬度或网格编号，例如 E4125_N33891"/></label><button className="secondary" onClick={()=>{setDeclaredCrs(false);setModal(true);}}><FileArrowUp size={20}/>导入场地资料</button><div className="scope-label">核心 <strong>100 × 100 m</strong><br/>周边视图 <strong>300 × 300 m</strong></div><button className="primary" onClick={preview?enterSite:locate}>{preview?'进入场地':'定位并预览'}<ArrowRight size={24}/></button></div>
        <div className="dock-bottom"><span>{preview?(native?'当前原包仍保留500米准备窗；物理求解域待定义':'此位置的建筑/植被按实际导入资料显示'):'区域导航范围与经过验证的研究范围分别记录'}</span><button className="text-button" onClick={openExample}>浏览真实工程样例 <ArrowRight size={15}/></button></div>
      </section>
    </>}

    {stage==='site' && <>
      <div className="site-location"><button onClick={()=>goRegion()}><ArrowLeft size={16}/>区域</button><span><strong>{currentName}</strong><small>{centerLabel} · {native?'可替换准备样例，非正式研究样本':'用户资料 / 位置预览'}</small></span><span className="status-tag">{native?'工作高度待核':'资料待核'}</span></div>
      <aside className="layer-rail" aria-label="场地图层"><p>空间图层</p>{[['bounds','范围',Stack],['buildings','建筑',Buildings],['vegetation','植被',Leaf],['roads','道路线',MapPin],['receptors','候选点',Compass]].map(([key,label,Icon])=><button key={key} aria-pressed={visible[key]} className={visible[key]?'on':''} onClick={()=>toggleLayer(key)}><Icon size={24}/><span>{label}</span></button>)}{preparationEligible && adoptedPreparationView && <button aria-label="住宅候选" aria-pressed={visible.residenceCandidates} className={visible.residenceCandidates?'on':''} onClick={()=>toggleLayer('residenceCandidates')}><Buildings size={24}/><span>住宅候选</span></button>}<button aria-pressed={visible.regional} onClick={()=>toggleLayer('regional')} className={visible.regional?'on':''}><Stack size={24}/><span>宏观格网</span></button></aside>
      <div className="site-toolbar"><button onClick={()=>changeDrawer('overview')} className={drawer==='overview'?'active':''}>资料概况</button><button onClick={()=>changeDrawer('missing')} className={drawer==='missing'?'active':''}>待补输入</button><button onClick={()=>changeDrawer('versions')} className={drawer==='versions'?'active':''}>来源与版本</button><button onClick={()=>changeDrawer('supplements')} className={drawer==='supplements'?'active':''}>成果资料</button><button onClick={()=>changeDrawer('source-preparations')} className={drawer==='source-preparations'?'active':''}>来源准备</button><button onClick={()=>changeDrawer('geometry-sources')} className={drawer==='geometry-sources'?'active':''}>来源几何</button><button onClick={()=>changeDrawer('metrics')} className={drawer==='metrics'?'active':''}>已有指标</button><button onClick={()=>changeDrawer('capabilities')} className={drawer==='capabilities'?'active':''}>分析条件</button></div>
    </>}

    {drawer && <aside className="detail-drawer" aria-label="资料详情"><div className="drawer-heading"><span className="eyebrow">场地资料与证据</span><button aria-label="关闭资料详情" onClick={()=>changeDrawer('')}><X size={20}/></button></div>
      {drawer==='overview' && <><h2>进入场地，核查资料</h2><p className="muted">{native?'现有GIS、来源体块与已有几何描述可浏览。尚未进行物理求解。':'这里只显示当前位置已载入的资料。没有数据的图层保持空缺。'}</p>
        {native?<><div className="stat-rows"><div><span>来源建筑 / 工作体块</span><strong>{countText(counts.building_source_count)} / {countText(counts.building_part_count)}</strong></div><div><span>核心植被裁片 / 源连通组</span><strong>{countText(counts.vegetation_fragment_count)} / {countText(counts.source_green_group_count)}</strong></div><div><span>源连通身份</span><strong>{(counts.vegetation_source_group_ids || []).join(", ")}</strong></div><div><span>分类投影面积</span><strong>{countText(counts.classified_projection_area_m2)} m²</strong></div><div><span>道路线（每个时期）</span><strong>{Object.values(counts.roads_per_snapshot || {}).map(v=>`${v}条`).join(" / ")}</strong></div></div><p className="evidence-note">3个裁片不等于3处独立绿地；53个来源建筑与54个工作体块分别计数。两期道路不合并称34条独立道路。</p></>:<div className="empty-note"><Info size={22}/><span>{imports.length?`已导入${imports[0].feature_count}个${LAYER_NAMES[imports[0].declared_role] || '资料'}要素`:'尚未载入该位置的建筑、植被或热结果。可导入自己的WGS84 GeoJSON资料。'}</span></div>}
        <h3>范围分别登记</h3><div className="scope-rows">{(siteScene.scope_registry || []).map(scope=><div key={scope.support_id}><i className={scope.width_m===100?'core':scope.width_m===300?'macro':'context'}/><span>{scope.width_m===100?'研究核心':scope.width_m===300?(native?'宏观一圈邻域':'周边视图'):scope.width_m===500?'微观取数准备窗':'物理求解域'}</span><strong>{scope.width_m==null?'待定义':`${scope.width_m} m`}</strong></div>)}</div><p className="evidence-note">{native?'300米不裁掉原500米包，也不作为CFD域。场地展示不扩大已验证研究范围。':'100米核心与300米周边均为显示范围预览，物理求解域须单独定义。'}</p>
        {snapshotLabels.length>0 && <label className="select-row">道路线显示时期<select value={visible.roads_snapshot || ''} onChange={e=>{setVisible(v=>({...v,roads_snapshot:e.target.value}));setDirty(true);}}><option value="">两期分别保留</option>{snapshotLabels.map(v=><option key={v}>{v}</option>)}</select></label>}
        <button className="primary full" onClick={()=>changeDrawer('missing')}>查看待补输入 <ArrowRight size={21}/></button>
        {geometrySourceEvidence('summary')}{sourcePreparationEvidence('summary')}{supplementEvidence('summary')}{preparationEvidence('summary')}{researchEvidence('summary')}
      </>}
      {drawer==='missing' && <><h2>把缺项留在交接中</h2><p className="muted">文件可读、来源一致与科学验证分别记录。空值保持空值。</p>{preparationEvidence('summary')}<RecordList rows={tableRows(siteScene,'micro_missing_inputs')} empty="该位置尚未提交参数/缺项表；不以工程样例参数补齐。"/><button className="primary full" onClick={exportProject} disabled={loadingFile}>导出待补交接包 <DownloadSimple size={20}/></button></>}
      {drawer==='versions' && <><h2>来源与冻结版本</h2><p className="muted">{native?'24个原件为本地引用清单；此平台使用受控展示副本。':'下方24项是平台内置工程包的引用清单，不代表该用户位置已有这些研究资料。'}</p>{imports.map(item=><section className="version-change" key={item.sha256}><h3>当前场地导入来源</h3><RecordList rows={[item]} empty=""/></section>)}{changes && <section className="version-change"><WarningCircle size={22}/><h3>联结表版本不同</h3><p>微观准备包保持冻结来源；当前宏观联结表另行保留，未自动重建场景。</p><dl><dt>冻结SHA256</dt><dd>{changes.frozen_sha256}</dd><dt>当前SHA256</dt><dd>{changes.current_sha256}</dd></dl></section>}
        {geometrySourceEvidence('summary')}{sourcePreparationEvidence('summary')}{supplementEvidence('sources')}{preparationEvidence('sources')}{researchEvidence('sources')}
        <h3>原场景来源清单</h3>
        {(data.sourcePackage.platform_adaptation?.source_version_changes || []).map((change,i)=><div className="evidence-note" key={i}>产品接口本轮已更新，旧清单与当前文件哈希分别记录；不升级科研状态。<pre>{JSON.stringify(change,null,2)}</pre></div>)}
        <div className="source-list">{data.sourcePackage.artifacts.map(a=><details key={a.artifact_id}><summary>{a.purpose || a.artifact_id}<small>{a.type} · {countText(a.bytes)} bytes</small></summary><p>{a.source_project_relative_path}</p><dl><dt>源SHA256</dt><dd>{a.sha256}</dd>{['file_acceptance','science_validation','integration','execution'].map(key=><React.Fragment key={key}><dt>{{file_acceptance:'文件验收',science_validation:'科学验证',integration:'软件接入（源声明）',execution:'执行（源声明）'}[key]}</dt><dd>{showValue(a[key]?.state ?? a[key])}</dd></React.Fragment>)}</dl></details>)}</div>
      </>}
      {drawer==='metrics' && <><h2>已有实算与口径</h2><p className="muted">这些是来源几何代理与候选诊断；不是风速、温度或改造效果。</p><h3>建筑连续描述</h3><RecordList rows={tableRows(siteScene,'micro_geometry_metrics')} empty="未载入该场地的实算指标。"/><h3>目标格六口径记录</h3><RecordList rows={Array.isArray(siteScene.records)?siteScene.records:[]} empty="未载入该位置的候选口径记录。"/><p className="evidence-note">全域6,567个唯一网格、58,215条边和39,402条六口径行分别计数。未适用、缺失与未计算不能填0。</p></>}
      {drawer==='object' && selected && <><h2>{LAYER_NAMES[selected.layerKey] || selected.layerKey}</h2><p className="muted">{selected.layerKey==='residence_candidates'?'住宅发布标签候选，完整源面保留；实际入住、建筑人口与服务角色待核。':'原属性与源身份；未知高度、类别和时点保持原说明。'}</p><dl className="object-fields">{Object.entries(selected.feature.properties || {}).map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{showValue(value)}</dd></React.Fragment>)}</dl></>}
      {drawer==='preparation' && <><h2>共同试点准备资料</h2>{preparationEvidence('full')}</>}
      {drawer==='supplements' && <><h2>五组成果资料</h2>{supplementEvidence('full')}</>}
      {drawer==='source-preparations' && <><h2>三组来源准备</h2>{sourcePreparationEvidence('full')}</>}
      {drawer==='geometry-sources' && <><h2>来源几何与对象</h2>{geometrySourceEvidence('full')}</>}
      {drawer==='research' && <><h2>科研开发证据</h2>{researchEvidence('full')}</>}
      {drawer==='capabilities' && <><h2>选择下一项研究任务</h2><p className="muted">当前可进行资料检查与已有指标浏览。各科研模块须通过其输入、研究验证及软件验收。</p>{supplementEvidence('summary')}{preparationEvidence('summary')}{researchEvidence('summary')}<h3>各方向应用条件</h3><div className="capability-list">{data.sourcePackage.capabilities.map(cap=><details key={cap.capability_id}><summary><span>{cap.capability_id} · {cap.question}</span><em>条件待补 / 待接入</em></summary><dl>{Object.entries(cap).filter(([key])=>!['question','capability_id'].includes(key)).map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{showValue(value)}</dd></React.Fragment>)}</dl></details>)}</div><div className="goal-note"><h3>两种目标分别保存</h3><p>02：最小标准化指标距离D（无量纲）。</p><p>03：达到共同预测目标的最少新增绿色投影面积（m²），协议与独立搜索待确认。</p><p>D候选换算面积不等于面积最优。当前未执行这两种搜索。</p></div><button className="primary full" onClick={save}>保存分析准备记录 <FloppyDisk size={21}/></button></>}
      <div className="drawer-footer"><button className="secondary" disabled={loadingFile} onClick={save}><FloppyDisk size={18}/>保存</button><button className="primary" onClick={exportProject} disabled={loadingFile}><DownloadSimple size={18}/>{loadingFile?'整理中':'导出交接'}</button></div>
      {lastExport && <p className="export-receipt">{lastExport.reopened?'已重开文件':'最近导出'}：{lastExport.filename}<br/>SHA256：{lastExport.sha256}<br/>{countText(lastExport.bytes)} bytes</p>}
    </aside>}

    <footer className="map-legend"><span><i className="legend-green"/>{visible.greenFx!==false?'绿色光效 · c4_min0候选分类':'绿色光效已关闭'}</span><span><i className="legend-building"/>建筑来源几何</span>{stage==='site' && preparationEligible && adoptedPreparationView && <span><i className="legend-residence"/>住宅标签候选</span>}<span><i className="legend-core"/>100米核心</span>{siteLayers.context && <span><i className="legend-context"/>500米准备窗</span>}{stage==='site'&&<span>植被 / 分类投影</span>}<span>青蓝源线 · 2021参考</span>{geometryReviewGroup && <span className="legend-source">来源几何：{GEOMETRY_GROUP_NAMES[geometryReviewGroup]} · 角色 / 物理应用未采用</span>}{sourceReviewGroup && <span className="legend-source">来源审阅：{SOURCE_GROUP_NAMES[sourceReviewGroup]} · 原m² / m · 未采用</span>}<span className="legend-info">{offline?'本地研究图层；在线底图已关闭':'在线底图仅供导航'} · DEM未接入 · 尚未仿真</span></footer>
    <div className="map-hint">拖动移动 · 滚轮缩放 · 右键拖动旋转</div>
    {notice && <div className={`toast ${notice.error?'error':''}`} role={notice.error?'alert':'status'}>{notice.error?<WarningCircle size={21}/>:<CheckCircle size={21}/>}<span>{notice.text}</span><button aria-label="关闭提示" onClick={()=>setNotice(null)}><X size={17}/></button></div>}

    {modal && <div className="modal-backdrop"><section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="close" aria-label="关闭导入" onClick={()=>setModal(false)}><X size={22}/></button><FileArrowUp size={36} weight="duotone"/><h2 id="import-title">导入你的场地资料</h2><p>首版读取本机GeoJSON。原文件不改写，图层按你声明的角色显示。</p><label>图层角色<select value={importRole} onChange={e=>setImportRole(e.target.value)}><option value="buildings">建筑轮廓（无高度时仅2D）</option><option value="vegetation">植被投影</option><option value="roads">道路线</option><option value="user_import">其他场地几何</option></select></label><label className="checkbox"><input type="checkbox" checked={declaredCrs} onChange={e=>setDeclaredCrs(e.target.checked)}/>我确认文件坐标为WGS84经纬度（EPSG:4326）</label><p className="evidence-note">GeoPackage、GeoTIFF和OBJ目前通过已有受控研究包接入。未知坐标不猜测；导入成功不代表科学验证通过。</p><button className="primary full" disabled={!declaredCrs || loadingFile} onClick={()=>uploadRef.current.click()}>选择GeoJSON文件 <ArrowRight size={22}/></button><button className="text-button" onClick={()=>{setModal(false);reopenRef.current.click();}}>重开本平台的ZIP / JSON交接包</button></section></div>}
    <input className="hidden-file" ref={uploadRef} type="file" accept=".geojson,.json" onChange={importGeometry} aria-label="选择场地GeoJSON文件"/>
    <input className="hidden-file" ref={reopenRef} type="file" accept=".zip,.json" onChange={reopenFile} aria-label="选择交接包文件"/>
  </main>;
}

function RecordList({rows,empty}) {
  if(!rows.length) return <p className="empty-note">{empty}</p>;
  return <div className="record-list">{rows.map((row,index)=><details key={index}><summary>{row.parameter_name || row.input_name || row.item || row.metric_id || row.metric || row.variant || row['参数'] || row['名称'] || `来源记录 ${index+1}`}</summary><dl>{Object.entries(row).map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{showValue(value)}</dd></React.Fragment>)}</dl></details>)}</div>;
}
