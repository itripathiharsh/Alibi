# M0 Environment Inspection & Verification Report

**Date:** 2026-11-13  
**Target:** ALIBI Milestone M0 — Environment & Architecture  
**Policy:** Strict D-Drive Storage & Zero C-Drive Data Policy  

---

## 1. Verified Component Status

| Component | Target Requirement | Fresh Shell Status | ALIBI Managed Status (`make.ps1`) | Details & Paths |
|---|---|---|---|---|
| **OS** | Windows 11 / Linux / macOS | ✅ Present | ✅ Present | Windows 11 Home Single Language (Build 10.0.26300, 64-bit) |
| **RAM** | ≥ 8 GB (16 GB recommended) | ✅ Present | ✅ Present | 16 GB Physical RAM (15.34 GB visible, ~5.0 GB free) |
| **CPU** | ≥ 4 Cores | ✅ Present | ✅ Present | AMD Ryzen 5 5500U (6 Cores, 12 Threads) |
| **GPU** | Optional dedicated VRAM | ⚠️ Integrated | ⚠️ Integrated | AMD Radeon Graphics (512 MB dedicated VRAM) |
| **Disk Space** | ≥ 10 GB Free on D: | ✅ Present | ✅ Present | **D: Drive: 193.91 GB Free** (C: 27.69 GB Free guarded) |
| **Node.js** | Node 22 LTS | ❌ Node 24 (`v24.20.0`) | ✅ **Node 22 LTS (`v22.23.5`)** | Fresh shell finds `D:\dev\Node\node.exe` via Machine PATH; `make.ps1` prepends `D:\dev\Node22` |
| **pnpm** | pnpm 9+ / 10+ | ⚠️ Not on PATH | ✅ **pnpm v10.34.9** | Corepack-managed at `D:\dev\Node22\pnpm.cmd` |
| **Java** | Java 17 (Temurin/OpenJDK) | ❌ Java 25 (`25.0.4.1`) | ✅ **Java 17 (`17.0.21`)** | Fresh shell finds `D:\Java\bin\java.exe`; `make.ps1` prepends `$env:JAVA_HOME\bin` (`D:\dev\jdk\bin`) |
| **Android SDK**| API 34-36 + Platform-tools | ⚠️ Unlinked in fresh shell | ✅ **adb 1.0.41 (v37.0.1)** | SDK at `D:\dev\android-sdk`, `ANDROID_HOME` configured |
| **Python 3.12**| Python 3.12.x | ✅ Present (via `uv`) | ✅ Present (via `uv`) | CPython 3.12.16 at `D:\dev\Tools\Python\uv-managed` |
| **uv** | Fast package manager | ✅ Present | ✅ Present | `uv 0.13.7` at `D:\dev\Tools\CLI\uv.exe` |
| **Ollama** | Local LLM Runner (Dev-only) | ✅ Running | ✅ Running | Client 0.34.2 at `D:\JarvisData\tools\ollama`, serving `llama3.2:latest` at `127.0.0.1:11434` (ADR-020 optional) |
| **Docker** | Docker 24+ & Compose v2 | ⚠️ Stale / Uninstalled | ⚠️ Pending approval | Broken 4.92 registration; 2.4 GB existing VHDX at `D:\DockerData`; installation strategy below |
| **Task Runner**| make.ps1 / Makefile | ✅ Present | ✅ Present | `make.ps1` (with env prepending & exit codes) + `Makefile` |

---

## 2. Shell Runtimes & Environment Configuration

### 2.1 The Fresh Shell Precedence Issue & Solution
In a standard unconfigured Windows terminal session:
- Machine PATH has `D:\dev\Node\` and `D:\Java\bin`, which causes a fresh shell to execute `Node v24.20.0` and `Java 25.0.4.1`.
- Per owner directive, Machine PATH is **not** modified.
- **ALIBI Solution**:
  1. `make.ps1` explicitly prepends `D:\dev\Node22` and `$env:JAVA_HOME\bin` (`D:\dev\jdk\bin`) to `$env:PATH` for all operations.
  2. Root `package.json` enforces `"engines": { "node": ">=22 <23" }`.
  3. `.npmrc` sets `engine-strict=true`.
  4. `.nvmrc` sets `22`.
  5. `infrastructure/scripts/doctor.ps1` validates that `(Get-Command node).Source` points to `D:\dev\Node22` and FAILS if non-Node 22 is active.

### 2.2 User Environment Variables Configured on D:
- `JAVA_HOME=D:\dev\jdk`
- `ANDROID_HOME=D:\dev\android-sdk`
- `ANDROID_SDK_ROOT=D:\dev\android-sdk`
- `GRADLE_USER_HOME=D:\dev\gradle-home`
- `ANDROID_USER_HOME=D:\dev\android-user`
- `COREPACK_HOME=D:\dev\Cache\corepack`
- `OLLAMA_MODELS=D:\dev\Models`
- `PIP_CACHE_DIR=D:\dev\Cache\pip`
- `UV_CACHE_DIR=D:\dev\Cache\uv`
- `npm_config_cache=D:\dev\Cache\npm`

---

## 3. Docker Subsystem Audit & Pending Decisions

### 3.1 Current System State
1. **Broken Registration**:
   - `HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop` registers `Docker Desktop 4.92.0` with `InstallLocation=C:\Users\imhar\AppData\Local\Programs\DockerDesktop`.
   - The directory `C:\Users\imhar\AppData\Local\Programs\DockerDesktop` does not exist on disk.
2. **Existing WSL Virtual Disks on D:**:
   - `D:\DockerData\DockerDesktopWSL\disk\docker_data.vhdx` (2,534,408,192 bytes / **2.4 GB**, dated 2026-09-25).
   - `D:\DockerData\DockerDesktopWSL\main\ext4.vhdx` (100,663,296 bytes / **100 MB**, dated 2026-09-25).
3. **WSL Status**:
   - `wsl -l -v` reports two distros: `Ubuntu-24.04` (Stopped) and `docker-desktop` (Stopped). There is no `docker-desktop-data` distro (current Docker versions use the unified `docker-desktop` distro).

### 3.2 Cleanup & Installation Proposal (Awaiting Owner OK)
1. **Registry Cleanup**:
   ```powershell
   Remove-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop" -Recurse -Force
   ```
2. **WSL Stale Distro Cleanup**:
   ```powershell
   wsl --unregister docker-desktop
   ```
3. **Existing VHDX Decision**:
   - **Question for Owner**: Do you want to **keep** or **delete** the old 2.4 GB `D:\DockerData\DockerDesktopWSL\disk\docker_data.vhdx`?
4. **Installer Execution with Official Flags**:
   Using official Docker Desktop installer flags:
   ```powershell
   & "D:\dev\downloads\Docker Desktop Installer.exe" install --installation-dir="D:\dev\DockerDesktop" --wsl-default-data-root="D:\DockerData" --backend=wsl-2 --accept-license --quiet
   ```
5. **RAM Cap (.wslconfig)**:
   Place in `C:\Users\imhar\.wslconfig`:
   ```ini
   [wsl2]
   memory=6GB
   processors=6
   swap=2GB
   ```
6. **Exact C-Drive Footprint**:
   - Program binaries: 0 bytes on C: (installed to `D:\dev\DockerDesktop`).
   - WSL images & container data: 0 bytes on C: (stored in `D:\DockerData`).
   - C: drive contents: Only user settings, daemon config, and logging metadata in `%APPDATA%\Docker` (~20–50 MB total).
