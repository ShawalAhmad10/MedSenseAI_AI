$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " MEDSENSEAI RUNTIME VERIFICATION" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

function Test-Service {

    param(
        [string]$Name,
        [int]$Port,
        [string]$Url
    )

    $listener = Get-NetTCPConnection `
        -State Listen `
        -LocalPort $Port `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if (-not $listener) {

        Write-Host (
            "[FAIL] {0,-12} port {1} not listening" -f $Name,$Port
        ) -ForegroundColor Red

        return $false
    }

    try {

        $sw = [System.Diagnostics.Stopwatch]::StartNew()

        $r = Invoke-WebRequest `
            -Uri $Url `
            -UseBasicParsing `
            -TimeoutSec 10 `
            -ErrorAction Stop

        $sw.Stop()

        Write-Host (
            "[PASS] {0,-12} :{1} HTTP {2} {3}ms PID {4}" `
            -f $Name,
               $Port,
               $r.StatusCode,
               $sw.ElapsedMilliseconds,
               $listener.OwningProcess
        ) -ForegroundColor Green

        return $true
    }
    catch {

        Write-Host (
            "[FAIL] {0,-12} :{1} listener exists but HTTP failed" `
            -f $Name,$Port
        ) -ForegroundColor Red

        return $false
    }
}


$backend = Test-Service `
    "Backend" `
    5005 `
    "http://127.0.0.1:5005/health"

$mainAI = Test-Service `
    "Main AI" `
    8000 `
    "http://127.0.0.1:8000/api/v1/health"

# lead service has no proven /health contract;
# FastAPI OpenAPI provides a lightweight readiness check.
$leadAI = Test-Service `
    "Lead AI" `
    8002 `
    "http://127.0.0.1:8002/openapi.json"

$frontend = Test-Service `
    "Frontend" `
    5173 `
    "http://127.0.0.1:5173/"


Write-Host ""

$legacy = Get-NetTCPConnection `
    -State Listen `
    -LocalPort 8001 `
    -ErrorAction SilentlyContinue

if ($legacy) {

    Write-Host "[FAIL] Legacy Sales AI :8001 is running." -ForegroundColor Red
    $legacyOK = $false

}
else {

    Write-Host "[PASS] Legacy Sales AI :8001 OFF" -ForegroundColor Green
    $legacyOK = $true
}


Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan

if ($backend -and $mainAI -and $leadAI -and $frontend -and $legacyOK) {

    Write-Host " MEDSENSEAI STATUS: ALL REQUIRED SERVICES READY" `
        -ForegroundColor Green

    exit 0

}
else {

    Write-Host " MEDSENSEAI STATUS: ATTENTION REQUIRED" `
        -ForegroundColor Red

    exit 1
}
