# Architecture Decision Records

Format: `docs/templates/ADR_TEMPLATE.md`. Newer ADRs supersede older ones explicitly ("Supersedes ADR-00X").
Status: Proposed · Accepted · Superseded · Rejected.

| ADR | Title | Status |
|-----|-------|--------|
| 001 | Modular monolith, Postgres-only infrastructure (no Redis/broker) | Accepted (planning) |
| 002 | Client-generated UUIDv7 IDs and SyncableMixin on all syncable tables from M1 | Accepted (planning) |
| 003 | Android shell starts in M2 (online), offline in M10 | Accepted (planning) |
| 004 | Voice capture in M4 with the AI gateway | Accepted (planning) |
| 005 | Minimal calendar ships in M6 for scheduling; full calendar in M8 | Accepted (planning) |
| 006 | Local embeddings with fastembed bge-small (384-dim) | **Amended by ADR-020** — local mode only; hosted mode only if the memory budget allows (M7) |
| 007 | Local STT with faster-whisper | **Amended by ADR-020** — local mode only; hosted uses on-device STT, optional Groq Whisper |
| 008 | Providers via raw httpx against OpenAI-compatible endpoints; native API only inside an adapter when needed | Accepted (planning) |
| 009 | Grounding validator: deadlines/projects only from user text or existing records | Accepted (planning) |
| 010 | Productivity score v1 = 0.5·completion + 0.3·on-time + 0.2·estimate accuracy; no hours term | Accepted (planning) — owner may tune; changes need ADR |
| 011 | Sync: op-log push + server_seq pull + field-level versions + explicit conflict rules | Accepted (planning) |
| 012 | ReportLab (PDF) chosen over WeasyPrint for Windows portability (no system libs) | Accepted (planning) |
| 013 | Tailscale recommended for remote/LAN access in local mode | Accepted (planning) — local/dev mode only after ADR-018 |
| 014 | Shared TS packages; API client generated from OpenAPI, never hand-written | Accepted (planning) |
| 015 | Uncategorised items treated as personal for sharing (conservative) | Accepted (planning) |
| 016 | Additional tables beyond spec list (devices, refresh_tokens, tags, task_tags, task_dependencies, recurrence_rules, ai_extractions, learned_patterns, ml_models, chat_*, report_share_access_log, sync_conflicts, audit_log, jobs) | Accepted (planning) |
| 017 | Local model selection (LLM) | **Pending — M4**, now scope-reduced: Ollama is a dev/local-mode provider only (ADR-020) |
| 018 | Free-cloud provider: Render free (api+worker, one container) + Neon free (Postgres+pgvector) + Vercel Hobby (web) + GitHub Actions (nightly jobs, backups) | **Accepted (owner, 2026-11-13)** — limits re-verified at M2b and M11 |
| 019 | Provider endpoints/models/free-tier limits as of implementation date | **Pending — M4** |
| 020 | Hosted-mode feature reductions (opt-in cloud AI, on-device STT, keyword-first search, web = dashboard, early deploy after M2) | **Accepted (owner, 2026-11-13)** |
| 021 | Pin Expo SDK 58 and Approved Dependencies Justifications (R11) | **Accepted (M0, 2026-11-13)** |

---

## ADR-001 — Modular monolith, Postgres-only infrastructure
**Context:** ₹0 budget, single user, local-first, must run on a personal PC.
**Decision:** One FastAPI codebase with `api` and `worker` entrypoints; background jobs in a Postgres `jobs` table with `SKIP LOCKED`; APScheduler for periodic triggers.
**Consequences:** Fewer moving parts and services to host for free; throughput limits irrelevant at 1 user. Revisit only if multi-user.

## ADR-002 — Client-generated UUIDv7 + SyncableMixin from M1
**Context:** Offline creation on Android must not need server round-trips; retrofitting sync columns later is risky.
**Decision:** All syncable entities use client-generated UUIDv7 and carry version/server_seq/deleted_at/field_versions from their first migration.
**Consequences:** Slight overhead early; M10 becomes protocol work, not schema surgery.

## ADR-003/004/005 — Sequencing changes
See `15_IMPLEMENTATION_ROADMAP.md` "Sequencing adjustments". Rationale: de-risk Android toolchain early, keep STT with the AI layer, give scheduling the calendar data it needs.

## ADR-009 — Grounding validator
**Context:** Spec: AI must not fabricate deadlines or project associations.
**Decision:** Deterministic post-validator; LLM output for deadline/project/estimate/priority accepted only with evidence in input or existing records.
**Consequences:** Some true-but-implicit deadlines will be missed → user adds them in confirm sheet. Preferred over fabrication.

## ADR-010 — Productivity score v1
See doc 10 §3. Hours excluded by design (spec: must not reward excessive hours). Reasonable reschedules judged against final deadline.

## ADR-012 — ReportLab
WeasyPrint needs Pango/Cairo system libraries (painful on Windows hosts). ReportLab is pure-Python and BSD-licensed.

## ADR-015 — Uncategorised = personal for sharing
Prevents accidental leakage of untagged tasks into professional shares.

## ADR-016 — Additional tables
Each serves a stated requirement: auth security (devices, refresh_tokens, audit_log), tasks (tags, task_tags, task_dependencies, recurrence_rules), AI trust (ai_extractions), learning confidence (learned_patterns, ml_models), assistant history (chat_*), sharing history (report_share_access_log), sync safety (sync_conflicts), reliability (jobs).

## ADR-018 — Free-cloud hosting (no card, no always-on PC)
**Date:** 2026-11-13 · **Status:** Accepted (owner) · **Supersedes:** "Pending — M11 evaluation"; makes doc 13 config B the primary runtime.
**Context:** The owner can't keep their PC running and has no budget, including no card for "always free" VMs. Doc 13 assumed the owner's PC (config A) as the always-on server, which no longer holds. Android is offline-first (M10), so the server only needs to be reachable *sometimes*. A server that sleeps when idle is acceptable.
**Options considered (limits as found 2026-11-13, secondary sources; re-verify on provider pages):**
| Option | Verdict |
|---|---|
| Oracle Always Free VM (now 2 OCPU / 12 GB ARM) | Rejected: card required; idle instances reclaimed (<20% use over 7 days); allowance was cut in 2026 |
| Hugging Face Spaces (Docker) | Rejected: Docker Spaces now need a paid plan |
| Koyeb free | Rejected: no free plan for new users since early 2026 |
| Supabase free (500 MB, pauses after 7 idle days, no backups) | Fallback DB only |
| **Render free web service** (512 MB RAM, sleeps after 15 min, ~1 min cold start, 750 instance-h/month, ephemeral disk) | **Chosen** for api+worker |
| **Neon free** (1 GB/project, 100 CU-h/month, scale-to-zero after 5 min, pgvector) | **Chosen** for Postgres |
| **Vercel Hobby** (personal, non-commercial) | **Chosen** for the web dashboard |
| **GitHub Actions** (private repo free minutes) | **Chosen** for nightly jobs + encrypted backups |
**Decision:**
- **One backend image, two run modes.** `ALIBI_MODE=local` runs separate `api` and `worker` processes and Postgres in compose, as doc 02 describes. `ALIBI_MODE=hosted` runs the worker loop and APScheduler *inside* the API process, because Render's free plan has no free background workers. Same code, chosen by env.
- **Database:** Neon free Postgres 16 + pgvector (pick the region nearest India that is offered). Plain Postgres only; no Neon-specific APIs.
- **File storage:** a storage interface with two backends: local filesystem (local mode) and Postgres (hosted mode, because Render's disk is ephemeral). Hosted quotas are in ADR-020.
- **Periodic work** that must run while the server sleeps (nightly learning recompute, purge, backup) runs as a GitHub Actions scheduled workflow against the DB/API. Reminders never depend on the server (on-device, ADR-020).
- **Backups:** nightly GitHub Actions job: `pg_dump` → encrypted with `age` (owner holds the private key offline) → workflow artifact (max retention). The owner downloads a copy weekly. Restore drill each milestone.
- **TLS:** provided by Render/Vercel; Caddy is only for the self-hosted VM option.
- **Keep-warm:** optional external pinger to `/health/live` (not `/ready`, so Neon can still sleep), limited to waking hours, staying under the 750 h/month pool. Before M10 (online-only Android) this hides the ~1 min cold start. Check Render's terms before enabling.
- **Portability:** nothing host-specific in code; moving to any Docker host + any Postgres = env change + `pg_dump`/`pg_restore`.
**Consequences:**
- ₹0, nothing runs on the owner's PC. Cold start up to ~1 min after idle; Neon wakes in under a second.
- **Data custody:** task data now lives with third parties (Neon on AWS, Render). It's encrypted at rest by the provider, but it's not on owner hardware. Mitigations: no AI provider sees data unless the owner opts in (ADR-020), API keys are encrypted in the DB (doc 12), and backups are encrypted with the owner's key.
- **Memory:** a hard 512 MB RAM budget for the hosted image. Measured from M0 (idle RSS) and gated from M2b (RSS after smoke test < 400 MB).
- **Free tiers can change or disappear** (RISK-011). The exit path is plain Docker + Postgres.
- **GitHub Actions minutes** are shared by CI and nightly jobs (RISK-014).

## ADR-020 — Hosted-mode feature reductions
**Date:** 2026-11-13 · **Status:** Accepted (owner) · **Amends:** ADR-006, ADR-007, ADR-017; FR-AI-010, FR-AI-011, FR-KNOW-003, FR-SYNC-002, FR-CAL-004, FR-TASK-013; roadmap M0, M4, M7–M11.
**Context:** The hosted runtime (ADR-018) has 512 MB RAM, no GPU, an ephemeral disk, sleeps when idle, and no always-on PC with Ollama.
**Decision (owner answers 2026-11-13):**
1. **AI is opt-in cloud.** `ai_external_enabled` stays **false by default** (doc 06 §6 unchanged). When the owner enables it, Groq → Gemini (→ NVIDIA) free tiers serve chat/JSON operations through the gateway. Only the text of that request is sent, minimised as in doc 06 §6. With AI off or out of quota, the rules + ML path is used (FR-AI-009). Ollama is a provider for **local/dev mode only**. Constraint "no mandatory cloud AI" holds: nothing requires AI.
2. **Speech-to-text:** **on-device Android speech recognition is primary** (free, private, offline-capable). Groq Whisper is optional when external AI is enabled; audio is forwarded and never stored. faster-whisper is local mode only and is **not** in the hosted image. Web has no voice capture.
3. **Search/RAG:** v1 hosted search is **keyword** (Postgres full-text + pg_trgm). Semantic/pgvector search and fastembed run in local mode. They're enabled in hosted mode only if M7 measures that the embedding model fits the memory budget. SQL-tool answers and the deterministic fallback are unchanged.
4. **Web app = dashboard:** analytics/dashboard, reports & sharing, task lists with simple edits (status, reschedule, title/notes), vault search (read-only), settings (account, devices, categories, AI providers). Not on web: voice capture, timers, full calendar editing, document upload, offline mode. **FR-SYNC-002 (web offline) → C (later); Dexie is not used in v1.** Android is the full client.
5. **Reminders/notifications:** computed and scheduled **on the device** from synced data (expo-notifications). Web shows an in-app list only. The server never pushes.
6. **Files:** evidence = text, links, and images/files ≤ 2 MB (compressed on device), stored in Postgres, total quota 250 MB (configurable, enforced server-side). Vault documents: store extracted text only, discard the original file. Voice audio is never stored in hosted mode. Reports are generated on demand and streamed, not stored.
7. **Heavy jobs** (model training, bulk re-embedding) may run in the nightly GitHub Actions workflow instead of the 512 MB server, if M5/M7 measurements require it. The server does inference only.
8. **Early deployment:** new milestone **M2b — Early hosted deployment**, right after M2, so the owner uses the app daily from M2 on. M11 becomes hardening of that deployment.
**Consequences:** Lower AI quality when AI is off (rules only); semantic search may be absent in hosted mode; web is no longer feature-equal to Android. In exchange: ₹0, private by default, and usable daily from M2. NFR-PERF-003/006/008 targets are measured against the cloud providers when enabled, or documented as N/A when AI is off.

## ADR-021 — Pin Expo SDK 58 and Dependency Justifications (R11)
**Date:** 2026-11-13 · **Status:** Accepted (M0)

### 1. Expo SDK Pin
Current verified stable release is **Expo SDK 58** (`expo@~58.0.25`). Mobile packages in `apps/mobile` pin SDK 58 native modules (`expo-router`, `expo-sqlite`, `expo-secure-store`, `expo-notifications`, `expo-audio`).

### 2. Dependency Justifications (Rule R11)
Each new dependency introduced for M0 and beyond is recorded with license and rationale:
- **`structlog`** (Apache-2.0): High-performance structured JSON logging, redaction processor pipeline, and contextvars correlation. Stdlib `logging` lacks composable filter pipelines and JSON serialization without error-prone custom formatters.
- **`pydantic-settings`** (MIT): Validated configuration and dotenv management. Stdlib `os.environ` lacks type safety, coercion, and schema validation.
- **`import-linter`** (BSD-2-Clause): Enforces architectural layering contracts in CI (specifically AGENTS §7 rule: domain modules import each other only via `service.py`).
- **`openapi-typescript`** (MIT): Generates compile-time TypeScript types directly from FastAPI's OpenAPI JSON schema.
- **`openapi-fetch`** (MIT): Ultra-lightweight (<2 KB), type-safe client wrapping native `fetch` using generated schema types.
- **`pre-commit`** (MIT): Multi-language git hook framework running ruff, eslint, prettier, and gitleaks before commits.
- **`gitleaks`** (MIT): Dedicated, high-speed static secret scanner running in pre-commit and CI.
- **`psutil`** (BSD-3-Clause): Cross-platform process introspection used to measure and verify container idle RSS memory.
- **`vitest`** (MIT) / **`jest`** (MIT): Unit test frameworks for TypeScript packages/web and React Native mobile.
- **`uuidv7`** (MIT): Generates RFC 9562 UUIDv7 identifiers in TypeScript for client-side offline entity creation.
