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
| 006 | Local embeddings with fastembed bge-small (384-dim) | Accepted (planning) — confirm in M4 benchmark |
| 007 | Local STT with faster-whisper | Accepted (planning) — model size from M4 benchmark |
| 008 | Providers via raw httpx against OpenAI-compatible endpoints; native API only inside an adapter when needed | Accepted (planning) |
| 009 | Grounding validator: deadlines/projects only from user text or existing records | Accepted (planning) |
| 010 | Productivity score v1 = 0.5·completion + 0.3·on-time + 0.2·estimate accuracy; no hours term | Accepted (planning) — owner may tune; changes need ADR |
| 011 | Sync: op-log push + server_seq pull + field-level versions + explicit conflict rules | Accepted (planning) |
| 012 | ReportLab (PDF) chosen over WeasyPrint for Windows portability (no system libs) | Accepted (planning) |
| 013 | Tailscale recommended for remote/LAN access in local mode | Accepted (planning) |
| 014 | Shared TS packages; API client generated from OpenAPI, never hand-written | Accepted (planning) |
| 015 | Uncategorised items treated as personal for sharing (conservative) | Accepted (planning) |
| 016 | Additional tables beyond spec list (devices, refresh_tokens, tags, task_tags, task_dependencies, recurrence_rules, ai_extractions, learned_patterns, ml_models, chat_*, report_share_access_log, sync_conflicts, audit_log, jobs) | Accepted (planning) |
| 017 | Local model selection (LLM) | **Pending — M4 hardware benchmark** |
| 018 | Free-cloud provider | **Pending — M11 evaluation** |
| 019 | Provider endpoints/models/free-tier limits as of implementation date | **Pending — M4** |

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
