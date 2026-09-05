@echo off
REM Little Planet - A Pocket Adventure: double-click to build and play.
title Little Planet - A Pocket Adventure
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Little Planet] Node.js was not found on PATH.
  echo Please install Node.js LTS from https://nodejs.org/ and double-click again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [Little Planet] First run: installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [Little Planet] npm install failed.
    pause
    exit /b 1
  )
)

echo [Little Planet] Building the game...
call npm run build
if errorlevel 1 (
  echo [Little Planet] Build failed.
  pause
  exit /b 1
)

echo [Little Planet] Opening the game in your browser...
start "" "%~dp0dist\index.html"
exit /b 0
