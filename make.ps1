<#
.SYNOPSIS
  ALIBI PowerShell task runner (Windows equivalent of Makefile)
.DESCRIPTION
  Provides standardized automation targets: doctor, up, down, check, test, openapi, client, migrate, etc.
  Strict D-Drive Storage & Zero C-Drive Data Policy.
#>

param(
    [Parameter(Position=0)]
    [string]$Target = "help",
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Args
)

$ErrorActionPreference = "Stop"

function Invoke-Doctor {
    Write-Host "=== ALIBI Doctor Inspection ===" -ForegroundColor Cyan
    $allGreen = $true

    # 1. OS
    $os = Get-CimInstance Win32_OperatingSystem
    Write-Host "[OK] OS: $($os.Caption) ($($os.Version))" -ForegroundColor Green

    # 2. Python 3.12 & uv
    try {
        $uvVer = & uv --version
        Write-Host "[OK] uv: $uvVer" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] uv not found" -ForegroundColor Red
        $allGreen = $false
    }

    try {
        $pyVer = & uv run --python 3.12 python --version
        Write-Host "[OK] Python 3.12: $pyVer" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] Python 3.12 via uv not found" -ForegroundColor Red
        $allGreen = $false
    }

    # 3. Node & pnpm
    try {
        $nodeVer = & node -v
        if ($nodeVer -like "v22.*") {
            Write-Host "[OK] Node.js: $nodeVer (Node 22 LTS)" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Node.js: $nodeVer (Recommended: Node 22 LTS)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[FAIL] Node.js not found" -ForegroundColor Red
        $allGreen = $false
    }

    try {
        $pnpmVer = & pnpm -v
        Write-Host "[OK] pnpm: v$pnpmVer" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] pnpm not found" -ForegroundColor Red
        $allGreen = $false
    }

    # 4. Java 17
    try {
        $javaOut = & java -version 2>&1 | Out-String
        if ($javaOut -match '17\.') {
            Write-Host "[OK] Java: Java 17 detected ($env:JAVA_HOME)" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Java: $($javaOut.Split("`n")[0]) (Target: Java 17)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[FAIL] Java not found" -ForegroundColor Red
        $allGreen = $false
    }

    # 5. Android SDK
    try {
        $adbVer = & adb --version 2>&1 | Select-Object -First 1
        Write-Host "[OK] Android SDK: $adbVer ($env:ANDROID_HOME)" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] adb / Android SDK not found on PATH" -ForegroundColor Yellow
    }

    # 6. Ollama
    try {
        $ollamaVer = & ollama --version 2>&1 | Out-String
        Write-Host "[OK] Ollama: $($ollamaVer.Trim())" -ForegroundColor Green
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
            Write-Host "[OK] Ollama Service: Running on 127.0.0.1:11434" -ForegroundColor Green
        } catch {
            Write-Host "[WARN] Ollama Service: Stopped (start with 'ollama serve')" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[WARN] Ollama binary not found" -ForegroundColor Yellow
    }

    # 7. Docker
    try {
        $dockerVer = & docker --version
        $composeVer = & docker compose version
        Write-Host "[OK] Docker: $dockerVer | $composeVer" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Docker / Docker Compose not found in PATH" -ForegroundColor Yellow
    }

    # 8. Storage
    $dDrive = Get-PSDrive D -ErrorAction SilentlyContinue
    if ($dDrive) {
        $freeGB = [math]::Round($dDrive.Free / 1GB, 2)
        Write-Host "[OK] Disk D: $freeGB GB free (Strict D-Drive storage policy active)" -ForegroundColor Green
    }

    Write-Host "===============================" -ForegroundColor Cyan
}

switch ($Target.ToLower()) {
    "doctor" {
        Invoke-Doctor
    }
    "up" {
        Write-Host "Starting Docker compose services..." -ForegroundColor Cyan
        docker compose up -d
    }
    "down" {
        Write-Host "Stopping Docker compose services..." -ForegroundColor Cyan
        docker compose down
    }
    "check" {
        Write-Host "Running checks (lint, typecheck, static)..." -ForegroundColor Cyan
        Set-Location "D:\alibi\backend"
        uv run ruff check app tests
        uv run ruff format --check app tests
        uv run mypy app
        Set-Location "D:\alibi"
        pnpm -r run lint
        pnpm -r run typecheck
    }
    "test" {
        Write-Host "Running backend and frontend unit tests..." -ForegroundColor Cyan
        Set-Location "D:\alibi\backend"
        uv run pytest tests/unit
        Set-Location "D:\alibi"
        pnpm -r run test
    }
    "migrate" {
        Write-Host "Applying database migrations..." -ForegroundColor Cyan
        Set-Location "D:\alibi\backend"
        uv run alembic upgrade head
    }
    "openapi" {
        Write-Host "Generating OpenAPI spec..." -ForegroundColor Cyan
        Set-Location "D:\alibi\backend"
        uv run python -m app.main --export-openapi
    }
    "client" {
        Write-Host "Generating TypeScript API client from openapi.json..." -ForegroundColor Cyan
        Set-Location "D:\alibi"
        pnpm --filter @alibi/api-client run build
    }
    default {
        Write-Host "Usage: .\make.ps1 [doctor|up|down|check|test|migrate|openapi|client]" -ForegroundColor Yellow
    }
}
