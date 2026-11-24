import {evaluationReadiness} from './evaluation-readiness.js';

const text=value=>typeof value==='string'?value:value?.detail||value?.label||'';
export function evaluationReadinessMarkdown(decision){
  if(!decision?.rows?.length)return [];
  const state=evaluationReadiness(decision);
  return ['', '## 评价适用性与待核事项','',`**${state.title}**`,state.detail,
    `本轮模型输出数值可区分：${state.model_delta_distinguishable===null?'暂不能比较':state.model_delta_distinguishable?'有差异（不代表实际有效差异）':'当前输出精度下不能区分'}。`,
    '当前不支持按实际降温效果选优或形成施工建议。',
    '',...state.limitations.map(item=>`- ${text(item)}`),'', '下一步：',...state.next_steps.map(item=>`- ${text(item)}`)];
}
