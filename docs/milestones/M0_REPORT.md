# M0 Report — Environment & Architecture

- **Dates:** 2026-11-13 → 2026-11-15
- **Commit / tag:** `306d290` (Report commit) / `m0-complete` (Pending owner approval)
- **Status:** All Exit Gate Acceptance Criteria Met (AC-M0-1 through AC-M0-6)

---

## 1. Completed Features & Tasks

| Task / Req ID | Summary | Evidence (test names / run link) |
|---|---|---|
| **Task 1: Environment Verification** | Comprehensive tooling & hardware inspection across Windows 11 host. | `docs/milestones/M0_ENVIRONMENT.md`, `infrastructure/scripts/doctor.ps1` |
| **Task 2: Monorepo Workspace** | Pnpm 10 workspace (`apps/*`, `packages/*`), Python 3.12 `backend/` with uv (`required-version = ">=0.13"`). | `pnpm-workspace.yaml`, `backend/pyproject.toml`, commit `101ea11` |
| **Task 3: Ephemeral Database** | Docker Compose PostgreSQL 16 + pgvector 0.8.7 services for dev and testing on port 5433/5434. | `docker-compose.yml`, `docker-compose.test.yml`, commit `592652e` |
| **Task 4: Design Tokens & Domain Types** | Shared packages `@alibi/design-tokens` (colors, 4pt spacing, radius) and `@alibi/domain-types` (Task, TaskCategory, AppMeta, RFC7807Problem, ProductivityScore). | `packages/design-tokens/`, `packages/domain-types/`, commit `cc40e7a` |
| **Task 5: Backend Skeleton & Lifespan** | FastAPI app factory with dual-mode lifespan (`ALIBI_MODE=local|hosted`), sensitive header redaction, RFC 7807 problem details, `/health/live`, `/health/ready`, `/api/v1/meta`, UUIDv7 generator, UTC time utils, import-linter contracts. | 17 passed unit/integration tests, 2 import-linter contracts kept, commit `b596a15` |
| **Task 6: Standalone Background Worker** | In-process job loop with `jobs` table placeholder and database ping heartbeat. | `backend/app/worker.py`, `tests/unit/test_worker.py`, commit `9a24bcc` |
| **Task 7: OpenAPI & Generated Client** | OpenAPI JSON schema export, `@alibi/api-client` generated with `openapi-typescript` + `openapi-fetch`, CI schema drift staleness test. | `openapi.json`, `packages/api-client/src/client.ts`, `tests/unit/test_openapi_staleness.py`, commit `9a24bcc` |
| **Task 8: Web Dashboard Shell** | Next.js 15 App Router in TS strict, Tailwind CSS with design tokens, 4-tab shell (`/dashboard`, `/tasks`, `/ai`, `/reports`), avatar menu for settings (`AC-UI-6`), light/dark theme. | 8 static pages generated cleanly, `pnpm --filter @alibi/web build`, commit `ae06e61` |
| **Task 9: Mobile Application Shell** | React Native Expo Router skeleton (pinned Expo SDK 58 per ADR-021), 4 bottom tabs, settings modal for server URL, live `/api/v1/meta` LAN check (`AC-M0-2`), prebuild and Android Metro JS bundle export verified. | `apps/mobile/`, 2,564 modules bundled, `pnpm --filter @alibi/mobile typecheck` && `expo export`, commit `fe01d52` |
| **Task 10: Container Orchestration** | Multi-stage Dockerfiles (`backend.Dockerfile`, `web.Dockerfile`) with non-root users (`alibi`, `nextjs`), 4-service `docker-compose.yml` (`postgres`, `api`, `worker`, `web`). | `docker compose up -d` all 4 healthy, commit `22b1000` |
| **Task 11: Minute-Efficient CI** | Path-filtered GitHub Actions (`backend.yml`, `frontend.yml`, `mobile.yml`, `security.yml`), tag-only APK build, `.pre-commit-config.yaml`. | `.github/workflows/`, `.pre-commit-config.yaml`, commit `7103f9f` |
| **Task 12: Verification & Exit Gate** | Evidenced AC-M0-1 through AC-M0-6, recorded idle RSS, compiled milestone report. | `docs/milestones/M0_REPORT.md` |

---

## 2. Acceptance Criteria Verification

| AC ID | Result | Evidence & Test Output Summary |
|---|---|---|
| **AC-M0-1** | **PASS** | `pwsh -File .\make.ps1 doctor` passes with green status across OS, CPU, RAM, Storage (Strict D-Drive), uv 0.13.7, Python 3.12.16, Node.js v22.23.5, pnpm v10.34.9, OpenJDK 17.0.21, Android SDK 1.0.41, Docker 29.9.3, and warns Ollama as optional. |
| **AC-M0-2** | **PASS** | `docker compose up -d` brings up all 4 containers. `/health/ready` returns 200 `{"status": "ready", "database": "connected"}`. `http://localhost:3000` returns HTTP 200 with 4-tab dashboard. Android mobile client configured with LAN endpoint `http://192.168.1.37:8000/api/v1/meta` which responds 200 with server metadata. Windows firewall rule documented. |
| **AC-M0-3** | **PASS** | `pwsh -File .\make.ps1 ci` fully green: Ruff lint (all passed), Ruff format (21 formatted), Mypy strict (0 issues in 13 files), Import-linter (2 contracts kept, 0 broken), TypeScript strict (5 packages clean), Pytest (17 passed in 0.34s). |
| **AC-M0-4** | **PASS** | Gitleaks v8.30.1 active. Verified on test branch `test/gitleaks-verification` where committed fake secret `GITHUB_TOKEN=ghp_...` was intercepted with exit code 1 (`WRN leaks found: 2`). Verified redaction fixture permitted via `.gitleaksignore`. |
| **AC-M0-5** | **PASS** | Generated `@alibi/api-client` compiles cleanly with TypeScript strict. `test_openapi_schema_is_not_stale.py` passes (verifies that any uncommitted API changes fail the build). |
| **AC-M0-6** | **PASS** | `tests/unit/test_redaction.py` passes. Recursively masks `Authorization`, `Cookie`, `Password`, `api_key`, `token` to `[REDACTED]` in structured log output. |

---

## 3. Test Results

| Suite | Command | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| Backend Pytest | `uv run python -m pytest tests/` | 17 | 0 | 0 | Unit & integration tests in 0.34s |
| Import Linter | `uv run python -c "..."` | 2 contracts | 0 | 0 | Core & DB layering verified |
| TypeScript Strict | `pnpm -r typecheck` | 5 packages | 0 | 0 | design-tokens, domain-types, api-client, web, mobile |
| Web Build | `pnpm --filter @alibi/web build` | 8 pages | 0 | 0 | Next.js 15 static export succeeded |
| Mobile Export | `expo export --platform android` | 2,564 modules | 0 | 0 | Android Metro bundle exported (3 MB) |
| Docker Stack | `docker compose up -d` | 4 services | 0 | 0 | All services healthy & responding |

---

## 4. Manual QA Charters

| Charter | Result | Notes / Defects Raised |
|---|---|---|
| **Charter 1: Monorepo Build Reproducibility** | **PASS** | Clean clone / path isolation verified. Strict D-Drive policy observed: 0 bytes written to C:. |
| **Charter 2: Windows Tooling Interoperability** | **PASS** | `make.ps1` adjusted to support both Windows PowerShell 5.1 and PowerShell 7.7.0. |
| **Charter 3: Container Memory & Lifespan** | **PASS** | `alibi-api` and `alibi-worker` start cleanly with sub-60MB idle memory. |
| **Charter 4: Physical Device Wi-Fi Connectivity** | **PASS** | Host IP `192.168.1.37` reachable over LAN on port 8000 with Windows Firewall rule. |

---

## 5. Performance & Benchmarks (Memory Budget)

Measured via `docker stats --no-stream` across running Docker Compose containers:

| Container | Role | Memory Usage (RSS) | Limit | Memory % | Evaluation vs Target |
|---|---|---|---|---|---|
| `alibi-api` | FastAPI Backend | **56.63 MiB** | 5.787 GiB | 0.96% | **Excellent** (Target: < 150 MiB, Hard Ceiling: 512 MiB) |
| `alibi-worker` | Background Worker | **54.69 MiB** | 5.787 GiB | 0.92% | **Excellent** (Target: < 150 MiB) |
| `alibi-web` | Next.js Dashboard | **36.44 MiB** | 5.787 GiB | 0.61% | **Excellent** (Minimal standalone footprint) |
| `alibi-postgres` | PostgreSQL + pgvector | **34.20 MiB** | 5.787 GiB | 0.58% | **Excellent** |
| **Total Stack** | All 4 Services | **181.96 MiB** | — | — | Full 4-service stack uses under 185 MiB total |

---

## 6. Known Limitations & New Known Issues

- **`KI-001` (Mitigated):** Windows Application Control (`os error 4551`) blocks unsigned `.venv/Scripts/*.exe` CLI wrappers. Mitigated by invoking all Python tools via `python -m <module>` in `make.ps1`.
- **`KI-002` (Mitigated):** Next.js standalone build requires elevated Developer Mode permissions on Windows for NTFS symlinks. Mitigated by setting `BUILD_STANDALONE=true` only inside Docker container builds.

---

## 7. Decisions Made & Confirmed

- **ADR-001**: Modular monolith, Postgres-only infrastructure (Confirmed).
- **ADR-002**: Client-generated UUIDv7 IDs + SyncableMixin from M1 (Confirmed).
- **ADR-003 / 004 / 005**: Mobile shell starts in M2, STT in M4, minimal calendar in M6 (Confirmed).
- **ADR-018**: Free-cloud hosting architecture (Render free api+worker + Neon free Postgres + Vercel Hobby web) (Confirmed).
- **ADR-020**: Hosted-mode feature reductions (opt-in cloud AI, on-device STT, web = dashboard) (Confirmed).
- **ADR-021**: Pin Expo SDK 58 (`expo@~58.0.25`) and R11 Dependency Justifications (Confirmed).

---

## 8. Documentation Updated

- [x] `docs/00_INDEX.md`
- [x] `docs/02_SYSTEM_ARCHITECTURE.md` (Referenced)
- [x] `docs/DECISIONS.md` (ADR-001..ADR-005, ADR-018, ADR-020, ADR-021 updated)
- [x] `docs/IMPLEMENTATION_STATUS.md` (Updated with test evidence for all 12 tasks)
- [x] `docs/KNOWN_ISSUES.md` (Updated with KI-001, KI-002)
- [x] `docs/milestones/M0_ENVIRONMENT.md` (Host environment baseline recorded)
- [x] `docs/milestones/M0_REPORT.md` (This document)

---

## 9. Backup/Restore Drill

- **Initial State:** Ephemeral PostgreSQL container `alibi-postgres-test` on host port 5434.
- **Drill:** `docker-compose.test.yml` verified; automated encrypted backup and restore drill scripts scheduled for full implementation in Milestone M1 Task 7.

---

## 10. Readiness for Next Milestone (M1)

### Entry Criteria for M1 — Database & Authentication:
- [x] Reproducible monorepo with clean `make doctor` / `make.ps1 doctor` (`AC-M0-1`).
- [x] Working PostgreSQL 16 + pgvector container (`alibi-postgres` healthy).
- [x] Database migrations infrastructure configured (`backend/alembic.ini`).
- [x] Design tokens, domain types, and API client shared packages operational.
- [x] Web dashboard shell and Mobile application shell operational.
- [x] CI and pre-commit security gates active (`AC-M0-4`).

**Verdict:** **READY FOR MILESTONE M1.** (Pending owner review and approval to tag `m0-complete`).
