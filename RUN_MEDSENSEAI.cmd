@echo off
setlocal

cd /d "%~dp0"

echo.
echo ============================================================
echo  MEDSENSEAI FINAL
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_MEDSENSEAI.ps1"

set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo [FAIL] MedSenseAI startup returned exit code %RC%.
)

endlocal & exit /b %RC%