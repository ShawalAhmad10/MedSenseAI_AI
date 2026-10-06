$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pgBin = "C:\Program Files\PostgreSQL\18\bin"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " MedSenseAI First-Time Setup"
Write-Host "============================================" -ForegroundColor Cyan

foreach ($cmd in @("node","npm","py")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd is required."
    }
}

if (-not (Test-Path "$pgBin\psql.exe")) {
    throw "PostgreSQL 18 is required."
}

Push-Location "$root\backend"

if (Test-Path "package-lock.json") {
    npm ci
}
else {
    npm install
}

if ($LASTEXITCODE -ne 0) {
    throw "Backend dependencies failed."
}

Pop-Location

Push-Location "$root\medsense_ai"

if (Test-Path "package-lock.json") {
    npm ci
}
else {
    npm install
}

if ($LASTEXITCODE -ne 0) {
    throw "Frontend dependencies failed."
}

Pop-Location

Push-Location "$root\ai_service"

py -3.12 -m venv .venv

& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip

& ".\.venv\Scripts\python.exe" `
    -m pip install `
    -r "$root\portable\requirements-main-ai-lock.txt"

if ($LASTEXITCODE -ne 0) {
    throw "Main AI dependencies failed."
}

py -3.13 -m venv .venv-lead-3139

& ".\.venv-lead-3139\Scripts\python.exe" -m pip install --upgrade pip

& ".\.venv-lead-3139\Scripts\python.exe" `
    -m pip install `
    -r "$root\portable\requirements-lead-runtime-lock.txt"

if ($LASTEXITCODE -ne 0) {
    throw "Lead dependencies failed."
}

Pop-Location

$dbUser = Read-Host "PostgreSQL username [postgres]"

if (-not $dbUser) {
    $dbUser = "postgres"
}

$secure = Read-Host "PostgreSQL password" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

try {
    $dbPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$env:PGPASSWORD = $dbPassword

$psql = "$pgBin\psql.exe"
$createdb = "$pgBin\createdb.exe"
$restore = "$pgBin\pg_restore.exe"

$exists = & $psql `
    -h localhost `
    -p 5432 `
    -U $dbUser `
    -d postgres `
    -tAc "SELECT 1 FROM pg_database WHERE datname='medsenseai_pharm';"

if ($exists.Trim() -ne "1") {

    & $createdb `
        -h localhost `
        -p 5432 `
        -U $dbUser `
        medsenseai_pharm

    if ($LASTEXITCODE -ne 0) {
        throw "Could not create medsenseai_pharm."
    }

    & $restore `
        -h localhost `
        -p 5432 `
        -U $dbUser `
        -d medsenseai_pharm `
        --no-owner `
        --no-privileges `
        --exit-on-error `
        "$root\database\medsenseai_pharm_full.backup"

    if ($LASTEXITCODE -ne 0) {
        throw "DB restore failed."
    }

    Write-Host "[PASS] medsenseai_pharm restored" -ForegroundColor Green
}
else {
    Write-Host "[INFO] Existing medsenseai_pharm preserved." -ForegroundColor Yellow
}

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

$lines = Get-Content "$root\portable\backend.env.reference"

function SetEnvValue {
    param(
        [string[]]$Lines,
        [string]$Key,
        [string]$Value
    )

    $found = $false

    $out = foreach ($line in $Lines) {

        if ($line -match "^$([regex]::Escape($Key))=") {
            "$Key=$Value"
            $found = $true
        }
        else {
            $line
        }
    }

    if (-not $found) {
        $out += "$Key=$Value"
    }

    return $out
}

$lines = SetEnvValue $lines "DB_HOST" "localhost"
$lines = SetEnvValue $lines "DB_PORT" "5432"
$lines = SetEnvValue $lines "DB_NAME" "medsenseai_pharm"
$lines = SetEnvValue $lines "DB_SCHEMA" "public"
$lines = SetEnvValue $lines "DB_SSL" "false"
$lines = SetEnvValue $lines "PGSSLMODE" "disable"
$lines = SetEnvValue $lines "DB_USER" $dbUser
$lines = SetEnvValue $lines "DB_PASSWORD" $dbPassword
$lines = SetEnvValue $lines "PORT" "5005"
$lines = SetEnvValue $lines "AI_SERVICE_URL" "http://127.0.0.1:8000"
$lines = SetEnvValue $lines "LEAD_AI_SERVICE_URL" "http://127.0.0.1:8002"
$lines = SetEnvValue $lines "FRONTEND_URL" "http://localhost:5173"

$jwtBytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
$jwt = [Convert]::ToBase64String($jwtBytes)

$lines = SetEnvValue $lines "JWT_SECRET" $jwt

$lines |
Set-Content "$root\backend\.env" -Encoding UTF8

$eu = [uri]::EscapeDataString($dbUser)
$ep = [uri]::EscapeDataString($dbPassword)

$aiEnv = @(
    "MEDSENSE_ENVIRONMENT=development",
    "MEDSENSE_LOG_LEVEL=INFO",
    "MEDSENSE_API_PREFIX=/api/v1",
    "MEDSENSE_DDI_MODEL_DIR=artifacts/ddi/model",
    "MEDSENSE_DDI_KNOWN_INTERACTION_SOURCE=external/db_drug_interactions.csv",
    "MEDSENSE_DATABASE_URL=postgresql+psycopg://${eu}:${ep}@localhost:5432/medsenseai_pharm"
)

$aiEnv |
Set-Content "$root\ai_service\.env" -Encoding UTF8

Write-Host ""
Write-Host "[PASS] MedSenseAI setup complete." -ForegroundColor Green
Write-Host "Now run START_MEDSENSEAI.ps1"
