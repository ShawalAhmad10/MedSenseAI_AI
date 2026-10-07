@echo off
cd /d "%~dp0"

echo.
echo ============================================================
echo  STOP MEDSENSEAI
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0STOP_MEDSENSEAI.ps1"

echo.
pause
