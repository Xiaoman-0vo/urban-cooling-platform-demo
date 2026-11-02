@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist data\jobs mkdir data\jobs
echo ============================================
echo  街区增绿降温 · 微博民意助手（聊天窗）
echo ============================================
echo.

where docker >nul 2>nul
if errorlevel 1 (
  echo [X] 找不到 docker 命令：请先启动 Docker Desktop 再双击本文件。
  pause
  exit /b 1
)

docker ps --filter "name=n8n" --filter "status=running" --format "{{.Names}}" | findstr /i "n8n" >nul
if errorlevel 1 (
  echo [1/2] n8n 没在跑，正在启动容器...
  docker start n8n >nul
  if errorlevel 1 (
    echo [X] 启动失败：请手动执行 docker start n8n 看报错。
    pause
    exit /b 1
  )
  echo     n8n 已启动，等 8 秒让它把 webhook 挂好...
  timeout /t 8 /nobreak >nul
) else (
  echo [1/2] n8n 已在运行。
)

echo [2/2] 启动聊天页服务（127.0.0.1:4177）...
echo.
echo   浏览器会自动打开；没打开就手动访问 http://127.0.0.1:4177/
echo   用完按 Ctrl+C 或直接关掉本窗口。
echo.
node scripts\serve-chat.mjs
pause
