# 15 — Implementation Roadmap (M0 – M12)

Each milestone is a vertical, testable increment. **Do not start M(N+1) until M(N)'s exit gate passes** (AGENTS R15).
Format per milestone: Goal · Read first · Entry · Tasks · Acceptance criteria (AC) · QA scope · Exit gate · Risks.

## Sequencing adjustments vs. original spec (recorded as ADR-003…ADR-005)
- **Sync columns from day one:** every syncable table gets `SyncableMixin` in M1/M2 so M10 doesn't retrofit the schema.
- **Android shell starts in M2** (online-only): proves the mobile toolchain early; M10 adds offline + sync.
- **Voice capture lands in M4** with the AI gateway (STT lives there); text capture with rules parser lands in M2.
- **Minimal calendar (fixed events + work blocks) lands in M6** because scheduling needs it; M8 completes calendar UI, recurrence editing, reminders.

```
M0 Env ─ M1 DB/Auth ─ M2 Tasks(+mobile shell) ─ M3 Dashboard ─ M4 AI gateway(+voice) ─ M5 Learning
   ─ M6 Scheduling(+min calendar) ─ M7 RAG/Vault ─ M8 Calendar/Reminders ─ M9 Reports/Sharing
   ─ M10 Offline/Sync ─ M11 Free-cloud ─ M12 Integration/Hardening → v1.0
```

---

## M0 — Environment & architecture
**Goal:** a reproducible monorepo where an empty app builds, tests, lints and runs end-to-end.
**Read first:** AGENTS, 02, 13, 14.
**Entry:** planning pack present.

**Tasks**
1. Inspect environment (`doctor` checks: OS, Docker, Python 3.12, uv, Node 22 LTS, pnpm, Java 17 + Android SDK, Ollama, RAM/CPU/GPU). Write results to `docs/milestones/M0_ENVIRONMENT.md`.
2. Monorepo: `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `backend/` with `uv init`, Makefile targets.
3. Backend skeleton: app factory, config, structlog with redaction, problem+json handlers, `/health/live|ready`, `/api/v1/meta`, `uuid7`, `time` utils, import-linter contracts.
4. Worker skeleton: job loop with `jobs` table placeholder (real table in M1), heartbeat.
5. Web skeleton: Next.js TS strict, Tailwind with tokens from `packages/design-tokens`, 4-tab shell, light/dark.
6. Mobile skeleton: Expo dev build, Expo Router, 4 tabs, theme tokens, builds an APK and runs on emulator/device.
7. OpenAPI generation (`make openapi`) → `packages/api-client` generation (`make client`) + staleness check.
8. Docker compose (postgres pgvector, api, worker, web), `docker-compose.test.yml`.
9. CI workflows (backend, frontend, mobile typecheck, security static).
10. Pre-commit: ruff, gitleaks, eslint, prettier.
11. Docs: DECISIONS ADR-001..005 confirmed, IMPLEMENTATION_STATUS initialised.

**AC**
- AC-M0-1 `make doctor` reports all required tools or clear install hints.
- AC-M0-2 `make up` → `/health/ready` 200 (DB reachable), web shows 4-tab shell, Android app shows 4-tab shell and calls `/api/v1/meta` successfully over LAN.
- AC-M0-3 `make check` green: ruff, mypy strict, import-linter, eslint, tsc, a sample unit test in each package.
- AC-M0-4 CI green on main; gitleaks active (a committed fake secret in a test branch is caught).
- AC-M0-5 Generated TS client compiles; CI fails when backend schema changes without regeneration (demonstrated).
- AC-M0-6 Logs redact `Authorization` header (unit test).

**QA scope:** build reproducibility on a second environment (WSL or VM) following README.
**Exit gate:** all AC + `M0_REPORT.md` + tag `m0-complete`.
**Risks:** Android toolchain on Windows (mitigate: document JDK/SDK paths in doctor); Expo native module versions (pin SDK).

---

## M1 — Database & authentication
**Goal:** schema foundation, migrations, owner account, secure sessions, devices, audit, jobs, backups.
**Read first:** 03, 04 §4.2, 12.
**Tasks**
1. Alembic setup; revisions 0001–0002 (doc 03 §4); `SyncableMixin`, `trg_sync_bump`, append-only trigger function.
2. Repository base enforcing `user_id`.
3. Auth: setup, login, refresh rotation + reuse detection, logout, me, change password, devices list/revoke, rate limiting (in-DB sliding window table or in-memory per process — document choice).
4. User creation seeds 4 system categories + default workspace (service, transactional).
5. Audit log writes.
6. Jobs table + worker claim loop (`SKIP LOCKED`), retries, dead-lettering, dedupe key.
7. Backup/restore scripts + nightly backup job + restore-verify job.
8. Web: setup screen, login, logout, session refresh, settings → account & devices.
9. Mobile: server URL screen, login, secure-store tokens, logout.
10. Categories API + settings UI (rename, sharing class, external-AI flag, custom categories).

**AC**
- AC-M1-1 AC-DB-1, AC-DB-3, AC-DB-4, AC-DB-5 pass.
- AC-M1-2 Setup only possible with zero users (second attempt 403).
- AC-M1-3 Refresh rotation; reuse of old refresh token → 401 `token_reused` and all family tokens revoked (AC-SEC-2).
- AC-M1-4 6th failed login within 15 min → 429.
- AC-M1-5 Argon2id hash in DB; login p95 < 400 ms.
- AC-M1-6 Job processed exactly once with 3 concurrent workers (test); failing job retried with backoff and dead after max attempts.
- AC-M1-7 Backup → drop DB → restore → users/categories identical (AC-SEC-6 initial form).
- AC-M1-8 Web and Android login/logout E2E (Playwright + Maestro).
- AC-M1-9 System categories exist after user creation with correct sharing classes; cannot be deleted (409).

**QA:** auth exploratory (expired tokens, revoked device, wrong server URL on mobile). **Exit gate:** AC + report + tag.
**Risks:** cookie auth across ports in local dev (use Next.js rewrite proxy to `/api`).

---

## M2 — Task management
**Goal:** complete task lifecycle on web and Android (online), text capture with rules-based extraction, time tracking, history.
**Read first:** 01 §2.2/§4, 03 §3.3, 04 §4.3–4.6, 05 §2–3, 06 §7 (rules parser part).
**Tasks**
1. Migration 0003; models/services for tasks, subtasks, tags, dependencies (cycle check), recurrence rules (+ instance generator job, 14 days ahead), task_events (every change), time entries (single running timer), evidence (files/link/text, storage, MIME checks), work_logs.
2. Status machine with transition table; reschedule command; soft delete/restore/purge job.
3. Views Today/Upcoming/Backlog/Completed per business rules (SQL in repository; tz-aware).
4. Rules parser + grounding validator (no LLM yet) → `/tasks/capture` with `ai_extractions` row; confirm/decision endpoint.
5. Search (trigram + filters).
6. Web: capture sheet (text), confirm sheet, task lists (4 views), task detail (all fields, subtasks, timer, evidence, history), search, categories/projects/tags management.
7. Mobile (online): FAB capture, confirm sheet, Today/Upcoming/Backlog/Completed, task detail with timer, complete/reopen.
8. Golden extraction set v1 (≥ 150 lines) and evaluation test (deterministic metrics).

**AC**
- AC-M2-1 Capture persists task with raw input before parsing; parsing failure leaves task intact (FR-TASK-001).
- AC-M2-2 Golden set: deadline exact-match ≥ 95%, fabricated deadline 0, fabricated project 0 (rules path).
- AC-M2-3 All valid transitions succeed, all invalid → 409 (table-driven test over 16 pairs).
- AC-M2-4 Every mutation writes exactly one or more `task_events` with correct diff; history endpoint returns chronological list.
- AC-M2-5 Only one running timer; actual_min = Σ entries after any sequence of start/stop/manual/edit/delete (Hypothesis test).
- AC-M2-6 View membership correct for 30 crafted tasks incl. IST midnight edges.
- AC-M2-7 Dependency cycle rejected (A→B→C→A).
- AC-M2-8 Recurring rule generates instances idempotently (running job twice → no duplicates).
- AC-M2-9 Evidence: disallowed MIME rejected; >25 MB 413; download requires auth.
- AC-M2-10 E2E web: capture → confirm → start timer → complete with note → appears in Completed with actual time. Same on Android (Maestro).
- AC-M2-11 Capture flow ≤ 3 interactions (AC-UI-1).
- AC-M2-12 Task create API p95 < 200 ms (NFR-PERF-001) with 5k tasks in DB.

**QA:** charter 1 (text only), charter 2. **Exit gate:** AC + report + tag.
**Risks:** dateparser edge cases with DMY — expand golden set with owner's real phrasing.

---

## M3 — Dashboard & analytics
**Goal:** all metrics and charts from real data with transparent score.
**Read first:** 10 §1–4, 05 §3.
**Tasks**
1. Analytics service: period resolver (tz), metric queries, score formula v1, insufficient-data logic, `/analytics/*` endpoints, formula endpoint.
2. `docs/analytics_sql/*.sql` reference queries; equivalence tests.
3. Migration 0004: indexes + `mv_daily_task_stats` + refresh job; equality test.
4. Web dashboard: period switcher, score ring + formula sheet, tiles, 7 charts with data-table toggle.
5. Mobile dashboard: tiles, score, 4 key charts (completion, trend, time distribution, est-vs-actual), others link to web or simplified lists.

**AC**
- AC-M3-1 AC-AN-1..3 pass.
- AC-M3-2 Score invariants: hours scaling invariance, reasonable reschedule not penalised, cancelled excluded, null when insufficient.
- AC-M3-3 Daily/weekly/monthly/custom correct incl. midnight-spanning time entries.
- AC-M3-4 NFR-PERF-004: monthly dashboard p95 < 800 ms on 5k tasks/20k time entries (Locust).
- AC-M3-5 Charts render with empty data (empty state) and large data (1 year heatmap) without errors; axe passes.

**QA:** charter 7. **Exit gate:** AC + report + tag.

---

## M4 — AI provider gateway (+ voice)
**Goal:** unified gateway with 4 providers, routing, fallback, validation, settings UI, usage; local STT; LLM-refined extraction; hardware benchmark.
**Read first:** 06, 12 §4, 13 §6.
**Tasks**
1. Run hardware benchmark → choose local LLM, STT size, confirm embedding model → ADR.
2. Migration 0005; encryption utility; provider settings API (keys write-only).
3. Adapters (ollama, nvidia, gemini, groq) with recorded HTTP fixtures; verify current endpoints/models → ADR.
4. Gateway: routing config, privacy filter, retries, cooldown, circuit breaker, repair loop, budgets, usage logs, health.
5. Fake provider for tests (deterministic, fixture-driven).
6. Extraction: integrate LLM refine step into pipeline behind grounding validator; prompt v1 + schema.
7. STT: faster-whisper service in worker/api (model loaded once), `/voice/transcribe`, `/voice/capture`.
8. Web: AI settings page (providers, test, routing order, master switch, usage view); voice capture via MediaRecorder.
9. Mobile: voice capture (expo-audio) → upload → confirm sheet.
10. Embedding service (fastembed) ready for M5/M7.

**AC**
- AC-M4-1 AC-AI-1..7 pass.
- AC-M4-2 Golden set with LLM (nightly, local model): category ≥ 85%, title acceptable ≥ 90%; fabricated deadline/project still 0 (validator).
- AC-M4-3 Voice E2E: recorded fixture audio → task with correct title on web and Android; WER report for owner clips (target ≤ 15% quiet).
- AC-M4-4 NFR-PERF-003 and NFR-PERF-008 met on owner hardware or documented in KNOWN_ISSUES with chosen mitigation (smaller model / cloud route).
- AC-M4-5 With every provider disabled: capture still works (rules path), UI shows "AI unavailable — saved as typed".

**QA:** charter 1 (voice), charter 6. **Exit gate:** AC + benchmark report + report + tag.
**Risks:** free-tier limits change (cooldown logic + local default); CPU-only hosts slow (route extraction to rules-only + async LLM).

---

## M5 — Personal Learning Engine
**Goal:** collector, maturity, understanding, duration, routines, preferences, workload, profile, evaluation harness — all measurable.
**Read first:** 07 (entire), 03 §3.6.
**Tasks**
1. Migration 0006. Collector wired to all domain events (doc 07 §2).
2. Persona generator + historical replay harness + metrics (build **first**, before models).
3. Maturity evaluator; L0/L1 implementations; then L2 models with promotion logic; artefact store in `ml_models`.
4. Routine detector (+ burst rule), preference learner, postponement, session length, interruptions, workload analyzer.
5. Profile compiler + `/learning/*` endpoints.
6. Prediction integration: capture confirm sheet shows category/project/duration predictions with confidence + similar tasks; feedback recorded.
7. AI Intelligence → Patterns UI (confirm/dismiss/reset; convert routine to recurrence with approval).
8. Banned vocabulary filter for insight text.

**AC**
- AC-M5-1 AC-PLE-1..10 pass.
- AC-M5-2 Persona metrics meet targets in doc 07 §12; results table in M5 report.
- AC-M5-3 Learning jobs complete within 60 s for 10k tasks on owner hardware.
- AC-M5-4 Predictions endpoint returns maturity level & confidence for every prediction.

**QA:** review patterns on owner's real data (from M2–M4 usage) for nonsense/over-claiming. **Exit gate:** AC + report + tag.
**Risks:** too little real data → rely on persona eval for gating; real-data validation continues in M12 dogfooding.

---

## M6 — Intelligent scheduling (+ minimal calendar)
**Goal:** CP-SAT proposals with explanations and approval flow, respecting fixed events.
**Read first:** 09, 03 §3.4/§3.7, 07 §7–8.
**Tasks**
1. Migration 0007 (calendar_events, schedule_recommendations).
2. Fixed events CRUD (incl. RRULE expansion) + availability + conflict detection services.
3. Input snapshot builder + hash; CP-SAT model; greedy fallback; reason codes.
4. Proposal API + decision apply (transactional, stale check).
5. Optional narrative via gateway with validator.
6. Web: "Plan my day/week", proposal review screen, minimal day/week calendar showing fixed events + blocks.
7. Mobile: "Plan my day" + proposal review + day list of blocks.
8. Property tests + benchmark suite.

**AC**
- AC-M6-1 AC-SCH-1..7 pass.
- AC-M6-2 Accepting a proposal creates exactly the selected blocks; rejecting creates none; observations recorded.
- AC-M6-3 Infeasibility message contains needed vs available minutes.
- AC-M6-4 E2E: create fixed event + 3 tasks with deadlines → plan → review → accept → calendar shows blocks not overlapping event.

**QA:** plan 5 real days on owner data; record acceptance and reasons for rejections. **Exit gate:** AC + benchmark report + tag.

---

## M7 — RAG & Knowledge Vault
**Goal:** auto-ingested vault, hybrid search, grounded assistant with sources.
**Read first:** 08, 06 §6.
**Tasks**
1. Migration 0008; ingestion jobs for all sources; chunking; embedding job; re-embed job.
2. Document text extraction (pdf/docx/txt/md) in worker with timeouts.
3. Vault search API (keyword/semantic/hybrid) + UI (web + mobile).
4. Intent router, SQL tools (reusing analytics service), retriever (RRF), context assembler, answer generation (streaming), validator, deterministic fallback.
5. Chat threads API + UI with source chips.
6. RAG eval world + question set.

**AC**
- AC-M7-1 AC-RAG-1..8 pass.
- AC-M7-2 All 7 spec example questions answered on owner's real data with correct sources (manual check recorded).
- AC-M7-3 Prompt-injection fixture document cannot cause the assistant to output content outside context or alter data.

**QA:** 20 real questions; mark each correct/partially/incorrect; any fabricated fact = S1. **Exit gate:** AC + tag.

---

## M8 — Calendar & reminders
**Goal:** full calendar experience and reliable reminders.
**Read first:** 01 §2.3/§2.12, 05 §3, 03 §3.10.
**Tasks**
1. Migration 0009 (notifications).
2. Calendar UI complete: day/week on web & mobile; legend for 4 kinds; actual-time overlay; manual block move/resize (owner action, logs event); recurring edit scopes (this/following/all).
3. Conflict panel (overlaps, over-capacity days, deadline-before-plan).
4. Notification scheduler service → `/notifications`; Android local notifications via expo-notifications (reschedule on sync/foreground); web in-app + Notification API; quiet hours; daily plan prompt.
5. Optional ICS URL import (C) only if time permits — otherwise KNOWN_ISSUES/backlog.

**AC**
- AC-M8-1 Calendar shows deadline vs work block vs fixed event vs actual time distinctly (visual snapshot + a11y labels).
- AC-M8-2 Recurring event edits with 3 scopes correct (unit tests on expansion with exdates/overrides).
- AC-M8-3 Reminder fires on Android within ±1 min of fire_at with app killed (manual + Maestro where possible); cancelled when task completed.
- AC-M8-4 Conflicts detected for crafted overlap/over-capacity cases.
- AC-M8-5 Quiet hours suppress non-critical notifications.

**QA:** a week of reminders on device; record misses. **Exit gate:** AC + tag.
**Risks:** Android battery optimisation delaying notifications → use exact alarms permission where allowed; document behaviour.

---

## M9 — Reports & sharing
**Goal:** factual reports in 3 formats, safe sharing.
**Read first:** 10 §5–6, 12.
**Tasks**
1. Migration 0010. Fact builder with scope filter in SQL; golden facts tests.
2. Narrative with validator + template fallback.
3. Renderers PDF/XLSX/CSV; storage; download endpoints.
4. Share creation (token once), viewer (server-rendered), expiry, revoke, access log, rate limit.
5. Web + mobile: generate, preview, download, share sheet, shares list & logs.
6. ZAP baseline against share viewer.

**AC**
- AC-M9-1 AC-REP-1..4 pass.
- AC-M9-2 AC-SEC-5 pass via direct HTTP (not via UI).
- AC-M9-3 Token not retrievable after creation; DB holds only hash.
- AC-M9-4 PDF opens in 3 viewers; XLSX in LibreOffice/Excel; CSV injection neutralised.
- AC-M9-5 Expired link 410; access log entries correct.

**QA:** charter 5. **Exit gate:** AC + tag.

---

## M10 — Android offline support & sync
**Goal:** Android works offline; web caches; sync protocol with explicit conflict rules; zero silent data loss.
**Read first:** 11 (entire), 03 §3.10.
**Tasks**
1. Migration 0011 (sync_operations, sync_conflicts, epoch).
2. Server: push (savepoints, idempotency, field-level merge, commands), pull (seq), bootstrap, conflicts API, epoch.
3. `packages/sync-core`: outbox model, coalescing, push/pull loop, backoff, conflict surfacing, storage adapter interface; ≥ 90% coverage.
4. Mobile: Drizzle local schema, migrate UI to read from local DB, outbox writes, background sync, sync indicator, conflicts screen, offline voice capture queue, file upload queue.
5. Web: Dexie adapter, offline read + queued capture/status.
6. Two-client sync harness + scenarios S1–S15 + fuzz.

**AC**
- AC-M10-1 AC-SYNC-1..4 pass.
- AC-M10-2 Manual charter 3 & 4 pass.
- AC-M10-3 App cold start offline to Today < 2.5 s (NFR-PERF-007).
- AC-M10-4 Upgrading app with pending outbox preserves ops (local DB migration test).

**Exit gate:** AC + tag. **Risks:** complexity — build server conflict engine with exhaustive unit tables first; UI last.

---

## M11 — Free-cloud deployment
**Goal:** optional hosted deployment, portable, ₹0.
**Read first:** 13 §7, 12 §3.
**Tasks**
1. Evaluate candidates per criteria table; ADR with evidence (limits checked on provider pages at that date).
2. Production Docker images (non-root, pinned digests), Caddy TLS config, env templates.
3. Deploy; run full E2E against cloud; configure backups off-host (encrypted with age).
4. Migration drill local→cloud→local.
5. Document runbook (`docs/RUNBOOK.md`): deploy, upgrade, rollback, restore, rotate keys.
If no viable free option: ADR stating local+Tailscale as the deployment; milestone passes with AC-DEP-3 and runbook.

**AC:** AC-DEP-1..4, AC-DEP-6; TLS A-grade (testssl.sh or SSL Labs) if public; cold start documented.
**Exit gate:** AC + tag.

---

## M12 — Full integration & testing (hardening → v1.0)
**Goal:** prove the whole system against every requirement; dogfood; fix.
**Tasks**
1. Traceability audit: every M requirement has passing tests (`check_traceability.py` green).
2. Full nightly suite 3 consecutive green nights.
3. Performance pass on all NFR-PERF; fix regressions.
4. Security pass: AC-SEC-1..8, ZAP full baseline, dependency audit, threat-model review.
5. Accessibility pass: axe + manual TalkBack + keyboard.
6. 14-day dogfooding with daily log in `docs/milestones/DOGFOOD_LOG.md`; triage defects.
7. Learning engine validation on real data (duration MdAPE vs user-estimate baseline once L2 reached; otherwise documented).
8. Documentation final pass; README quick start verified on clean machine.
9. Release: tag `v1.0.0`, signed APK, backup.

**AC:** doc 14 §9 release criteria — all.

---

## Cross-milestone checklist (every milestone)
- [ ] `M{N}_PLAN.md` written before coding
- [ ] Migrations + doc 03 updated
- [ ] API spec + client regenerated
- [ ] Tests at all relevant levels; coverage gates
- [ ] Relevant manual QA charters run and recorded
- [ ] Backup/restore drill
- [ ] IMPLEMENTATION_STATUS, KNOWN_ISSUES, DECISIONS updated
- [ ] `M{N}_REPORT.md` from template
- [ ] Tag `m{N}-complete`
