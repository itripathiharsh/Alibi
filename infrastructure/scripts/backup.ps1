<#
.SYNOPSIS
  ALIBI Database Backup Script (PowerShell)
.DESCRIPTION
  Safely extracts a compressed PostgreSQL custom dump from alibi-postgres container.
  Enforces Strict D-Drive Storage policy.
#>

param(
    [string]$OutputFile = "D:\alibi\backups\alibi_backup.dump",
    [string]$Container = "alibi-postgres",
    [string]$DbUser = "alibi",
    [string]$DbName = "alibi"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $OutputFile.StartsWith("D:\")) {
    Write-Host "Error: Output path must reside on D: drive per storage policy." -ForegroundColor Red
    exit 1
}

$outDir = Split-Path -Parent $OutputFile
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

Write-Host "Dumping PostgreSQL database '$DbName' from container '$Container'..." -ForegroundColor Cyan

# 1. Run pg_dump inside container writing to container temp
& docker exec $Container pg_dump -U $DbUser -d $DbName -F c -f /tmp/alibi_backup.dump
if ($LASTEXITCODE -ne 0) {
    Write-Host "pg_dump failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2. Copy binary archive safely out of container to D: drive
& docker cp "$($Container):/tmp/alibi_backup.dump" $OutputFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker cp failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

# 3. Clean up container temporary file
& docker exec $Container rm -f /tmp/alibi_backup.dump

Write-Host "Backup successfully created: $OutputFile" -ForegroundColor Green
exit 0
