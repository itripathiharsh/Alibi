# M0 Plan — Environment & Architecture

**Milestone:** M0  
**Target Duration:** Milestone M0 implementation  
**Governing Documents:** AGENTS.md, docs/02_SYSTEM_ARCHITECTURE.md, docs/13_DEPLOYMENT_AND_INFRASTRUCTURE.md, docs/14_TESTING_AND_ACCEPTANCE.md  
**Strict Policy:** Strict D-Drive Storage & Zero C-Drive Data Policy  

---

### 1. Requirement IDs in Scope
Foundational infrastructure for the full product lifecycle:
- `NFR-PORT-001` (Runs on Windows/Linux via Docker and without Docker)
- `NFR-MAINT-001` (Test coverage infrastructure, linters, strict typing)
- `NFR-SEC-001` (Security static analysis: gitleaks, ruff, bandit, audit)
- Architectural Gates: `AC-ARCH-1` (import-linter), `AC-ARCH-4` (OpenAPI schema sync), `AC-ARCH-5` (no business logic in UI)
- Acceptance Criteria: `AC-M0-1` through `AC-M0-6`

---

### 2. Approach & Key Design Choices
- **Monorepo Layout:**
  - `pnpm-workspace.yaml` defining `apps/*` and `packages/*`.
  - Packages: `packages/design-tokens` (colors, spacing tokens), `packages/domain-types`, `packages/api-client` (generated via `openapi-typescript` + `openapi-fetch`).
  - Backend: Python 3.12 managed via `uv` in `backend/` with isolated `.venv` strictly on D: (`D:\alibi\backend\.venv`).
  - Web: Next.js (App Router, TS strict) with Tailwind CSS utilizing tokens from `@alibi/design-tokens`, 4-tab shell (Today, Calendar, Analytics, Intelligence) with light/dark theme.
  - Mobile: React Native + Expo (dev build), Expo Router 4-tab shell, calling `/api/v1/meta`.
  - Automation: `make.ps1` for Windows native execution alongside `Makefile` for Linux/CI.
- **Backend Architecture (Modular Monolith, doc 02 §4):**
  - App factory in `app/main.py`.
  - Config via `pydantic-settings` in `app/core/config.py`.
  - Logging via `structlog` with redaction processor for sensitive headers (`Authorization`, `api_key`, `password`).
  - Endpoints: `/health/live`, `/health/ready`, `/api/v1/meta`.
  - Utility primitives: `app/core/ids.py` (UUIDv7 client/server), `app/core/time.py` (UTC + Asia/Kolkata boundary helpers).
  - Enforced boundaries: `import-linter` contract forbidding domain layers from cross-importing repositories.
- **Worker Skeleton:** In-process worker entrypoint `python -m app.worker` with placeholder job loop and heartbeat.

---

### 3. Order of Work (Vertical Slices)
1. **Task 1 — Environment Verification:** (Completed & Documented in `M0_ENVIRONMENT.md`).
2. **Task 2 — Monorepo Configuration:** Setup `pnpm-workspace.yaml`, root `package.json`, and backend `pyproject.toml` via `uv init`.
3. **Task 3 — Design Tokens & Shared Types:** Create `packages/design-tokens` and skeleton for `packages/domain-types`.
4. **Task 4 — Backend Skeleton & API:** App factory, structlog with redaction processor, error handlers, `/health/live`, `/health/ready`, `/api/v1/meta`, `import-linter` config.
5. **Task 5 — Worker Skeleton:** Worker entrypoint with heartbeat and claim loop stub.
6. **Task 6 — OpenAPI & Generated Client:** Export `/openapi.json` via backend target; generate `@alibi/api-client` via `openapi-typescript`; add staleness check.
7. **Task 7 — Web Application Shell:** Next.js App Router, Tailwind configured with `@alibi/design-tokens`, 4-tab navigation shell (Today, Calendar, Analytics, Intelligence), dark/light mode toggle.
8. **Task 8 — Mobile Application Shell:** Expo Router skeleton in `apps/mobile`, 4-tab bottom navigation, theme tokens, `/api/v1/meta` ping.
9. **Task 9 — Containers & Test Compose:** `docker-compose.yml` (Postgres 16 + pgvector, api, worker, web) and `docker-compose.test.yml`.
10. **Task 10 — CI Workflows & Pre-commit:** GitHub Actions workflows (`backend.yml`, `frontend.yml`, `security.yml`), pre-commit hooks (ruff, eslint, prettier, gitleaks).
11. **Task 11 — M0 Verification & Exit Gate:** Run all acceptance checks (`AC-M0-1` to `AC-M0-6`), compile `docs/milestones/M0_REPORT.md`, update `IMPLEMENTATION_STATUS.md`.

---

### 4. Test Plan
- **Static Analysis:** `ruff check`, `ruff format --check`, `mypy --strict app/`, `import-linter` contracts, `eslint`, `tsc` across workspaces.
- **Unit Tests:**
  - Redaction test: Verify `Authorization` headers are masked in logs (AC-M0-6).
  - Time & ID tests: UUIDv7 uniqueness and order verification, UTC tz conversions.
  - OpenAPI staleness test: Validate that schema drift causes build failure (AC-M0-5).
  - Sample tests across `backend/tests/unit`, `apps/web`, `packages/*`.
- **Integration Tests:**
  - `/health/live` returns 200 `{"status": "ok"}`.
  - `/health/ready` returns 200 once DB ping succeeds.
  - `/api/v1/meta` returns version, timestamp, environment metadata.
- **Security Tests:** Fake-secret fixture committed in isolated branch to verify `gitleaks` interception (AC-M0-4).

---

### 5. Risks & Mitigations
- **Risk:** Expo native dependencies and Android Gradle versions on Windows.  
  *Mitigation:* Pin exact Expo SDK (SDK 52), verified JDK 17 (`D:\dev\jdk`) and Android SDK 36 (`D:\dev\android-sdk`).
- **Risk:** Docker storage escaping to C: drive on Windows.  
  *Mitigation:* Relocate WSL2 data VHDX to `D:\dev\docker-data` prior to container pulls; keep native dev flow (`make.ps1`) ready as fallback.
- **Risk:** Port collisions in local dev (FastAPI :8000, Web :3000, Ollama :11434).  
  *Mitigation:* Standardize ports in `.env` and verify via `doctor` target.

---

### 6. Questions for Owner (Ask-First Items)
1. **Docker Setup Preference:** Do you approve **Option A** (Docker Desktop with WSL2 data VHDX moved to `D:\dev\docker-data`), **Option B** (Docker Engine inside native WSL Ubuntu on D:), or **Option C** (Native local dev without Docker for now)?
2. **Milestone Plan Approval:** Please confirm approval of this order of work to proceed with Step 3 implementation.
