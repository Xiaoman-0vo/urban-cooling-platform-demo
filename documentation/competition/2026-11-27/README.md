# 赛题一关键代码与参赛素材

整理日期：2026年11月27日。包含15组关键代码截图、实现思路、可编辑报告表述、数据与量化结果、CodeArts真实使用记录，以及云服务待补证内容。

## 下载与阅读

- [关键代码与实现思路](关键代码与实现思路.md)：可直接在仓库阅读，包含15张图与对应代码原文。
- [24页可编辑 Word](UrbanCool_AI_赛题一参赛材料与关键代码说明_2026-11-27.docx)：适合整理到官方模板1。
- [完整截图和佐证素材 ZIP](UrbanCool_AI_赛题一代码截图素材_2026-11-27.zip)：含高清图、代码原文、测试日志、历史模型指标和CodeArts记录。

## 代码索引

| 编号 | 内容 | 源文件 |
| --- | --- | --- |
| 01 | 用户目标必须有原话依据 | [server/agent-tools.mjs](../../../server/agent-tools.mjs#L104) |
| 02 | 用状态图组织模型和工具循环 | [server/agent-runtime.mjs](../../../server/agent-runtime.mjs#L98) |
| 03 | 工具权限与执行记录在服务端落实 | [server/agent-runtime.mjs](../../../server/agent-runtime.mjs#L60) |
| 04 | 公众热感知线索按批次校验来源 | [server/heat-collection.mjs](../../../server/heat-collection.mjs#L35) |
| 05 | 在预算和空间约束内生成候选 | [server/pilot-search.mjs](../../../server/pilot-search.mjs#L51) |
| 06 | 地图定位与候选边界同步显示 | [src/pilot-preview.js](../../../src/pilot-preview.js#L2) |
| 07 | 冻结数据与模型先核验再使用 | [server/historical-lst.py](../../../server/historical-lst.py#L25) |
| 08 | 把地图范围编译为覆盖情景特征 | [server/historical-lst.py](../../../server/historical-lst.py#L96) |
| 09 | 手动评价先检查当前版本和约束 | [server/pilot-temperature.mjs](../../../server/pilot-temperature.mjs#L81) |
| 10 | CodeArts 实现结果一致性判断 | [src/evaluation-readiness.js](../../../src/evaluation-readiness.js#L91) |
| 11 | 采用候选时再次核对版本 | [server/pilot-search.mjs](../../../server/pilot-search.mjs#L86) |
| 12 | 账户数据持久化与隔离 | [server/account-database.mjs](../../../server/account-database.mjs#L89) |
| 13 | 导出成果时保留版本和成员哈希 | [src/planning-workflow.js](../../../src/planning-workflow.js#L146) |
| 14 | OBS 交付代码保留执行门槛 | [deploy/huawei/delivery.mjs](../../../deploy/huawei/delivery.mjs#L92) |
| 15 | 容器部署保留状态并限制权限 | [deploy/huawei/compose.yaml](../../../deploy/huawei/compose.yaml#L16) |

报告篇幅有限时，优先使用01、02、05、08、10和13；其他内容可作为实现细节或答辩备查。

## 版本与验证口径

- 材料源码基线：`ca4e0e17b0c2a41120d48a298de4372cb4af4450`，图中行号和说明按该版本冻结；后续修改源代码时请同步更新材料。
- 发布前核对的远端 main：`3fbe67bd322eac2160964b1cfb81dc433be2bf0e`。
- 2026年11月27日基线软件回归：214项中212通过、2跳过、0失败；独立账户/云模板/交付组合28项通过。两组存在重叠，不累加。
- 模型指标和七次场地实算属于已保存的冻结历史记录，本轮未重新训练或重跑模型。
- 真实关联云服务创建、华为云部署及现场降温效果尚未完成，准备代码和本机验收不计作云端或现场证明。
- 本次发布新增材料和阅读入口，业务源码保持原有内容。当前工作区未提交的云接入说明不包含在本次提交中。

文件哈希和源码范围见[来源清单](source-manifest.json)。官方要求与模板入口已经保留在Word及素材包中。
