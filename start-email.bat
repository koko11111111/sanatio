@echo off
cd /d "%~dp0"
echo.
echo SANATIO Email Server
echo ====================
echo.

where python >nul 2>nul
if not errorlevel 1 (
  if not exist ".env" (
    echo Tip: Copy .env.example to .env and add Gmail app password for real emails.
    echo      Without .env, the reset code prints in this window ^(for testing^).
    echo.
  )
  python email_server.py
  pause
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo Install Python from https://www.python.org/ or Node from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing email packages ^(first time only^)...
  call npm install
)

if not exist ".env" (
  echo Tip: Copy .env.example to .env and add your Gmail app password.
  echo.
)

node email-server.js
pause
