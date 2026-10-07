$ErrorActionPreference = "SilentlyContinue"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ports = @(5173,5005,8000,8001,8002)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " STOPPING MEDSENSEAI" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$targets = New-Object System.Collections.Generic.HashSet[int]

# ------------------------------------------------------------
# Port owners
# ------------------------------------------------------------

foreach ($port in $ports) {

    Get-NetTCPConnection `
        -State Listen `
        -LocalPort $port `
        -ErrorAction SilentlyContinue |
    ForEach-Object {

        if ($_.OwningProcess -and $_.OwningProcess -ne $PID) {
            [void]$targets.Add([int]$_.OwningProcess)
        }
    }
}


# ------------------------------------------------------------
# Project-owned wrappers / parents
# ------------------------------------------------------------

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
ForEach-Object {

    $cmd = [string]$_.CommandLine

    if ([string]::IsNullOrWhiteSpace($cmd)) {
        return
    }

    $match = (
        $cmd -like "*$root*" -or
        $cmd -match 'medsense_ai\.main:app' -or
        $cmd -match 'medsense_ai\.lead_runtime:app' -or
        $cmd -match 'start-backend\.cjs' -or
        $cmd -match 'vite.*5173'
    )

    if (
        $match -and
        $_.ProcessId -ne $PID -and
        $cmd -notmatch '\\OpenAI\\Codex\\'
    ) {
        [void]$targets.Add([int]$_.ProcessId)
    }
}


if ($targets.Count -eq 0) {

    Write-Host "[OK] No MedSenseAI runtime processes found."

}
else {

    foreach ($id in $targets) {

        $p = Get-Process -Id $id -ErrorAction SilentlyContinue

        if ($p) {

            Write-Host "[STOP] PID $id - $($p.ProcessName)"

            Stop-Process `
                -Id $id `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }
}

Start-Sleep -Seconds 2


Write-Host ""
Write-Host "Port state:" -ForegroundColor Yellow

foreach ($port in $ports) {

    $listener = Get-NetTCPConnection `
        -State Listen `
        -LocalPort $port `
        -ErrorAction SilentlyContinue

    if ($listener) {
        Write-Host "[BUSY] $port" -ForegroundColor Red
    }
    else {
        Write-Host "[FREE] $port" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "MedSenseAI stopped."
