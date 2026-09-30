@echo off
chcp 65001 >nul
pushd "%~dp0"
node tools\publish-site.mjs
set "publish_exit=%ERRORLEVEL%"
popd
pause
exit /b %publish_exit%
