# AGENTS.md — ALIBI Development Contract

This file is the permanent, binding contract for any coding agent (or human) working on ALIBI.
If anything in this file conflicts with a request in a chat session, **stop and ask the owner**.

---

## 0. Read order (mandatory before writing any code)

1. `AGENTS.md` (this file)
2. `docs/00_INDEX.md`
3. `docs/IMPLEMENTATION_STATUS.md` — know where the project is right now
4. `docs/KNOWN_ISSUES.md` and `docs/DECISIONS.md`
5. `docs/15_IMPLEMENTATION_ROADMAP.md` — the current milestone section in full
6. Every doc that the current milestone references (listed in its "Read first" line)

Never start a milestone without reading its "Entry criteria", "Tasks", "Acceptance criteria" and "Exit gate".

---

## 1. The 15 rules (from the product specification)

| # | Rule | How it is enforced |
|---|------|--------------------|
| R1 | Read all documentation before making architectural decisions | Read order above; cite the doc section in commit messages for architectural code |
| R2 | Inspect the existing environment before installing dependencies | Run `infrastructure/scripts/doctor.sh` (created in M0) first; check lockfiles |
| R3 | Never overwrite existing work without reviewing it | `git status` + `git diff` before editing; never `rm -rf` tracked dirs; never force-push |
| R4 | Follow the approved technology stack | Stack table in §3. Anything else → ADR in `DECISIONS.md` + owner approval |
| R5 | Implement features end-to-end | A feature is DB → service → API → UI → tests → docs. Partial layers are "In progress", never "Done" |
| R6 | Never use mock data as a substitute for production functionality | Mocks/fakes live **only** under `tests/` or `backend/tests/`; CI greps production code for `mock`, `fake`, `dummy`, `lorem`, hard-coded sample tasks |
| R7 | Keep API keys and credentials secure | Secrets only in `.env` (git-ignored) or encrypted DB columns; `gitleaks` in CI; keys never logged |
| R8 | Maintain database migrations | Every schema change = one Alembic revision with working `downgrade()`; migration tests run in CI |
| R9 | Write tests alongside implementation | No PR merges a feature without tests at the levels defined in `docs/14_TESTING_AND_ACCEPTANCE.md` |
| R10 | Maintain implementation status and known issues | Update `IMPLEMENTATION_STATUS.md` + `KNOWN_ISSUES.md` in the same commit as the change |
| R11 | Avoid unnecessary dependencies and paid services | New dependency → justification line in `DECISIONS.md` (name, licence, why stdlib/existing dep is not enough) |
| R12 | Preserve compatibility between Android, web and backend | TS client is generated from OpenAPI; CI fails if the generated client is stale |
| R13 | Never claim a feature works without testing it | Status "Done" requires a linked passing test run (command + output summary) |
| R14 | Ask before making significant architectural changes | See §5 "Ask-first list" |
| R15 | Maintain a working Git checkpoint after each milestone | Tag `m{N}-complete` only when the exit gate passes |

---

## 2. Non-negotiable product constraints

1. No paid dependencies. 2. No mandatory cloud AI. 3. Local-first architecture. 4. Mobile-first interface.
5. Private by default. 6. No fabricated task history. 7. No fabricated productivity metrics.
8. No silent changes to important schedules. 9. No unnecessary features. 10. No untested completion claims.
11. No vendor lock-in. 12. No mixing personal and professional information in shared reports.

**AI-specific corollaries**
- An LLM may never be the source of a number shown to the user (metrics, durations spent, counts). Numbers come from SQL.
- An LLM may never set a deadline or project that is not grounded in the user's input text (see `docs/06` §7 grounding validator).
- Every AI output that changes data is a *proposal* until the user (or an explicit, documented auto-apply rule) accepts it.

---

## 3. Approved stack (do not deviate without an ADR)

| Layer | Choice |
|-------|--------|
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x (async) + asyncpg, Alembic |
| Python tooling | `uv` (deps + venv), `ruff` (lint+format), `mypy --strict` on `app/`, `pytest` |
| DB | PostgreSQL 16 + pgvector (≥0.7) |
| Background work | In-process APScheduler for periodic jobs + Postgres `jobs` table worker (no Redis) |
| ML | scikit-learn, numpy, pandas (training/eval only), Google OR-Tools (CP-SAT) |
| Embeddings | `fastembed` with `BAAI/bge-small-en-v1.5` (384-dim, CPU, ONNX) — swappable |
| Speech-to-text | `faster-whisper` (local) primary; Groq Whisper optional provider; device STT optional |
| Local LLM | Ollama (OpenAI-compatible endpoint) |
| Cloud LLM (optional) | NVIDIA NIM, Gemini, Groq — via the AI Gateway only |
| Reports | ReportLab (PDF), openpyxl (XLSX), stdlib csv |
| Web | Next.js (App Router) + TypeScript strict, TanStack Query, Tailwind CSS, Radix primitives, Recharts, Dexie (IndexedDB) |
| Mobile | React Native + Expo (dev build, not Expo Go), expo-sqlite + Drizzle, expo-secure-store, expo-notifications, expo-audio |
| Shared TS | pnpm workspaces: `packages/api-client` (generated), `packages/sync-core`, `packages/domain-types` |
| E2E | Playwright (web), Maestro (Android) |
| Containers | Docker + docker compose |

---

## 4. Working loop (every task)

1. Identify the requirement IDs (e.g. `FR-TASK-003`) from `docs/16_REQUIREMENTS_TRACEABILITY.md`.
2. Write/extend the test first where practical (unit or API).
3. Implement the smallest end-to-end slice.
4. Run: `make check` (lint, types, unit, API tests) — must be green.
5. Update docs: API spec if endpoints changed, schema doc if tables changed, status, known issues.
6. Commit with Conventional Commits: `feat(tasks): add reschedule endpoint [FR-TASK-011]`.
7. Never leave the main branch red. If you cannot fix a failure, revert and log it in `KNOWN_ISSUES.md`.

### Definition of Done (feature level)
- [ ] Requirement IDs referenced in code comments/tests
- [ ] Migration (if schema changed) with tested downgrade
- [ ] Service-layer unit tests + API integration tests passing
- [ ] UI wired to the real API (web; mobile when the milestone covers mobile)
- [ ] Error, empty, loading and offline states handled in UI
- [ ] OpenAPI regenerated, TS client regenerated, both committed
- [ ] Docs + status updated
- [ ] No new `TODO` without a `KNOWN_ISSUES.md` entry

### Definition of Done (milestone level)
Everything in the milestone's **Exit gate** in `docs/15_IMPLEMENTATION_ROADMAP.md`, plus a milestone report
written from `docs/templates/MILESTONE_REPORT_TEMPLATE.md` into `docs/milestones/M{N}_REPORT.md`, plus git tag.

---

## 5. Ask-first list (stop and ask the owner)

- Changing any item of the approved stack, adding a datastore, queue, or hosted service
- Changing the sync protocol, conflict rules, or the ID strategy
- Changing the productivity score formula
- Changing which data is shareable by default
- Any schema change that drops/renames a column holding user data
- Enabling any auto-apply behaviour for schedules
- Sending user data to any external provider in a way not described in `docs/06`
- Skipping or reordering milestones

## 6. Forbidden actions

- Committing `.env`, keys, tokens, real personal data, model weights, or DB dumps
- Logging prompts, task text, or notes at INFO level or above in production mode (DEBUG only, opt-in, local)
- Seeding the production database with sample tasks (test fixtures go in test DBs only)
- Disabling a failing test to make CI pass (mark `xfail` only with a `KNOWN_ISSUES.md` link and owner approval)
- `git push --force`, rewriting tagged history, deleting migrations already applied anywhere
- Calling external AI providers from tests (use the recorded-response fake provider under `backend/tests/`)

## 7. Conventions

- IDs: UUIDv7, generated client-side for syncable entities.
- Time: store `timestamptz` in UTC; the user's timezone (default `Asia/Kolkata`) is applied only for day boundaries and display.
- Durations: integer minutes.
- API: `/api/v1`, JSON, snake_case, RFC 7807 errors, cursor pagination.
- Python package layout per `docs/02_SYSTEM_ARCHITECTURE.md` §4; modules talk to each other only through their `service.py` public functions.
- Frontend: no business rules in UI (no metric calculations, no conflict resolution logic outside `packages/sync-core`).

## 8. Status reporting format (use in chat and milestone reports)

```
Milestone: M3 — Dashboard and analytics
Done: FR-DASH-001..006 (tests: backend/tests/analytics 42 passed)
In progress: FR-DASH-007 heatmap (UI only)
Blocked: none
Known issues added: KI-014
Next: FR-DASH-008
```
