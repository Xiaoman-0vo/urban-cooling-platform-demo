# 城市降温平台现有源数据交接包（2026-10-22）

> 本文件保存打包时的原始交接说明，供对照 ZIP 内同名记录。当前下载、分目录解压和许可补核请以 [datasets/README.md](README.md) 为准。以下“解压到同一文件夹”是旧建议；实际交接请先按包编号分别解压，保留每包公共清单，再按需合并数据。CMAB v7 的 CC BY 4.0 已补核，证据见 [license_verification.json](license_verification.json)。四个原始 ZIP 的字节与哈希未修改。

本交接包保留当前项目已取得的数据产品原始文件或已保存的原生窗口/原对象提取件。这里的“源数据”指本研究取得的输入产品，其中植被分类、建筑高度、人口、绿视率本身是发布者加工或模型估计的产品，不全部属于第一手实测记录。

## 四个压缩包

- 01_WorldPop2020_China.zip：2020 年中国人口源栅格，R2025A v1 约束型。
- 02_CLCD2020_China.zip：2020 年中国土地覆盖源栅格及发布者分类表。
- 03_Chengdu_Buildings_Greenness.zip：CMAB v7 成都完整 5 个 Shapefile 组件、SGVI cd/ 全 45 个成员、CNBH 原始 X105Y31 瓦片和 UBGG 成都原始栅格。
- 04_Landsat_OSM_Basemaps.zip：已保存的 10 景 Landsat 原始温度 DN/QA 窗口，两景红光/近红外 DN/QA 窗口及来源元数据，两期成都中心区 OSM 原对象提取件，Natural Earth 三个原始发布 ZIP 和成都导航边界原始响应 JSON。

四个 ZIP 可解压到同一文件夹，公共清单相同；Natural Earth 的原始 ZIP 仍保留为 ZIP，可按需再次解压。Shapefile 的 .shp/.shx/.dbf/.prj/.cpg 必须放在同一目录。

## 来源与年份

逐产品来源、版本、年份、原生坐标和已知局限见 data_products.json。逐文件大小、SHA256、原始本地路径与源 ZIP 成员名见 manifest.csv / manifest.json。源 ZIP 取件只改变外层打包，不修改成员内容。全国人口和 CLCD 未裁剪；OSM 为保存完整 way 的局部对象提取件；Landsat 是现有保存窗口而非完整卫星场景。此包未下载新影像、裁剪新数据、重投影、改值、重算模型或制作派生 100 米指标。

产品标注年份与实际输入或发布时间不能混用：UBGG 成都来自 2020-07-27/28 影像；WorldPop 2020 为人口目标年而版本发布于 2025 年；CMAB 成都逐栋观测时点未确认；CNBH 目标年 2020 但输入含其他时期；SGVI 为 2023 产品，gvi1-gvi4 的季节对应未核实。Landsat 地表温度不等同气温或人体热舒适。

## 许可与署名

人口、CLCD、UBGG、CNBH、SGVI 的本地来源台账登记为 CC BY 4.0，当前发布者许可核验结果及 CMAB 数据许可见 license_verification.json。对许可字段没有取得独立明确值的产品，保留“未确认”，不把论文页面许可自动当作数据许可。OSM 数据保持 ODbL 1.0 并署名 © OpenStreetMap contributors，说明见 https://www.openstreetmap.org/copyright 。Natural Earth 为公有领域，Landsat 为 USGS 公有领域数据。公开再分发时保留每个数据集的原作者、来源、版本和许可；本说明不替换原许可。

## 校验与边界

SHA256SUMS.files.txt 校验原文件或原 ZIP 成员；SHA256SUMS.packages.txt 校验四个交接 ZIP；verification_report.json 记录每个 ZIP 的成员数、逐成员 SHA256/字节读回和 CRC 检查。未纳入 QQ 机器人配置、密钥、对话或运行日志。此包不包含模型权重、研究结果、论文附件或完整街景照片。
