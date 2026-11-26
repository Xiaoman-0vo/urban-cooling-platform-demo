// Explicit lexical evidence only. Unsupported or ambiguous wording asks for clarification.
const units='(?:平方米|平米|m2|m²|㎡)';
const bounds=/至少|最低(?:改造)?(?:面积)?|不少于|下限|最少|不低于|至多|最多|最高|不超过|上限/g;
const normalize=text=>text.normalize('NFKC').replace(/(?<=\d)[,，](?=\d)/g,'');

export function lowerAreaBound(left) {
  const label=[...left.matchAll(bounds)].at(-1)?.[0];
  return Boolean(label&&!/至多|最多|最高|不超过|上限/.test(label));
}

export function minimumAreaValues(original) {
  const text=normalize(original),values=[];
  for(const match of text.matchAll(new RegExp(`(?<![\\w.])-?\\d+(?:\\.\\d+)?\\s*(万|千|百)?\\s*${units}`,'gi'))){
    const left=text.slice(0,match.index).split(/[，,、；;。!?！？\n]/).at(-1);
    const right=text.slice(match.index+match[0].length).split(/[，,、；;。!?！？\n]/)[0];
    if(!lowerAreaBound(left)||/(?:不是|不要|不采用|不设|取消|撤回)\s*(?:最低(?:改造)?面积)?\s*$/.test(left)||
      /^\s*(?:不用了|作废|不采用|撤回)/.test(right))continue;
    if(/(?:从|由)\s*$/.test(left)&&/^\s*(?:改|调整|调|降|提|增|减|变|换)?(?:到|为|成|至)/.test(right))continue;
    const number=Number(match[0].match(/-?\d+(?:\.\d+)?/)[0])*({万:10000,千:1000,百:100}[match[1]]||1);
    values.push(number);
  }
  return [...new Set(values)];
}

export function spatialSearchRequest(original) {
  const text=normalize(original);
  const clauses=text.split(/[，,。；;！!\n]/);
  const noun='(?:空间候选|候选(?:方案|范围)?|布局|空间方案)';
  const verb='(?:生成|搜索|重算|重新计算|重新找|更新|再找|找出|找一下)';
  const command=new RegExp(`${verb}.{0,10}${noun}|${noun}.{0,10}${verb}`);
  const negative=new RegExp(`(?:取消|撤回|暂停|不要|不用|不必|无需|别|先不).{0,12}(?:${verb}|${noun})`);
  const cancelled=clauses.some(clause=>negative.test(clause));
  const requested=!cancelled&&clauses.some(clause=>command.test(clause)&&!/[?？]|能否|可否|是否|能不能|可不可以|会怎样|是什么意思|为什么|如何/.test(clause));
  return {requested,cancelled,values:minimumAreaValues(text),
    reuse:/最低(?:改造)?面积(?:保持|仍|照旧|不变)|最低(?:改造)?面积沿用|其余(?:条件)?不变|其他(?:条件)?不变/.test(text),
    related:/(?:空间候选|候选搜索|搜索候选)/.test(text)};
}
