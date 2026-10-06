$ok = $true

$checks = @(
    @{N="Frontend"; U="http://127.0.0.1:5173/"},
    @{N="Backend"; U="http://127.0.0.1:5005/health"},
    @{N="Products"; U="http://127.0.0.1:5005/api/products"},
    @{N="Main AI"; U="http://127.0.0.1:8000/api/v1/health"},
    @{N="Lead AI"; U="http://127.0.0.1:8002/api/v1/lead-runtime/health"}
)

foreach ($c in $checks) {

    try {

        $r = Invoke-WebRequest `
            $c.U `
            -UseBasicParsing `
            -TimeoutSec 10

        if ($r.StatusCode -eq 200) {
            Write-Host "[PASS] $($c.N)" -ForegroundColor Green
        }
        else {
            $ok = $false
        }
    }
    catch {
        Write-Host "[FAIL] $($c.N)" -ForegroundColor Red
        $ok = $false
    }
}

try {

    $lead = Invoke-RestMethod `
        "http://127.0.0.1:8002/api/v1/lead-runtime/health" `
        -TimeoutSec 10

    if ($lead.model_ready -eq $true) {
        Write-Host "[PASS] Lead model ready" -ForegroundColor Green
    }
    else {
        Write-Host "[FAIL] Lead model not ready" -ForegroundColor Red
        $ok = $false
    }
}
catch {
    $ok = $false
}

if (
    Get-NetTCPConnection `
        -State Listen `
        -LocalPort 8001 `
        -ErrorAction SilentlyContinue
) {
    Write-Host "[FAIL] 8001 must remain OFF" -ForegroundColor Red
    $ok = $false
}
else {
    Write-Host "[PASS] 8001 OFF" -ForegroundColor Green
}

if ($ok) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " MEDSENSEAI FULL SYSTEM READY"
    $configuredDatabase = Get-Content (Join-Path $PSScriptRoot 'backend\.env') | Where-Object { $_ -match '^DB_NAME=' } | ForEach-Object { $_.Substring(8).Trim() }
    $configuredSchema = Get-Content (Join-Path $PSScriptRoot 'backend\.env') | Where-Object { $_ -match '^DB_SCHEMA=' } | ForEach-Object { $_.Substring(10).Trim() }
    if (-not $configuredSchema) { $configuredSchema = 'public' }
    Write-Host " DATABASE: $configuredDatabase / $configuredSchema"
    Write-Host "============================================" -ForegroundColor Green
}
else {
    exit 1
}
