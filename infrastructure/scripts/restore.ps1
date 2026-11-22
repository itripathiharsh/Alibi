<#
.SYNOPSIS
  ALIBI Database Restore Script (PowerShell)
.DESCRIPTION
  Restores a PostgreSQL custom dump into alibi-postgres container.
  Enforces Strict D-Drive Storage policy.
#>

param(
    [string]$InputFile = "D:\alibi\backups\alibi_backup.dump",
    [string]$Container = "alibi-postgres",
    [string]$DbUser = "alibi",
    [string]$DbName = "alibi",
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $InputFile)) {
    Write-Host "Error: Backup file '$InputFile' does not exist." -ForegroundColor Red
    exit 1
}

$hasDocker = $false
try {
    $dockerCheck = & docker ps --filter "name=^/${Container}$" --format "{{.Names}}" 2>$null
    if ($dockerCheck -match $Container) {
        $hasDocker = $true
    }
} catch {
    $hasDocker = $false
}

if ($hasDocker) {
    Write-Host "Restoring database '$DbName' from '$InputFile' into container '$Container'..." -ForegroundColor Cyan
    # 1. Copy dump file into container temp
    & docker cp $InputFile "$($Container):/tmp/alibi_restore.dump"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "docker cp to container failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    # 2. Run pg_restore with --clean and --if-exists
    & docker exec $Container pg_restore -U $DbUser -d $DbName --clean --if-exists --no-owner --no-privileges /tmp/alibi_restore.dump
    if ($LASTEXITCODE -gt 1) {
        Write-Host "pg_restore failed with exit code $LASTEXITCODE" -ForegroundColor Red
        & docker exec $Container rm -f /tmp/alibi_restore.dump
        exit $LASTEXITCODE
    }

    # 3. Clean up container temporary file
    & docker exec $Container rm -f /tmp/alibi_restore.dump
} else {
    Write-Host "Restoring database '$DbName' from '$InputFile' at $($DbHost):$($DbPort)..." -ForegroundColor Cyan
    $pgRestorePath = "pg_restore"
    if (-not (Get-Command "pg_restore" -ErrorAction SilentlyContinue)) {
        if (Test-Path "D:\PostgreSQL\bin\pg_restore.exe") {
            $pgRestorePath = "D:\PostgreSQL\bin\pg_restore.exe"
        }
    }
    & $pgRestorePath -h $DbHost -p $DbPort -U $DbUser -d $DbName --clean --if-exists --no-owner --no-privileges $InputFile
    if ($LASTEXITCODE -gt 1) {
        Write-Host "pg_restore failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host "Database restore completed successfully." -ForegroundColor Green
exit 0

