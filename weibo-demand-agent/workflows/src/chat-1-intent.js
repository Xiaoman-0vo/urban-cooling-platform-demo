// 聊天窗第 1 步：把用户这一句话读成"他想干什么"
// 四个去向：query（问某地现状）/ classify（贴了一条微博要判）/ collect（下单去抓）/ status（问进度）/ help（不知道怎么用）
// 注意：这里只做路由判断，不花钱、不联网。真正干活在后面的分支。
const LEXICON = /*__PLACE_LEXICON__*/null;

const input = $input.first().json || {};
const raw = String(input.chatInput ?? input.text ?? '').trim();
const sessionId = input.sessionId || null;
const norm = raw.replace(/\s+/g, '');

// ---- 城市识别：取最长命中的别名，避免"重庆"被"江北"这类短词抢走 ----
const cities = (LEXICON && LEXICON.cities) || {};
let city = null;
let hitLen = 0;
for (const [name, def] of Object.entries(cities)) {
  const names = [name].concat((def && def.aliases) || []);
  for (const alias of names) {
    if (alias && norm.includes(alias) && alias.length > hitLen) {
      city = name;
      hitLen = alias.length;
    }
  }
}

// ---- 意图 ----
const HELP_PAT = /^(帮助|help|说明|怎么用|你会什么|你能做什么|你是谁|你好|hi|hello)/i;
const QUERY_PAT = /(查一?下?|看看|有哪些|有没有|现状|快照|统计|汇总|多少|几条|几个|几成|情况|进展|占比|分布|手上有|收了|采到)/;
// 像一条微博正文的信号：链接、@某人、#话题#、【标题】、带日期的转发链
const POST_PAT = /(https?:\/\/|@[\u4e00-\u9fa5A-Za-z0-9_-]{1,20}|#[\u4e00-\u9fa5A-Za-z0-9]+#|【|】|\d+\s*月\s*\d+\s*日)/;

let intent = 'classify';
// "问现状"要同时满足两点：像在提问，且真的在问我们手上的数据（城市名 / 线索 / 诉求 / 统计）。
// 只靠"什么/怎么"会把贴进来的短微博（"这天气怎么办"）误判成提问。
const asksData = QUERY_PAT.test(norm) || /(线索|诉求|数据|统计|样本|抽样)/.test(norm);
const hasSubject = !!city || /(线索|诉求|数据|统计|样本|抽样)/.test(norm);

// ---- 采集任务：说"帮我抓/采集/爬 某地 某话题"就下单，不是判定 ----
const COLLECT_PAT = /(抓|采集|爬取|爬一下|收集|搜集|捞|拉一批|跑一批|再抓|多抓|补抓)/;
const STATUS_PAT = /(进度|跑到哪|到哪了|好了吗|完成了吗|跑完了吗|还在跑|job)/i;
const WANTS_JOB = COLLECT_PAT.test(norm) || /(下单|建个任务|开个任务)/.test(norm);

if (POST_PAT.test(raw)) intent = 'classify';        // 长得像微博正文：直接判，别被"多少"抢走
else if (STATUS_PAT.test(norm)) intent = 'status';   // 问进度
else if (WANTS_JOB) intent = 'collect';              // 下采集订单
else if (HELP_PAT.test(norm) || norm.length < 4) intent = 'help';
else if (asksData && hasSubject && raw.length <= 60) intent = 'query';

// ---- 词表里没有的地名：**也当成一个城市去采、去统计** ----
// 旧版是回一句"请先去词表加一行"，用户看着像命令没生效。
// 现在两种写法都认：
//   ① 带后缀 —— 「平顶山市」「龙泉驿区」
//   ② 不带后缀但位置很明确 —— 「平顶山现在有多少线索」「帮我抓平顶山 遮阴」
// 认出来就把字面地名当城市名（去掉"市/区/县/镇"），别名带上全称，
// 判定口径照用（run-pipeline --city/--aliases），所以统计不会全落"范围外"。
const TOPIC_WORDS = ['遮阴', '树荫', '阴凉', '纳凉', '闷热', '暴晒', '高温', '热浪', '热岛',
  '凉快', '通风', '绿化', '行道树', '乘凉', '日晒', '候车', '公园', '建筑', '道路', '地面',
  '气温', '天气', '降温', '体感', '空调', '中暑', '太阳', '水泥', '公交', '地铁', '线索',
  '诉求', '数据', '统计', '样本', '抽样'];

function guessPlace(text) {
  const suffixed = text.match(/([\u4e00-\u9fa5]{2,4})(市|区|县|镇)/);
  if (suffixed) return { name: suffixed[1], full: suffixed[1] + suffixed[2] };
  // 去掉开头的动词，避免「帮我抓平顶山遮阴」把"帮我抓"当地名
  const body = text.replace(/^(帮我|给我|请|麻烦|再|多|想)?(抓|采集|爬取|爬一下|爬|收集|搜集|捞|拉一批|跑一批)/, '');
  const lead = body.match(/^([\u4e00-\u9fa5]{2,4}?)(?=现在|目前|最近|今天|这两天|这周|有多少|有啥|有几条|的线索|这边|那边|的|热不热|怎么样)/);
  if (lead && !TOPIC_WORDS.includes(lead[1])) return { name: lead[1], full: lead[1] };
  return null;
}

let unknown_place = null;
let unknown_aliases = [];
if (!city && !POST_PAT.test(raw)) {
  const p = guessPlace(norm);
  if (p) {
    city = p.name;                                // 规范名：平顶山
    unknown_place = p.full;                       // 原话：平顶山市 / 平顶山
    unknown_aliases = [p.full, p.name].filter(Boolean);
    // "平顶山市热不热" 这种短问句别被当成要判定的微博正文
    if (intent === 'classify' && raw.length <= 25 && /(热不热|怎么样|有没有|多少|现状|线索|诉求)/.test(norm)) {
      intent = 'query';
    }
  }
}

// ---- 快照文件：按城市名推文件名，**是否真的存在交给后面的读文件节点验证** ----
// 以前这里写死"只有成都、重庆"，结果新采了别的城市它也还是回"没有"。
// 现在一律算出一个候选文件名：读得到就用，读不到（ENOENT）就自动下单去采。
let city_file = 'heat_perception.json';   // 没提城市：默认看成都（唯一同步到平台的快照）
if (city && city !== '成都') city_file = `heat_perception_${city}.json`;
let city_note = unknown_place
  ? `词表里没有「${unknown_place}」，我按字面地名采和统计（想要别名更全，可加一行到 config/place-lexicon.v2.json）`
  : (intent === 'query' && !city
      ? '这句里没看出城市名，先按成都那份快照回答；要问别的城市请带上地名（例如「重庆现在有多少线索」）'
      : '');

// ---- 主题词：把问句里的动词/城市名去掉，剩下的当主题 ----
const stop = ['查一下', '查查', '查', '看看', '有哪些', '有没有', '现状', '快照', '统计', '汇总',
  '多少条', '多少', '几条', '几个', '几成', '情况', '进展', '占比', '分布', '手上有', '收了', '采到',
  '的', '吗', '呢', '啦', '了', '和', '现在', '目前', '最近', '一共', '总共',
  '？', '?', '请', '帮我', '我想看', '想知道', '告诉你', '有多少']; 
let topic = norm;
for (const w of stop) topic = topic.split(w).join('');
if (city) {
  topic = topic.split(city).join('');
  for (const alias of ((cities[city] && cities[city].aliases) || [])) topic = topic.split(alias).join('');
}
topic = topic.slice(0, 16);

const request_id = 'chat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

// ---- 采集任务单：把这句话拆成"搜什么、抓多深" ----
// 两种情况会建任务单：
//   1) 用户明说"帮我抓/采集…"（intent=collect）
//   2) 用户问某地现状，但那个城市的快照读不到（intent=query + 有城市名）
//      → 先按默认参数把单子备好，等读文件节点确认"文件不存在"再真正写进队列
// 关键：地点由这句话决定。没提城市就只按关键词搜（不做城市过滤），不预设成都。
let job = null;
const auto = (intent === 'query' && !!city);
if (intent === 'collect' || auto) {
  let kw = '';
  if (auto) {
    // 自动补采时关键词必须跟"热"有关：问句里的"有多少线索"不是话题。
    // 先在原句里找热相关词，找不到就用"高温"（这也是微博上量最大的热话题词）。
    const HEAT_WORDS = ['遮阴', '树荫', '阴凉', '纳凉', '闷热', '暴晒', '高温', '热浪',
      '热岛', '凉快', '通风', '绿化', '行道树', '乘凉', '日晒'];
    for (const w of HEAT_WORDS) {
      if (norm.includes(w)) { kw = w; break; }
    }
    if (!kw) kw = '高温';
  } else {
    const junk = ['帮我', '给我', '麻烦', '请', '我要', '我想', '抓', '采集', '爬取', '爬一下', '爬',
      '收集', '搜集', '捞', '拉一批', '跑一批', '再抓', '多抓', '补抓', '下单', '建个任务', '开个任务',
      '一下', '一些', '一批', '点儿', '点', '的微博', '微博', '帖子', '评论', '内容', '数据', '线索',
      '最近', '现在', '目前', '相关', '吧', '呗', '谢谢', '好吗', '可以吗', '的', '了', '吗', '？', '?'];
    kw = norm;
    if (city) {
      kw = kw.split(city).join('');
      for (const alias of ((cities[city] && cities[city].aliases) || [])) kw = kw.split(alias).join('');
    }
    for (const w of junk) kw = kw.split(w).join('');
    kw = kw.slice(0, 20).trim() || '高温';
  }

  // "多抓点/抓深一点" → 翻页与帖子数加倍（仍受额度上限约束）
  const deep = /(多抓|抓多点|深一点|多一些|多来点|全一点|两页|2页)/.test(norm);
  // 自动补采（用户没明说要抓）默认抓 2 页，样本太小时关切点会空
  const pages = deep ? 2 : (auto ? 2 : 1);
  const top = deep ? 12 : 6;
  const comment_pages = deep ? 2 : 1;
  const query = (city ? city + ' ' : '') + kw;

  job = {
    id: 'job-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    query,
    city: city || null,
    aliases: unknown_aliases,
    keyword: kw,
    pages,
    top,
    comment_pages,
    max: 120,
    pace: auto ? 800 : 1200,
    auto,                                     // true = 因"缺快照"自动补采，不是用户下的单
    status: 'queued',
    phase: 'queued',
    message: '已下单，等待后台工人接单',
    requested_by: sessionId || 'anonymous',
    created_at: new Date().toISOString(),
  };
}

return [{
  json: {
    intent,
    city,
    city_file,
    city_note,
    topic,
    text: raw,
    norm,
    session_id: sessionId,
    request_id,
    scope: city ? { city } : null,
    job,
    unknown_place,
    unknown_aliases,
  },
}];
