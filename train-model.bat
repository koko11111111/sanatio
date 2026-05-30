@echo off
cd /d "%~dp0"
echo.
echo SANATIO AI Model Training
echo =========================
echo Uses CIFAKE dataset (real vs AI-generated images) from Hugging Face.
echo This may take 10-30 minutes depending on your internet and PC.
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed. Get it from https://www.python.org/
  pause
  exit /b 1
)

echo [1/3] Installing Python packages...
python -m pip install -r ml\requirements.txt
if errorlevel 1 (
  echo pip install failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Downloading CIFAKE sample from Hugging Face...
echo       (If this is slow, bootstrap CIFAR-10 data will be used instead.)
python ml\download_dataset.py --per-class 4000
if errorlevel 1 (
  echo CIFAKE download failed or timed out — using bootstrap dataset...
  python ml\bootstrap_dataset.py --per-class 2500
)

echo.
echo [3/3] Training model and exporting to assets\model\ai-detector.json ...
python ml\train_model.py
if errorlevel 1 (
  echo Training failed.
  pause
  exit /b 1
)

echo.
echo Done! Refresh the dashboard and analyze a photo to use the trained model.
pause
