$root = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $root 'portable\check-database-settings.cjs')
if ($LASTEXITCODE -ne 0) {
    throw 'Backend and AI must use the same PostgreSQL database. Correct their .env files before starting.'
}
$serviceLogDirectory = Join-Path $root 'portable\runtime-logs'
New-Item -ItemType Directory -Path $serviceLogDirectory -Force | Out-Null

function Test-MedSenseServicePort {
    param([int]$Port)
    $servicePortClient = New-Object System.Net.Sockets.TcpClient
    try {
        $connection = $servicePortClient.ConnectAsync('127.0.0.1', $Port)
        return ($connection.Wait(500) -and $servicePortClient.Connected)
    } catch {
        return $false
    } finally {
        $servicePortClient.Dispose()
    }
}

function Start-MedSenseService {
    param([string]$Name, [int]$Port, [string]$Directory, [string]$Command)
    if (Test-MedSenseServicePort -Port $Port) {
        Write-Host "$Name is already listening on port $Port; skipped." -ForegroundColor Yellow
        return
    }
    Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $Directory -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $Command
    ) -RedirectStandardOutput (Join-Path $serviceLogDirectory "$Name.stdout.log") `
      -RedirectStandardError (Join-Path $serviceLogDirectory "$Name.stderr.log")
    for ($serviceStartupAttempt = 0; $serviceStartupAttempt -lt 60; $serviceStartupAttempt++) {
        if (Test-MedSenseServicePort -Port $Port) {
            Write-Host "$Name is ready on port $Port." -ForegroundColor Green
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$Name did not become ready on port $Port. Check its logs in $serviceLogDirectory."
}

Start-MedSenseService -Name 'backend' -Port 5005 -Directory "$root\backend" -Command 'node ..\portable\start-backend.cjs'
Start-MedSenseService -Name 'ai' -Port 8000 -Directory "$root\ai_service" -Command "`$env:PYTHONPATH='$root\ai_service\src'; & '.\.venv\Scripts\python.exe' -m uvicorn medsense_ai.main:app --host 127.0.0.1 --port 8000"
Start-MedSenseService -Name 'leads' -Port 8002 -Directory "$root\ai_service" -Command "`$env:PYTHONPATH='$root\ai_service\src'; & '.\.venv-lead-3139\Scripts\python.exe' -m uvicorn medsense_ai.lead_runtime:app --host 127.0.0.1 --port 8002"
Start-MedSenseService -Name 'frontend' -Port 5173 -Directory "$root\medsense_ai" -Command 'npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort'

Write-Host 'Open http://127.0.0.1:5173/ after startup completes.' -ForegroundColor Green
Write-Host "Service logs: $serviceLogDirectory"
Write-Host 'Verify with: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\VERIFY_MEDSENSEAI.ps1'
