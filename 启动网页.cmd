@echo off
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  pause
  exit /b 1
)
node server.cjs
echo.
echo BADSC server stopped. Check the error above if it did not open.
pause
