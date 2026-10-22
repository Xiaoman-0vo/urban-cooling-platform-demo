# 数据来源、展示副本与底图署名

本地首版对应根目录共享包 `NSFC_ROOT_SHARED_HANDOFF`、版本 `2026-10-05.v1`，工程场景为 `CD_E4125_N33891_source_handoff_v1`。来源依据为 [成果能力清单](../共享接口/成果能力清单.json)和[当前验收场景](../共享接口/当前验收场景.json)。下列说明区分科研原件、显示副本和在线导航底图。

原场景资料分别有24项原件引用、24个JSON/GeoJSON显示文件与15个内嵌场景图层。原场景24个显示文件由22个基础显示产物及2个区域导航文件构成：基础产物在清单的output_files登记，绿色星点及2021道路各在独立适配记录登记。只读科研/准备登记与历史快照另存，不覆盖这份清单或scene；8项科研登记来源、14项准备源件和新增住宅候选显示层分别记录，不并入原24项来源或原15层计数。

## 24 项原件引用

[public/data/manifest.json](public/data/manifest.json)保留原清单的 24 项完整 `artifacts` 元数据，包括来源路径、文件大小、SHA-256，以及文件验收、科学验证、软件接入、执行四个状态轴。原登记值用于识别具体冻结版本；平台适配信息另写在 `platform_adaptation`，不覆盖源状态。

| 来源组 | 原件 ID | 平台用途 |
| --- | --- | --- |
| 宏观几何与图 | `macro_nodes`、`macro_edges`、`macro_graph_manifest` | 6,567 节点区域索引，目标格相关边与图来源说明 |
| 宏观联结与字段 | `macro_joined`、`macro_field_roles`、`macro_building_support` | 六口径目标行、字段角色与目标建筑支持记录 |
| 宏观核查 | `macro_variable_review`、`macro_quality_review`、`macro_raw_dn_readback` | 变量依赖、质量准入与原始 DN 补核依据 |
| 微观准备包 | `micro_scene`、`micro_obj`、`micro_raster`、`micro_manifest`、`micro_readback` | 八层来源几何、工作体块与原生分类栅格的引用，原包与保存后复核记录 |
| 微观缺项与精细核对 | `micro_missing_inputs`、`micro_roads`、`micro_identity`、`micro_geometry_metrics`、`micro_geometry_review`、`micro_gf2_check` | 缺项、道路快照、植被源身份、已有几何指标与获取核查 |
| 公平性、可获取性与接口 | `equity_candidate_design`、`equity_latest_review`、`access_methods`、`product_contract` | 候选研究设计、方法条件与平台准入边界 |

完整来源路径与 64 位 SHA-256 以机器清单为准；本表不替代该清单。界面或导出文件引用这些原件，不代表已获得全部来源的公开分发许可。

## 哈希与唯一授权差异

显示准备管线只读科研来源。其余 23 项必须匹配清单中的原 SHA-256，不会自动接受科研文件变化；制作前后的 24 项来源哈希分别保存在 [readback_verification.json](public/data/readback_verification.json)。

本轮只有 `product_contract` 获准使用更新后的平台接口文档。管线须显式使用 `--accept-platform-contract-update` 才接受该差异，原清单 `artifacts` 的冻结 SHA-256仍保留。适配日志记录：

- 冻结 SHA-256：`f0daefba2857cc6bc116475e5c959943590c6769eff1114f668ced34c2df7d2d`
- 本轮当前 SHA-256：`cecd88ba68efa36b7090f92a24b052742c5a56c80de18348e25933689be57590`
- 来源：`平台产品设计/研究接口与能力准入.md`
- `reason`：`authorised_current_platform_spec_sync`
- `accepted_for`：`platform_contract_reference_only_not_scientific_rebuild`

这项记录只解释本轮接口文档同步，不升级科研状态，不修改根共享清单，也不自动重建旧微观场景。以后出现来源变化，应保留版本差异并重新确认其用途。

微观准备包还保留它冻结时使用的宏观联结表 SHA-256 `e4230eb55e8835f45f69e50896be6314ff252d4cba51df3014b4fedbb28ace87`；当前登记的联结表为 `98a8bd68c9dd0290da3cdf7940f1cbe294ad8e8ae52abcf9b9d64fb8fbd430e5`。两者差异在 `scene.version_alignment` 和 [version_differences.json](public/data/version_differences.json)中分别保存，没有替换冻结来源。

## 原场景的24个显示文件

原场景显示包由24个JSON/GeoJSON文件构成；`public/data`还另存当前科研登记与按索引SHA命名的历史快照。GeoPackage的宏观节点、微观全部8层及两期道路均保留完整几何、原属性和源对象身份，从EPSG:32648转为EPSG:4326经度/纬度，没有简化、修复或按300 m裁掉原包。CSV用原字符串保存，空单元格保持空字符串；JSON的缺失值保持`null`，不填零。

300 m 边界与 54 个建筑部件属于明确标记的展示衍生物：前者由登记的米制范围生成，后者由 53 个来源建筑的 Polygon/MultiPolygon 部件拆分，不增加独立建筑数。原 500 m 准备窗保留。建筑工作高度没有准确度认证；3 个植被裁片对应 1 个源连通组；道路按快照与源 ID 联合识别，6 个候选受体没有测量标签。

scene.layers中的15层包含core、context、macro_context300、建筑、植被、道路、候选点、审查层、building_parts及兼容别名；别名不增加源对象。区域绿色星点与历史道路属于跨区域/场地连续显示的导航资料，显示由“绿色光效”开关控制，未计入这15层。用户新位置不套用样例的场景、缺项表、建筑、植被或热结果；用户导入的文件名、哈希、坐标声明与四轴记录单独保存。

已有体块 OBJ、分类 GeoTIFF 和各核查文档在原件清单中保留引用；首版没有把全部二进制原件转换成通用浏览器资料。目标格六口径记录、建筑指标、连通身份及待补 CSV 见 `scene.records`、`scene.tables` 和 [tables.json](public/data/tables.json)。24 项原件完整元数据和状态保存在 `manifest.json`，7 个已登记 JSON 元数据文档的只读内容保存在 [source_metadata.json](public/data/source_metadata.json)，显示文件哈希保存在清单的适配记录中。

项目JSON与ZIP保存当前场景展示副本、图层、24项源件引用与哈希、界面状态、软件记录和独立`researchRegistrations`/`preparationRegistrations`数组。ZIP的`research/registrations.json`与`preparation/registrations.json`分别与`project.json`中的登记一致；缺失或内容不一致会拒绝重开。准备登记内含本次14项准备源件及原清单组成的完整原ZIP；**不包含全部24个科研原件、8项科研状态索引的完整来源文件、原始栅格或全部模型权重，不是完整研究数据发布包**。软件读写记录不会升级原件科学状态。

## 只读科研状态追加登记

来源为[根目录当前成果状态索引](../共享接口/当前成果状态索引.json)。当前索引原字节SHA-256为`6b56102f564361fe2755efbea9b613b2a71e67af3d5fcd247ea157cc2af659f9`，大小20,572 bytes，`checked_at`为`2026-10-06T03:03:37+08:00`。前一`efa0962c4a6ea46d47d9339330e350120f7d923d80008aeb214da5b95f144fd2`索引对应的快照和实际下载验收证据保留；本轮索引只更新`checked_at`，三个阶段的绑定声明、8项来源和26条开发误差均不变。

| 索引阶段 | 已保存的开发次数 | 平台记录边界 |
| --- | --- | --- |
| 一跳邻域开发 | 72 | 保存上游开发证据，最终及应用验证待完成 |
| 配置来源 | 96 | 开发误差与来源绑定分别保留 |
| 完整组别消融 | 216 | 保存开发比较，不作为因果或场地改造收益 |

26条`development_MAE`记录保留模型、口径、组别、种子聚合、单位和来源身份。`degC`表示模型误差的℃，不表示场地温度、降温值或人体舒适结果。当前细配置C的联合增量尚无稳定正向证据；不据此证明其没有物理作用。三个阶段的独立技术回执与索引清单绑定声明均为`true`，仍不代表最终测试或科学应用验证。

登记格式为`0.1.read-only-research-registration`，身份为`coordination-index:<原索引SHA-256>`，完整保留原`index`对象和独立`adapter_receipt`。文件验收为`readable_verified_index`，科学验证为`development_evidence_not_application_validated`，软件接入为`local_read_only_registration`，执行为`metadata_registered_no_model_execution`；历史`sourcePackage`、`scene`和原24项来源的四轴值均不覆盖。

登记器只读取索引和8项明确引用的元数据/开发汇总，核对每项声明与实测SHA-256及字节大小，并在读取前后核查来源与索引未变。核验范围是`index_and_selected_metadata_bytes_not_all_weights_or_inference`：没有跟随清单内嵌路径读取全部权重，没有读取锁定最终标签，没有执行推理、训练或其他新研究。独立软件核验记录保留8项实测哈希及前后读取记录。

七项应用门控全部为`false`：`validated_new_site_prediction`、`physical_cooling`、`comfort_accessibility`、`actual_use`、`equity_results`、`minimum_area_search`、`optimal_recommendation`。开发资料可读、哈希一致和软件保存成功不会开放这些能力。

项目的`researchRegistrations`可追加当前登记，保留已有索引身份和历史场景。旧包没有登记时重开为无登记状态，不从当前文件自动补入；用户主动“接纳当前科研登记”或“追加当前科研登记”后再保存、JSON或ZIP导出。本轮已实际追加`6b5610…`，与`efa096…`共存，本地保存及页面重载恢复两份登记均已验证；最新双版本JSON与ZIP也已从磁盘实际重开。前一版本和最新双登记的浏览器验收分列于[科研状态接入记录](科研状态接入_20261006.md)。

- [当前科研登记副本](public/data/research-state.json)
- [当前6b5610…索引快照](public/data/research_snapshots/6b56102f564361fe2755efbea9b613b2a71e67af3d5fcd247ea157cc2af659f9.json)
- [历史efa096…索引快照](public/data/research_snapshots/efa0962c4a6ea46d47d9339330e350120f7d923d80008aeb214da5b95f144fd2.json)
- [只读登记入口](scripts/register-research-state.mjs)与[当前独立软件核验记录](scripts/research-state-registration-receipt.json)
- [保留的efa096…独立核验记录](scripts/research-state-registration-receipt_efa0962c4a6ea46d47d9339330e350120f7d923d80008aeb214da5b95f144fd2.json)

## 共同试点准备资料与住宅源面

共同试点准备登记为`pilot-preparation:7d66553a704f56bb247003cdb163f5234a7c90abeaca8eb06816db297f764892`，schema为`0.1.read-only-pilot-preparation-registration`。原ZIP93,456 bytes，SHA-256为`08c7156289efc7a383b096fca81a8442cc0915ed265c6986dfe4a6d6eaafd543`；原清单11,511 bytes，SHA为`d858b018fc206d561202f0d0d6b0c31ea0cf2a05c87256f349fe35ed50c7f0d6`。14项显式源件与15个ZIP成员逐项核查，完整原ZIP和原清单随准备登记保存。

登记与原清单四轴分开。原状态仍为`checked/not_assessed/not_adapted/not_run`；平台回执只确认原ZIP、清单和14项准备源字节一致、只读本地接入及没有研究执行。六项运行门控仍为`false`，不改变科研登记原有七项应用门控。

住宅展示读取既有[6个完整住宅候选源面](../共享接口/公平性输入准备/共同试点住宅源对象_展示准备.geojson)，不裁剪、简化或修复，也不替换原场景建筑层。`residence_candidates`为独立展示角色，源FID、合并ID、source row、源哈希及原生人口格ID分别保留。Residence只是发布标签；原观测日期、实际入住、公共可进入性、服务角色、T/P/U及公平单元仍未知或未采用，不能声称为2020同期住宅。

六对象不与300 m窗相交，500 m仅是准备窗。CSV的人口单位为人数/原生像元，未分配或汇总建筑人口，住宅GeoJSON不携带人数；六住宅与六受体尚无OD关联。宏观九格8格输入接受、`E4126_N33890`缺项、33项微观`null`、两类天气/一类地形候选和12条未计算双分支记录保持原值。旧service快照与当前准备源件的字节差异分别保存，不自动重基。

准备登记只允许显式接纳与`E4125_N33891`的真实中心、100 m核心及100/300/500 m范围对应的资料；中心和核心米制核对容差0.05 m，求解域保持`null`。用户导入场地或其他位置不能复用，旧工程无准备登记时不自动回填。JSON/ZIP及本地保存均等待异步原包字节核验；ZIP准备侧录与项目一致，源准备ZIP不能冒充工程ZIP。

- [当前准备登记](public/data/preparation-state.json)与[保留的准备快照](public/data/preparation_snapshots/7d66553a704f56bb247003cdb163f5234a7c90abeaca8eb06816db297f764892.json)
- [只读登记入口](scripts/register-preparation-state.mjs)与[独立源字节核验记录](scripts/preparation-state-registration-receipt.json)
- [任务书](../平台产品设计/共同试点准备资料接入任务书_20261006.md)与[实际接纳、保存及交接记录](共同试点准备接入_20261006.md)

本轮1份准备登记与2份科研登记已通过本地保存、重载恢复，以及JSON/ZIP磁盘读取与UI文件选择器重开。磁盘文件中的原场景、24来源、15图层、两科研原快照、准备固定副本及其原93,456字节ZIP均核对一致，14源核验通过；完整路径/哈希及错误包、旧包、换场地的实测证据分别见上述接入记录。

## 区域绿色分类星点

[regional_green_points.geojson](public/data/regional_green_points.geojson)只取已登记当前宏观联结表的 `c4_min0` 单口径，在 6,567 个唯一网格中选取有限且 `0 < G02 <= 1` 的 5,868 个记录。点坐标来自同一 `grid_id` 的源节点 `center_e_m`、`center_n_m`，转换为 WGS84 经度/纬度；它们是网格中心，不是绿色斑块质心或实测观测点。此层仅作“绿色分类预览 · c4_min0 · 候选指标”的导航显示。

原研究代码 `02_不同绿色空间的相互作用/宏观研究/实施/第一步_数据与变量核查/绿地/compute_green_trials.py` 的第 33 行定义网格面积 10,000 m²，第 194 行以分类 2、3 为绿色，第 255—263 行计算保留比例与筛除比例，第 310 行检查 `G02 = G03 + G04`。因此 G02 是保留分类 2、3 的投影面积之和除以网格面积，是 0—1 的无量纲比例；G03、G04分别为两类分量。`filtered_green_ratio` 是筛除绿色比例，本口径全部为零，不能用作现存绿色比例。

点属性原样保留 G02、G03、G04、`filtered_green_ratio`、`green_trial_status`、正式输入/标签准入声明与源 SHA-256；CSV 数值仍为原字符串，未改成百分数。清单适配记录保存定义参考代码的路径、行号、总行数和 SHA-256，以及来源、坐标变换、筛选计数与独立回读记录。代码只读，没有执行；参考代码不是新增的第 25 项科研原件。单网格只生成单口径的一个导航点，不增加独立样本、不展示温度、不升级研究准入，也不解释为实地绿量或热效应。

当前城市星图跨区域与场地连续显示：远景将多个已有来源点聚合成光团，近景展开原始来源点。聚合数量是来源网格点数量，光团颜色只用组内G02平均值作显示强调；光团位置和大小不作为新的绿色空间几何，不将光团数解释为独立绿地或研究样本数。

光团、原点与光晕随缩放调整显示大小和亮度，3秒呼吸仅改变光晕透明度；切换到场地不自动隐藏星点或关闭呼吸。系统减少动态时保留静态光效并停止时间动画。右侧“绿色光效”开关同时控制这组点光与历史道路导航参考，设置随项目保存和导出保留；旧包未记录该选项时默认开启。

显示聚合、缩放与动画不改写底层点位、G02原值、来源计数、源文件哈希或四轴状态。显示阈值及聚合尺度不作为生态、降温或科研分类标准，来源几何和科学状态仍以原清单、原记录为准。

已打开地图中的既有点光、光晕及聚合显示也会同步新的显示参数，绿色光效贯穿区域与场地；这些同步只影响渲染，不改写保存的来源几何或科研字段。

## 2021 年历史道路导航参考

[regional_roads_2021.geojson](public/data/regional_roads_2021.geojson)是已存在的上游文件 `02_不同绿色空间的相互作用/宏观研究/数据核查/二环边界核对_2026-10-02/chengdu_highways_210101.geojson` 的逐字节显示副本：4,515,166 bytes，12,032 个 LineString。原 JSON 结构、要素 ID、属性、经纬度坐标和顺序均保留，没有增加要素字段、重投影、裁剪、修复、平滑或生成新道路线。

独立冻结 SHA-256 为 `56f276ba8b8c69e52a0f70ceb7312d7900394da1dff41b5d1598b6fc163b18fb`。管线分别检查这个来源与显示副本的哈希，并记录制作前后来源哈希、线数、坐标点数与经纬度范围；只核 JSON 结构和有限经纬度坐标范围，不认证位置准确度。该导航来源登记于 `manifest.platform_adaptation.regional_roads_2021`，**不加入原 24 项 artifacts，也不改变原件清单快照或科研状态**；独立冻结哈希不匹配时不会静默重建。

青蓝线仅标记“2021历史导航参考”，不称当前路网、已核准宽度、步行网络或已经接入的科研输入。区域道路与工程样例两期各 17 条来源道路分别计数；导航参考不用于对象选择或场地分析。来源中的历史 OSM 属性保留原值，OSM 署名和许可链接仍适用。

这份青蓝历史源线在区域和场地视图中均可显示，由“绿色光效”开关与点光一起控制；视图切换和缩放仅调整呈现，不修改源线几何、原快照或记录数量。

## OpenStreetMap 在线底图与 CARTO 记录

当前默认使用 OpenStreetMap 标准栅格底图，视口瓦片入口为 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`。地图内保留可点击署名 **© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors**；官方版权页说明 OSM 数据以 ODbL 授权并要求署名。[OpenStreetMap 版权与许可](https://www.openstreetmap.org/copyright)。

底图采用正常的人机交互视口请求，没有新增批量抓取、预下载或离线地图打包。浏览器依照服务 HTTP 头处理正常缓存；“只用本地图层”关闭在线背景，显示本地研究资料，未离线保存 OSM 底图。OSM 官方政策允许正常交互浏览，禁止批量下载和预抓，服务没有可用性保证。[OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)。

本轮核查发现 CARTO 官方资料要求自有 API key，因此本版已移除 CARTO 请求入口，暂无 CARTO key 环境变量或选择界面。若后续使用 CARTO Dark Matter，应按届时服务条款配置自己的 key，并在地图内同时保留 **© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, © [CARTO](https://carto.com/attribution/index.html)** 的可见链接署名。依据为 [CARTO basemap-styles](https://github.com/CartoDB/basemap-styles)、[CARTO 署名说明](https://carto.com/attribution/index.html)、[2026 年 9 月 29 日更新的服务条款](https://carto.com/legal/basemap-terms/)；核查日期为 2026 年 10 月 5 日。

在线底图道路、建筑、地名与公园均为位置导航背景，不能作为本项目的实测几何、植被分类或热环境证据。研究来源图层有各自 ID 和来源哈希。本包没有离线打包 OSM/CARTO 瓦片、字体、精灵或地图内容；DEM、地形求解、气象驱动、观测校准、热结果和布局推荐尚未接入。

当前本地软件已运行，本轮62项Node检查通过，包含22项地图、18项工程交接、9项科研登记合同、9项准备登记合同和4项网站检查；定位与异步状态守卫修改后的最终生产构建也已通过，原大chunk性能提示保留。完整批次见[共同试点准备接入](共同试点准备接入_20261006.md)。前一科研登记回合`efa096…`的保存、JSON与ZIP读回、实际磁盘下载及重开已验证，磁盘文件SHA与界面回执一致；下载事件等待超时单独记录，完成依据为落盘文件和实际重开。此前10月5日后台导出未取得新磁盘文件的尝试仍作为历史失败保留，不能与成功证据混写。

前一科研登记回合`6b5610…`索引已完成只读来源核验并手动追加到含`efa096…`的工程。本地保存及页面重载恢复、该批双版本JSON与ZIP导出读回和实际磁盘重开均已验证，两份登记、历史来源和七项关闭门控保留。该批下载文件位于本机`/Users/wangyanbo/Downloads`，实际文件SHA与界面回执一致：

| 格式 | 最新实际磁盘文件 | 大小（bytes） | SHA-256 |
| --- | --- | ---: | --- |
| JSON | `街区交接_E4125_N33891_2026-10-05T19-09-47-608Z.json` | 4,738,062 | `cce6ea23287a869cc21ee0c2ffb83ebb589e4737a06102a67c0851bd16d74ee8` |
| ZIP | `街区交接_E4125_N33891_2026-10-05T19-11-03-041Z.zip` | 818,162 | `ed14b2ee14efb33bb8a0360189917e1c6e49e706fdd56fa3a4858e71efff97bf` |

新增登记、双登记保存导出及重开以[科研状态接入记录](科研状态接入_20261006.md)分版本记录。其他软件证据见[验收记录](验收记录.json)、[界面核查](design-qa.md)及[独立复核](tests/独立复核.md)。这些结果只确认所记录的软件操作，不能作为A01—A21全部完成、研究应用验证或公开部署完成的依据。
