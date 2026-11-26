import React, {useEffect, useMemo, useRef} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Buildings, CheckCircle, Leaf, MapPin, Stack} from '@phosphor-icons/react';
import OverviewChart from './OverviewChart.jsx';
import StudyMap3D from './StudyMap3D.jsx';
import GridStream from './GridStream.jsx';
import {overviewSummary} from './overview-data.js';
import './overview.css';

const number = value => value === null ? '待补充' : new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
const percent = value => value === null ? '待补充' : `${(value*100).toFixed(1)}%`;

function Panel({number:order, title, subtitle, children, className=''}) {
  return <section className={`uc-panel ${className}`}><div className="uc-panel-heading"><span>{order}</span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section>;
}

export default function CityOverview({data, onClose, onLocate, onOpenExample}) {
  const dialog = useRef(null);
  const summary = useMemo(()=>overviewSummary(data),[data]);
  const grids = useMemo(()=>(data.nodes?.features ?? []).filter(feature=>feature.properties?.role==='inside_full' && feature.properties?.grid_id).sort((a,b)=>a.properties.grid_id.localeCompare(b.properties.grid_id)),[data.nodes]);
  useEffect(()=>{
    const element=dialog.current;
    if(!element.open)element.showModal();
    return ()=>element.close();
  },[]);
  const roleOption = useMemo(()=>({
    color:summary.roles.map(role=>role.color),
    tooltip:{trigger:'item',renderMode:'richText',formatter:'{b}\n{c} 条记录 · {d}%'},
    series:[{type:'pie',radius:['67%','84%'],center:['50%','50%'],startAngle:90,
      itemStyle:{borderWidth:3,borderColor:'#0b242b',borderRadius:3},label:{show:false},
      data:summary.roles.map(role=>({name:role.name,value:role.value})),
    }],
  }),[summary]);
  const coverageOption = useMemo(()=>({
    grid:{top:4,left:0,right:0,bottom:0},
    xAxis:{type:'value',show:false,max:summary.clcd.total ?? undefined},
    yAxis:{type:'category',show:false,data:['CLCD 2020']},
    tooltip:{trigger:'item',renderMode:'richText',formatter:'{a}\n{c} 个源像元'},
    series:(summary.clcd.parts ?? []).map((value,index)=>({name:['绿类（2/3/4）','其他已知类别','未知 / 无数据'][index],
      type:'bar',stack:'coverage',barWidth:14,itemStyle:{color:['#65d9bd','#365661','#889096'][index]},data:[value],
    })),
  }),[summary]);

  return <dialog className="uc-overview" ref={dialog} aria-labelledby="uc-overview-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="uc-overview-content">
      <header className="uc-header"><a className="uc-logo" href="https://github.com/Xiaoman-0vo/urban-cooling-platform-demo" target="_blank" rel="noreferrer"><span className="uc-logo-mark"><Leaf size={24} weight="duotone"/></span><span>UrbanCool<span className="uc-logo-ai"> AI</span><small>URBAN COOLING RESEARCH</small></span></a><div className="uc-header-title"><span>城市研究 / OVERVIEW</span><h1 id="uc-overview-title">城市降温研究总览</h1></div><button className="uc-back" onClick={onClose} autoFocus><ArrowLeft size={17}/>返回规划工作台</button></header>
      <div className="uc-intro"><div><span className="uc-kicker">CHENGDU · RESEARCH EXPLORER</span><p>从城市结构，走进每一个街区。</p></div><span className="uc-snapshot"><i/>已有来源快照 <span>·</span> 总览试用</span></div>
      <section className="uc-metrics" aria-label="研究资料统计">
        <article><span>研究围合面积</span><strong>{number(summary.areaKm2)}<small>km²</small></strong><p>2021 OSM 边界 · 来源登记值</p></article>
        <article><span>宏观网格记录</span><strong>{number(summary.gridRecords)}<small>格</small></strong><p>100 m 网格 · 含边界与上下文</p></article>
        <article><span>接收候选记录</span><strong>{number(summary.receiverRecords)}<small>格</small></strong><p>依据 receiver_candidate 标记</p></article>
        <article><span>源图有向边</span><strong>{number(summary.edges)}<small>条</small></strong><p>含自环 · 描述图结构</p></article>
      </section>
      <div className="uc-dashboard">
        <div className="uc-column uc-left">
          <Panel number="01" title="研究空间构成" subtitle="按加载网格的角色分类">
            <div className="uc-ring"><OverviewChart option={roleOption} label={`网格角色：${summary.roles.map(role=>`${role.name}${role.value}格`).join('，')}`}/><div className="uc-ring-center"><strong>{number(summary.gridRecords)}</strong><span>网格记录</span></div></div>
            <dl className="uc-role-list">{summary.roles.map(role=><div key={role.key}><dt><i style={{background:role.color}}/>{role.name}</dt><dd>{number(role.value)}<small>格</small></dd></div>)}</dl>
          </Panel>
          <Panel number="02" title="植被来源概览" subtitle="CLCD 2020 · 成都导航范围">
            <div className="uc-coverage-number"><strong>{percent(summary.clcd.greenShare)}</strong><span>已知分类像元中的绿类占比</span></div>
            {summary.clcd.parts ? <div className="uc-coverage-chart"><OverviewChart option={coverageOption} label={`CLCD源像元：绿类${summary.clcd.green}，其他已知类别${summary.clcd.known-summary.clcd.green}，未知或无数据${summary.clcd.missing}`}/></div>:<p className="uc-note">分类统计缺失，保留空值。</p>}
            <div className="uc-coverage-key"><span><i/>绿类 2 / 3 / 4</span><span><i/>其他已知类别</span></div>
            <p className="uc-note">30 m 分类产品的显示口径，不能替代研究指标 G02。</p>
          </Panel>
        </div>
        <section className="uc-map-panel" aria-labelledby="uc-map-title"><div className="uc-map-heading"><span className="uc-kicker">STUDY AREA / 01</span><h2 id="uc-map-title">成都二环研究区</h2><p>真实边界与网格角色 · 轮廓展示</p></div><StudyMap3D boundary={data.studyBoundary} nodes={data.nodes}/><div className="uc-map-bottom"><span><MapPin size={16}/>成都 · 100 m 研究网格</span><button onClick={onOpenExample}>查看工程样例<ArrowUpRight size={17}/></button></div></section>
        <div className="uc-column uc-right">
          <Panel number="03" title="进入研究街区" subtitle="从已有完整内格定位场地"><GridStream features={grids} onLocate={onLocate}/></Panel>
          <Panel number="04" title="研究能力与接入" subtitle="查看已有资料，衔接下一步工作">
            <div className="uc-module"><span className="uc-module-icon"><Stack size={18}/></span><div><h3>02 · 宏观预测</h3><p>在线模型服务待接入</p></div><span className="uc-module-state">待接入</span></div>
            <div className="uc-module"><span className="uc-module-icon"><Leaf size={18}/></span><div><h3>03 · 增绿需求</h3><p>独立模型与面积协议</p></div><span className="uc-module-state">独立证据</span></div>
            <div className="uc-module"><span className="uc-module-icon"><Buildings size={18}/></span><div><h3>04 · 潜在冷机会</h3><p>机会与人口分配研究</p></div><span className="uc-module-state">独立证据</span></div>
            <p className="uc-note">02 / 03 / 04 保持各自口径。此页只读，不触发预测或联合计算。</p>
            <button className="uc-workbench-link" onClick={onClose}>进入规划工作台<ArrowRight size={16}/></button>
          </Panel>
        </div>
      </div>
      <footer className="uc-footer"><span><CheckCircle size={14}/>读取现有资料 · 未执行模型推理</span><span>OSM contributors · CLCD 2020 · <a href="https://github.com/knight-L/sc-datav" target="_blank" rel="noreferrer">sc-datav 界面组件</a> · <a href={`${import.meta.env.BASE_URL}licenses/overview-third-party-notices.txt`} target="_blank" rel="noreferrer">开源声明</a></span><span>UrbanCool AI / 总览试用</span></footer>
    </div>
  </dialog>;
}
