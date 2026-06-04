@echo off
title SANATIO AI Server
echo ================================================
echo   SANATIO AI Detector Server
echo ================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Download it from https://python.org
    pause
    exit /b
)

:: Install dependencies
echo Installing required packages...
pip install torch torchvision opencv-python pillow --quiet

echo.
echo Starting server...
echo Keep this window open while using the website.
echo.

python server.py
pause
