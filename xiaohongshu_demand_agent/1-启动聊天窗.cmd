@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 小红书民意助手：沿用本机判定配置，启动聊天页。
echo 请保持 Docker Desktop 运行。按 Ctrl+C 停止聊天页。
node scripts\start-chat.mjs
if errorlevel 1 pause