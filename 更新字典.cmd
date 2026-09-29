@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  echo 把 BA-Units 的 output 文件夹或 Options.json 拖到此文件上。
  pause
  exit /b 1
)
set /p dbversion=请输入来源数据库版本（例如 1.1.1.1）：
if "%dbversion%"=="" (
  echo 版本不能为空。
  pause
  exit /b 1
)
node tools\build-dictionary.cjs "%~1" --version "%dbversion%"
pause
