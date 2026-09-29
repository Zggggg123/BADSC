@echo off
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo 需要先安装 Node.js 18 或更新版本。
  pause
  exit /b 1
)
node server.cjs
if errorlevel 1 pause
