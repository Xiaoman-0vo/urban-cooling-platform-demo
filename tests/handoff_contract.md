# 本地交接合同与独立验收准备

日期：2026-10-05。范围：只审核共享接口与平台静态适配、保存、导出和重开；不训练、求解、统计公平、计算可达性或生成研究结果。

依据是项目根目录下三个只读源件：共享接口/成果能力清单.json、共享接口/当前验收场景.json、共享接口/综合结果接入约定.md。参考包版本为2026-10-05.v1，场景为CD_E4125_N33891_source_handoff_v1。

## 1. 静态资料合同

- public/data/manifest.json保留原能力清单的package_id、package_version、artifact_count、24条artifacts、capabilities、rules；平台适配信息只加在platform_adaptation，不覆盖源件的四轴或来源哈希。
- public/data/scene.json保留原验收场景的共同ID、情景类型、科学范围、样例身份、经纬度、EPSG:32648、scope_registry、coordinate_mapping、identity_rules、version_alignment和checks。
- scene新增layers，各项为GeoJSON FeatureCollection。buildings、vegetation、roads、receptors的源properties不重命名；新增__artifact_id、__source_layer、__source_fid，feature.id采用artifact:layer:fid。建筑源ID为merged_id，植物裁片ID为local_id，源组件为source_component_ids，道路联合键为rr_snapshot_label和rr_source_feature_id。
- layers.context与context500都是500m准备窗；macro_context300是独立的300m一圈宏观邻域，不替换准备窗。
- records保存所选E4125_N33891的六条完整CSV口径，原值为字符串，空单元格保留空字符串。tables保存微观几何、裁片身份、待补输入及选中建筑支持行。JSON结果缺失使用null，不能混用空字符串或0。
- scene.counts提供原始计数与适配层计数；部件数、裁片数、源对象数分别记录。计数简键可同时提供，但必须与详细键一致。
- scene.results保持未计算热结果与false运行开关。本地软件可以成功浏览；源科学验证仍按原清单记录。

## 2. C01—C08自动检查值

| 检查 | 自动可核验值与语义 | 限制 |
| --- | --- | --- |
| C01区域资料 | 6,567节点；58,215有向边；6,567自环；角色344边界相交、5,871全内、352外围；39,402口径行属于6,567独立格；六口径c4/c8 × min0/min9/min36；当前目标仅六条完整记录 | 比较JSON元数据和适配记录，不重读全量原始数据库，不认证模型输入 |
| C02范围 | core_100宽100m，界[412500,3389100,412600,3389200]；macro_neighborhood_300宽300m，界[412400,3389000,412700,3389300]；micro_preparation_500宽500m，界[412300,3388900,412800,3389400]；physical_solver_domain宽与界均null、not_defined | 三个已有范围分列；300m/500m均非最终求解域 |
| C03建筑与受体 | 500m准备窗53个源建筑；核心5个；6个候选受体；建筑源ID保留并唯一；受体为not_measured_or_confirmed；工作高度精度未验证 | 渲染部件数可以大于53；软件外观不能升级为实测三维精度 |
| C04植被身份 | 3个裁片，local_id分别保留；source_component_ids归到17696，共1源组；分类投影面积合计1989m²；真实独立绿地仍未验证 | 不能显示3个真实独立绿地，不能把投影面积当可种植地面 |
| C05道路与地面 | 每快照17条道路记录、2快照；联合键保留且不重复；合并后的真实唯一道路数not_inferred；无道路面；hard_review_is_plantable=false | 不把34行称34条独立道路，不把候选源线称验收步行网络 |
| C06缺结果 | temperature_improvement_C=null；value_state=not_calculated；prediction_enabled、physics_enabled、optimal_recommendation_enabled均false；I11权重/总分null | 不显示0℃改善，不伪造舒适、公平、综合推荐 |
| C07冻结版本 | 联结表冻结哈希e4230e…ce87与当前98a8bd…430e5不同，same_as_frozen=false；其他已登记哈希双保留；manifest当前哈希与scene版本记录一致 | 不能用当前哈希覆盖微观冻结来源；是否重建由研究方决定 |
| C08保存与重开 | 原来源24项、四轴、ID、scope_registry、空值、六口径、source_component_ids、冻结/当前哈希逐项保留；可选导出文件与当前静态数据核对 | 静态测试不能证明按钮、文件下载或浏览器导入成功；浏览器步骤需另外实际执行 |

自动检查入口：test_handoff.py。默认读取同一应用public/data下两份JSON和根目录共享接口；缺文件直接失败，不把缺少资料当通过或静默跳过。只依赖Python标准库，不需安装地理库。

运行：

    python3 -m unittest discover -s '平台本地首版/tests' -p 'test_handoff.py' -v

实际下载文件可额外检查：

    HANDOFF_EXPORT_FILE='/absolute/path/export.zip' python3 -m unittest discover -s '平台本地首版/tests' -p 'test_handoff.py' -v

实际文件支持JSON或ZIP；ZIP只在内存读取project.json和layers/*.geojson并逐层核对，不解压写盘。未提供导出文件时，仅C08“实际下载文件”子检查标为跳过；其余静态合同检查照常运行。测试不修改共享源件、前端或数据输出。

## 3. 浏览器验收：定位→范围→源身份/缺项→保存→导出→重开

本文件仅列准备步骤；浏览器执行者另记录真实时间、应用版本、证据、通过/失败和异常。以下步骤本轮尚未执行。

1. **定位。**打开本地应用，等待真实场景加载。输入/选择E4125_N33891或对应104.0874739045911、30.63178077683709。应进入本样例；显示“可替换工程样例、非用户确认正式样本”，不承诺任意位置均有同等资料。改变相机不改变研究对象ID。
2. **范围。**依次显示100m核心、300m宏观邻域、500m准备窗，并旋转、缩放。三范围的位置、用途与记录一致；切到300m显示不截掉500m包的来源记录。物理求解域仍“未定”，不能被相机框代替。
3. **源身份与缺项。**点击建筑、植物裁片、受体和道路。查看源ID、源图层、时间/哈希、工作高度状态；三植物裁片均能追溯到17696；道路按快照显示。缺项面板显示热结果未计算、道路面/可种植性未验收、受体未测、同期基线未认证，以及当前与冻结联结版本差异。
4. **保存。**保存当前选择、范围、相机和图层状态，再刷新/关闭后打开。uiState与共同ID恢复，数据空值、四轴和版本不被自动升级。“保存成功”须以真实持久化回读为依据。
5. **导出。**下载JSON或ZIP，浏览器执行者记录实际文件路径并读取文件。ZIP含project.json和各layers/*.geojson。导出含完整来源目录与当前加载场景展示副本，明确不包含24个全部原始源文件。核对表列数字、ID、范围、来源哈希、空值、四轴、uiState、imports与独立软件回执。
6. **重开。**通过应用导入刚下载的JSON或ZIP；在另一个浏览器上下文或无原源电脑的场景查看模式复核。几何和属性能显示则可确认“展示副本可回读”，不能确认原始研究资料齐备。核对选择/范围/图层/相机恢复，删除或错误字段应有错误提示且不覆盖原项目。

还需一个失败样例：导入损坏JSON或未知export_schema_version，应用明确拒绝并保留当前内容；不生成貌似成功的空项目。

## 4. 导出与状态合同

根前端冻结导出：

- export_schema_version = 0.1.local-view-handoff。
- sourcePackage = 当前manifest完整来源目录与适配记录。
- scene = 当前加载场景；layers = 当前加载场景的GeoJSON层。
- uiState = 使用者定位、对象选择、范围、图层及相机等当前界面状态；imports保留用户追加资料记录。
- software_receipt = 独立软件记录，只表达本次加载、保存/导出/导入等操作的验收，不升级研究状态。

导出不是包括所有研究原件的自包含数据包。源绝对路径、项目相对路径、文件哈希与公开再分发许可状态保留；场景展示副本可以自带几何/属性，但不能凭目录路径推定原件存在、可下载或许可公开。

四轴必须分别保留：file_acceptance、science_validation、integration、execution。源验收state和scope原样保存，平台接入/操作状态写入platform_adaptation及software_receipt；不能将浏览器正常加载转换为科学validated。

当前获准的单项文档更新仅为artifact_id=product_contract：原来源目录继续保留冻结哈希与四轴，platform_adaptation.source_version_changes显式记录冻结/当前哈希、源路径、reason=authorised_current_platform_spec_sync及accepted_for=platform_contract_reference_only_not_scientific_rebuild。其他23项科研来源必须匹配原登记哈希；本次管线所有源件读取前后哈希一致。此例外属于平台契约同步，不代表更新微观冻结场景、科研数据或科学验证。

必保留空值包括：源观测日期未知时source_observation_time=null；原包package_relative_path=null；物理求解域width_m/bounds_m=null；热改善值null；I11 weights/overall_score=null。not_calculated、not_defined、not_assessed、not_received、missing、not_applicable、failed等含义不合并。

## 5. 03面积目标与有限搜索结论

I04保留normalized_indicator_distance；I08保留added_green_projection_area_m2，并明确not_equivalent_to_objective=normalized_indicator_distance。面积目标为m²，必须以合法候选协议独立求解，当前search_conclusion=not_run，不能从最小D候选换算面积后称最少新增面积。

完整100m格、同分母且只新增时，10000 × (G02_new − G02_baseline)只是一项面积定义关系；不是优化证明、可种植地面、工程量或人民币。只有新增且保留现有植被、统一布局规则的首版建议尚待研究冻结。

若后来接入搜索，target_met、target_not_met、no_feasible_candidate_found、support_insufficient、inconclusive分别保留。有限搜索失败不等于证明不可达；未找到与支持不足对象不从公平分布中静默删除。

## 6. 通过范围

静态断言通过，只说明交接JSON保留了已约定数据及状态。必须实际完成浏览器步骤并读回保存/导出文件，才能确认“本地软件贯通”。温度、舒适、服务、公平和综合推荐的科学准入仍以各方向研究验证为依据。

## 7. 本轮独立执行记录

2026-10-05，在真实public/data/manifest.json和scene.json生成后执行test_handoff.py：9项检查中8项静态合同检查通过，1项实际导出文件检查因未提供HANDOFF_EXPORT_FILE明确跳过；最终退出码0。不把该跳过项记录为通过。

确认显示副本为53个源建筑、54个渲染部件、5个核心源建筑、6个候选受体、3个植被裁片/1源组；道路按roads_2020、roads_2021各17行计数，源rr_snapshot_label分别保留2020年初、2021年初，联合身份按源字段核验。

确认三范围与未定物理求解域、温度null/未计算、I04与I08独立目标、I11空权重/总分、源24项原始四轴均保留。平台适配日志的24项前后哈希一致；23项匹配原登记，1项product_contract具有明确获准版本同步记录，不据此升级科研场景。

本轮未操作浏览器，未验证实际按钮、浏览器持久化、下载或应用导入。负责浏览器验收的执行者可将真实JSON/ZIP路径传入HANDOFF_EXPORT_FILE，再核对实件；仍须另记录页面重开及导入读回。
