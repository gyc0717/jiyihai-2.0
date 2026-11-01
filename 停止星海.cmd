@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem 数据（和 pid）在用户目录，不在工程里
set "DATA=%USERPROFILE%\.dsh\memory-starsea"

if not exist "%DATA%\server.pid" (
  echo 记忆星海现在没在跑。
  timeout /t 2 >nul
  exit /b 0
)

set /p PID=<"%DATA%\server.pid"
"%SystemRoot%\System32\taskkill.exe" /PID %PID% /F >nul 2>nul
if errorlevel 1 (
  echo 进程可能已经退出了，顺手清掉记录。
) else (
  echo 已停下。
)
del "%DATA%\server.pid" >nul 2>nul
timeout /t 2 >nul
