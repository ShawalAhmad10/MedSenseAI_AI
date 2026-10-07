$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendDir  = Join-Path $root "backend"
$aiDir       = Join-Path $root "ai_service"
$frontendDir = Join-Path $root "medsense_ai"

$mainPython = Join-Path $aiDir ".venv\Scripts\python.exe"
$leadPython = Join-Path $aiDir ".venv-lead-3139\Scripts\python.exe"

$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm  = (Get-Command npm.cmd  -ErrorAction Stop).Source

$logDir = Join-Path $root "portable\runtime-logs"

New-Item `
    -ItemType Directory `
    -Path $logDir `
    -Force |
Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"


Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " MEDSENSEAI FINAL START" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Root: $root"
Write-Host ""


# ============================================================
# 1. VALIDATE REQUIRED FILES
# ============================================================

$required = @(
    $backendDir,
    $aiDir,
    $frontendDir,
    $mainPython,
    $leadPython,
    (Join-Path $root "portable\start-backend.cjs"),
    (Join-Path $root "portable\check-database-settings.cjs")
)

foreach ($item in $required) {

    if (-not (Test-Path $item)) {
        throw "Required runtime component missing: $item"
    }
}

Write-Host "[PASS] Runtime files present." -ForegroundColor Green


# ============================================================
# 2. STOP PREVIOUS MEDSENSEAI RUNTIME
# ============================================================

Write-Host "[STEP] Cleaning previous runtime..." -ForegroundColor Yellow

& "$root\STOP_MEDSENSEAI.ps1"

Start-Sleep -Seconds 1


# ============================================================
# 3. DATABASE CONFIG CONSISTENCY
# ============================================================

Write-Host ""
Write-Host "[STEP] Checking shared database configuration..." `
    -ForegroundColor Yellow

Push-Location $root

try {

    & $node "$root\portable\check-database-settings.cjs"

    if ($LASTEXITCODE -ne 0) {
        throw "Backend and AI database configuration mismatch."
    }
}
finally {
    Pop-Location
}

Write-Host "[PASS] Database configuration consistent." `
    -ForegroundColor Green


# ============================================================
# HELPERS
# ============================================================

function Wait-Http {

    param(
        [string]$Name,
        [int]$Port,
        [string]$Url,
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {

        $listener = Get-NetTCPConnection `
            -State Listen `
            -LocalPort $Port `
            -ErrorAction SilentlyContinue

        if ($listener) {

            try {

                $sw = [System.Diagnostics.Stopwatch]::StartNew()

                $response = Invoke-WebRequest `
                    -Uri $Url `
                    -UseBasicParsing `
                    -TimeoutSec 8 `
                    -ErrorAction Stop

                $sw.Stop()

                if (
                    $response.StatusCode -ge 200 -and
                    $response.StatusCode -lt 400
                ) {

                    Write-Host (
                        "[READY] {0,-12} :{1} HTTP {2} {3}ms" `
                        -f $Name,
                           $Port,
                           $response.StatusCode,
                           $sw.ElapsedMilliseconds
                    ) -ForegroundColor Green

                    return $true
                }
            }
            catch {
                # keep waiting until timeout
            }
        }

        Start-Sleep -Seconds 2
    }

    Write-Host (
        "[FAIL] {0} did not become ready on :{1}" `
        -f $Name,$Port
    ) -ForegroundColor Red

    return $false
}


function Show-FailureLog {

    param(
        [string]$Name,
        [string]$ErrorLog
    )

    Write-Host ""
    Write-Host "----- $Name ERROR LOG -----" -ForegroundColor Red

    if (Test-Path $ErrorLog) {

        Get-Content `
            $ErrorLog `
            -Tail 60 `
            -ErrorAction SilentlyContinue

    }
    else {

        Write-Host "No error log generated."
    }
}


# ============================================================
# 4. BACKEND
# ============================================================

Write-Host ""
Write-Host "[START] Backend :5005" -ForegroundColor Yellow

$backendOut = Join-Path $logDir "backend-$stamp.out.log"
$backendErr = Join-Path $logDir "backend-$stamp.err.log"

Start-Process `
    -FilePath $node `
    -ArgumentList @(
        "..\portable\start-backend.cjs"
    ) `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError $backendErr |
Out-Null


if (-not (
    Wait-Http `
        -Name "Backend" `
        -Port 5005 `
        -Url "http://127.0.0.1:5005/health" `
        -TimeoutSeconds 45
)) {

    Show-FailureLog "BACKEND" $backendErr
    throw "Backend startup failed."
}


# ============================================================
# 5. MAIN AI
# ============================================================

Write-Host ""
Write-Host "[START] Main AI :8000" -ForegroundColor Yellow

$mainOut = Join-Path $logDir "main-ai-$stamp.out.log"
$mainErr = Join-Path $logDir "main-ai-$stamp.err.log"

# CRITICAL:
# Python package is under ai_service\src.
$previousPythonPath = $env:PYTHONPATH
$env:PYTHONPATH = Join-Path $aiDir "src"

Start-Process `
    -FilePath $mainPython `
    -ArgumentList @(
        "-m",
        "uvicorn",
        "medsense_ai.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000"
    ) `
    -WorkingDirectory $aiDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $mainOut `
    -RedirectStandardError $mainErr |
Out-Null


if (-not (
    Wait-Http `
        -Name "Main AI" `
        -Port 8000 `
        -Url "http://127.0.0.1:8000/api/v1/health" `
        -TimeoutSeconds 90
)) {

    Show-FailureLog "MAIN AI" $mainErr
    throw "Main AI startup failed."
}


# ============================================================
# 6. LEAD AI
# ============================================================

Write-Host ""
Write-Host "[START] Lead AI :8002" -ForegroundColor Yellow

$leadOut = Join-Path $logDir "lead-ai-$stamp.out.log"
$leadErr = Join-Path $logDir "lead-ai-$stamp.err.log"

Start-Process `
    -FilePath $leadPython `
    -ArgumentList @(
        "-m",
        "uvicorn",
        "medsense_ai.lead_runtime:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8002"
    ) `
    -WorkingDirectory $aiDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $leadOut `
    -RedirectStandardError $leadErr |
Out-Null


if (-not (
    Wait-Http `
        -Name "Lead AI" `
        -Port 8002 `
        -Url "http://127.0.0.1:8002/openapi.json" `
        -TimeoutSeconds 60
)) {

    Show-FailureLog "LEAD AI" $leadErr
    throw "Lead AI startup failed."
}


# Restore caller PYTHONPATH only AFTER both Python children inherit it.

if ($null -eq $previousPythonPath) {

    Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue

}
else {

    $env:PYTHONPATH = $previousPythonPath
}


# ============================================================
# 7. FRONTEND
# ============================================================

Write-Host ""
Write-Host "[START] Frontend :5173" -ForegroundColor Yellow

$frontOut = Join-Path $logDir "frontend-$stamp.out.log"
$frontErr = Join-Path $logDir "frontend-$stamp.err.log"

Start-Process `
    -FilePath $npm `
    -ArgumentList @(
        "run",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        "5173",
        "--strictPort"
    ) `
    -WorkingDirectory $frontendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $frontOut `
    -RedirectStandardError $frontErr |
Out-Null


if (-not (
    Wait-Http `
        -Name "Frontend" `
        -Port 5173 `
        -Url "http://127.0.0.1:5173/" `
        -TimeoutSeconds 45
)) {

    Show-FailureLog "FRONTEND" $frontErr
    throw "Frontend startup failed."
}


# ============================================================
# 8. LEGACY 8001 MUST BE OFF
# ============================================================

$legacy = Get-NetTCPConnection `
    -State Listen `
    -LocalPort 8001 `
    -ErrorAction SilentlyContinue

if ($legacy) {

    throw "Legacy Sales AI port 8001 unexpectedly started."
}

Write-Host "[PASS] Legacy :8001 remains OFF." `
    -ForegroundColor Green


# ============================================================
# 9. FINAL VERIFICATION
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " FINAL VERIFICATION" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

& "$root\VERIFY_MEDSENSEAI.ps1"

if ($LASTEXITCODE -ne 0) {
    throw "Final runtime verification failed."
}


Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " MEDSENSEAI IS READY" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

Write-Host ""
Write-Host "Frontend : http://127.0.0.1:5173/"
Write-Host "Backend  : http://127.0.0.1:5005/"
Write-Host "Main AI  : http://127.0.0.1:8000/"
Write-Host "Lead AI  : http://127.0.0.1:8002/"
Write-Host ""
Write-Host "Logs     : $logDir"
Write-Host ""
Write-Host "To stop:"
Write-Host ".\STOP_MEDSENSEAI.ps1"
