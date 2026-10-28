# 部署到另一台电脑（含"人人都能聊"）

这个助手由四个进程组成，换电脑要装的东西不多。下面是从零开始的顺序，照着做即可。

```
浏览器（任何人）
   │  http://<这台电脑的IP>:4177/
   ▼
聊天页服务  scripts/serve-chat.mjs   ← 静态页 + 把 /webhook/* 转发给 n8n
   │
   ▼
n8n（Docker 容器）  http://127.0.0.1:5678
   │  聊天窗/进度接口在这里；它只"下单"，不干重活
   ▼
data/jobs/*.json  ←（同一个文件夹，容器里叫 /data/jobs）
   ▲
   │
后台工人  scripts/job-worker.mjs   ← 在宿主机上干重活：采集 → 判定 → 汇总
```

为什么工人不放进容器：采集要读本机的微博 Cookie，判定要访问模型网络；放宿主机最省事，
容器只负责"接单 + 界面"。两边通过 `data/jobs` 这一个文件夹交换任务与进度。

## 一、新电脑要装什么

| 软件 | 版本 | 检查命令 |
|---|---|---|
| Docker Desktop | 任意近期版 | `docker --version` |
| Node.js | 20.19+ 或 22.12+ | `node -v` |
| PowerShell | Windows 自带 5.1 即可 | `$PSVersionTable.PSVersion` |

Python 不是必需的（只有改词表/契约校验时才用）。

## 二、搬文件

把整个 `weibo-demand-agent` 文件夹拷过去。**必须带的**：

- `chat/`（聊天页前端，含 `vendor/` 约 2.4 MB 的离线脚本）
- `workflows/`、`workflows/src/`、`contract/`、`config/`
- `scripts/`（采集、判定、汇总、工人、聊天服务）
- `data/`（可以只带 `heat_perception*.json` 这几份快照，`jobs/` 留空）

**不要带的**：`.weibo-cookie`、`.weibo-cookie-web`、`data/raw_*.json`、`data/items_*.json`。
Cookie 是本机账号的登录态，换机器必须重新登一次（见第四节）。

## 三、起 n8n

```powershell
cd "路径\weibo-demand-agent"
docker compose -f deploy/docker-compose.yml up -d
docker ps --filter name=n8n
```

等十几秒，浏览器打开 `http://127.0.0.1:5678` 建一个本机账号（第一次会要你设邮箱密码，随便设，别忘了）。

然后导入三个工作流（顺序无关）：

```powershell
# 03 判定契约（被聊天窗调用）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-workflow.ps1 -WorkflowFile workflows\03-demand-agent-api.json -BaseName 03-demand-agent-api
# 04 聊天窗
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-workflow.ps1 -WorkflowFile workflows\04-demand-chat.json -BaseName 04-demand-chat
# 05 进度查询（给进度条用）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-workflow.ps1 -WorkflowFile workflows\05-job-status.json -BaseName 05-job-status
```

脚本会自动导入 → 发布 → 重启容器 → 健康检查，最后打印"webhook 已注册"。

## 四、补齐这台电脑的"环境"

### 1) 模型 Key（判定要用）

n8n 界面 → 左下 Credentials → 新建 **Header Auth**：

- Name：`DeepSeek API`
- Header Name：`Authorization`
- Header Value：`Bearer sk-你的key`

工作流 `03-demand-agent-api` 里的 `4-调用模型` 节点已经指向这个凭据名，建好就能用。

### 2) 微博 Cookie（采集要用）

这台电脑的 Edge 上登录一次微博（`weibo.com` 或 `m.weibo.cn` 都行），然后：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\refresh-cookie.ps1
```

它会：关掉 Edge → 用调试端口重开 → 通过 CDP 从浏览器里读出 `SUB` 等 Cookie → 写成 `.weibo-cookie` / `.weibo-cookie-web`。
看到 `已写入 .weibo-cookie（14 项）` 就成了。

> Cookie 有效期通常几周到几个月。采集报 418/403 或"未登录"时，重跑一次这个脚本即可。

## 五、起聊天页（两种用法）

### 只给自己看

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "1-启动聊天窗.cmd"   # 或者下面这条
node scripts\serve-chat.mjs
```

打开 `http://127.0.0.1:4177/`。

### 给同一局域网的人看（"人人都能聊"）

```powershell
node scripts\serve-chat.mjs --host 0.0.0.0
```

启动后会打印类似 `同一局域网内可用：http://192.168.1.7:4177/`。把这个地址发给别人，
同一 Wi-Fi/网段下就能直接打开聊天窗，**不需要装任何东西、也不用登录 n8n**。

要点：

- 第一次会被 Windows 防火墙拦一下，选"允许访问"（专用网络即可）；
- 端口 4177 被占用就加 `--port 4178`；
- 别人只能聊天、看进度；采集任务仍然跑在**你这台机器**上（用你的 Cookie），所以别把地址发到公网。

## 六、起后台工人（采集与判定真正干活的一方）

```powershell
node scripts\job-worker.mjs
```

看到 `后台任务工人已启动 … 等待任务…` 就对了，这个窗口**保持开着**。
聊天窗里说一句「帮我抓成都 遮阴」，它就会依次做：采微博 → 逐条判定 → 汇总快照。

想让它开机自启，可以把这行加到任务计划程序（触发器：登录时）。

## 七、验收清单

1. `http://127.0.0.1:5678/webhook/weibo-job-status` 返回 `{"ok":true,...}`；
2. 聊天窗发「帮我抓成都 遮阴」→ 顶部出现进度条，百分比会动；
3. 发「进度」→ 回复当前阶段与条数；
4. 跑完后发「成都现在有多少线索」→ 报快照里的计数；
5. 贴一条微博正文 → 3–8 秒返回判定与证据片段。

## 八、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 聊天窗一片空白 | 用了 n8n 自带托管页（样式在 CDN 上） | 用 `scripts/serve-chat.mjs` 这个本地页 |
| 进度条一直 0% | 工人没起 | 另开窗口跑 `node scripts/job-worker.mjs` |
| 采集报"未登录" | Cookie 过期 | 重跑 `scripts/refresh-cookie.ps1` |
| 判定全失败 | 模型 Key 没配或额度用完 | 检查 n8n 凭据 `DeepSeek API` |
| 别人打不开 | 防火墙 / 不在同一网段 | 允许 4177 入站；用打印出来的局域网地址 |
