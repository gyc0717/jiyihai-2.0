@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "NODE=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE%" set "NODE=node"

echo 正在把 memory-starsea 同步到 Gitee 的 ai-agent-project 仓库…
echo.
"%NODE%" tools\sync-gitee.mjs "同步 memory-starsea"
echo.
pause
