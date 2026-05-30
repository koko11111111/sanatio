@echo off
cd /d "%~dp0"
echo Starting Sanatio website at http://localhost:8080
echo.
echo For password reset emails, also run start-email.bat in another window
echo   — or use start-all.bat to run BOTH together.
echo.
python -m http.server 8080
pause
