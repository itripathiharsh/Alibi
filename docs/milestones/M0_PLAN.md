# M0 Plan — Environment & Architecture (Revised)

**Milestone:** M0  
**Target Duration:** Milestone M0 implementation  
**Governing Documents:** AGENTS.md, docs/02_SYSTEM_ARCHITECTURE.md, docs/05_UI_UX_GUIDELINES.md, docs/13_DEPLOYMENT_AND_INFRASTRUCTURE.md, docs/14_TESTING_AND_ACCEPTANCE.md, DECISIONS.md (ADR-001..005, ADR-018, ADR-020, ADR-021)  
**Strict Policy:** Strict D-Drive Storage & Zero C-Drive Data Policy  

---

### 1. Requirement IDs in Scope
Foundational infrastructure for the full product lifecycle:
- `NFR-PORT-001` (Runs on Windows/Linux via Docker and without Docker; supports `ALIBI_MODE=local|hosted`)
- `NFR-MAINT-001` (Test coverage infrastructure, linters, strict typing)
- `NFR-SEC-001` (Security static analysis: gitleaks, ruff, bandit, audit)
- Architectural Gates:
  - `AC-ARCH-1` (`import-linter` contract: domain modules import each other only via `service.py`)
  - `AC-ARCH-4` (OpenAPI schema sync & TS client generation)
  - `AC-ARCH-5` (No business logic in UI)
  - `AC-UI-6` (Settings housed in avatar menu, never as a bottom tab)
- Acceptance Criteria: `AC-M0-1` through `AC-M0-6`
- Memory Gate: Idle RSS of backend container measured and recorded in `docs/milestones/M0_REPORT.md` (goal < 150 MB baseline)

---

### 2. Approach & Key Design Choices
- **Navigation & Screens (doc 05 §1 & §1a):**
  - **4-Tab Navigation (Web & Mobile):** `Dashboard`, `Tasks`, `AI Intelligence`, `Reports`.
  - **Settings:** Housed strictly in the avatar menu / header modal, **never** as a tab (`AC-UI-6`).
  - **Web Scope (doc 05 §1a):** Dashboard/analytics, reports & sharing, task lists with simple edits (status, reschedule, title, notes), vault search (read-only), settings. No voice capture, timers, full calendar editing, or document uploads. Online-only (Dexie deferred per ADR-020).
- **Dual Runtime Modes (`ALIBI_MODE`):**
  - `ALIBI_MODE=local|hosted` (default `local`).
  - `hosted` mode: Single container for Render free tier (512 MB ceiling). Lifespan launches worker loop and APScheduler in-process.
  - `local` mode: Separate `api` and `worker` entrypoints for local development.
- **Memory & Lazy Imports:**
  - Base application startup imports are ultra-lean. Heavy analytical/ML libraries (`ortools`, `sklearn`, `reportlab`, `fastembed`) are lazy-imported inside services/jobs.
  - Container idle RSS is measured and recorded in `docs/milestones/M0_REPORT.md`.
- **Monorepo & Shared Tooling:**
  - `pnpm-workspace.yaml` defining `apps/*` and `packages/*`.
  - Packages: `@alibi/design-tokens` (colors, spacing tokens), `packages/domain-types`, `@alibi/api-client` (generated via `openapi-typescript` + `openapi-fetch`).
  - Backend: Python 3.12 managed via `uv` in `backend/` on D:.
  - Mobile: React Native + Expo SDK 58 pinned (ADR-021) in `apps/mobile`. Configurable server URL in settings/first-run.
  - Task Automation: `make.ps1` (with `$PSNativeCommandUseErrorActionPreference`, PATH overrides for Node 22 and Java 17, and exit codes) + `Makefile` for Linux/CI.
- **Minute-Efficient CI Workflows:**
  - GitHub Actions with native `paths:` filters (`backend/**`, `apps/web/**`, `apps/mobile/**`).
  - Caching for `pnpm` and `uv`.
  - `mobile.yml`: typecheck and lint on PRs; APK compilation (`expo prebuild` + `./gradlew assembleRelease`) runs **only on release tags (`v*`)**.
  - GitHub repository is private (owner-managed).
- **Credentials & Custody:**
  - Coding agents never create accounts or handle production credentials. The owner provisions GitHub, Render, Neon, Vercel, API keys, and offline `age` keypairs.

---

### 3. Order of Work (Vertical Slices)
1. **Task 1 — Environment Verification:**
   - Completed & documented in `docs/milestones/M0_ENVIRONMENT.md`.
   - `doctor.ps1` and `doctor.sh` in `infrastructure/scripts/`.
   - Node 22 enforced via engines + `.npmrc` + `.nvmrc` + doctor assertion.
   - Ollama verified as optional dev tool (`WARN`).
2. **Task 2 — Monorepo Configuration:**
   - Setup `pnpm-workspace.yaml`, root `package.json`, `.npmrc`, `.nvmrc`, `.gitattributes`.
   - Setup `backend/` with `uv init` and Python 3.12 on D:.
3. **Task 3 — Ephemeral Database Compose:**
   - Provide Postgres 16 + pgvector compose service early so database integration tests have a live target.
4. **Task 4 — Design Tokens & Shared Types:**
   - `@alibi/design-tokens` (JSON tokens for web Tailwind & React Native theme).
   - `packages/domain-types` skeleton.
5. **Task 5 — Backend Skeleton & Dual-Mode Lifespan:**
   - FastAPI app factory binding `0.0.0.0:8000`.
   - Settings in `app/core/config.py` with `ALIBI_MODE`.
   - In-process worker loop and scheduler trigger for `hosted` mode.
   - Structlog with redaction processor for sensitive headers (`Authorization`, `api_key`, `password`).
   - RFC 7807 problem+json handlers, `/health/live`, `/health/ready` (DB ping), `/api/v1/meta`.
   - `app/core/ids.py` (UUIDv7) and `app/core/time.py` (UTC + tz utilities).
   - `import-linter` contract forbidding cross-module imports except via `service.py`.
6. **Task 6 — Standalone Worker Skeleton:**
   - `app/worker.py` entrypoint for `local` mode with job loop stub and heartbeat.
7. **Task 7 — OpenAPI & Generated Client:**
   - Export `/openapi.json` from backend.
   - Build `@alibi/api-client` via `openapi-typescript`.
   - Add CI staleness validation test.
8. **Task 8 — Web Dashboard Shell:**
   - Next.js (App Router, TS strict) with Tailwind CSS using `@alibi/design-tokens`.
   - 4-tab dashboard navigation (`Dashboard`, `Tasks`, `AI Intelligence`, `Reports`).
   - Avatar menu for Settings (`AC-UI-6`).
   - Light/dark theme toggle.
9. **Task 9 — Mobile Application Shell:**
   - Expo Router skeleton in `apps/mobile` (pinned to Expo SDK 58).
   - 4-tab bottom navigation (`Dashboard`, `Tasks`, `AI Intelligence`, `Reports`).
   - Avatar menu for Settings and Server URL configuration.
   - `/api/v1/meta` LAN connectivity ping.
   - APK release build verification.
10. **Task 10 — Container Orchestration & Dockerfile:**
    - `infrastructure/docker/backend.Dockerfile` (multi-stage, non-root, minimal layers).
    - `docker-compose.yml` (postgres, api, worker, web).
    - `docker-compose.test.yml`.
11. **Task 11 — Minute-Efficient CI & Pre-commit:**
    - GitHub Actions: `backend.yml`, `frontend.yml`, `mobile.yml` (path-filtered; tag-only APK build), `security.yml` (gitleaks).
    - Pre-commit configuration.
12. **Task 12 — Verification & Exit Gate:**
    - Verify `AC-M0-1` through `AC-M0-6`.
    - Confirm ADR-001 through ADR-005.
    - Measure and record backend idle memory (RSS) in `docs/milestones/M0_REPORT.md`.
    - WSL Ubuntu build reproducibility check (roadmap QA scope).
    - Compile `docs/milestones/M0_REPORT.md` and update `docs/IMPLEMENTATION_STATUS.md`.

---

### 4. Test Plan & Acceptance Evidence
- **Static Analysis:** `ruff check`, `ruff format --check`, `mypy --strict app/`, `import-linter` contracts, `eslint`, `tsc`.
- **Unit Tests:**
  - Redaction test: Verify `Authorization` headers are masked in logs (AC-M0-6).
  - Time & ID tests: UUIDv7 uniqueness and order verification, UTC tz conversions.
  - OpenAPI staleness test: Validate that schema drift causes build failure (AC-M0-5).
  - Dual-mode test: Verify lifespan triggers worker in `hosted` mode and remains separate in `local` mode.
- **Integration Tests:**
  - `/health/live` returns 200 `{"status": "ok"}`.
  - `/health/ready` returns 200 with live PostgreSQL container.
  - `/api/v1/meta` returns version, timestamp, environment metadata.
- **Security Tests:** Fake-secret fixture committed in isolated branch to verify `gitleaks` interception (AC-M0-4).
- **Physical Device E2E (AC-M0-2):**
  - APK built and installed on owner's physical Android phone.
  - Owner runs firewall command: `netsh advfirewall firewall add rule name="ALIBI API" dir=in action=allow protocol=TCP localport=8000`.
  - App connects over LAN IP to `/api/v1/meta` and confirms 200 response.
- **Memory Measurement:** Measure container memory with `docker stats` / psutil to record idle RSS baseline.

---

### 5. Risks & Mitigations
- **Risk:** RAM pressure on 16 GB machine running Docker + dev servers + emulator.  
  *Mitigation:* Use physical Android phone for device verification instead of emulator; set WSL2 RAM cap to 6 GB via `.wslconfig`.
- **Risk:** Native module incompatibilities with newer Expo SDKs.  
  *Mitigation:* Pinned exact Expo SDK 58 in ADR-021; lockfile strict.
- **Risk:** 512 MB Render ceiling in hosted mode.  
  *Mitigation:* Lazy imports for heavy libs; idle RSS recorded in M0; < 400 MB post-smoke gate from M2b.
- **Risk:** GitHub Actions minute exhaustion.  
  *Mitigation:* Native `paths:` filters; tag-only mobile APK compilation; local `make.ps1 ci` alternative.

---

### 6. Questions for Owner (Ask-First Items)
1. **Docker Cleanup & Installation Approval:**
   - Confirm command proposal for cleaning broken 4.92 registration.
   - Confirm whether to **keep** or **delete** existing `D:\DockerData\DockerDesktopWSL\disk\docker_data.vhdx` (2.4 GB).
   - Confirm installation with `--installation-dir=D:\dev\DockerDesktop` and `--wsl-default-data-root=D:\DockerData`.
2. **Approval of Revised Plan:**
   - Confirm approval of this updated `M0_PLAN.md` to proceed with implementation once Docker is configured.
