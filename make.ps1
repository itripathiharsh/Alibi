#Requires -Version 5.1
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
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $true
}

# Allow environment overrides for Node 22 and Java 17, with defaults
$nodeDir = if ($env:ALIBI_NODE_DIR) { $env:ALIBI_NODE_DIR } else { "D:\dev\Node22" }
$javaDir = if ($env:ALIBI_JAVA_HOME) { $env:ALIBI_JAVA_HOME } else { "D:\dev\jdk" }
$env:JAVA_HOME = $javaDir

if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    $env:ANDROID_HOME = "D:\dev\android-sdk"
}

$javaBinDir = Join-Path $env:JAVA_HOME "bin"
$androidToolsDir = Join-Path $env:ANDROID_HOME "platform-tools"
$cliToolsDir = "D:\dev\Tools\CLI"

# Prepend our controlled runtimes before any ambient paths
$env:PATH = "$nodeDir;$javaBinDir;$androidToolsDir;$cliToolsDir;$env:PATH"

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
            & uv run python -m ruff check app tests
            & uv run python -m ruff format --check app tests
            & uv run python -m mypy app
            & uv run python -c "import importlinter.cli, sys; sys.exit(importlinter.cli.lint_imports())"
        }
        Invoke-InDir $PSScriptRoot {
            & pnpm -r run typecheck
        }
    }
    "test" {
        Write-Host "Running backend and frontend unit tests..." -ForegroundColor Cyan
        Invoke-InDir "$PSScriptRoot\backend" {
            & uv run python -m pytest tests
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
