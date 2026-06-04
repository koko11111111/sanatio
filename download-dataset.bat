@echo off
title SANATIO — Download Training Dataset
echo ================================================
echo   SANATIO — Download CIFAKE Dataset
echo ================================================
echo.
echo This will download real vs AI-generated images
echo from Hugging Face (~2GB). Make sure you have
echo a good internet connection.
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Download from https://python.org
    pause
    exit /b
)

echo Installing required packages...
pip install datasets huggingface_hub pillow --quiet

echo.
echo Downloading dataset (4000 images per class)...
python download_dataset.py --output real_fake_data --per-class 4000

echo.
echo Done! Images saved to real_fake_data folder.
echo Now move the REAL and FAKE folders to your project root
echo and run retrain-model.bat
echo.
pause
