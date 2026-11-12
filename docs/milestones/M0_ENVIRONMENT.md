# M0 Environment Inspection & Verification Report

**Date:** 2026-11-13  
**Target:** ALIBI Milestone M0 — Environment & Architecture  
**Policy:** Strict D-Drive Storage & Zero C-Drive Data Policy  

---

## 1. Verified Component Status

| Component | Target Requirement | Status | Version / Path Found | Verified With |
|---|---|---|---|---|
| **OS** | Windows 11 / Linux / macOS | ✅ Present | Windows 11 Home Single Language (Build 10.0.26300, 64-bit) | `Get-CimInstance Win32_OperatingSystem` |
| **RAM** | ≥ 8 GB (16 GB recommended) | ✅ Present | 16 GB Physical RAM (15.34 GB visible, ~5.0 GB free) | System CIM inspection |
| **CPU** | ≥ 4 Cores | ✅ Present | AMD Ryzen 5 5500U (6 Cores, 12 Threads) | System CIM inspection |
| **GPU** | Optional dedicated VRAM | ⚠️ Integrated | AMD Radeon Graphics (512 MB dedicated VRAM, shared system RAM) | System CIM inspection |
| **Free Disk** | ≥ 10 GB Free on D: | ✅ Present | **D: Drive: 193.91 GB Free** (C: 27.69 GB Free guarded) | `Get-PSDrive D` |
| **Docker + Compose**| Docker 24+ & Compose v2 | ⚠️ Pending approval | Uninstalled; detailed D-drive isolation strategy presented below | Pre-install breakdown prepared |
| **Python 3.12** | Python 3.12.x | ✅ Verified | CPython 3.12.16 at `D:\dev\Tools\Python\uv-managed` | `uv run --python 3.12 python --version` |
| **uv** | Fast Python package manager | ✅ Verified | `uv 0.13.7` at `D:\dev\Tools\CLI\uv.exe` | `uv --version` |
| **Node.js** | Node 22 LTS | ✅ Verified | `v22.23.5` (Jod LTS) at `D:\dev\Node22\node.exe` | `node -v` |
| **pnpm** | pnpm 9+ / 10+ | ✅ Verified | `v10.34.9` via Corepack at `D:\dev\Node22\pnpm.cmd` | `pnpm -v` |
| **Java 17** | Eclipse Temurin 17 | ✅ Verified | OpenJDK 17.0.21 at `D:\dev\jdk\bin` | `java -version`, `javac -version` |
| **Android SDK** | API 34-36 + Build-tools + Platform-tools | ✅ Verified | Installed at `D:\dev\android-sdk`, `adb` 1.0.41 (v37.0.1) | `adb --version` |
| **Ollama** | Local LLM Runner | ✅ Verified (Running)| Client 0.34.2 running at `127.0.0.1:11434`, `llama3.2:latest` model ready | `Invoke-RestMethod http://127.0.0.1:11434/api/tags` |
| **Task Runner** | Makefile / PowerShell equivalent | ✅ Verified | `make.ps1` and `Makefile` created with matching targets | `.\make.ps1 doctor` |

---

## 2. Changes Executed & Verified

1. **Repository Layout**:
   - Flattened from `D:\alibi\files\ALIBI_planning_pack\ALIBI` to `D:\alibi`.
   - Initialized Git repository on `main` branch.
   - Initial commit created: `chore: initial planning pack and repository structure` (`1f3fe59`).

2. **Java 17**:
   - `JAVA_HOME` set to `D:\dev\jdk`.
   - `D:\dev\jdk\bin` added to User PATH.
   - Verified: `openjdk version "17.0.21" 2026-10-20`.

3. **Android SDK**:
   - `ANDROID_HOME` and `ANDROID_SDK_ROOT` set to `D:\dev\android-sdk`.
   - `D:\dev\android-sdk\platform-tools` and `D:\dev\android-sdk\cmdline-tools\latest\bin` added to User PATH.
   - Verified: `Android Debug Bridge version 1.0.41`.

4. **Node 22 LTS & pnpm**:
   - Official Node 22.23.5 LTS Windows x64 binary archive downloaded to `D:\dev\downloads` and extracted to `D:\dev\Node22`.
   - User PATH updated with `D:\dev\Node22`.
   - Corepack enabled and configured with `pnpm@10.34.9`.
   - Verified: `node -v` -> `v22.23.5`, `pnpm -v` -> `10.34.9`.

5. **Ollama**:
   - Service started with models configured on `D:\dev\Models`.
   - Verified: Listening on `127.0.0.1:11434`, serving `llama3.2:latest`.

6. **Task Automation**:
   - Created `make.ps1` supporting `doctor`, `up`, `down`, `check`, `test`, `migrate`, `openapi`, `client`.
   - Created `Makefile` for Linux and CI consistency.
   - Verified: `.\make.ps1 doctor` passes all runtime checks.

---

## 3. Docker Installation: Strict D-Drive Storage Strategy (Awaiting Confirmation)

Per requirement 5, before running the installer, here is the exact breakdown of what touches the system and how all heavy assets, container images, volumes, and runtime data are strictly pinned to the **D: drive**:

### What Docker Desktop touches by default on Windows:
1. **Application binary / Program Files**: Docker Desktop installer places the core GUI application in `C:\Program Files\Docker\Docker` (~1.5 GB).
2. **WSL2 Virtual Disks**: By default, Docker Desktop creates two WSL2 distributions whose `.vhdx` files reside in `%LOCALAPPDATA%\Docker\wsl`:
   - `docker-desktop` (WSL engine utility layer, ~500 MB)
   - `docker-desktop-data` (holds **ALL** pulled Docker images, container root filesystems, and named Docker volumes; grows to **10 GB – 50+ GB**).

### How we ensure Zero Heavy Data on C: and pin everything to D::

1. **Option A — WSL2 VHDX Relocation to D: (Standard & Recommended)**:
   - Run installer: `winget install -e --id Docker.DockerDesktop`
   - Immediately before or right after launch, relocate the `docker-desktop-data` and `docker-desktop` distributions to `D:\dev\docker-data`:
     ```powershell
     wsl --shutdown
     wsl --export docker-desktop-data D:\dev\docker-data-export.tar
     wsl --unregister docker-desktop-data
     wsl --import docker-desktop-data D:\dev\docker-data D:\dev\docker-data-export.tar --version 2
     Remove-Item D:\dev\docker-data-export.tar
     ```
   - From then on, every `docker pull` (Postgres, pgvector, Node, Python) and all persistent volumes reside inside `D:\dev\docker-data\ext4.vhdx`.

2. **Option B — Docker Engine CLI inside Native Ubuntu-24.04 WSL Distro on D:**:
   - If you prefer zero Docker Desktop GUI on C: altogether:
   - We already have `Ubuntu-24.04` in WSL. We can move its virtual hard disk to `D:\dev\wsl\Ubuntu-24.04.vhdx`, configure `/etc/docker/daemon.json` with `"data-root": "/mnt/d/docker-data"`, and run Docker CLI natively without the Docker Desktop installer.

3. **Option C — Pure Local Dev Mode (No Docker Required for M0)**:
   - Run PostgreSQL 16 + pgvector natively on Windows or WSL on D:, running FastAPI (`uvicorn`) and Next.js (`pnpm dev`) directly on the host. Docker is only required for containerized packaging in `docker compose`.

*Awaiting your explicit OK on Option A, B, or C before executing.*
