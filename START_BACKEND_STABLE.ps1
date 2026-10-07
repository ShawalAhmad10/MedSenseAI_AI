$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$logs = Join-Path $root "service_logs"

New-Item -ItemType Directory -Path $logs -Force | Out-Null

while ($true) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $log = Join-Path $logs "backend-$stamp.log"

    Write-Host ""
    Write-Host "Starting MedSenseAI Backend directly on :5005" -ForegroundColor Cyan

    Push-Location $backend

    try {
        node .\src\server.js 2>&1 | Tee-Object -FilePath $log
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "[WARNING] Backend stopped." -ForegroundColor Yellow
    Write-Host "Restarting in 3 seconds..." -ForegroundColor Yellow
    Write-Host "Log: $log" -ForegroundColor Yellow

    Start-Sleep -Seconds 3
}
