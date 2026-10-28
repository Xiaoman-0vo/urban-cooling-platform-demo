// 聊天窗兜底：用户没说清要干什么时给用法（不联网、不花钱）
const ctx = $('1-意图') ? $('1-意图').first().json : {};
const text = (ctx && ctx.text) || '';

const L = [];
// 打招呼：先回一句人话，再给用法
const isGreeting = /^(你好|您好|在吗|hi|hello|嗨|哈喽)/i.test(String(text).trim());
if (isGreeting) {
  L.push('你好。我是微博民意助理，可以帮你把公开微博读成可核查的线索。');
  L.push('');
}

// 说了「某某市」但词表里没有这个地名：默认已经按字面地名去采了（chat-1 会把它当城市），
// 这里只在"没走采集分支"时兜底提示一句，别让用户以为命令没生效。
if (ctx.unknown_place && !ctx.job) {
  const name = String(ctx.unknown_place).replace(/[市|区|县|镇]$/, '');
  L.push(`「${ctx.unknown_place}」不在城市词表里，但可以直接按字面地名采：`);
  L.push('');
  L.push(`- 发「**帮我抓${name} 遮阴**」→ 我按 \`${name}\` 去抓并统计（别名自动带上「${ctx.unknown_place}」）；`);
  L.push(`- 或问「**${name}现在有多少线索**」→ 没快照会自动补采，进度条会走，约 2–3 分钟。`);
  L.push('');
  L.push(`_想把别名补全（让「${name}」也命中「${ctx.unknown_place}」以外的叫法），在 \`config/place-lexicon.v2.json\` 的 \`cities\` 里加一行即可：_`);
  L.push('```json');
  L.push(`"${name}": { "aliases": ["${ctx.unknown_place}"] }`);
  L.push('```');
  return [{ json: { output: L.join('\n') } }];
}

if (text && !isGreeting) L.push(`没看懂「${String(text).slice(0, 30)}」想让我做什么。`);
L.push('');
L.push('**两种用法**');
L.push('1. **问现状**（读已有快照；没有就自动补采，约 2–3 分钟）：');
L.push('   - `查成都 遮阴`、`重庆 候车 现状`、`北京有多少条诉求`');
L.push('2. **贴一条微博**（调模型判定，约 3–8 秒）：');
L.push('   - 直接粘贴正文，例如：`太阳晒得人眼睛都睁不开，树荫一点都没有`');
L.push('');
L.push('**能看出什么**');
L.push('- 是否与热相关、内容类型（亲历/转述/建议/广告…）、体验标签（炎热/暴晒/闷热/凉爽）、空间诉求（遮阴不足/候车条件/通风…）、评价方向（不适/改善）');
L.push('- 每条结论都带「证据片段」，可以回到原文核对');
L.push('');
L.push('**不能做什么**');
L.push('- 不是温度观测，也不代表受影响人数；没有线索不等于没有热问题');
L.push('- 地点范围由你的问题决定，不预设城市；词表（`config/place-lexicon.v2.json`）里没有的地名，也能按字面地名直接采和统计');
L.push('- 采集需要微博 Cookie，且依赖后台工人（`2-启动采集工人.cmd`）在本机跑');

return [{ json: { output: L.join('\n') } }];
