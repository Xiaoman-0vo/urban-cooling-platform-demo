// Adapted from knight-L/sc-datav src/components/chart.tsx, Apache-2.0.
// Modified 2026-10-25: JavaScript/CSS port, explicit resize/dispose lifecycle,
// reduced-motion support and plain-text summaries provided by the parent.
import React, {useEffect, useRef} from 'react';
import * as echarts from 'echarts/core';
import {CanvasRenderer} from 'echarts/renderers';
import {BarChart, PieChart} from 'echarts/charts';
import {GridComponent, TooltipComponent} from 'echarts/components';

echarts.use([CanvasRenderer, BarChart, PieChart, GridComponent, TooltipComponent]);

export default function OverviewChart({option, label}) {
  const host = useRef(null);
  const chart = useRef(null);
  useEffect(() => {
    const instance = echarts.init(host.current, null, {renderer:'canvas'});
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(host.current);
    return () => {observer.disconnect(); instance.dispose(); chart.current = null;};
  }, []);
  useEffect(() => {
    chart.current?.setOption({...option,
      animation:!window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    }, {notMerge:true});
  }, [option]);
  return <div className="uc-chart" ref={host} role="img" aria-label={label}/>;
}
