@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "NODE=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE%" set "NODE=node"

echo 正在把「记忆星海」入口重新放回 DeepSeek Harness…
echo.
"%NODE%" tools\install-dsh.mjs
echo.
echo 装完记得关掉 DeepSeek Harness 再打开。
pause
