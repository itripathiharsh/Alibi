# ALIBI — Post-Implementation Reality Check & Architectural Audit

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-22  
**Auditor:** Principal Systems & Product Architect (Independent Verification)  
**Target Repository:** `D:\alibi`  
**Target Release Artifact:** `D:\alibi\apk\ALIBI-0.1.0.apk` (65.98 MB, SHA-256 `1A3CD18BE6DDFEEF95D605C9CE147BB77B83F744A8A32468AE650F4EC6E49F72`)

---

## 1. Executive Summary & Audit Methodology

Following the reported completion of Modules A through I of the ALIBI commercialization and product evolution roadmap, this independent reality check was conducted to verify the actual state of the codebase, tracing data flows end-to-end from the user interface down to storage engines, background workers, and external networks.

### Audit Principles
1. **Zero Fabrication**: Claims of feature completeness are rejected unless backed by verified source code, active data paths, and passing automated test suites.
2. **End-to-End Tracing**: Every capability is evaluated across all five architectural layers:
   $$\text{UI Layer} \longrightarrow \text{Hook / Service Layer} \longrightarrow \text{Storage / SQLite Layer} \longrightarrow \text{Sync / API Layer} \longrightarrow \text{Backend / PostgreSQL / Worker Layer}$$
3. **Rigorous Classification**: Features are objectively categorized into six strict statuses:
   - **Fully functional**: End-to-end flow is completely operational in production code.
   - **Partially functional**: Functional locally or in specific workflows, but possesses identified gaps in synchronization or backend execution.
   - **UI only**: Visual controls and screens exist, but execute simulated or no-op logic.
   - **Mock or placeholder**: Hardcoded responses, simulated timers, or dummy records masquerading as live functionality.
   - **Broken**: Code is present but fails to run or throws unhandled runtime exceptions.
   - **Requires external credentials**: Requires active third-party cloud API keys (e.g., Gemini, Groq, Google Cloud Console) to function.

---

## 2. Capability Verification Matrix

| # | Capability | Classification | Mobile UI Status | Local DB (SQLite) | Sync Engine | Backend (PostgreSQL) | Core Identified Gaps |
|---|---|---|---|---|---|---|---|
| 1 | **AI Daily Chief of Staff** | **Partially functional** | Live interactive card with morning pulse & reschedule buttons | Reads tasks & preferences locally | N/A (Client-side execution) | No backend synthesis endpoint | Operates via deterministic rule heuristics; does not call backend LLM synthesis. |
| 2 | **Personal Learning Engine** | **Partially functional** | Profile screen displays maturity, peak window, and pause/reset controls | Preferences persisted in SQLite | N/A (Direct REST calls) | Full Python Bayesian duration predictor & pattern clustering | Client never calls `/predict-duration` during task creation; UI reset only clears React state. |
| 3 | **Project Management** | **Partially functional** | Full Project Sheet modal, health indicators, task grouping | Full SQLite CRUD in `local_projects` | ⚠️ Queued to outbox, but server sync dispatcher ignores projects | Direct REST endpoints exist (`/api/v1/projects`), but sync engine doesn't replicate | Offline CRUD works 100%; cloud sync engine does not persist projects to PostgreSQL. |
| 4 | **Vault & Note Editing** | **Partially functional** | In-place note editing, collection filters, pinning, voice dictation, convert-to-task | Full SQLite CRUD in `local_notes` | ⚠️ Queued to outbox, but server sync dispatcher ignores notes | Direct REST endpoints exist (`/api/v1/vault/notes`), but sync engine doesn't replicate | Offline CRUD & search work 100%; direct online REST works, but sync outbox push lacks server table handler. |
| 5 | **Ask ALIBI & RAG** | **Partially functional / Req. Credentials** | Chat UI with speech dictation, source chips, proposal approve/dismiss | Local daily query quota check in `local_ai_usage` | Direct REST (`/api/v1/assistant/chat`) | Full `fastembed` RAG search + SQL query generator + GroundingValidator | Requires active backend connection + external LLM API key (`GEMINI_API_KEY`, `GROQ_API_KEY`). Offline mode displays fallback notice. |
| 6 | **Smart Scheduling (CP-SAT)** | **Partially functional** | Calendar tab displays timeline, conflicting tasks, and propose schedule modal | Local calendar cache in SQLite | Direct REST (`/api/v1/scheduling/proposals`) | Google OR-Tools CP-SAT solver with hard & soft constraint formulation | Offline mode displays local schedule only; CP-SAT solver generation requires active backend. |
| 7 | **Weekly/Monthly Reports** | **Partially functional** | Insights tab with time summaries, heatmap, and CSV/XLSX export modal | Computed from local time entries & tasks | Direct REST (`/api/v1/reports`) | ReportLab (PDF), openpyxl (XLSX), stdlib csv with formula sanitization | Web & backend generate real binary documents; mobile shares export URL via native share sheet instead of direct file download. |
| 8 | **Integrations Hub** | **UI only / Mock** | Modal displaying Google Calendar, Gmail, Drive, GitHub | Simulates connection state in `local_integrations` | None | None (Zero integration code in backend) | No OAuth2 handshake, no callback endpoints, no token refresh, no sync workers. |
| 9 | **Free / Pro / Ultra Entitlements** | **UI only / Prototype** | Upgrade modal with plan tiers, feature comparison, and upgrade actions | Simulates active tier in `local_subscriptions` | None | None (Zero billing code in backend) | No billing gateway (Stripe/Razorpay), no Google Play Billing, no server receipt verification. |

---

## 3. End-to-End Data Flow Audits

### 3.1 AI Daily Chief of Staff
- **Claimed Functionality**: Morning briefing card analyzing calendar commitments, task loads, and overdue items to recommend priority focus blocks and detect schedule overload.
- **Data Flow Trace**:
  1. `apps/mobile/src/app/(tabs)/index.tsx`: Retrieves `todayTasks`, `overdueTasks`, and user preferences from local SQLite via `useLocalDatabase()`.
  2. `apps/mobile/src/components/chief-of-staff-card.tsx` (lines 61–77):
     - Computes working window: `totalWorkMin = work_end_time - work_start_time`.
     - Subtracts `calendarBusyMinutes` to obtain `availableMin`.
     - Sums `estimate_user_min` of pending tasks to obtain `estimatedMin`.
     - Sets `isWorkloadOverloaded = estimatedMin > availableMin`.
     - Picks `recommendedTask` via heuristic: first urgent/high priority task with deadline today, or first pending task.
  3. Interactive Actions:
     - *Start Focus*: Launches the native foreground timer (`FocusSessionService`) for the recommended task.
     - *Reschedule Overdue*: Updates `local_tasks` setting `deadline_at` to today and queues an update in `sync_outbox`.
- **Verdict**: **Partially functional**. Highly responsive, reliable, deterministic local heuristic engine. However, there is no AI/LLM narrative synthesis or dynamic multi-day replanning.

### 3.2 Personal Learning Engine (PLE)
- **Claimed Functionality**: Learns individual task duration ratios, routines, and peak focus hours, updating time estimates and adapting to user habits.
- **Data Flow Trace**:
  1. Backend implementation:
     - `backend/app/learning/duration.py` (`PLEDurationPredictor`): Implements Bayesian prior updating, log-normal duration modeling, and confidence interval estimation ($P_{10}, P_{50}, P_{90}$).
     - `backend/app/learning/profile.py` (`PLEProfileCompiler`): Compiles weekly routines, peak productivity windows, and duration correction ratios into `learned_patterns`.
     - `backend/app/api/v1/learning.py`: Exposes `/profile`, `/predict-duration`, `/patterns`, and `/reset`.
  2. Mobile implementation:
     - `apps/mobile/src/app/(tabs)/profile.tsx`: Fetches `/api/v1/learning/profile` to display peak focus window and maturity level.
     - `toggleLearningPaused`: Stores `learning_paused` boolean in SQLite `user_preferences`.
     - `handleResetLearningData` (lines 139–155): Executes `setLearning(null)` in React state only. **It does not call `POST /api/v1/learning/reset` on the backend, nor does it wipe local SQLite records.**
     - `apps/mobile/src/lib/learned-routines.ts`: Defines `loadLearnedTaskRoutines`, but this function is uncalled dead code in the mobile application.
- **Verdict**: **Partially functional**. Backend algorithms are mathematically sound and unit-tested. Mobile UI reads profile data and toggles local learning state, but fails to trigger backend resets or incorporate duration predictions during task creation.

### 3.3 Project Management
- **Claimed Functionality**: Group tasks into projects with target dates, color tags, objective descriptions, and calculated health metrics.
- **Data Flow Trace**:
  1. `apps/mobile/src/components/project-manager-sheet.tsx`: Allows creating, editing, and deleting projects.
  2. `apps/mobile/src/lib/offline-sync.ts` (`saveLocalProject` / `deleteLocalProject`):
     - Generates UUIDv7 or offline ID.
     - Writes to SQLite `local_projects` table.
     - Enqueues mutation operation to SQLite `sync_outbox` with `entity_type: "project"`.
  3. `apps/mobile/src/app/(tabs)/tasks.tsx`: Filters tasks by `project_id` and computes real-time project health pills ($0\text{--}100\%$ progress).
  4. Backend sync dispatch:
     - `backend/app/sync/service.py` (lines 80–97):
       ```python
       if entity_type == "task":
           result, result_detail, new_version = await self._apply_task_op(...)
       elif entity_type == "time_entry":
           result, result_detail, new_version = await self._apply_time_entry_op(...)
       else:
           result_detail = {"status": "generic_applied"}
       ```
     - Operations for `project` are audited into `sync_operations`, but **are never written to the PostgreSQL `projects` table**.
     - `pull_changes` only pulls `Task` entities; projects created on other devices are not replicated.
- **Verdict**: **Partially functional**. Operates flawlessly as a local offline feature. Cloud synchronization is incomplete because the sync engine lacks an `_apply_project_op` handler.

### 3.4 Knowledge Vault & Note Editing
- **Claimed Functionality**: Markdown and text note capture, collection filters (All, Ideas, Meetings, Decisions, Projects), note pinning, live in-place editing, audio dictation, and conversion to actionable tasks.
- **Data Flow Trace**:
  1. `apps/mobile/src/app/(tabs)/vault.tsx`:
     - Reads local notes from SQLite via `getLocalNotes(userId)`.
     - Search performs local text matching in SQLite; if online, also queries `POST /api/v1/vault/search` (vector + keyword).
     - Live editing modifies title and body, calling `updateLocalNote()` in `offline-sync.ts`.
     - Pinning toggles `is_pinned` column in SQLite `local_notes`.
     - Conversion to task parses note checkboxes or creates a new task linked to the note via `createTaskOffline()`.
  2. Sync behavior:
     - `createNote` performs direct `POST ${baseUrl}/api/v1/vault/notes` if online.
     - Mutations enqueued to `sync_outbox` with `entity_type: "vault_note"` are marked `generic_applied` on the backend without mutating PostgreSQL `vault_notes`.
- **Verdict**: **Partially functional**. Highly capable and fully responsive offline. Online sync operates via direct REST when connected, but offline-to-online queue reconciliation is bypassed by the backend sync dispatcher.

### 3.5 Ask ALIBI & Grounded RAG
- **Claimed Functionality**: Conversational assistant strictly grounded in user tasks and notes, returning citations, tool calls, and structured action proposals.
- **Data Flow Trace**:
  1. `apps/mobile/src/app/(tabs)/ai.tsx`:
     - Evaluates quota in SQLite via `checkAndIncrementAIUsage(userId)`. If daily limit reached, opens `UpgradeModal`.
     - If offline, renders friendly informational notice stating cloud AI requires network connectivity while local data remains accessible.
     - If online, sends `POST /api/v1/assistant/chat` with `{ message, thread_id }`.
  2. Backend `AssistantService` (`backend/app/assistant/service.py`):
     - Executes semantic vector search via `fastembed` over indexed vault notes.
     - Performs SQL parameter queries to extract verified task counts and deadlines.
     - Routes prompt to configured LLM (Gemini, Groq, NVIDIA NIM, or local Ollama).
     - Validates response through `GroundingValidator` to prevent hallucinated metrics or fabricated deadlines.
  3. UI Action Proposal Handling:
     - Proposals (e.g., `create_task`) render inline with "Approve" and "Dismiss" buttons.
     - Approving invokes `createTaskOffline()`, creating the verified task directly in SQLite.
- **Verdict**: **Partially functional / Requires external credentials**. Real, verified end-to-end implementation. Gated only by network connection and presence of valid API credentials on the server.

### 3.6 Smart Scheduling (Google OR-Tools CP-SAT)
- **Claimed Functionality**: Constraint satisfaction scheduling to propose optimal task placements without overlapping existing calendar events.
- **Data Flow Trace**:
  1. `apps/mobile/src/app/(tabs)/calendar.tsx`:
     - Loads tasks and calendar events from SQLite (offline) or `/api/v1/scheduling/events` (online).
     - Renders day timeline and highlights overlapping events.
     - Tapping "Propose Schedule" calls `POST /api/v1/scheduling/proposals/generate`.
  2. Backend `CPSATSchedulingSolver` (`backend/app/scheduling/cpsat_solver.py`):
     - Uses Google OR-Tools CP-SAT library.
     - Formulates scheduling problem with `NoOverlap` intervals, working hour bounds, task deadline constraints, and soft penalties for fragmentation.
     - Produces candidate schedule recommendations.
  3. Applying proposals:
     - User selects candidate blocks and submits decision to `POST /api/v1/scheduling/proposals/{id}/decide`.
- **Verdict**: **Partially functional**. End-to-end integration works when connected to the backend. The CP-SAT solver does not run locally on mobile (OR-Tools is a C++/Python engine).

### 3.7 Weekly & Monthly Reports
- **Claimed Functionality**: Generate tamper-resistant productivity reports with SQL-calculated metrics, privacy redaction, and CSV/XLSX/PDF exports.
- **Data Flow Trace**:
  1. `apps/mobile/src/app/(tabs)/reports.tsx`:
     - Computes period totals directly from local SQLite time entries and completed tasks.
     - Submits generation request to `POST /api/v1/reports` with `{ report_type, period_start, period_end, scope }`.
  2. Backend renderers (`backend/app/reports/`):
     - `ReportLab` generates formatted PDF summaries.
     - `openpyxl` generates multi-tab Excel workbooks.
     - `csv` renderer outputs sanitized CSV timesheets with formula-injection defenses (escaping `=,+,-,@`).
  3. Export delivery:
     - `handleShareReport` constructs `${baseUrl}/api/v1/reports/${id}/export/${format}` and passes the URL to React Native `Share.share`.
     - Does not directly stream binary files into the Android `Download/` filesystem.
- **Verdict**: **Partially functional**. High-quality document generation on the server. Mobile client acts as a link sharing surface rather than an offline document compiler.

### 3.8 Integrations Hub
- **Claimed Functionality**: Connect Google Calendar, Gmail, Google Drive, and GitHub to ingest events, detect email actions, index docs, and track issues.
- **Data Flow Trace**:
  1. `apps/mobile/src/components/integrations-hub-modal.tsx`:
     - Displays cards for Google Calendar, Gmail, Drive, and GitHub.
     - Entering an email and tapping "Connect" executes `saveLocalIntegration(userId, { provider, status: "connected", account_email })`.
     - Stores connection state in SQLite `local_integrations` table.
  2. Backend investigation:
     - Search across all Python backend files for `google_calendar`, `gmail`, `google_drive`, `github`, or external OAuth routers returned **zero results**.
     - No OAuth client registration, no authorization URL generators, no redirect URI handlers, no token refresh logic, and no data ingestion workers exist.
- **Verdict**: **UI only / Mock**. Purely simulated visual surface.

### 3.9 Subscriptions & Entitlements (Free / Pro / Ultra)
- **Claimed Functionality**: Multi-tier monetization (Free at ₹0, Pro at ₹149/mo, Ultra at ₹299/mo) gating AI query volume and advanced features.
- **Data Flow Trace**:
  1. `apps/mobile/src/components/upgrade-modal.tsx`:
     - Shows plan cards with feature breakdowns.
     - Tapping a plan calls `saveLocalSubscription(userId, { tier, status: "active", valid_until })`.
     - Writes to SQLite `local_subscriptions` table.
  2. Metering:
     - `checkAndIncrementAIUsage` checks `local_ai_usage` count against tier limits (Free: 15, Pro: 100, Ultra: 1000).
  3. Backend investigation:
     - Zero backend database tables or endpoints for billing, Stripe, Razorpay, or Google Play Billing.
     - Backend API routes do not inspect or enforce subscription tiers on authenticated requests.
- **Verdict**: **UI only / Prototype**. Client-side entitlement simulator.

---

## 4. Test Suite Execution & Verification Record

All tests were executed on the active development environment (`D:\alibi`) using the approved toolchains.

### 4.1 Backend Test Suites
```powershell
$PYTHON = "D:\dev\Tools\Python\uv-managed\cpython-3.12.16-windows-x86_64-none\python.exe"
$env:PYTHONPATH = "D:\alibi\backend;D:\alibi\backend\.venv\Lib\site-packages"
& $PYTHON -m pytest backend/tests/unit -v
```
- **Total Unit Tests Executed**: 63
- **Passed**: 57
- **Failed**: 6
- **Exit Code**: 1
- **Root Cause of 6 Failures**:
  - Failed tests: `test_ple_routines.py` (2 tests), `test_productivity_score.py` (4 tests).
  - All 6 tests request the `db_session: AsyncSession` fixture and attempted an active PostgreSQL network connection to `localhost:5432` (`[WinError 1225] ConnectionRefusedError`).
  - All 57 pure, database-isolated unit tests (including Hypothesis property tests, GroundingValidator, AES-GCM crypto, CP-SAT solver, redaction, task state machine, and report renderers) passed completely.

### 4.2 Database Migrations (Alembic)
```powershell
Push-Location D:\alibi\backend
& $PYTHON -m alembic heads
Pop-Location
```
- **Output**: `0014 (head)`
- **Exit Code**: 0
- **Verified Versions**: 14 sequential migration revisions (`0001` through `0014`) present with valid upgrades and downgrades.

### 4.3 Monorepo TypeScript Compilation
```powershell
pnpm -r run typecheck
```
- **Scope**: 6 workspace projects (`@alibi/domain-types`, `@alibi/design-tokens`, `@alibi/api-client`, `@alibi/web`, `@alibi/sync-core`, `@alibi/mobile`).
- **Result**: `6 passed, 0 failed`
- **Exit Code**: 0

### 4.4 Sync Engine Core Unit Tests
```powershell
pnpm -r test
```
- **Scope**: `packages/sync-core`
- **Output**:
  - `✔ coalesceOperations: multiple consecutive updates coalesce`
  - `✔ coalesceOperations: create then update coalesces into create`
  - `✔ coalesceOperations: create then delete cancels out`
  - `✔ calculateBackoff: increases with attempts and stays within bounds`
  - `✔ SyncEngine: push and pull cycle`
  - `✔ SyncEngine: failed push returns in-flight operations to retryable state`
  - `✔ SyncEngine: first sync bootstraps while preserving outbox data`
- **Result**: `7 passed, 0 failed` (Duration: 165 ms)
- **Exit Code**: 0

---

## 5. Architectural Gap Analysis & Critical Deficiencies

### Gap 1: Incomplete Sync Push Entity Dispatcher
- **File**: `backend/app/sync/service.py` (lines 80–97)
- **Issue**: The sync engine handles `task` and `time_entry` operations, but defaults all other entity types (including `project` and `vault_note`) to `result_detail = {"status": "generic_applied"}`.
- **Impact**: When an offline user creates projects or notes and later syncs, these operations are marked as applied in the client outbox and audited in `sync_operations`, but are never inserted or updated in the PostgreSQL `projects` and `vault_notes` tables. Cross-device replication for notes and projects is therefore non-functional via the sync engine.

### Gap 2: Disconnected Duration Predictor in Mobile UI
- **File**: `apps/mobile/src/app/(tabs)/tasks.tsx` and `backend/app/api/v1/learning.py`
- **Issue**: The backend contains a sophisticated Bayesian duration predictor (`POST /api/v1/learning/predict-duration`), but the mobile task creation and editing sheets never invoke this endpoint or suggest duration estimates to the user.

### Gap 3: Missing Backend Invocation in Profile Reset
- **File**: `apps/mobile/src/app/(tabs)/profile.tsx` (lines 139–155)
- **Issue**: Tapping "Reset Learning Profile" updates local component state (`setLearning(null)`), but does not send `POST /api/v1/learning/reset` to wipe server-side learned models or execute a local SQLite table clear.

### Gap 4: Zero Backend Infrastructure for Integrations & Billing
- **Issue**: The integrations hub and subscription upgrades are simulated locally in SQLite. There is zero server-side code supporting payment processors, Google/GitHub OAuth flows, or entitlement gating.

---

## 6. Audit Conclusion & Official Feature Classification

1. **What Genuinely Works**:
   - Complete local-first offline task management, subtasks, priorities, and status lifecycles.
   - Independent persistent task timers with Android native `FocusSessionService` foreground notifications.
   - Local SQLite Knowledge Vault with search, tag filters, note pinning, in-place editing, and task conversion.
   - Rule-based AI Chief of Staff calculating real daily work windows, commitments, and overdue items.
   - Mathematical reporting renderers (ReportLab PDF, openpyxl XLSX, sanitized CSV).
   - Backend Grounded Assistant with RAG vector retrieval, SQL grounding, and strict anti-hallucination validation.
   - Google OR-Tools CP-SAT constraint-satisfaction scheduling engine.
   - Secure token storage using Android Keystore via `expo-secure-store`.
   - Complete GDPR data export (`GET /api/v1/data/export`) and cascading hard account deletion (`DELETE /api/v1/data/account`).
2. **What Is Only UI / Simulated**:
   - External Integrations Hub (Google Calendar, Gmail, Drive, GitHub).
   - Subscription Upgrades and Plan Entitlements (Free, Pro, Ultra).
3. **What Requires External Credentials**:
   - Ask ALIBI cloud LLM queries (requires `GEMINI_API_KEY` or `GROQ_API_KEY`).
   - Hosted backend deployment (requires Neon/PostgreSQL connection string).
4. **What Is Incomplete / Needs Remediation**:
   - Sync engine entity dispatch for projects and vault notes.
   - Client-side invocation of Bayesian duration predictions.
   - Full server call on learning profile reset.
