---
name: urbancool-huawei-delivery
description: Package, verify and deploy this UrbanCool repository to Huawei Cloud, operate its private OBS release storage through the official SDK, and collect delivery evidence. Use for UrbanCool CodeArts delivery tasks in this repository.
---

# UrbanCool 华为云交付

在当前仓库根目录工作。先读 `AGENTS.md`、`CODEARTS_TASK.md` 和 `documentation/赛题1部署与交付.md`。本技能是本项目自建技能，不能登记成华为官方已有技能。

运行 `npm run topic1 -- plan` 查看空缺。用户目前没有 ECS，主机、区域和 SSH 字段留空；不推测账号、不开通 ECS。配置副本可放在忽略的 `deploy/huawei/target.json`，结构来自 `target.example.json`。凭证只从 `HUAWEICLOUD_SDK_AK`、`HUAWEICLOUD_SDK_SK` 和可选 `HUAWEICLOUD_SDK_SECURITY_TOKEN` 读取，不写入聊天、文件或命令参数。

- 先用 `npm run test:topic1`、`npm run build:accounts` 验证改动。
- 用 `npm run topic1 -- local --port 5312` 新建独立本机容器，实际验证账户隔离、候选采用、报告与重启持久化。可用 `--node-image` 指定已有镜像，并如实记录版本。脚本不删除卷、不停止其他项目。
- 用 `npm run topic1 -- pack` 生成源码 ZIP 和成员哈希；用 `verify --artifact <ZIP>` 复核。打包排除运行库、密钥、Cookie、用户数据库与模型权重。
- 用 `obs --artifact <ZIP> --target deploy/huawei/target.json` 先检查操作计划。仅在已获准操作明确区域和桶时追加 `--execute`；`create_bucket: true` 会通过官方 OBS SDK 创建私有桶，随后上传按 SHA-256 命名的包并核对对象长度。失败后停止，不自动改权限、换区或反复创建资源。
- 已有 ECS、Docker、域名与 HTTPS 反代就绪后，在该主机仓库根目录执行 `sh deploy/huawei/deploy.sh <env文件>`。随后运行 `probe --origin <HTTPS源>` 并复跑实际账户工作流。公网探测通过不自动证明服务属于华为云。

运行记录写入 `.runtime/topic1/`。保存本次实际 CodeArts 任务 ID、修改差异、工具原始输出与技能名称；只有实际操作后才能填写云资源和请求 ID。`planned_not_executed`、本机容器、夹具测试、CLI 已安装均不能升级为已完成云服务或 CodeArts 开发。

赛题要求使用已有智能体与 Skills，后续还需选择并实际运行 CodeArts 中可用的已有技能；本自建技能和 OBS 适配器是可执行雏形，不能独自证明已满足该项。RDS、Redis 尚未接入。部署不得自动运行温度预测、恢复研究队列或启动依赖个人浏览器的采集。
