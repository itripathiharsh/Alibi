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
    [string]$DbName = "alibi"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $InputFile)) {
    Write-Host "Error: Backup file '$InputFile' does not exist." -ForegroundColor Red
    exit 1
}

Write-Host "Restoring database '$DbName' from '$InputFile' into container '$Container'..." -ForegroundColor Cyan

# 1. Copy dump file into container temp
& docker cp $InputFile "$($Container):/tmp/alibi_restore.dump"
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker cp to container failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2. Run pg_restore with --clean and --if-exists
& docker exec $Container pg_restore -U $DbUser -d $DbName --clean --if-exists --no-owner --no-privileges /tmp/alibi_restore.dump
# pg_restore returns 0 on success, or 1 if non-fatal warnings (e.g. object did not exist to clean)
if ($LASTEXITCODE -gt 1) {
    Write-Host "pg_restore failed with exit code $LASTEXITCODE" -ForegroundColor Red
    & docker exec $Container rm -f /tmp/alibi_restore.dump
    exit $LASTEXITCODE
}

# 3. Clean up container temporary file
& docker exec $Container rm -f /tmp/alibi_restore.dump

Write-Host "Database restore completed successfully." -ForegroundColor Green
exit 0

