# 02 — System Architecture

## 1. Style
**Modular monolith.** One FastAPI process (API) + one worker process (same codebase, different entrypoint) + PostgreSQL. Each account owns an isolated data space; account identity is taken from the authenticated token and every owned-data query is scoped by that identity.
No microservices, no message broker, no Redis. Modules are isolated by package and talk via public service functions.

> **Hosted mode (ADR-018/020):** the primary runtime is `ALIBI_MODE=hosted`. It's **one container** on Render free, where the API process also runs the worker loop + APScheduler, connected to Neon Postgres. The diagram and process table below describe `local` mode (dev/self-host). Hosted differences: no Ollama/faster-whisper in the image, fastembed only if M7 shows it fits, web is an online-only dashboard (no IndexedDB/Dexie, no PWA offline shell), files stored in Postgres, nightly jobs and backups via GitHub Actions.

## 2. Context diagram

```
 ┌──────────────┐     HTTPS/JSON      ┌────────────────────────────────────────────┐
 │ Android app  │◄───────────────────►│ FastAPI (api)                              │
 │ RN + Expo    │   /api/v1, /sync    │  auth · tasks · calendar · analytics ·     │
 │ SQLite local │                     │  learning · scheduling · ai · rag ·        │
 └──────────────┘                     │  knowledge · reports · sharing · sync ·    │
 ┌──────────────┐                     │  notifications                             │
 │ Web app      │◄───────────────────►│                                            │
 │ Next.js      │                     └───────┬───────────────┬────────────────────┘
 │ IndexedDB    │                             │ SQL           │ jobs table
 └──────────────┘                     ┌───────▼───────┐ ┌─────▼──────────────────────┐
 ┌──────────────┐  /s/{token} (RO)   │ PostgreSQL 16 │ │ Worker (same code)         │
 │ Share viewer │◄──────────────────►│ + pgvector    │ │ embeddings · learning ·    │
 └──────────────┘                     └───────────────┘ │ reports · backups · STT    │
                                                        └─────┬──────────────────────┘
                                         AI Gateway (in-process library)
                          ┌───────────┬──────────┬─────────┼──────────┬───────────────┐
                          ▼           ▼          ▼         ▼          ▼               ▼
                       Ollama     NVIDIA NIM   Gemini     Groq   faster-whisper   fastembed
                       (local)    (optional)  (optional) (opt.)    (local STT)  (local embed)
```

## 3. Runtime processes
| Process | Entrypoint | Responsibilities |
|---------|-----------|------------------|
| `api` | `uvicorn app.main:app` | HTTP API, auth, sync, synchronous light work |
| `worker` | `python -m app.worker` | Polls `jobs` (`FOR UPDATE SKIP LOCKED`), runs APScheduler periodic jobs |
| `postgres` | `pgvector/pgvector:pg16` | Data, vectors |
| `ollama` | host or container | Local LLM (optional but recommended) |
| `web` | `next start` | Web UI (can be static-exported behind backend in local mode) |

Rule: anything > 300 ms or using an LLM/STT/embedding in the background runs as a job. Synchronous LLM use is allowed only
for user-awaited interactions (extraction, chat), always with a timeout and graceful degradation.

## 4. Backend package layout

```
backend/
├── pyproject.toml  uv.lock  alembic.ini
├── app/
│   ├── main.py                  # app factory, routers, middleware
│   ├── worker.py                # job loop + scheduler
│   ├── core/                    # config (pydantic-settings), logging, errors, ids (uuid7), time (tz utils), security primitives
│   ├── database/                # engine, session, base model, mixins (SyncableMixin), repositories helpers
│   ├── api/                     # deps (current_user, db session), router aggregation, problem+json handlers
│   ├── authentication/          # users, devices, refresh tokens
│   ├── tasks/                   # tasks, subtasks, tags, dependencies, recurrence, time entries, events, extraction pipeline
│   ├── calendar/                # events, recurrence expansion, availability, conflicts
│   ├── analytics/               # metric queries + formulas (pure functions + SQL)
│   ├── learning/                # collector, feature builders, models, patterns, profile, evaluation
│   ├── scheduling/              # CP-SAT model, greedy fallback, explanations, proposals
│   ├── ai/
│   │   ├── gateway.py           # routing, fallback, validation, circuit breaker
│   │   ├── providers/           # ollama.py nvidia.py gemini.py groq.py base.py
│   │   ├── prompts/             # versioned prompt templates (*.j2) + schemas
│   │   ├── stt.py  embeddings.py
│   ├── rag/                     # intent router, sql tools, vector retriever, context assembly, citation check
│   ├── knowledge/               # vault items, ingestion, text extraction, chunking
│   ├── reports/                 # fact builder, narrative, renderers (pdf/xlsx/csv)
│   ├── sharing/                 # share links, public viewer endpoints, access log
│   ├── synchronization/         # push/pull, conflict resolver, op log
│   ├── notifications/           # schedule computation for reminders
│   ├── jobs/                    # job registry, enqueue(), handlers
│   └── backups/                 # pg_dump orchestration, export/import
├── migrations/                  # alembic
└── tests/                       # unit/ integration/ ai_eval/ learning_eval/ fixtures/ fakes/
```

Each domain module contains: `models.py` (SQLAlchemy), `schemas.py` (Pydantic I/O), `service.py` (public functions),
`repository.py` (queries), `router.py` (HTTP), `events.py` (domain events it emits), `tests/` mirrors.

**Dependency rule** (enforced with `import-linter` in CI):
- `api` → module `router` → module `service` → module `repository`/`models`.
- Modules may import other modules' `service` and `schemas` only. Never another module's `repository`/`models`.
- `core` and `database` import nothing from domain modules.
- `ai` is used by `tasks`, `rag`, `reports`, `learning` — never the reverse.

## 5. Domain events (in-process)
Services emit events through a tiny synchronous dispatcher within the same DB transaction (outbox pattern via `jobs` table
for anything slow). Key events:

| Event | Emitted by | Consumers |
|-------|-----------|-----------|
| `task.created/updated/status_changed/rescheduled/deleted` | tasks | learning.collector, knowledge.ingest (job), notifications |
| `time_entry.created/updated` | tasks | learning.collector, analytics cache invalidation |
| `prediction.accepted/rejected/corrected` | tasks, scheduling | learning.collector |
| `schedule.proposal_decided` | scheduling | learning.collector, calendar |
| `note.created/updated` | knowledge | embeddings job |

## 6. Key flows

### 6.1 Quick capture (text)
1. Client generates UUIDv7, inserts locally (mobile SQLite / web IndexedDB) with `title = raw_input`, `parse_status = pending`, shows it instantly.
2. Client pushes op (online) → `POST /api/v1/tasks/capture` (idempotent on id) → row persisted, `task.created` event.
3. Server runs extraction (doc 06 §7): rules parser (always) → LLM refine (if enabled & reachable, timeout 8 s) → grounding validator.
4. Response returns `extraction` proposal; client opens Confirm sheet. User edits/accepts → `PATCH /tasks/{id}` with accepted fields + `prediction` feedback.
5. Offline: steps 3–4 happen when connectivity returns; task already exists with raw title (never lost).

### 6.2 Voice capture
`expo-audio` records (m4a/aac, 16 kHz mono) → `POST /api/v1/voice/transcribe` (multipart) → faster-whisper → transcript → flow 6.1 with origin `voice`.
Offline: audio file saved locally + queued op `voice_capture`; placeholder task "Voice note (pending transcription)" created immediately.
**Hosted (ADR-020):** primary path is on-device Android speech recognition → transcript → flow 6.1 (works offline, no audio leaves the phone). `/voice/transcribe` is used only when external AI is enabled and forwards to Groq Whisper; audio is never stored. Web has no voice capture.

### 6.3 Schedule proposal
Task saved → user taps "Plan it" (or daily plan) → `POST /scheduling/proposals` → service loads availability, open tasks, predictions,
preferences → CP-SAT solve (≤5 s) → proposal stored `status=proposed` with explanations → client shows diff → user decides →
accepted blocks written as `calendar_events(kind=work_block)` in one transaction; stale-check via `input_snapshot_hash`.

### 6.4 RAG question
Question → intent router (rules + small LLM classification) → SQL tools (structured) and/or vector retrieval with filters →
context pack with source IDs → LLM answer with citation markers → citation validator (every cited ID was in context; numbers
appear in tool results) → answer + sources. Failure → deterministic fallback answer listing retrieved records.

### 6.5 Report
Request → fact builder (pure SQL, scoped by sharing class) → frozen `facts` JSON → optional narrative job → validator →
renderers (PDF/XLSX/CSV) store files → report `ready`. **Hosted (ADR-020):** only the facts JSON is stored; files are rendered on demand and streamed on download.

## 7. Cross-cutting
- **Config:** `pydantic-settings`, env-only; `app/core/config.py` single source.
- **Logging:** structlog JSON; request id; redaction processor strips `authorization`, `api_key`, `password`, task/note text fields.
- **Errors:** RFC 7807; error codes catalogue in doc 04 §3.
- **Time:** `app/core/time.py` — `now_utc()`, `local_day_bounds(date, tz)`; no `datetime.now()` elsewhere (lint rule).
- **IDs:** `uuid7()` in Python; `uuidv7` npm package on clients.
- **Feature flags:** `settings.features` table-less flags in config (e.g. `AUTO_SCHEDULE_RECURRING=false`).
- **Health:** `/health/live`, `/health/ready` (DB, migrations at head, worker heartbeat < 60 s, AI provider statuses informational).

## 8. Frontend architecture

### 8.1 Shared packages (pnpm workspace)
- `packages/api-client` — generated by `openapi-typescript` from `backend/openapi.json` + thin `openapi-fetch` wrapper. **Never hand-edited.**
- `packages/domain-types` — enums/constants mirrored from OpenAPI (generated).
- `packages/design-tokens` — colors, type scale, spacing (JSON → Tailwind config + RN theme).
- `packages/sync-core` — platform-agnostic sync engine: op queue model, push/pull loop, backoff, conflict surfacing. Storage adapter interface implemented by mobile (SQLite); the web (Dexie) adapter is deferred with FR-SYNC-002 (ADR-020).

### 8.2 Web (`apps/web`)
Next.js App Router, client-side data via TanStack Query; auth tokens: access token in memory, refresh token in `HttpOnly; Secure; SameSite=Strict` cookie
scoped to `/api/v1/auth/refresh` (web only). Hosted on Vercel with a rewrite `/api/*` → backend so cookies stay same-origin. **v1 web is an online-only dashboard (ADR-020):** no service worker/offline shell; scope per doc 05 §1a.

### 8.3 Mobile (`apps/mobile`)
Expo Router; local DB = expo-sqlite with Drizzle schema mirroring syncable tables; UI reads **from local DB** (single source for UI),
sync engine reconciles with server. Tokens in expo-secure-store. Background sync via `expo-background-task` + on app foreground + on connectivity change.

## 9. Architecture acceptance criteria
- AC-ARCH-1: `import-linter` contracts pass in CI.
- AC-ARCH-2: Disabling all AI providers → full test suite for non-AI requirements passes.
- AC-ARCH-3: Killing the worker does not break any synchronous API; jobs resume on restart (no lost jobs).
- AC-ARCH-4: OpenAPI schema diff check: generated client up to date in CI.
- AC-ARCH-5: No business calculation in `apps/*` (code review checklist + grep for metric names in UI code).
