@echo off
setlocal
title MedSenseAI First Run

cd /d "%~dp0"

echo.
echo ============================================
echo  MedSenseAI - First Time Setup
echo  Shared Neon Database
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm is not installed.
    pause
    exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python Launcher is not installed.
    pause
    exit /b 1
)

echo.
echo [1/5] Installing backend dependencies...
cd /d "%~dp0backend"
call npm ci
if errorlevel 1 goto FAIL

echo.
echo [2/5] Installing frontend dependencies...
cd /d "%~dp0medsense_ai"
call npm ci
if errorlevel 1 goto FAIL

echo.
echo [3/5] Preparing Main AI Python 3.12...
cd /d "%~dp0ai_service"

py -3.12 -m venv .venv
if errorlevel 1 goto FAIL

call .venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 goto FAIL

call .venv\Scripts\python.exe -m pip install -e .
if errorlevel 1 goto FAIL


echo.
echo [4/5] Preparing Lead AI Python 3.13...

py -3.13 -m venv .venv-lead-3139
if errorlevel 1 goto FAIL

call .venv-lead-3139\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 goto FAIL

call .venv-lead-3139\Scripts\python.exe -m pip install -e .
if errorlevel 1 goto FAIL


echo.
echo [5/5] Starting MedSenseAI...

cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_MEDSENSEAI.ps1"

timeout /t 15 /nobreak >nul

start http://127.0.0.1:5173/

echo.
echo ============================================
echo  MedSenseAI launched
echo ============================================
echo.
echo Same shared Neon DB configuration is used.
echo No local database was created or restored.
echo.

pause
exit /b 0


:FAIL
echo.
echo ============================================
echo  SETUP FAILED
echo ============================================
echo Check the error shown above.
pause
exit /b 1