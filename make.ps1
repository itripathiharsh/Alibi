<#
.SYNOPSIS
  ALIBI PowerShell task runner (Windows equivalent of Makefile)
.DESCRIPTION
  Standardized automation targets: help, doctor, up, down, check, test, openapi, client, migrate, ci.
  Strict D-Drive Storage & Zero C-Drive Data Policy.
#>

param(
    [Parameter(Position=0)]
    [string]$Target = "help",
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$TargetArguments
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

# Ensure environment overrides for Node 22, Java 17, and Android SDK take precedence
$env:JAVA_HOME = "D:\dev\jdk"
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    $env:ANDROID_HOME = "D:\dev\android-sdk"
}
$node22Dir = "D:\dev\Node22"
$javaBinDir = Join-Path $env:JAVA_HOME "bin"
$androidToolsDir = Join-Path $env:ANDROID_HOME "platform-tools"
$env:PATH = "$node22Dir;$javaBinDir;$androidToolsDir;$env:PATH"

function Show-Help {
    Write-Host "ALIBI Task Runner (PowerShell)" -ForegroundColor Cyan
    Write-Host "Available targets:"
    Write-Host "  .\make.ps1 help       Show this help message"
    Write-Host "  .\make.ps1 doctor     Run environment verification checks"
    Write-Host "  .\make.ps1 up         Start Docker Compose services in background"
    Write-Host "  .\make.ps1 down       Stop Docker Compose services"
    Write-Host "  .\make.ps1 check      Run linters and typecheckers (backend & frontend)"
    Write-Host "  .\make.ps1 test       Run backend and frontend unit test suites"
    Write-Host "  .\make.ps1 migrate    Apply Alembic database migrations"
    Write-Host "  .\make.ps1 openapi    Export OpenAPI schema from FastAPI backend"
    Write-Host "  .\make.ps1 client     Regenerate TypeScript API client from openapi.json"
    Write-Host "  .\make.ps1 ci         Run full CI check and test pipeline"
}

function Invoke-InDir {
    param(
        [string]$Path,
        [scriptblock]$Script
    )
    Push-Location $Path
    try {
        & $Script
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }
}

switch ($Target.ToLower()) {
    "help" {
        Show-Help
    }
    "doctor" {
        & "$PSScriptRoot\infrastructure\scripts\doctor.ps1"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    "up" {
        Write-Host "Starting Docker compose services..." -ForegroundColor Cyan
        & docker compose up -d
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    "down" {
        Write-Host "Stopping Docker compose services..." -ForegroundColor Cyan
        & docker compose down
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    "check" {
        Write-Host "Running checks (lint, typecheck, static)..." -ForegroundColor Cyan
        Invoke-InDir "$PSScriptRoot\backend" {
            & uv run ruff check app tests
            & uv run ruff format --check app tests
            & uv run mypy app
        }
        Invoke-InDir $PSScriptRoot {
            & pnpm -r run lint
            & pnpm -r run typecheck
        }
    }
    "test" {
        Write-Host "Running backend and frontend unit tests..." -ForegroundColor Cyan
        Invoke-InDir "$PSScriptRoot\backend" {
            & uv run pytest tests/unit
        }
        Invoke-InDir $PSScriptRoot {
            & pnpm -r run test
        }
    }
    "migrate" {
        Write-Host "Applying database migrations..." -ForegroundColor Cyan
        Invoke-InDir "$PSScriptRoot\backend" {
            & uv run alembic upgrade head
        }
    }
    "openapi" {
        Write-Host "Exporting OpenAPI spec..." -ForegroundColor Cyan
        Invoke-InDir "$PSScriptRoot\backend" {
            & uv run python -m app.main --export-openapi
        }
    }
    "client" {
        Write-Host "Generating TypeScript API client..." -ForegroundColor Cyan
        Invoke-InDir $PSScriptRoot {
            & pnpm --filter @alibi/api-client run build
        }
    }
    "ci" {
        Write-Host "Running full CI pipeline (check + test)..." -ForegroundColor Cyan
        & "$PSScriptRoot\make.ps1" check
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & "$PSScriptRoot\make.ps1" test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    default {
        Write-Host "Unknown target '$Target'." -ForegroundColor Red
        Show-Help
        exit 1
    }
}
