import {execFile} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {AgentError} from './agent-tools.mjs';

const run = promisify(execFile);
const program = fileURLToPath(new URL('./historical-lst.py', import.meta.url));
const temperatureArea = fileURLToPath(new URL('../public/data/planning-pilot-temperature.json', import.meta.url));
const gridPattern = /(?<![\w])E\d{4}_N\d{5}(?![\w])/gi;
const datePattern = /(?<!\d)(\d{4})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})(?!\d)\s*[日号]?/g;
const partialDatePattern = /\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g;
const temperatureQuestion = /(?:历史(?:地表)?温度|地表温度|有多热|多热|热不热|多少度|温度(?:是)?多少)/;
const placeReference = /这(?:个|一)?(?:格子|网格|块地|里)|(?:当前|选中的?|本)(?:格|网格|场地|位置)/;
const otherIntent = /预算|单价|费用|改造|改成|增绿|候选|方案|降温|气温|体感|天气|实时|取消|别(?:查|算|预测)|不要|不用|为何|为什么|怎么(?:算|预测|训练)|什么模型|能不能(?:用|跑)|对比|比较|导出|报告|生成|顺便|[。!?;]\s*[^\s。!?;]/;
const currentOrFuture = /今天|今日|现在|明天|后天|未来/;
export const HISTORICAL_LST_TOOL = 'estimate_historical_surface_temperature';

function calendarDate([, year, month, day]) {
  const iso = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().startsWith(iso) ? iso : null;
}

export function historicalTemperatureRequest(text, {selection, siteId, nodes, pending}={}) {
  const query = text.normalize('NFKC').trim();
  const grids = [...new Set([...query.matchAll(gridPattern)].map(([grid])=>grid.toUpperCase()))];
  const dates = [...new Set([...query.matchAll(datePattern)].map(calendarDate))];
  const withoutDates = query.replace(datePattern,'');
  const partialDate = [...withoutDates.matchAll(partialDatePattern)].length>0;
  const rest = withoutDates.replace(partialDatePattern,'').replace(gridPattern,'').replace(/[\s,，。！？!?、:：]/g,'');
  const followUp = pending && (grids.length || dates.length || partialDate) &&
    /^(?:网格(?:是|为)?|日期(?:是|为)?|就这天|就这个|就这格)*$/.test(rest);
  if (!followUp && (otherIntent.test(query) || !temperatureQuestion.test(query) ||
      (!dates.length && currentOrFuture.test(query)) ||
      !(grids.length || dates.length || partialDate || placeReference.test(query) || /历史/.test(query)))) return null;

  const selected = [selection?.id, siteId].find(id=>nodes?.has(id));
  const grid_id = grids.length===1 ? grids[0] : grids.length ? null : (followUp ? pending.grid_id : null) || selected || null;
  const date = dates.length===1 && !partialDate ? dates[0] :
    (!dates.length && !partialDate && followUp ? pending.date : null);
  return {grid_id,date};
}

export function createHistoricalTemperature({root=process.env.URBANCOOL_LST_ROOT, python=process.env.URBANCOOL_LST_PYTHON || 'python'}={}) {
  if(!root)return null;
  const experiment=resolve(root);
  async function estimate(query, args, signal) {
    const {stdout}=await run(python,[program,'--experiment',experiment,'--grid',query.grid_id,'--date',query.date,...args],
      {signal, timeout:15000, maxBuffer:16384, windowsHide:true, env:{...process.env, OMP_NUM_THREADS:'2', PYTHONDONTWRITEBYTECODE:'1'}});
    const result=JSON.parse(stdout);
    if(result.grid_id!==query.grid_id||result.date!==query.date)throw new Error('response scope');
    return result;
  }
  return {
    sample_prompt:'估计 E4105_N33911 在 2022-09-28 的历史地表温度',
    async estimate(query, {signal}={}) {
      try {
        const result=await estimate(query,[],signal);
        if(result.status==='no_data')return {...query,status:'no_data'};
        if(result.status!=='estimated'||!Number.isFinite(result.estimated_lst_c)||!Number.isFinite(result.observed_lst_c))
          throw new Error('response estimate');
        return result;
      } catch {
        if(signal?.aborted)throw new AgentError('turn_cancelled','本轮估计已停止。',499);
        throw new AgentError('historical_temperature_unavailable','历史地表温度模型未能运行，请检查本机 Python 环境和 V3 数据。',503);
      }
    },
    async evaluatePilot(query, {signal}={}) {
      try {
        const result=await estimate(query,['--temperature-area',temperatureArea,'--temperature-area-sha256',query.area_sha256,
          '--scenario-bounds',...query.bounds_utm.map(String)],signal);
        if(result.status!=='scenario_estimated'||result.area_sha256!==query.area_sha256||result.scene_id!==query.scene_id||
          result.area_m2!==query.area_m2||JSON.stringify(result.bounds_utm)!==JSON.stringify(query.bounds_utm)||
          !['observed_lst_c','baseline_lst_c','scenario_lst_c','predicted_delta_lst_c'].every(key=>Number.isFinite(result[key])))
          throw new Error('invalid scenario response');
        return result;
      } catch {
        signal?.throwIfAborted();
        throw new AgentError('pilot_temperature_unavailable','试算未能运行。请检查本机 Python、V3 模型数据和试算范围的版本后重试。',503);
      }
    },
  };
}

export function historicalTemperatureReply(result) {
  if(result.status==='needs_inputs'){
    const parts=[];
    if(!result.grid_id)parts.push('一个网格编号，也可以先在地图上定位网格');
    if(!result.date)parts.push('一个完整有效的日期（如 2022 年 9 月 28 日）');
    return `请提供${parts.join('，以及')}。`;
  }
  if(result.status==='no_data')return `${result.grid_id} 在 ${result.date} 没有通过校验的历史温度样本。`;
  const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
    .format(new Date(result.observed_utc));
  return `${result.grid_id} 在 ${result.date} 的地表温度估计为 **${result.estimated_lst_c.toFixed(2)}℃**。Landsat 观测为 **${result.observed_lst_c.toFixed(2)}℃**（北京时间 ${time}）。模型为 ${result.model_version}，使用 ${result.reference_grid_count} 个同日参考格。`;
}
