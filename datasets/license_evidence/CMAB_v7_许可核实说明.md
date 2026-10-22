# CMAB v7 数据许可补核（2026-10-22）

结论：Figshare 的 CMAB **数据集 v7** 明确采用 **CC BY 4.0**，不是从论文版权声明推断。应保留作者、数据 DOI 和许可链接，注明从四川包选择成都组件并重新打包，成员字节未修改，不暗示原作者认可本项目。

## 直接原始证据

- 2026-10-05 保存的官方 GET `https://api.figshare.com/v2/articles/27992417/versions/7` 原始响应，resource id=27992417，version=7，resource_type=dataset，DOI=`10.6084/m9.figshare.27992417.v7`。
- 同一 JSON 的 `license` 对象为 `value: 1`、`name: CC BY 4.0`、`url: https://creativecommons.org/licenses/by/4.0/`。完整原响应与当时 HTTP 200 获取记录均保留，响应 SHA256 与获取日志记录一致。
- 2026-10-02 最初下载审计保存的 `publisher_v7.json` 独立具有相同 DOI、版本和许可对象；本目录保存副本。
- 同一 v7 响应列出的 `sichuan.zip` 为 file id=53804027，529,366,213 字节、MD5=`a91c30dfd1c2f179ebc4e05f84b1a84f`。本次重新读取现有四川原包，大小与 MD5 完全一致，因此许可证据对应本项目实际取得的 v7 数据包。
- CC 官方许可说明 https://creativecommons.org/licenses/by/4.0/ 已于本次打开，允许在遵守署名、许可链接、注明修改等条件下分享和改编。完整法律文本以 https://creativecommons.org/licenses/by/4.0/legalcode 为准。

CMAB 的 `description.txt`、`README.txt`、`metadata.csv` 本身没有独立许可条款，本目录仍原样保留；作者代码仓库 README 讲遥感影像 API 取得，不作为本数据许可依据。论文页面的文章许可与 Figshare 数据集许可分别判断。本次实时 Figshare 请求失败，不改变已保存、哈希闭合、版本固定的直接数据许可证据。

## 建议保留的署名

数据来源：Zhang, Yecheng; Zhao, Huimin; Long, Ying. CMAB—The World's First National-Scale Multi-Attribute Building Dataset. Figshare, v7. https://doi.org/10.6084/m9.figshare.27992417.v7 。许可：CC BY 4.0，https://creativecommons.org/licenses/by/4.0/ 。本交接件从四川发布 ZIP 选择成都 5 个原始 Shapefile 组件并重新打包，成员内容字节未修改。

## 不修改既有校验件

本轮仅新增本目录证据，未改协作版 datasets/ 或任何已生成 ZIP。03_Chengdu_Buildings_Greenness.zip 重新计算的 SHA256 与既有记录一致。包内旧的“许可未确认”是此前检查快照；仓库或 Release 应加本补核说明，不应静默修改 ZIP 而沿用旧 SHA。

## 作者来源交叉核对

作者实验室 DATA049 的正式地址为 https://www.beijingcitylab.org/data/data-049/index.html ，本次已成功打开，页面 Access & Document 链接同一 Figshare 主 DOI；该页面证明数据出处，不替代 v7 API 的数据许可。2026-10-05 原页面和作者影像下载辅助仓库 README 也已按当时获取日志的 SHA256 核对并保存在本目录。
