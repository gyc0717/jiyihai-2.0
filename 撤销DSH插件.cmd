@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "NODE=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE%" set "NODE=node"

echo 正在把「记忆星海」从 DeepSeek Harness 里撤掉…
"%NODE%" tools\uninstall-dsh.mjs
echo.
echo 撤完了。重新打开 DeepSeek Harness 就恢复原样。
pause
