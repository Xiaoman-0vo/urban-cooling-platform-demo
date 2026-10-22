# 研究源数据：下载、来源与校验

这里提供已有源数据包的索引、来源清单和校验方法。**前端开发和浏览现有展示资料不需要先下载这约 1.94 GB 的数据。**源码仓库中的 `src/` 是界面程序，`public/data/` 是已整理的展示资料；这些研究源数据通过独立 GitHub Release 交付，不放进前端公开静态资源目录。

## 当前交付状态

截至本次本地整理，四个 ZIP 已生成且逐成员完整性检查通过；**远程 Release 与附件尚待发布（pending）**。以下链接是固定的预定地址，在发布完成前可能返回 404。只有发布者实际确认远程附件后，才把 [release_assets.json](release_assets.json) 中的状态改为 `published`；这个状态文件本身不替代下载后的 SHA256 校验。

预定 Release：[`v0.1.0-collab-20261022`](https://github.com/Xiaoman-0vo/urban-cooling-platform-demo/releases/tag/v0.1.0-collab-20261022)。

| 数据包及预定下载地址 | 实际 ZIP 字节 | 约 GB | 状态 |
| --- | ---: | ---: | --- |
| [01_WorldPop2020_China.zip](https://github.com/Xiaoman-0vo/urban-cooling-platform-demo/releases/download/v0.1.0-collab-20261022/01_WorldPop2020_China.zip) | 855,466,230 | 0.855 | pending |
| [02_CLCD2020_China.zip](https://github.com/Xiaoman-0vo/urban-cooling-platform-demo/releases/download/v0.1.0-collab-20261022/02_CLCD2020_China.zip) | 756,021,034 | 0.756 | pending |
| [03_Chengdu_Buildings_Greenness.zip](https://github.com/Xiaoman-0vo/urban-cooling-platform-demo/releases/download/v0.1.0-collab-20261022/03_Chengdu_Buildings_Greenness.zip) | 296,274,587 | 0.296 | pending |
| [04_Landsat_OSM_Basemaps.zip](https://github.com/Xiaoman-0vo/urban-cooling-platform-demo/releases/download/v0.1.0-collab-20261022/04_Landsat_OSM_Basemaps.zip) | 26,948,673 | 0.027 | pending |
| **总计** | **1,934,710,524** | **1.935** | 本地已核验，远程待发布 |

GB 按 10 亿字节计算，总量约 1.802 GiB。清单中的 118 项源文件及元数据解压后合计 2,356,992,143 字节；压缩包和解压内容同时保留约需 4.3 GB，建议预留至少 5 GB。没有把全国所有年份、其他城市或未取得的完整卫星影像算进来。

## 每个包包含什么

| 包 | 具体内容与空间支持 | 原件或提取方式 |
| --- | --- | --- |
| 01 人口 | WorldPop 中国 2020 人口单波段 GeoTIFF，Global2 R2025A v1 约束型；原生 WGS84、3 角秒，通常称约 100 m；每原生像元的估计人数 | 全国发布者文件原件，未裁剪、未重投影；只含 2020 目标年。2025 是版本发布年。 |
| 02 土地覆盖 | CLCD 中国 2020 年 30 m 土地覆盖 GeoTIFF及原分类表 `CLCD_classificationsystem.xlsx` | 全国发布者原件，保留原 Albers 投影；只含 2020 年，不包括整个年度系列。 |
| 03 成都建筑与绿化 | CMAB v7 成都完整 5 个 Shapefile 组件；SGVI `cd/` 下全部 45 个成员，涵盖点、道路及 nodata 图层；CNBH `CNBH10m_X105Y31.tif` 原瓦片；UBGG 成都 3 m 原栅格 | CMAB、SGVI 从发布者原 ZIP 选取对应城市成员，逐成员字节保持不变；CNBH 与 UBGG 为原发布文件。CNBH 是覆盖成都的源瓦片，不是完整全国高度数据。 |
| 04 观测、道路与底图 | 已保存的 10 景 Landsat 温度原始 DN/QA 窗口，两景红光与近红外原始 DN/QA 窗口及来源元数据；2020/2021 年初 OSM 成都中心区对象提取件；Natural Earth 省级区划、河流和城镇三份原 ZIP；成都导航边界完整原始 JSON | Landsat 是已有原生网格窗口，未重新取得完整场景；OSM 提取窗为 WGS84 `[103.97,30.59,104.16,30.76]` 并保留完整 way，对象可伸出窗口；Natural Earth 保留全球原 ZIP，导航边界为 OSM 原 API 响应。 |

“源数据”指本研究取得的输入产品。植被分类、建筑高度、人口和绿视率本身包含发布者的分类或模型估计，不能统一称为第一手实测。产品标注年份、输入影像日期与发布日期分别记录，详见 [data_products.json](data_products.json)。其中：UBGG 成都来自 2020-07-27/28 影像；CMAB 成都逐栋日期尚未确认；CNBH 目标年 2020 但输入包含其他时期；SGVI 是 2023 产品，其 `gvi1`–`gvi4` 的具体季节对应尚未核实。

本包保留原值与坐标，不提供新的投影统一或模型准入认证。Landsat 地表温度仍是过境时刻的地表温度；人口是空间估计；OSM 数据库连接不等于实测行人通行；Natural Earth 的 `10m` 表示 **1:1000 万制图比例尺**，不是 10 米像元。解压与校验通过不能自动转成热舒适、真实降温、真实访问或规划施工结论。

## SHA256：下载后必须比对的固定值

```text
a44bc1c37ce51cc02c9554b22eaf8d7f6ffdebb34ff57da637630cd9b041a9b8  01_WorldPop2020_China.zip
21c33c1b1b79ab6456e4ea784ab5700172d1330c7c37f7ae965ae8db899a55c2  02_CLCD2020_China.zip
0e31f03a16dd5e17ebff86ab28f44050332cb2bfc875614e52b62dcdc5caac07  03_Chengdu_Buildings_Greenness.zip
755d16c3381203059e4c9822a88575766ad6d2810608ebed2203e71a0f218533  04_Landsat_OSM_Basemaps.zip
```

同一内容也在 [SHA256SUMS.packages.txt](SHA256SUMS.packages.txt) 和 [release_assets.json](release_assets.json)。不要仅根据浏览器显示“下载完成”或文件能打开判断完整。

## 跨平台下载和校验脚本

`download_data.py` 使用 Python 3.11 及以上版本的标准库，不安装第三方依赖。以下命令从仓库根目录执行。macOS 使用 `python3`；Windows 通常使用 `py -3`。先确认所用解释器版本符合要求。

查看预定附件与校验信息，不连接外网：

```text
python3 datasets/download_data.py list
```

Release 发布后，下载全部或只下载较小的观测道路包：

```text
python3 datasets/download_data.py download --all
python3 datasets/download_data.py download 04_Landsat_OSM_Basemaps.zip
```

Windows PowerShell 对应写法：

```powershell
py -3 datasets/download_data.py list
py -3 datasets/download_data.py download --all
```

默认存到 `datasets/downloads/`；可以加 `--directory "完整路径"` 选择已有数据盘。若通过浏览器手动下载，把文件放进同一目录后执行：

```text
python3 datasets/download_data.py verify --all
python3 datasets/download_data.py verify 04_Landsat_OSM_Basemaps.zip --directory "你的下载目录"
```

脚本只在明确执行 `download` 时联网。它逐块读取并同时要求大小与 SHA256 符合清单；验证完成后才保存为正式 ZIP。已有且一致的文件会跳过，已有但不一致的文件会报错保留，**不自动覆盖**。网络失败、校验失败或正常中断会清理本次创建的临时文件；强制结束进程可能留下带随机后缀的 `.partial`，确认属于本次下载后可自行移走。脚本不支持断点续传，不自动解压，不运行研究代码，也不会把“网络请求成功”当成“已核验”。

当前索引仍为 pending 时，脚本会明确提示可能 404；这不是已验证的远程下载。不要修改预期 SHA256 来迁就一个错误文件。若出现不同内容，重新核对下载来源和 Release 版本。

## 不使用脚本时的 macOS / Windows 校验

macOS：在 `datasets/downloads/` 打开终端，运行：

```sh
shasum -a 256 -c ../SHA256SUMS.packages.txt
```

该命令预期四个 ZIP 都在目录中。只下载一个包时可运行 `shasum -a 256 04_Landsat_OSM_Basemaps.zip`，将输出与上方固定值逐字比对。

Windows PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath ".\datasets\downloads\04_Landsat_OSM_Basemaps.zip"
```

将 `Hash` 与上方值比对；大小也应为 26,948,673 字节。需要自动逐包比较时，直接使用跨平台脚本的 `verify --all`。

## 解压与原生格式

先校验 ZIP，再解压到一个**新的空目录**，避免覆盖自己的输入。每包顶层名都是 `urban-cooling-data-20261022/`；包内公共说明和清单相同。建议先各自解压到按包编号区分的目录，之后按需合并 `data/` 内容。不要把下载文件直接放入 `public/data/`。

macOS 可以用“归档实用工具”解压，也可以在仓库根目录执行以下示例，目标目录须尚未包含自己的文件：

```sh
mkdir -p datasets/extracted/04
ditto -x -k datasets/downloads/04_Landsat_OSM_Basemaps.zip datasets/extracted/04
```

Windows PowerShell 对应示例不使用 `-Force`：

```powershell
Expand-Archive -LiteralPath ".\datasets\downloads\04_Landsat_OSM_Basemaps.zip" -DestinationPath ".\datasets\extracted\04"
```

Shapefile 的 `.shp`、`.shx`、`.dbf`、`.prj`、`.cpg` 保持同名并放在同一目录；CMAB 5 组件和 SGVI 每组 5 组件均已完整保留。GeoTIFF 可用 QGIS 等 GIS 软件打开；OSM PBF 是结构化对象数据，需要支持 OSM 的工具；Natural Earth 三个发布 ZIP 仍为嵌套 ZIP，可按需再解压。Landsat 原始 DN 的换算和 QA 解释见来源元数据，不能把 DN 数字直接当摄氏度或反射率。

## 与仓库其他目录的关系

- `src/`：前端源代码，负责交互、地图和证据展示，不是完整科研计算代码库。
- `public/data/`：前端直接读取的 JSON/GeoJSON 与内嵌登记；已有展示数据可支撑软件开发，但不能替代本目录列出的源产品。
- `evidence/`：历史软件与研究来源核查材料，包括失败样例与受控快照；不等于当前数据或当前模型运行结果。
- `datasets/`：轻量的数据索引和工具；ZIP 通过 Release 交付。`downloads/` 与 `extracted/` 被本目录 `.gitignore` 排除。
- ZIP 内的 `data/`：原始产品、来源成员或已保存的窗口；ZIP 内 `provenance/`：对应发布者说明和来源元数据。

清单及历史元数据中的 `/Users/...` 本地路径仅用于追溯原件，不是队友电脑的启动依赖，也不是下载目标。请根据 ZIP 内 `relative_path` 找文件，后续运行研究工具时显式配置本机数据根目录；不要批量替换溯源字符串或更改已记录的原件 SHA256。

## 来源、许可与公开发布范围

逐产品版本和来源见 [data_products.json](data_products.json)，许可核对见 [license_verification.json](license_verification.json)。继续保留原作者、数据集标题、版本、DOI 和相应署名；这里的说明不替换发布者许可。

| 数据 | 原来源与许可记录 |
| --- | --- |
| WorldPop | [官方产品页](https://hub.worldpop.org/geodata/listing?id=135)，[DOI 10.5258/SOTON/WP00839](https://doi.org/10.5258/SOTON/WP00839)，CC BY 4.0。 |
| CLCD | [Zenodo 18180184](https://zenodo.org/records/18180184)，本地来源台账登记 CC BY 4.0；原分类表随包保存。 |
| CMAB v7 | **数据集许可已实证确认 CC BY 4.0**。[版本 DOI](https://doi.org/10.6084/m9.figshare.27992417.v7)，[固定 v7 API](https://api.figshare.com/v2/articles/27992417/versions/7)，[许可原文](https://creativecommons.org/licenses/by/4.0/)。两份原始官方 API 响应与四川源包身份匹配，详见 [补核说明](license_evidence/CMAB_v7_许可核实说明.md) 和 [机器记录](license_evidence/CMAB_v7_许可核实结果.json)；保留作者、DOI、许可链接和成都取件重打包说明。此结论来自数据记录，不是从论文版权推断。 |
| SGVI-2023 | [Zenodo 15258817](https://zenodo.org/records/15258817)，发布者 API 已确认 CC BY 4.0。 |
| CNBH | [Zenodo 7827315](https://zenodo.org/records/7827315)，发布者 API 已确认 CC BY 4.0。 |
| UBGG | [Zenodo 8352777](https://zenodo.org/records/8352777)，发布者 API 已确认 CC BY 4.0。 |
| Landsat | [USGS 地表温度](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature)、[USGS 地表反射率](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-reflectance)，USGS 公有领域数据；保留场景与来源元数据。 |
| OSM 道路与导航边界 | [Geofabrik 中国来源](https://download.geofabrik.de/asia/china.html)，[OpenStreetMap 署名和许可](https://www.openstreetmap.org/copyright)，© OpenStreetMap contributors，ODbL 1.0。 |
| Natural Earth | [发布者下载入口](https://www.naturalearthdata.com/downloads/)，[使用条款](https://www.naturalearthdata.com/about/terms-of-use/)，Public domain。 |

### CMAB 许可补核及包内旧记录

2026-10-05 保存的官方 Figshare v7 API 响应明确记录数据集 ID `27992417`、版本 `7`、DOI `10.6084/m9.figshare.27992417.v7` 及 `license={value:1,name:"CC BY 4.0",url:"https://creativecommons.org/licenses/by/4.0/"}`。原响应 SHA256 `485780c0725d5b0a2b07d4e9ec76632ecba27a4ee9d7d5b2b3dca4b139a494f7` 与当时 HTTP 200 获取记录一致；2026-10-02 最初下载审计保存的独立响应也具有相同许可。

同一 v7 响应中的四川文件 ID 为 `53804027`，大小 529,366,213 字节、MD5 `a91c30dfd1c2f179ebc4e05f84b1a84f`，本次重新读取本地四川源包所得值完全一致，因此许可证据对应本项目实际提取成都组件的来源。Beijing City Lab [DATA049 原作者页](https://www.beijingcitylab.org/data/data-049/index.html) 也链接同一 Figshare DOI；其页面与作者辅助代码 README 用于交叉追溯，不替代数据集许可。

四个 ZIP 内早先的“CMAB 许可未确认”属于**打包时的检查快照**；许可状态以本仓库 [license_verification.json](license_verification.json) 和上述补核证据为准。**四个数据 ZIP 均未修改，原 SHA256 继续适用**；03 包 SHA256 仍为 `0e31f03a16dd5e17ebff86ab28f44050332cb2bfc875614e52b62dcdc5caac07`。原版本的公共清单和来源说明也保留，以避免改变已验证交接件。

建议署名：Zhang, Yecheng; Zhao, Huimin; Long, Ying. *CMAB—The World's First National-Scale Multi-Attribute Building Dataset*. Figshare, v7. DOI: 10.6084/m9.figshare.27992417.v7. CC BY 4.0。本交接件从四川发布 ZIP 选择成都 5 个原始 Shapefile 组件并重新打包，成员字节未修改；不暗示原作者认可本项目。

源产品之间的时间差、估计误差和用途边界仍保留；软件交接不会自动解决它们。四包没有 QQ 密钥、机器人配置或对话日志，也没有模型权重、全部研究代码或完整街景照片。

## 本地完成了哪些检查

[verification_report.json](verification_report.json) 是本地打包时的核验记录：118 项源文件/成员已计算 SHA256；CMAB 5 个组件、SGVI 45 个成员的数量与字节数符合预定选择；四 ZIP 的每个成员均完整读回，字节数、SHA256、CRC 通过，四包各自小于 2 GiB。该记录证明本地交接件的字节一致性，不证明 Release 已发布，也不证明研究结论有效。

下载工具的离线测试可在 `datasets/` 执行 `python3 -m unittest -v test_download_data.py`；测试只使用小型内存数据和模拟网络响应，不向外网请求、不下载这些大文件。测试覆盖正常下载、已有文件跳过、拒绝覆盖、错误哈希、超额响应、网络失败和清单路径校验。
