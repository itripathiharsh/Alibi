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
| 022 | Six-destination Android navigation and reference-led visual refresh | Accepted (owner, 2026-11-17) |
| 023 | Public self-registration and account-level data isolation | Accepted (owner, 2026-11-17) |

---

## ADR-001 — Modular monolith, Postgres-only infrastructure
**Context:** ₹0 budget, single user, local-first, must run on a personal PC.
**Decision:** One FastAPI codebase with `api` and `worker` entrypoints; background jobs in a Postgres `jobs` table with `SKIP LOCKED`; APScheduler for periodic triggers.
**Consequences:** Fewer moving parts and services to host for free. Account provisioning is open to individual users under ADR-023; capacity assumptions must be revisited as adoption grows.

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

**Re-verification (M2b, 2026-11-16):**
- **Render**: 512 MB RAM, sleeps after 15 min, 750 free instance hours/month confirmed (https://render.com/pricing).
- **Neon**: 0.5 GB storage, 100 CU-h/month, scale-to-zero after 5 min, pgvector 0.7+ confirmed (https://neon.tech/pricing).
- **Vercel Hobby**: 100 GB bandwidth, unlimited invocations for non-commercial personal projects confirmed (https://vercel.com/pricing).
- **GitHub Actions**: 2,000 free minutes/month for private repos confirmed (https://github.com/pricing).
All free tier limits remain valid for the ₹0 hosted architecture; account-level usage may grow as self-registration is enabled (ADR-023).

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
- **`uuid6`** (MIT): RFC 9562 UUIDv7 generation for Python 3.12 (standard library `uuid` lacks v7 until 3.14).
- **`tzdata`** (Apache-2.0): IANA time zone database provider required by Python standard library `zoneinfo` on Windows hosts.
- **`pytest-asyncio`** (Apache-2.0): Asynchronous test runner support for FastAPI and asyncpg/SQLAlchemy async sessions.
- **`query-string`** (MIT): URL query parameter parser required by `expo-router` deep link path navigation.
- **`@react-native/assets-registry`** (MIT): React Native runtime asset table registry required by Metro bundler.
- **`invariant`** (MIT): Assertion utility required by React Native AssetSourceResolver for Metro bundle compilation.
- **`argon2-cffi`** (MIT): Industry standard password hashing (Argon2id) specified in doc 12 §2. Python stdlib lacks Argon2id.
- **`pyjwt`** (MIT): Compact, cryptographically validated JWT access tokens (HS256).
- **`cryptography`** (Apache-2.0 / BSD-3-Clause): Authenticated Fernet (AES-128-CBC + HMAC) encryption for provider keys in DB.
- **`expo-secure-store`** (MIT): Android Keystore-backed secure storage for access and refresh tokens on mobile (doc 12 §2). AsyncStorage lacks OS-level hardware-backed encryption.
- **`pgvector`** (PostgreSQL / Apache-2.0): Type-safe asyncpg and SQLAlchemy Vector(384) mapping for vector similarity search in PostgreSQL 16.
- **`openpyxl`** (MIT): Reading and writing Excel .xlsx files with typed cells and frozen headers for tabular report exports (doc 10 §5.3). Python stdlib only supports CSV.
- **`python-dateutil`** (Apache-2.0 / BSD-3-Clause): RFC 5545 RRULE recurrence parsing and evaluation per FR-TASK-018 and doc 04 §4.4; Python stdlib lacks iCalendar recurrence expansion.
- **`dateparser`** (BSD-3-Clause): Multi-locale deterministic natural language date parsing with Indian DMY date preference per FR-TASK-003 and doc 06 §7; stdlib `strptime` requires exact static format strings.
- **`APScheduler`** (MIT): In-process asynchronous periodic triggers for local worker maintenance (recurrence generation and learning-profile refresh), as already selected by ADR-001. The Python standard library has no equivalent asyncio scheduler with coalescing and single-instance controls; this adds no external service.
- **`python-multipart`** (Apache-2.0): Required by FastAPI / Starlette for parsing RFC 7578 multipart/form-data evidence file uploads per doc 04 §4.6.
- **`hypothesis`** (MPL-2.0, dev-only): Property-based testing engine required by AC-M2-5 to prove `actual_min == sum(durations)` across arbitrary randomized sequences of timer actions.
- **`recharts`** (MIT): React SVG charting component library specified in approved stack (AGENTS §3) for analytics dashboard visualizations with accessible data table toggles per doc 05 §3 and doc 10 §4.

## ADR-022 — Six-destination Android navigation and reference-led visual refresh
- Status: Accepted (owner)
- Date: 2026-11-17
- Requirement IDs affected: FR-AUTH-001..005, FR-TASK-001..020, FR-CAL-001..007, FR-DASH-001..006, FR-KNOW-001..004, FR-REP-001..005

### Context
The owner supplied seven Android app screenshots and requested the app's entire design match them. The references use six bottom destinations: Home, Tasks, Calendar, Insights, Vault, and Profile. Existing `docs/05_UI_UX_GUIDELINES.md` prescribed four primary destinations. The owner was asked to resolve that conflict and explicitly chose the six tabs. Screenshot task names, dates, metrics, and profile values are examples and must not become production records.

### Options considered
| Option | Pros | Cons | Cost | Licence |
|--------|------|------|------|---------|
| Retain four destinations | Keeps prior guideline unchanged | Does not match the owner's explicit reference selection | None | N/A |
| Use six mobile destinations; retain four web destinations | Matches Android references; web dashboard scope stays intact | More mobile tabs | None | N/A |

### Decision
Android bottom tabs are Home, Tasks, Calendar, Insights, Vault, Profile, in that order. The grounded assistant remains reachable from Vault. Settings and logout are reachable from Profile. Web retains the four destinations in ADR-020. Use the supplied visual language without copying any sample data. No backend/API/schema, sync, or dependency changes are part of this decision.

### Consequences
Update mobile navigation and UI guidance; keep assistant as a hidden route, reachable through Vault. Validate all values on refreshed screens against existing authenticated API data. This decision does not declare the visual refresh complete.

### Owner approval
Required if on the AGENTS.md ask-first list: no — owner explicitly selected six tabs on 2026-11-17.

## ADR-023 — Public self-registration and account-level data isolation
- Status: Accepted (owner)
- Date: 2026-11-17
- Requirement IDs affected: FR-AUTH-001..007, FR-SEC-001..003, FR-DATA-003
- Supersedes: Single-owner account assumptions in ADR-001, ADR-018 context, docs/01, docs/12, and the prior M13 plan.

### Context
The owner approved allowing multiple people to create their own ALIBI accounts on one server. The database and repositories already carry `user_id` ownership; the auth service and signup UI were still restricted to one initial account.

### Decision
Add unauthenticated `POST /api/v1/auth/signup`. It creates a user with a private default workspace and system categories, uses the existing Argon2id password policy, rejects duplicate emails, records an audit event, and applies an in-process per-IP signup rate limit. Keep `/auth/setup` as first-user bootstrap for compatibility. Web and Android expose signup regardless of whether the server already has users. No email verification or team sharing is added. Protected APIs continue deriving ownership only from the authenticated JWT subject.

### Consequences
No schema migration is needed: users already have unique case-insensitive emails and owned records have `user_id`. Public signup has abuse risk and no email verification; hosted signup requires TLS and the rate limit is per API process. Each account gets independent categories, workspace, tasks, notes, AI settings, reports, and learning data. Share links remain the only cross-account disclosure path and continue to use frozen snapshots and existing share scope rules.

### Owner approval
Owner explicitly selected “Allow multiple self-signups” on 2026-11-17.

## ADR-024 — Organization web portal and consented professional reporting
- Status: Accepted (owner)
- Date: 2026-11-17
- Requirement IDs affected: FR-ORG-001..006, FR-AUTH-007, FR-SHARE-004..005, FR-DASH-001..006
- Supersedes: ADR-020 web dashboard scope; ADR-023 statement that report links are the only cross-account disclosure path.

### Context
The owner changed the web product direction. The public landing pages remain the marketing site. Individuals use Android for the full personal ALIBI experience. Web is for organization owners and team leads to manage members and review professional activity.

### Decision
1. Preserve public landing routes and their content/design.
2. Add organizations, owner/team-lead/member roles, invitation links, and a versioned member consent record. Membership is separate from ownership of personal data.
3. Joining an organization requires explicit consent to share the Professional category. Only consenting members appear in organization views. Members can leave/revoke; live access ends immediately.
4. Managers may see professional task titles/status, dates, project/category labels, time entries, and professional-only productivity metrics. Never expose descriptions, notes, attachments, or any personal, academic, learning, or uncategorized data.
5. All organization metrics are computed from SQL and filtered by both active consent and `sharing_class='professional'` in backend queries. Team leads can only see organizations where their membership role grants access.
6. No parent/guardian access in this change. The consent model should support a future separate scope grant without enabling it now.
7. No new paid service or dependency. Invitations use high-entropy, expiring, revocable links with hashed tokens; delivery is user-managed.

### Consequences
Schema migration and new organization APIs are required. Public organization signups and invitations must not expose existing personal records. This explicitly authorizes sharing only the professional data types listed above, after member acceptance; no historical task data is shared before consent. Landing pages stay unchanged; authenticated web navigation and pages become an organization portal.

### Owner approval
The owner requested this product model on 2026-11-17, including professional-only reporting for owners/team leads and future parent access only on consent.

## ADR-025 — Independent task timers and task-level execution score
- Status: Accepted (owner)
- Date: 2026-11-18
- Requirement IDs affected: FR-TASK-021, FR-CAL-009, FR-DASH-007
- Supersedes: the per-user single-running-timer constraint for active task timers; the overall productivity score formula is unchanged.

### Context
The owner requested concurrent task tracking, independent elapsed time and scores, a two-hour check-in, and a GitHub-style activity graph. The owner explicitly chose a separate per-task score rather than changing the existing productivity score.

### Decision
1. Permit at most one active timer per `(user_id, task_id)` while allowing different tasks to run simultaneously. Preserve the legacy `/time-entries/running` response and add `/running/all` for updated clients.
2. Schedule a private Android local notification two hours after each timer starts. Do not include task titles in lock-screen notification text. Stopping a timer cancels only its own reminder. Notification permission is optional and never blocks logging.
3. A completed task's separate execution score averages its available deadline result (100 if on time, else 0) and estimate accuracy (`max(0, 100 × (1 − relative deviation))`). Missing targets are omitted; no available target or an incomplete task yields null. This score does not change the overall productivity score and grants no bonus for more hours.
4. Show period and lifetime time per task and a year of SQL-derived daily activity. Concurrent timer minutes are task effort and can exceed elapsed wall-clock time.
5. Remove repeated server auto-discovery from ordinary mobile startup and page loads; keep explicit discovery in Settings. Signup renders the form without setup-status polling.

### Consequences
Migration 0013 replaces the partial unique index and has a guarded downgrade. The Expo notifications module is already in the approved stack; its SDK-compatible package is added to mobile. A sleeping free Render instance can still delay the first actual API request; this change removes repeated client probes but does not keep the host warm.

### Owner approval
Owner requested concurrent independent timers, two-hour notifications and per-task scoring on 2026-11-18, and selected a separate task score.

## ADR-026 — Android local task cache and outbox recovery
- Status: Accepted as an implementation detail of the owner's 2026-11-18 instruction to fix the audited offline gaps
- Date: 2026-11-18
- Requirement IDs affected: FR-SYNC-001, FR-SYNC-003, FR-SYNC-004, FR-TASK-001, FR-TASK-003, FR-CAL-009

### Context
The whole-app audit found that Android had server sync endpoints and the shared sync engine, but its task screens still relied on direct API requests. Task capture, status changes, cached task views, active local timers and stopped timer sessions therefore did not reliably survive a network outage.

### Decision
1. Use the already-approved `expo-sqlite`, Drizzle, and `@alibi/sync-core` stack to persist account-scoped task views, a task outbox, sync cursor, local timer sessions, and recorded timer history.
2. Keep the existing `/api/v1/sync` operation envelope and conflict rules. Extend current task serialization/validation so task details needed by Android survive a round trip; when an offline stop reuses an online timer ID, finalize the existing open entry exactly once.
3. Cache local and server timers separately so a server refresh cannot discard an in-progress offline timer. Pending local data wins over pulled server data until its operation is resolved.
4. This is a partial Android offline slice: task capture/read/status and task timer history only. Calendar, Vault, voice upload, file uploads, other syncable entities, conflict UI, and full M10 scenarios remain incomplete. Do not mark M10 complete until its own exit gate passes.

### Consequences
No new third-party package or database migration is introduced; these dependencies were already in the approved stack. SQLite tables are created/upgraded locally. Android behavior still requires an emulator/device airplane-mode run before the offline requirement can be marked done.

### Owner authorization
The owner explicitly instructed the agent to finish the outstanding whole-app audit fixes on 2026-11-18. No sync envelope or conflict-rule change is part of this implementation.

## ADR-027 — Personal workflow automation and Vault/task bridge
- Status: Accepted by the owner's explicit “implement it all” instruction on 2026-11-19
- Date: 2026-11-19
- Requirement IDs affected: FR-PROD-001..009, FR-TASK-011, FR-KNOW-001..004

### Context
The owner supplied an end-to-end product evaluation and asked for its individual productivity recommendations to be implemented. The evaluation called for a data-grounded daily kickoff, an optional end-of-day sweep, background focus controls, Android quick capture, PLE-based focus protection, Vault/task links, weekly reflection and small task-list/focus-session improvements.

### Decision
1. Use existing SQL task fields to rank kickoff suggestions. Suggestions stay local draft state until the user confirms their three priorities.
2. End-of-day counts come from SQL in the user's timezone. Tomorrow/backlog/cancel/done are distinct explicit actions; next-workday updates use the existing reschedule service and event history.
3. Use a small Android-native foreground service, widget and Quick Settings tile, with the existing React Native/Expo runtime. Task titles remain hidden in the notification unless the user enables them. Quick capture opens the existing authenticated capture path and uses on-device speech.
4. PLE focus protection is disabled by default. Turning it on is an explicit schedule write based on actual recorded sessions and configured work hours; existing calendar events are skipped. Turning it off deletes only ALIBI-generated focus blocks.
5. Add one account-scoped link table for many-to-many task/note links. Task creation from a note is user-selected; task completion appends the actual task title and timestamp to linked note text and refreshes its local search chunks.
6. Weekly retrospective metrics reuse the existing SQL analytics API; the user's own reflection is saved only on request as a personal Vault note. Batch task actions, haptics and ambient audio use existing APIs/platform capabilities and add no dependency or external service.

### Consequences
Migration 0014 is additive and reversible; no existing user-data columns are dropped or renamed. The sync operation envelope, productivity score formula, external AI routing, and default sharing scope are unchanged. No schedule is altered until the user enables focus protection or chooses an end-of-day action. Android foreground service, widget/tile delivery and audio still require device QA.

### Owner authorization
The owner supplied the evaluation and explicitly instructed “implement it all” and build the APK on 2026-11-19. That instruction authorizes this additive workflow scope and the opt-in focus-block behavior described here.

## ADR-028 — Brain dump, accountability check-ins, recommendations and the Today ring widget
- Status: Accepted by the owner on 2026-11-22 ("build other things as we discussed … with the widget"; the device-only/no-backend idea was explicitly deferred)
- Date: 2026-11-22
- Requirement IDs affected: FR-TASK-022, FR-AI-012, FR-LEARN-012, FR-LEARN-013, FR-NOTIF-004, FR-PROD-010

### Context
The owner asked for (1) a brain dump on the Add Task screen that understands Hinglish and sorts many items by day/week, (2) learning from everything the user does so recommendations start after about a week, (3) free accountability nudges that ask whether work got done, (4) use of their free Groq/Gemini/OpenRouter keys, and (5) a round home-screen widget with a quick-action menu whose options the user can choose. Moving everything onto the phone was discussed and deferred by the owner.

### Decision
1. **Brain dump** (`POST /tasks/brain-dump`, new `BRAIN_DUMP` gateway operation). The LLM only splits items, names them in the user's words and quotes time words. Dates are resolved by the deterministic rules parser from phrases that appear in the text; the day/week bucket is computed in code. With no provider, a deterministic splitter is used. Nothing is saved server-side; the device saves the items the user keeps through the existing offline outbox. The rules parser gained Hinglish phrases (aaj/kal/parso, subah/dopahar/shaam/raat, "N baje", "week ke end tak", "weekend tak").
2. **Cloud AI consent per user** (FR-AI-012). Cloud providers run only when the server switch `AI_EXTERNAL_ENABLED` is on **and** the user turned on smart sorting (`users.settings.cloud_ai_opt_in`, default off). `PUT /ai/config` now changes only the caller's consent; previously any signed-in user could flip the server-wide switch for everyone. The owner may set free-tier keys as server env vars; a user's own saved key takes precedence; a provider the user disabled stays disabled.
3. **OpenRouter** is added as an OpenAI-compatible provider (no new dependency; reuses the Groq adapter). Its free model id is configurable (`OPENROUTER_MODEL`) because free models change. Gemini's default model moves from the retired `gemini-1.5-flash` to `gemini-2.5-flash`. Each server key variable may hold several comma-separated keys (owner request, 2026-11-22, after being told that multiplying free quotas across accounts can break provider terms and risks linked accounts being blocked). Requests rotate across the pool; a key that returns 429 cools down for 60 s and one that returns 401/403 for 10 min while the next key is tried; any other failure moves on to the next provider. Keys are never logged; usage logs and attempts record only a slot number (`gemini#2`).
4. **Signals and recommendations** (FR-LEARN-012/013). Check-in answers, brain-dump review counts and recommendation feedback are stored as `behavior_observations` (no schema change; ids and counts only, never task text). Recommendations unlock after 7 active local days and each needs its own minimum sample; every number is counted from the user's rows. At most three are returned; the app shows one at a time.
5. **Check-ins** (FR-NOTIF-004) run on the device from the local task cache: 15 minutes after an open task's due time, "Did it get done?" with Done / +1 hour / Tomorrow. At most 6 a day, none 22:30–07:30, own channel with private lock-screen visibility, toggle in Settings. Each button is an explicit user action; buttons open the app briefly so the handler always runs (no background-task dependency).
6. **Today ring widget** (FR-PROD-010): native `AppWidgetProvider` drawing done/total for today from a snapshot the app writes to SharedPreferences. Tap opens a translucent quick-action menu (blurred on Android 12+). Long-press cannot be used because launchers reserve it. Users pick up to five actions in a configuration screen (on add for Android ≤11, from widget settings or "Edit actions" on 12+).

### Consequences
No migration, no new dependency, no new hosted service. OpenAPI and the TS client are regenerated. Cloud AI stays off for everyone until both the owner and the user turn it on. Widget counts and check-in scheduling are computed on the device from cached tasks (same trade-off as KI-027). Device QA is still required for the widget, menu, blur and notification buttons.
