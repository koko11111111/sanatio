@echo off
title SANATIO — Retrain AI Model
echo ================================================
echo   SANATIO — Retrain AI Model
echo ================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Download from https://python.org
    pause
    exit /b
)

echo Installing required packages...
pip install torch torchvision opencv-python pillow tqdm --quiet

echo.
echo Checking folders...
if not exist "real" (
    echo ERROR: 'real' folder not found. Add real photos there first.
    pause
    exit /b
)
if not exist "fake" (
    echo ERROR: 'fake' folder not found. Add AI-generated photos there first.
    pause
    exit /b
)

echo.
echo Starting retraining...
echo This may take a while depending on your dataset size.
echo.
python trian_model.py

echo.
echo Done! ai_detector_model.pth has been updated.
pause
