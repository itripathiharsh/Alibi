# M0 Environment Inspection Report

**Date:** 2026-11-13  
**Target:** ALIBI Milestone M0 — Environment & Architecture  
**Policy:** Strict D-Drive Storage & Zero C-Drive Data Policy  

---

## 1. Executive Summary

| Component | Target Requirement | Detected Status | Version / Path Found | Action Required |
|---|---|---|---|---|
| **OS** | Windows 11 / Linux / macOS | ✅ Present | Windows 11 Home Single Language (10.0.26300, 64-bit) | None |
| **RAM** | ≥ 8 GB (16 GB recommended) | ✅ Present | 16 GB Total (~15.34 GB visible, ~4.81 GB free) | Sufficient for local stack & small quantized LLMs |
| **CPU** | ≥ 4 Cores | ✅ Present | AMD Ryzen 5 5500U (6 Cores, 12 Logical Processors) | Supported |
| **GPU** | Optional dedicated VRAM | ⚠️ Integrated only | AMD Radeon Graphics (512 MB dedicated VRAM) | CPU-based inference for Ollama (1B-3B) & Whisper |
| **Disk Space** | ≥ 10 GB Free on D: | ✅ Present | **D: Drive: 194.16 GB Free** (C: 27.69 GB Free) | Ample room on D:; C: write-guard enforced |
| **Docker + Compose**| Docker Engine 24+ & Compose v2 | ❌ Missing | Not found on Windows PATH or WSL | Install Docker Desktop with WSL2 backend on D: |
| **Python 3.12** | Python 3.12.x | ✅ Present (via uv) | CPython 3.12.16 at `D:\dev\Tools\Python\uv-managed` | None; managed by `uv` |
| **uv** | Fast Python package manager | ✅ Present | `uv 0.12.17` at `D:\dev\Tools\CLI\uv.exe` | None |
| **Node.js** | Node 22 LTS | ⚠️ Wrong Version | Node `v24.20.0` at `D:\dev\Node\node.exe` | Switch to Node 22 LTS for Next.js & Expo stability |
| **pnpm** | pnpm 9+ / 10+ | ⚠️ Missing CLI | Corepack 0.35.0 is present; pnpm not exposed in PATH | Enable via Corepack or install pnpm globally on D: |
| **Java** | Java 17 (Eclipse Temurin/OpenJDK) | ⚠️ Misconfigured | OpenJDK 17.0.21 installed at `D:\dev\jdk`, but `JAVA_HOME` points to non-existent `D:\dev\jdk21` | Fix `JAVA_HOME=D:\dev\jdk` and update PATH |
| **Android SDK** | API 34-36 + Build-tools + Platform-tools | ⚠️ Present, unlinked | Installed at `D:\dev\android-sdk`, but `ANDROID_HOME` unset in session | Set `ANDROID_HOME=D:\dev\android-sdk` and export PATH |
| **Ollama** | Local LLM Runner | ⚠️ Present, stopped | Client `0.34.2` at `D:\JarvisData\tools\ollama`, `llama3.2` model downloaded | Start service (`ollama serve`) |
| **Make** | GNU Make (for Makefile targets) | ❌ Missing | Not recognized in PATH | Install GNU Make on D: via winget or scoop |

---

## 2. Hardware Deep Dive & Feasibility

### 2.1 CPU & RAM
- **Processor**: AMD Ryzen 5 5500U with Radeon Graphics (6 cores, 12 threads @ 2.1 - 4.0 GHz).
- **Physical Memory**: 16 GB DDR4.
- **Feasibility Assessment**:
  - Memory headroom is sufficient to run Docker containers (PostgreSQL + pgvector, FastAPI, Web UI) alongside local development servers.
  - Can comfortably run small quantized LLMs (e.g., Llama 3.2 1B/3B, Qwen 2.5 1.5B/3B) and fastembed embeddings in CPU memory without paging.

### 2.2 GPU & AI Acceleration
- **GPU**: AMD Radeon Graphics integrated (no dedicated NVIDIA CUDA VRAM).
- **Feasibility Assessment**:
  - Model execution will be CPU-based via Ollama (AVX2/FMA instructions).
  - Embeddings: `fastembed` with `bge-small-en-v1.5` runs in CPU mode via ONNX runtime (meets NFR targets < 500 ms).
  - Speech-to-Text: `faster-whisper` (`tiny.en` or `base.en`, int8 quantized) on CPU will achieve RTF ≤ 0.5 for typical voice capture clips.
  - LLM Extraction: Rules parser is primary (< 300 ms); local LLM refine will run asynchronously or under ~4-7 s on CPU with Llama 3.2 3B Q4_K_M.

### 2.3 Storage Allocation
- **D: Drive**: 147.07 GB Used, **194.16 GB Free**.
- **C: Drive**: 92.31 GB Used, 27.69 GB Free.
- **Storage Directives**:
  - All workspace files, virtual environments, node_modules, Docker storage volumes, build artifacts, and package caches strictly reside on **D:**.
  - User environment already specifies:
    - `PIP_CACHE_DIR=D:\dev\Cache\pip`
    - `UV_CACHE_DIR=D:\dev\Cache\uv`
    - `UV_PYTHON_INSTALL_DIR=D:\dev\Tools\Python\uv-managed`
    - `npm_config_cache=D:\dev\Cache\npm`
    - `OLLAMA_MODELS=D:\dev\Models`
    - `TEMP=D:\dev\Cache\temp`
    - `TMP=D:\dev\Cache\temp`

---

## 3. Component Details & Exact Remediation Steps

### 3.1 Docker & Docker Compose
- **Current State**: Neither `docker.exe` nor `docker compose` is available in Windows PATH. WSL2 contains an unconfigured `docker-desktop` distro.
- **Recommended Action**: Install Docker Desktop for Windows and configure it to use WSL2 with image/container storage on D:.
- **Install Command (PowerShell)**:
  ```powershell
  winget install -e --id Docker.DockerDesktop
  ```
- **Configuration on D: (Crucial for D-Drive policy)**:
  1. Open Docker Desktop Settings > Resources > Advanced (or Settings > WSL Integration).
  2. In Docker Desktop Settings > Docker Engine, set `data-root` to `D:\\docker-data` if using Hyper-V, or if using WSL2, move the `docker-desktop-data` distro to D: using:
     ```powershell
     wsl --export docker-desktop-data D:\dev\docker-data.tar
     wsl --unregister docker-desktop-data
     wsl --import docker-desktop-data D:\dev\docker-data D:\dev\docker-data.tar --version 2
     Remove-Item D:\dev\docker-data.tar
     ```

### 3.2 Python 3.12 & uv
- **Current State**: `uv 0.12.17` is active at `D:\dev\Tools\CLI\uv.exe`. CPython 3.12.16 is already installed in `D:\dev\Tools\Python\uv-managed\cpython-3.12.16-windows-x86_64-none\python.exe`.
- **Verification**:
  ```powershell
  uv run --python 3.12 python --version
  # Output: Python 3.12.16
  ```
- **Action**: No installation needed. All backend dependencies will be managed via `uv sync` in `backend/` using Python 3.12 on D:.

### 3.3 Node.js & pnpm
- **Current State**:
  - Node is `v24.20.0` at `D:\dev\Node\node.exe`.
  - Expo and Next.js tooling recommend Node 22 LTS (`v22.x`) for guaranteed lockfile and native build compatibility.
  - `corepack` (v0.35.0) is present at `D:\dev\Node\corepack.cmd`.
- **Recommended Action**:
  - Option A (Direct Switch on D:): Download Node 22.x LTS zip and replace files in `D:\dev\Node` (or maintain side-by-side in `D:\dev\Node22`).
  - Option B (Enable pnpm with existing Node or Node 22):
    ```powershell
    & "D:\dev\Node\corepack.cmd" enable pnpm
    # or install pnpm into D:\dev\Tools\npm:
    npm install -g pnpm --prefix "D:\dev\Tools\npm"
    ```

### 3.4 Java 17
- **Current State**:
  - Eclipse Temurin OpenJDK 17.0.21 is already installed at `D:\dev\jdk`.
  - However, user environment variable `JAVA_HOME` is set to `D:\dev\jdk21` (non-existent folder), causing Windows to fall back to Java 25 (`C:\Program Files\Eclipse Adoptium\jdk-25.0.4.1-hotspot`), which will cause Android Gradle Plugin build failures.
- **Recommended Action**:
  - Update `JAVA_HOME` and PATH to point to `D:\dev\jdk`:
    ```powershell
    [System.Environment]::SetEnvironmentVariable('JAVA_HOME', 'D:\dev\jdk', 'User')
    $env:JAVA_HOME = "D:\dev\jdk"
    $env:Path = "D:\dev\jdk\bin;" + $env:Path
    ```

### 3.5 Android SDK
- **Current State**:
  - Full Android SDK is present at `D:\dev\android-sdk`.
  - Contains platform `android-36`, build-tools `36.0.0`, `cmdline-tools`, `emulator`, and `adb.exe` (v1.0.41 / 37.0.1).
  - Environment variables `ANDROID_HOME` and `ANDROID_SDK_ROOT` are not exported.
- **Recommended Action**:
  - Set environment variables and add platform tools to PATH:
    ```powershell
    [System.Environment]::SetEnvironmentVariable('ANDROID_HOME', 'D:\dev\android-sdk', 'User')
    [System.Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', 'D:\dev\android-sdk', 'User')
    $env:ANDROID_HOME = "D:\dev\android-sdk"
    $env:ANDROID_SDK_ROOT = "D:\dev\android-sdk"
    $env:Path = "D:\dev\android-sdk\platform-tools;D:\dev\android-sdk\cmdline-tools\latest\bin;" + $env:Path
    ```

### 3.6 Ollama
- **Current State**:
  - Binary installed at `D:\JarvisData\tools\ollama\ollama.exe`.
  - Model directory configured to `D:\dev\Models` (`OLLAMA_MODELS=D:\dev\Models`).
  - `llama3.2:latest` model manifest is already downloaded in `D:\dev\Models`.
  - Ollama daemon is currently stopped.
- **Recommended Action**:
  - Start Ollama server whenever local AI features are needed:
    ```powershell
    ollama serve
    ```

### 3.7 GNU Make
- **Current State**: `make` is missing. The repository Makefile expects `make` commands (`make doctor`, `make up`, `make check`, etc.).
- **Recommended Action**:
  - Install `make` on D: via winget or scoop:
    ```powershell
    winget install -e --id GnuWin32.Make
    ```
  - Alternatively, create a PowerShell wrapper or equivalent script `doctor.ps1` as specified in `docs/13` §2 (`infrastructure/scripts/doctor.sh / doctor.ps1`).

---

## 4. Next Step Checklist

1. Confirm review of this environment report.
2. Confirm whether to proceed with:
   - Installing Docker Desktop (or deciding to run DB natively on Windows/WSL).
   - Switching `D:\dev\Node` to Node 22 LTS.
   - Setting `JAVA_HOME=D:\dev\jdk` and `ANDROID_HOME=D:\dev\android-sdk`.
   - Enabling `pnpm`.
   - Installing `make`.
3. Once confirmed, author `docs/milestones/M0_PLAN.md` based on `docs/templates/MILESTONE_PLAN_TEMPLATE.md` for owner approval.

