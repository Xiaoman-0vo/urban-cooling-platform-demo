# Qwen 主 Agent 接入

新增独立入口`server/qwen-agent-server.mjs`，通过兼容Chat Completions的接口调用Qwen。主协调和专业角色可以指定不同模型；本次本地推理脚本支持`active`（验证集所选主模型）和`base`（未加适配器的量化基座）。

此入口沿用现有工具权限、目标版本、原始用户约束和调用上限。温度科研模型仍未接通，语言模型名称不能作为温度科研模型版本或执行证明。

先启动服务器上的Qwen语言推理进程，并按实际SSH地址建立本机转发：

```bash
cd /path/to/qwen-runtime
venv/bin/python -u qwen_runtime.py serve
```

该脚本读取服务器selection.json，本轮选中epoch_1。基座保存在qwen3-8b-nf4，适配器在results/adapter_epoch_1。无需重新训练。

```powershell
ssh -p SSH_PORT -N -L 127.0.0.1:18083:127.0.0.1:18083 SSH_USER@SSH_HOST
```

在项目目录启动Qwen后端：

```powershell
$env:QWEN_BASE_URL='http://127.0.0.1:18083/v1'
$env:QWEN_MODEL='active'
$env:QWEN_SPECIALIST_MODEL='base'
node server/qwen-agent-server.mjs
```

另一个终端执行`npm run dev`后，网页继续通过5181访问本地Agent后端。该端口应由本次选择的后端占用；已有服务占用时，不直接覆盖进程。Qwen入口将会话保存在`.runtime/agent-qwen/sessions/`，试用时从页面开始新会话。

其他Qwen兼容服务应按实际配置`QWEN_BASE_URL`、`QWEN_MODEL`和`QWEN_SPECIALIST_MODEL`；需要认证时使用环境变量`QWEN_API_KEY`。凭证不写入源码或前端。`active`和`base`是本次试验入口的别名，其他服务应使用实际注册的模型名。

本文件提供接入方法，不表示候选模型已经通过主Agent质量验收。训练和闭环评估在项目父目录`finetune-main-qwen-20261101/`。默认原DeepSeek入口仍保留。

本轮限定工作流新测试从16/30提高到22/30，但真实专业模型三轮接入探针未通过，存在可选字段填null/0、预算更新证据引用和失败恢复问题。当前只作为实验主Agent候选。详细结果见该目录的评估报告.md及失败复核.md。
