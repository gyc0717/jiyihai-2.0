@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem 先用 DSH 自带的 node（这台机器的 PATH 有点乱，直接指路径最稳），没有再找系统的
set "BUNDLED=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
if exist "%BUNDLED%" (
  set "NODE=%BUNDLED%"
) else (
  set "NODE=node"
)

echo 正在起「记忆星海」…
"%NODE%" starsea\server.mjs
echo.
echo 服务已停止。
pause
