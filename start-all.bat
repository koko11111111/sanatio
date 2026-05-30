@echo off
cd /d "%~dp0"
echo Starting website AND email server...
echo.
echo  Website:  http://localhost:8080
echo  Email API: http://localhost:3001
echo.
start "SANATIO Email" cmd /k start-email.bat
timeout /t 3 /nobreak >nul
start "SANATIO Website" cmd /k start-server.bat
