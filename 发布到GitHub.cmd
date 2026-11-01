@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo 没找到 git，先装 Git for Windows：https://git-scm.com/download/win
  pause
  exit /b 1
)

echo.
echo 第一次推送需要先在 GitHub 上建一个空仓库（不要勾选 README / .gitignore）。
echo 仓库名建议：dsh-memory-starsea
echo.

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  set /p REPO=粘贴仓库地址（https://github.com/gyc0717/dsh-memory-starsea.git）：
  if "!REPO!"=="" (
    echo 没填地址，退出。
    pause
    exit /b 1
  )
  git remote add origin "!REPO!"
  echo 已设置 origin
) else (
  echo 已有 origin：
  git remote get-url origin
)

echo.
echo 正在推送…
git push -u origin main
if errorlevel 1 (
  echo.
  echo 推送失败。常见原因：
  echo   1. 仓库还没在 GitHub 上创建
  echo   2. 没有登录凭据 —— 再跑一次，弹出的窗口里登录 GitHub
  echo   3. 仓库地址写错了
) else (
  echo.
  echo 推送完成。去 GitHub 刷新看看。
)
pause
