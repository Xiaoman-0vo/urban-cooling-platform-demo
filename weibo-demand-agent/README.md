# 微博民意助手（weibo-demand-agent）

把公开微博里"哪里热得难受、希望改哪里"的说法，判读成**可回查、可统计、可对接平台**的城市热感知线索。
运行在 n8n 上：聊天窗下单 → 后台工人采集 → 规则+大模型判定 → 汇总快照 → 平台地图侧栏读取。

> **三条边界（先看这个）**
> 1. 只判读公开微博文本，**不产生温度数据**，也不代表市民总体感受；
> 2. 线索数量**不是人数**，去重后才是内容条数；
> 3. 地点范围**由提问决定**，默认不预设城市；词表外的地名按字面采集。

---

## 一、它能做什么

| 你在聊天窗里说 | 它做什么 |
|---|---|
| 「成都现在有多少线索」 | 读已有快照，报条数、类别明细、代表原文（**可点开跳微博**）、需求归类 |
| 「帮我抓成都 遮阴」 | 下单去采 → 顶部进度条实时走：采微博 → 逐条判定 → 汇总快照 |
| 「嘉峪关现在有多少线索」（词表里没有） | 自动按"嘉峪关"字面下单采集，不再让你去改配置 |
| 贴一条微博正文 | 单条判读：热相关性、体验、空间诉求、评价方向、场景、置信度、**证据片段**（可在原文里对号） |
| 「洛阳现在有多少线索」（没采过） | 自动下单去采，进度条从「已下单」走到 100%，跑完再问就有数字 |
| 「进度」 | 报后台任务当前阶段与条数 |

界面截图：

- 欢迎页：`docs/images/chat-welcome.png`
- 判读结果与原文链接：`docs/images/chat-answer.png`

---

## 二、快速开始（Windows，3 步）

**前置**：Docker Desktop 已装并启动、Node.js ≥ 20.19（或 ≥ 22.12）、这台电脑的 Edge 已登录微博。

### 第 1 步：起 n8n 并导入工作流

```powershell
docker start n8n          # 没有容器就先按 docs/03-n8n环境与本次改动.md 建一个
cd "C:\path\to\weibo-demand-agent"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-workflow.ps1 -WorkflowFile workflows\04-demand-chat.json
```

> 换机器：`deploy/README.md` 有完整容器创建命令（含 `/data` 挂载与 `N8N_RESTRICT_FILE_ACCESS_TO`）。

### 第 2 步：双击两个启动器

| 文件 | 作用 |
|---|---|
| `1-启动聊天窗.cmd` | 起 n8n（如未运行）+ 本地聊天页 `http://127.0.0.1:4177/` |
| `2-启动采集工人.cmd` | 起后台工人：接单 → 采集 → 判定 → 汇总（**别关这个窗口**） |

### 第 3 步：打开聊天页说话

浏览器访问 <http://127.0.0.1:4177/>，试这几句：

```
成都现在有多少线索
帮我抓成都 遮阴
进度
成都南站外面全是水泥地，等车热得不行
```

**采集失败？** 多半是登录态过期，执行一次（装 Edge 的机器上）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\refresh-cookie.ps1
```

它直接从本机 Edge 取登录态写入 `.weibo-cookie`（已在 `.gitignore`，**永不进仓库**）。

---

## 三、它是怎么跑起来的

```
 浏览器
   │  http://127.0.0.1:4177/
   ▼
 chat/index.html ──► scripts/serve-chat.mjs（静态页 + 反代 /webhook/* 到 n8n）
                        │
                        ▼
                 n8n：04-demand-chat（24 节点）
                   ├─ 问现状 → 读 data/heat_perception*.json → 模型组织语言
                   ├─ 贴微博 → 规则层 → 大模型抽取 → 证据回查 → 判读卡片
                   └─ 要采集 → 写任务单 data/jobs/<id>.json（异步，立刻回执）
                        │
                        ▼
                 scripts/job-worker.mjs（宿主机工人，串行）
                   ① collect-weibo.mjs          采微博 + 一级评论 → data/raw_*.json
                   ② run-pipeline.mjs           逐条判定 → data/items_<城市>.json
                   ③ aggregate-heat-perception.mjs → data/heat_perception_<城市>.json
                        │
                        ▼
                 平台地图侧栏（可选）：urban-cooling-platform-demo/public/data/heat_perception.json
```

工人跑在宿主机而不是容器里：采集要用本机 Edge 的登录态，判定要走本机网络；容器只管编排与契约。

**模型**：判定与摘要都用 `deepseek-flash`（`api.deepseek.com/chat/completions`，判定 T=0.2/max_tokens=3000，摘要 T=0.3/max_tokens=900）；每条回答末尾都会打印模型与各版本号。

**进度条**：工人每步写 `data/jobs/<id>.progress.json`，聊天页每 2 秒查 `GET /webhook/weibo-job-status`
（工作流 `05-job-status`），取 `latest.json` 或当前任务文件渲染。

---

## 四、目录结构

| 路径 | 说明 |
|---|---|
| `1-启动聊天窗.cmd` / `2-启动采集工人.cmd` | 双击即用 |
| `chat/index.html`、`chat/vendor/` | 本地聊天页（资源内置，不依赖 CDN） |
| `config/taxonomy.v1.json` | **判定词表**：热相关性/内容类型/体验/诉求/话题/关键词/判定顺序 |
| `config/place-lexicon.v2.json` | **地点词表**：城市→别名；词表外地名按字面采 |
| `contract/weibo-demand.contract.v1.schema.json` | 对外契约（JSON Schema 2020-12，24 个 `$defs`） |
| `contract/validate.py` | 契约自检：`python contract/validate.py` |
| `workflows/03-demand-agent-api.json` | 契约入口（10 节点）：`POST /webhook/weibo-demand/v1` |
| `workflows/04-demand-chat.json` | 聊天窗（25 节点）：`/webhook/wc9d1f2a34b7e48c0/chat` |
| `workflows/05-job-status.json` | 进度查询：`GET /webhook/weibo-job-status` |
| `workflows/src/*.js` | 各 Code 节点源码（**改这里，再跑 `scripts/build-*.py` 重新生成 JSON**） |
| `scripts/collect-weibo.mjs` | 采集器（搜索 + 一级评论，`--job-id/--progress` 支持进度） |
| `scripts/run-pipeline.mjs` | 判定流水线（规则 → 模型 → 校验 → 合流，按城市过滤） |
| `scripts/aggregate-heat-perception.mjs` | 汇总成平台快照 |
| `scripts/job-worker.mjs` | 后台工人（轮询任务单，串行执行三步） |
| `scripts/serve-chat.mjs` | 本地聊天页服务 + n8n 反向代理 |
| `scripts/refresh-cookie.ps1` | 从 Edge 取登录态（CDP，需要时可重跑） |
| `scripts/test-chat.ps1` | 聊天窗回归（5/5） |
| `scripts/test-rules-local.mjs` / `test-place-scope.mjs` / `test-p3-api.ps1` | 规则层 13/13、地点 16/16、契约接口 10/10 |
| `scripts/capture-chat.mjs` | 无头 Edge 给聊天页截图（`--welcome` 拍首屏） |
| `data/` | 运行产物（`jobs/` 任务单、`items_*.json`、`raw_*.json`）；只有快照与 `.gitkeep` 进仓库 |
| `docs/` | 设计、计划、环境、采集、上线、聊天窗六份文档 |
| `deploy/` | n8n 容器 compose + 换机器步骤 |

---

## 五、数据与契约

**每条线索**（`items_<城市>.json` 的 Item，约 40 个字段）关键字段：

```
source_post_id / source_url                               原始微博
published_at / fetched_at / event_time_* / time_status    时间三分（发布/发生/抓取）
text / excerpt / ai_summary / evidence_spans              原文与可回查证据片段
heat_relevance / content_types / experience_tags          判定结论
spatial_demands / place_mentions / location_matches       诉求与地点
in_scope / scope_target / place_kind                      是否落在本次提问的城市
demand_topic / evaluation_direction / activity_scene      话题、倾向、场景
confidence / needs_review / route / review_status          合流与人工复核
query_batch_id / rules_version / classifier_version        可回归的版本号
```

**给平台的快照**（`data/heat_perception.json`，schema `heat-perception/1`）：

```
mode: historical_sample        ← 历史抽样回放，不是直播
counts:                        ← 原始记录 / 判定条数 / 落城 / 去重内容 / 范围外 / 地点待定 / 公开诉求
events[]:                      ← 按诉求话题归并的关切点（代表原文 + 可点链接）
observations[]:                ← 一般性热感受、改善体验（不是诉求，但保留）
limits[] / generated_at / city
```

平台侧把它拷到 `urban-cooling-platform-demo/public/data/heat_perception.json` 即可在地图侧栏读。

**版本号**（每条输出都带）：contract `v1` · taxonomy `t1` · rules `r1` · classifier `c1`。

---

## 六、常见故障

| 现象 | 原因 / 处理 |
|---|---|
| 聊天页打不开 | `1-启动聊天窗.cmd` 的窗口必须开着；端口被占就 `--port 4178` |
| 说"已下单"但一直排队 | `2-启动采集工人.cmd` 没开；`data/jobs` 被删（启动器会自动重建） |
| 采集 0 条 | 登录态过期 → `scripts\refresh-cookie.ps1`；或换关键词确认有结果 |
| 进度条不动 | `05-job-status` 没导入/没发布 → `deploy-workflow.ps1 -WorkflowFile workflows\05-job-status.json` |
| 卡在"等待快照" | 看工人窗口报错；重跑 `node scripts\aggregate-heat-perception.mjs` |
| 条数是旧的 | 快照还是上一轮 → 重新下单，或按城市重跑聚合 |
| 改了节点代码不生效 | 改 `workflows/src/*.js` → `python scripts/build-*.py` → `deploy-workflow.ps1` → **重启 n8n 容器** |

---

## 七、团队怎么改

| 想改什么 | 改哪里 | 改完要做什么 |
|---|---|---|
| 判定口径、关键词、话题分类 | `config/taxonomy.v1.json` | 无（下次请求生效），同步升 `taxonomy_version` |
| 城市别名 | `config/place-lexicon.v2.json` | 无；词表外城市本来也能按字面采 |
| 节点逻辑（意图、渲染、校验） | `workflows/src/*.js` | `python scripts/build-chat-workflow.py` → `deploy-workflow.ps1` → 重启 n8n |
| 采集规则（页数、评论数、限速） | `scripts/collect-weibo.mjs` + `chat-4-job.js` 取参 | 同上（重新构建 04） |
| 平台读数 | `data/heat_perception*.json` | 拷到平台 `public/data/` |

**自检命令**

```powershell
python contract\validate.py                                                    # 契约
node scripts\test-rules-local.mjs                                              # 规则层 13/13
node scripts\test-place-scope.mjs                                              # 地点判定 16/16
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-chat.ps1      # 聊天窗 5/5
```

---

## 八、已知限制

- 采集依赖**已登录浏览器**的 Cookie：低频小样本（默认微博 2 页、每帖 6 条一级评论、1.5s 限速），不适合当"实时舆情监听"。
- 判定用 `deepseek-flash`，单条约 2–6 秒；120 条样本约 2–4 分钟。置信度是**确定性依据合成**的三档，不是模型自报概率。
- 快照 `mode=historical_sample`：**不是实时**，也不做 100m 网格插值。
- 平台侧目前只读消费快照，未做接口级联调（真接口方案见 `docs/01-方案设计.md` §7）。
- 未做：鉴权/限流、事件聚类去重（当前只做内容级去重）、人工复核回写 UI。

## 九、文档索引

| 文档 | 内容 |
|---|---|
| `docs/01-方案设计.md` | 定位与边界、五层架构、判定标准与准确度、契约、平台对接、异常 |
| `docs/02-实现计划.md` | P0–P9 施工顺序、里程碑、验收用例 |
| `docs/03-n8n环境与本次改动.md` | 容器怎么建的、改了哪些宿主机设置 |
| `docs/04-采集适配器说明.md` | 微博接口、Cookie、限速与断点 |
| `docs/05-采集与研判上线.md` | 两城实测数据、判定质量抽样、延迟 |
| `docs/06-n8n聊天窗.md` | 24 节点编排、进度条机制、换电脑/局域网 |

---

**技术栈**：n8n 2.45（Docker）· DeepSeek `deepseek-flash` · Node 26 ESM · JSON Schema 2020-12
**数据口径**：公开微博与一级评论的抽样，历史回放，非温度观测，非人数。
