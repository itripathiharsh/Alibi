<#
.SYNOPSIS
  ALIBI Environment Doctor (PowerShell)
.DESCRIPTION
  Checks tools, versions, hardware, ports, and environment configurations.
  Strict D-Drive Storage & Zero C-Drive Data Policy.
#>

$ErrorActionPreference = "Continue"
$allPassed = $true

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "               ALIBI Environment Doctor                     " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Operating System
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
if ($os) {
    Write-Host "[OK]   OS: $($os.Caption) ($($os.Version), $($os.OSArchitecture))" -ForegroundColor Green
} else {
    Write-Host "[FAIL] OS: Could not query operating system" -ForegroundColor Red
    $allPassed = $false
}

# 2. Hardware (RAM, CPU, GPU)
$ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$ramFree = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
if ($ramTotal -ge 8.0) {
    Write-Host "[OK]   RAM: $ramTotal GB total ($ramFree GB free physical)" -ForegroundColor Green
} else {
    Write-Host "[WARN] RAM: $ramTotal GB total (Minimum recommended: 8 GB, 16 GB for full local stack)" -ForegroundColor Yellow
}

$cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cpu) {
    Write-Host "[OK]   CPU: $($cpu.Name) ($($cpu.NumberOfCores) Cores, $($cpu.NumberOfLogicalProcessors) Threads)" -ForegroundColor Green
}

$gpu = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object -First 1
if ($gpu) {
    $vramMB = [math]::Round($gpu.AdapterRAM / 1MB, 0)
    Write-Host "[INFO] GPU: $($gpu.Name) ($vramMB MB dedicated VRAM)" -ForegroundColor Gray
}

# 3. Disk Space (D: Drive)
$dDrive = Get-PSDrive D -ErrorAction SilentlyContinue
if ($dDrive) {
    $freeGB = [math]::Round($dDrive.Free / 1GB, 2)
    if ($freeGB -ge 10.0) {
        Write-Host "[OK]   Storage: D: drive has $freeGB GB free (Strict D-Drive Policy active)" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Storage: D: drive has only $freeGB GB free (Need >= 10 GB)" -ForegroundColor Red
        $allPassed = $false
    }
} else {
    Write-Host "[FAIL] Storage: D: drive not accessible!" -ForegroundColor Red
    $allPassed = $false
}

# 4. Port Availability (8000, 3000, 5433 for ALIBI compose, 5432 host check, 11434)
Write-Host "`n--- Network Ports ---" -ForegroundColor Cyan
$portsToCheck = @(
    @{ Port = 8000; Service = "FastAPI Backend" },
    @{ Port = 3000; Service = "Web Dashboard" },
    @{ Port = 5433; Service = "ALIBI PostgreSQL (Compose)" },
    @{ Port = 11434; Service = "Ollama (Dev)" }
)

foreach ($p in $portsToCheck) {
    $listener = Get-NetTCPConnection -LocalPort $p.Port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        Write-Host "[INFO] Port $($p.Port) ($($p.Service)): In use by PID $($listener.OwningProcess[0])" -ForegroundColor Gray
    } else {
        Write-Host "[OK]   Port $($p.Port) ($($p.Service)): Available" -ForegroundColor Green
    }
}

# Host port 5432 check
$pg5432 = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
if ($pg5432) {
    $proc = Get-Process -Id $pg5432.OwningProcess[0] -ErrorAction SilentlyContinue
    $procName = if ($proc) { $proc.ProcessName } else { "PID $($pg5432.OwningProcess[0])" }
    Write-Host "[WARN] Port 5432 in use by host service ($procName)." -ForegroundColor Yellow
    Write-Host "       Hint: Compose maps ALIBI PostgreSQL to host port 5433 (POSTGRES_HOST_PORT=5433 in .env)." -ForegroundColor Gray
}

# 5. Core Development Tooling
Write-Host "`n--- Development Tooling ---" -ForegroundColor Cyan

# Python 3.12 via uv
$uvCmd = Get-Command uv -ErrorAction SilentlyContinue
if ($uvCmd) {
    $uvVer = & uv --version 2>&1 | Out-String
    $uvVer = $uvVer.Trim()
    Write-Host "[OK]   uv: $uvVer ($($uvCmd.Source))" -ForegroundColor Green
    if ($uvVer -notmatch "0\.(1[3-9]|[2-9][0-9])") {
        Write-Host "[WARN] uv: Found $uvVer, recommended >= 0.13" -ForegroundColor Yellow
        Write-Host "       Hint: Update or prioritize D:\dev\Tools\CLI\uv.exe" -ForegroundColor Yellow
    }
} else {
    Write-Host "[FAIL] uv: Not found on PATH. Install via https://docs.astral.sh/uv/" -ForegroundColor Red
    $allPassed = $false
}

try {
    $pyVer = & uv run --python 3.12 python --version 2>&1 | Out-String
    if ($pyVer -match "3\.12") {
        Write-Host "[OK]   Python 3.12 (via uv): $($pyVer.Trim())" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Python 3.12 (via uv): Found $($pyVer.Trim()), expected 3.12.x" -ForegroundColor Red
        Write-Host "       Hint: Run 'uv python install 3.12' to download managed Python 3.12" -ForegroundColor Yellow
        $allPassed = $false
    }
} catch {
    Write-Host "[FAIL] Python 3.12: uv could not run python 3.12" -ForegroundColor Red
    Write-Host "       Hint: Run 'uv python install 3.12' on D:" -ForegroundColor Yellow
    $allPassed = $false
}

# Node.js 22 LTS
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeSource = $nodeCmd.Source
    $nodeVer = & node -v 2>&1 | Out-String
    $nodeVer = $nodeVer.Trim()
    if ($nodeVer -match "^v22\." -and $nodeSource -like "*Node22*") {
        Write-Host "[OK]   Node.js: $nodeVer ($nodeSource)" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Node.js: Found $nodeVer from '$nodeSource'" -ForegroundColor Red
        Write-Host "       Expected Node 22 LTS from D:\dev\Node22." -ForegroundColor Yellow
        Write-Host "       Hint: Run via .\make.ps1, which prepends D:\dev\Node22 to PATH." -ForegroundColor Yellow
        $allPassed = $false
    }
} else {
    Write-Host "[FAIL] Node.js: Not found on PATH" -ForegroundColor Red
    Write-Host "       Hint: Install Node 22 LTS in D:\dev\Node22 and prepend to PATH." -ForegroundColor Yellow
    $allPassed = $false
}

# pnpm
$pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
if ($pnpmCmd) {
    $pnpmVer = & pnpm -v 2>&1 | Out-String
    Write-Host "[OK]   pnpm: v$($pnpmVer.Trim()) ($($pnpmCmd.Source))" -ForegroundColor Green
} else {
    Write-Host "[FAIL] pnpm: Not found on PATH" -ForegroundColor Red
    Write-Host "       Hint: Run 'corepack enable pnpm' in Node 22." -ForegroundColor Yellow
    $allPassed = $false
}

# Java 17
$javaCmd = Get-Command java -ErrorAction SilentlyContinue
if ($javaCmd) {
    $javaOut = & java -version 2>&1 | Out-String
    if ($javaOut -match 'version "(17\.[0-9.]+)"') {
        Write-Host "[OK]   Java: OpenJDK $($Matches[1]) ($($javaCmd.Source))" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Java: Expected Java 17, but found $($javaOut.Split("`n")[0].Trim()) from '$($javaCmd.Source)'" -ForegroundColor Red
        Write-Host "       Hint: Run via .\make.ps1, which prepends D:\dev\jdk\bin to PATH." -ForegroundColor Yellow
        $allPassed = $false
    }
} else {
    Write-Host "[FAIL] Java: Not found on PATH" -ForegroundColor Red
    Write-Host "       Hint: Set JAVA_HOME=D:\dev\jdk and add D:\dev\jdk\bin to PATH." -ForegroundColor Yellow
    $allPassed = $false
}

# Android SDK
if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
    $adbCmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($adbCmd) {
        $adbOut = & adb --version 2>&1 | Select-Object -First 1
        Write-Host "[OK]   Android SDK: $adbOut (ANDROID_HOME=$env:ANDROID_HOME)" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Android SDK: ANDROID_HOME set, but 'adb' not on PATH" -ForegroundColor Red
        Write-Host "       Hint: Add $env:ANDROID_HOME\platform-tools to PATH." -ForegroundColor Yellow
        $allPassed = $false
    }
} else {
    Write-Host "[FAIL] Android SDK: ANDROID_HOME environment variable not set or invalid" -ForegroundColor Red
    Write-Host "       Hint: Set ANDROID_HOME=D:\dev\android-sdk and add platform-tools to PATH." -ForegroundColor Yellow
    $allPassed = $false
}

# Ollama (Optional / Dev-only per ADR-020)
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollamaCmd) {
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "[OK]   Ollama (Dev-only): Running on 127.0.0.1:11434 ($($resp.models.Count) models available)" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Ollama (Dev-only): Installed at $($ollamaCmd.Source), but service not running" -ForegroundColor Yellow
        Write-Host "       Hint: Start with 'ollama serve' when using local LLM features." -ForegroundColor Gray
    }
} else {
    Write-Host "[WARN] Ollama (Dev-only): Binary not found on PATH (optional for hosted mode)" -ForegroundColor Yellow
}

# Docker / Compose (Required for local stack & M0 verification: FAIL if missing)
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCmd) {
    $docVer = & docker --version 2>&1 | Out-String
    $composeCmd = & docker compose version 2>&1 | Out-String
    if ($composeCmd -match "Docker Compose version") {
        Write-Host "[OK]   Docker: $($docVer.Trim()) | $($composeCmd.Trim())" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Docker: 'docker' found, but 'docker compose' failed or missing" -ForegroundColor Red
        $allPassed = $false
    }
} else {
    Write-Host "[FAIL] Docker: 'docker' / 'docker compose' not found on PATH" -ForegroundColor Red
    Write-Host "       Hint: Install Docker Desktop to D:\dev\DockerDesktop with --wsl-default-data-root=D:\DockerData." -ForegroundColor Yellow
    Write-Host "             Run installer: & 'D:\dev\downloads\DockerDesktopInstaller.exe' install --installation-dir='D:\dev\DockerDesktop' --wsl-default-data-root='D:\DockerData' --backend=wsl-2 --accept-license --quiet" -ForegroundColor Yellow
    $allPassed = $false
}

Write-Host "============================================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "Doctor Check PASSED: Environment meets all active requirements." -ForegroundColor Green
    exit 0
} else {
    Write-Host "Doctor Check FAILED: Address the issues above." -ForegroundColor Red
    exit 1
}
