@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  街区增绿降温 · 小红书民意助手（后台工人）
echo ============================================
echo.
echo 这个窗口负责：采小红书 -> 逐条判定 -> 汇总快照。
echo 聊天窗里说一句「帮我抓成都 遮阴」就会自动开工，进度显示在聊天页顶部。
echo 不要关这个窗口；关掉后任务会一直停在"排队中"。
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] 找不到 node：请先安装 Node.js 20.19+ 或 22.12+。
  pause
  exit /b 1
)

if not exist "data\jobs" mkdir "data\jobs"
if not exist "data\jobs\latest.json" echo {"id":null,"status":"idle","phase":"idle","message":"当前没有任务"}>"data\jobs\latest.json"

echo 请在已连接 OpenCLI 扩展的浏览器中登录小红书。
echo 判定端口和 OpenCLI 入口自动读取本机配置。

node scripts\job-worker.mjs
echo.
echo 工人已退出。按任意键关闭。
pause >nul
