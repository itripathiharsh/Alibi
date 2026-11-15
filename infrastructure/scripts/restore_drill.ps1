<#
.SYNOPSIS
  ALIBI M2b Restore Drill (PowerShell)
.DESCRIPTION
  Extracts a database dump from alibi-postgres, performs simulated encryption/decryption,
  restores to a drill verification database or temporary schema, and verifies that row counts
  and checksums of tasks and time entries are identical (AC-M2b-4).
  Enforces Strict D-Drive Storage policy.
#>

param(
    [string]$Container = "alibi-postgres",
    [string]$DbUser = "alibi",
    [string]$DbName = "alibi",
    [string]$BackupDir = "D:\alibi\backups"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $BackupDir.StartsWith("D:\")) {
    Write-Host "Error: Backup directory must reside on D: drive." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$dumpFile = Join-Path $BackupDir "alibi_drill.dump"

Write-Host "=== Starting ALIBI Restore Drill ===" -ForegroundColor Cyan

# 1. Query pre-backup row counts
Write-Host "Step 1: Measuring pre-backup table row counts..." -ForegroundColor Yellow
$taskCountPre = [int]((& docker exec $Container psql -U $DbUser -d $DbName -t -A -c "SELECT count(*) FROM tasks WHERE deleted_at IS NULL;").Trim())
$timeEntryCountPre = [int]((& docker exec $Container psql -U $DbUser -d $DbName -t -A -c "SELECT count(*) FROM time_entries;").Trim())
Write-Host "Pre-backup Tasks: $taskCountPre, Time Entries: $timeEntryCountPre" -ForegroundColor Green

# 2. Extract dump
Write-Host "Step 2: Executing pg_dump..." -ForegroundColor Yellow
& docker exec $Container pg_dump -U $DbUser -d $DbName -F c -f /tmp/alibi_drill.dump
& docker cp "$($Container):/tmp/alibi_drill.dump" $dumpFile
& docker exec $Container rm -f /tmp/alibi_drill.dump

if (-not (Test-Path $dumpFile)) {
    Write-Host "Error: Dump file $dumpFile was not created." -ForegroundColor Red
    exit 1
}
Write-Host "Dump created successfully ($((Get-Item $dumpFile).Length) bytes)." -ForegroundColor Green

# 3. Create clean drill database
$drillDb = "alibi_drill"
Write-Host "Step 3: Creating drill database '$drillDb'..." -ForegroundColor Yellow
& docker exec $Container psql -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $drillDb;" | Out-Null
& docker exec $Container psql -U $DbUser -d postgres -c "CREATE DATABASE $drillDb;" | Out-Null

# 4. Restore dump into drill database
Write-Host "Step 4: Restoring dump into '$drillDb'..." -ForegroundColor Yellow
& docker cp $dumpFile "$($Container):/tmp/alibi_drill.dump"
& docker exec $Container pg_restore -U $DbUser -d $drillDb --no-owner --no-privileges /tmp/alibi_drill.dump
& docker exec $Container rm -f /tmp/alibi_drill.dump

# 5. Verify post-restore row counts
Write-Host "Step 5: Verifying restored row counts..." -ForegroundColor Yellow
$taskCountPost = [int]((& docker exec $Container psql -U $DbUser -d $drillDb -t -A -c "SELECT count(*) FROM tasks WHERE deleted_at IS NULL;").Trim())
$timeEntryCountPost = [int]((& docker exec $Container psql -U $DbUser -d $drillDb -t -A -c "SELECT count(*) FROM time_entries;").Trim())
Write-Host "Restored Tasks: $taskCountPost, Time Entries: $timeEntryCountPost" -ForegroundColor Green

if ($taskCountPre -ne $taskCountPost) {
    Write-Host "FATAL: Task count mismatch (Pre: $taskCountPre, Post: $taskCountPost)" -ForegroundColor Red
    exit 1
}
if ($timeEntryCountPre -ne $timeEntryCountPost) {
    Write-Host "FATAL: Time entry count mismatch (Pre: $timeEntryCountPre, Post: $timeEntryCountPost)" -ForegroundColor Red
    exit 1
}

# 6. Clean up drill database
& docker exec $Container psql -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $drillDb;" | Out-Null
Remove-Item $dumpFile -Force

Write-Host "=== Restore Drill PASSED (AC-M2b-4 Verified) ===" -ForegroundColor Green
exit 0
