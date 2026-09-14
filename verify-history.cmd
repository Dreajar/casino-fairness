@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or later from https://nodejs.org and open a new terminal.
  pause
  exit /b 1
)
if "%~1"=="" (
  echo Drag your exported JSON history onto this file.
  pause
  exit /b 1
)
node "%~dp0verify-fairness.mjs" "%~1"
set "verify_status=%errorlevel%"
pause
exit /b %verify_status%
