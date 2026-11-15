// Conservative lexical evidence checks. Ambiguous paraphrases remain a request
// for clarification; the presence of an unrelated number never authorizes it.
const FIELD_WORDS = {
  budget_rmb: /预算|建设费(?:上限|封顶值)?|费用上限|投入上限|投资(?:上限)?|总投入|钱|愿投入/g,
  candidate_area_m2: /候选面积|声明面积|面积声明|可讨论面积|候选(?:用地|地)|候选地面|声明(?:地面|候选地)|用地声明|面积(?:目标|这项)?/g,
  unit_cost_rmb_per_m2: /(?:建设|施工|假设|假定)?单价|单位(?:造价|费用)|每(?:平方米|平方|平米)(?:的)?(?:建设费|费用|价格|建设单价)?/g,
  added_green_target_m2: /新增(?:绿量|绿地|绿色|增绿)?(?:面积)?目标|新增绿量|增绿目标/g,
  target_delta_lst_c: /期望(?:地表)?降温|(?:地表)?降温目标|目标(?:地表)?降温/g,
};

export function goalValueMentioned(field, value, quote) {
  const text = quote.normalize('NFKC').replace(/(?<=\d)[,，](?=\d)/g, '');
  for (const match of text.matchAll(/(?<![A-Za-z\d.])-?\d+(?:\.\d+)?\s*(万|千|百)?/g)) {
    const numeric = Number(match[0].replace(/\s*(万|千|百)$/, '')) * ({万:10000,千:1000,百:100}[match[1]] || 1);
    if (Math.abs(numeric-value) >= 1e-8) continue;
    const start=match.index,end=start+match[0].length;
    const before=text.slice(0,start),after=text.slice(end);
    const left=before.split(/[，,、；;。!?！？\n]/).at(-1);
    const right=after.split(/[，,、；;。!?！？\n]/)[0];
    if (/(?:不是|不采用|不要|非)\s*$/.test(left) || /^\s*(?:元|平方米|㎡|度)?\s*(?:不用了|作废|不采用|撤回)/.test(right)) continue;
    // A source value in an explicit "from X to Y" revision is not authorization to save X.
    if (/(?:从|由)\s*$/.test(left) &&
        /^\s*(?:元(?:\s*(?:\/|每)\s*(?:平方米|平方|平米|m2|m²))?|平方米|平米|m2|m²|度|°C)?\s*(?:改|调整|调|降|提|增|减|涨|缩|扩|变|换|抬)?(?:到|为|成|至)/i.test(right)) continue;
    const anchors=[];
    for (const [kind, pattern] of Object.entries(FIELD_WORDS)) {
      for (const anchor of left.matchAll(pattern)) anchors.push({kind,distance:left.length-anchor.index-anchor[0].length,side:'left'});
      for (const anchor of right.matchAll(pattern)) {
        // Postfixed labels: "800平方米候选地", "100元/平方米的假设单价".
        if (anchor.index<=10) anchors.push({kind,distance:anchor.index,side:'right'});
      }
    }
    const costUnit=/^\s*元\s*(?:\/|每)\s*(?:平方米|平方|平米|m2|m²|㎡)/i.test(right) ||
      /每(?:平方米|平方|平米|㎡)[^，,、；;。\d]{0,14}$/.test(left);
    if (costUnit) { if (field==='unit_cost_rmb_per_m2') return true; continue; }
    // Prefer the nearest explicit field label preceding a number. On overlap,
    // the more specific green-area label beats the generic "面积" label.
    anchors.sort((a,b)=>a.distance-b.distance || (a.kind==='added_green_target_m2'?-1:1));
    const label=anchors.find(anchor=>anchor.side==='left')?.kind || anchors[0]?.kind;
    let detected=label;
    if (/^\s*(?:平方米|平米|㎡|m2|m²)/i.test(right)) detected=label==='added_green_target_m2'?label:'candidate_area_m2';
    else if (/^\s*元/.test(right)) detected=label==='unit_cost_rmb_per_m2'?label:'budget_rmb';
    else if (/^\s*(?:度|℃|°C)/i.test(right)) detected=label==='target_delta_lst_c'?label:null;
    if (detected===field) return true;
  }
  return false;
}

export function predictionRequested(original) {
  const text=original.normalize('NFKC');
  const negative=/(?:取消|撤回|停掉|停止)(?:本轮|这轮|之前|刚才|温度|降温|地表|的|模型|服务|计算|预测){0,8}(?:预测|计算|运行|调用)|(?:不|别|无需|不要|不用|不必)(?:再|先|进行|执行|尝试|本轮|这轮|温度|降温|地表|的|模型|服务){0,8}(?:计算|运行|预测|估算|调用|评估)/;
  if (negative.test(text)) return false;
  return /(?:尝试|试一次|检查|请|再|做|进行|执行|运行)?(?:温度|降温|地表温度)?预测/.test(text) ||
    /(?:计算|运行|评价|评估)(?:一下|一次|这个方案的|当前方案的|旧目标版本的|温度|降温|地表温度|模型|服务){1,8}/.test(text) ||
    /(?:调用|运行|执行|试用).{0,10}(?:温度|降温).{0,6}(?:服务|模型)/.test(text) ||
    /(?:温度|降温).{0,6}(?:服务|模型).{0,10}(?:调用|运行|执行|试用)/.test(text);
}

export function pilotPredictionCancelled(original) {
  return /(?:取消|撤回|暂停|不|别|无需|不要|不用|不必)(?:再|先|做|跑|算|进行|执行|尝试|之前|刚才|的|温度|地表|降温|模型|服务){0,9}(?:预测|温度|运行|计算|调用)/.test(original.normalize('NFKC'));
}

export function pilotPredictionRequested(original) {
  const text=original.normalize('NFKC');
  if(pilotPredictionCancelled(text))return false;
  return text.split(/[，,。；;！!\n]/).some(clause=>
    !/[?？]|能否|可否|是否|为什么|能不能|可不可以/.test(clause) &&
    /(?:请|帮我|我想)(?:先|直接)?预测|(?:请检查|尝试|试一下|试一次|试试|计算|算一下|运行|执行|调用|跑一下|做一次).{0,14}(?:温度|降温|预测)|(?:温度|预测)(?:模型|服务|接入状态).{0,10}(?:尝试|调用|运行|检查)/.test(clause));
}
