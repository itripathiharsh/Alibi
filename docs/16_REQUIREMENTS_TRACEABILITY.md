# 16 — Requirements Traceability Matrix

Every requirement ID → milestone → spec section → test location. Tests must carry the ID via `@pytest.mark.req("FR-TASK-001")` (backend) or a `// req: FR-TASK-001` comment / test title tag (TS, Playwright, Maestro).
`scripts/check_traceability.py` parses this table and the test tree; CI fails if a **M** requirement has zero tagged tests.

Status values: ☐ not started · ◐ in progress · ☑ passing (link evidence in IMPLEMENTATION_STATUS).

| Req ID | Summary | P | Milestone | Spec | Test location (planned) | Status |
|---|---|---|---|---|---|---|
| FR-AUTH-001 | Owner account created via CLI `make create-user` or first-run setup screen (only when z… | M | M1 | 12, 04§4.2 | backend/tests/integration/auth/ | ☑ |
| FR-AUTH-002 | Login with email + password (minimum 6 characters); Argon2id hashing | M | M1 | 12, 04§4.2 | backend/tests/unit/test_security.py; backend/tests/integration/test_auth_api.py | ☑ |
| FR-AUTH-003 | Access token (15 min) + rotating refresh token (30 days); refresh-token reuse revokes t… | M | M1 | 12, 04§4.2 | backend/tests/integration/auth/ | ☑ |
| FR-AUTH-004 | Device registration (name, platform) on login; owner can list and revoke devices | M | M1 | 12, 04§4.2 | backend/tests/integration/auth/ | ☑ |
| FR-AUTH-005 | Password change invalidates all refresh tokens except current | M | M1 | 12, 04§4.2 | backend/tests/integration/auth/ | ☑ |
| FR-AUTH-006 | Login rate limiting (5 failures / 15 min / IP+email) | M | M1 | 12, 04§4.2 | backend/tests/integration/auth/ | ☑ |
| FR-AUTH-007 | Rate-limited public signup creates isolated user, workspace and system categories; duplicate email rejected | M | M13 | 12, 04§4.2 | backend/tests/integration/test_auth_api.py; tests/e2e/web + mobile | ☐ |
| FR-ORG-001 | Create an organization with owner role, separate from personal record ownership | M | M13 | 02§8, 03§3.1, 04§4.18 | backend/tests/integration/organizations/ | ☐ |
| FR-ORG-002 | Owner creates expiring/revocable member or team-lead invitation links | M | M13 | 03§3.1, 04§4.18, 12§5 | backend/tests/security/organizations/ | ☐ |
| FR-ORG-003 | Invitation acceptance records versioned professional-only consent; member can revoke | M | M13 | 01§2.1a, 03§3.1, 12§2,5,6 | backend/tests/security/organizations/ + mobile/e2e | ☐ |
| FR-ORG-004 | Role-protected owner/team-lead access to organization members | M | M13 | 02§8, 04§4.18, 12§5 | backend/tests/security/organizations/ | ☐ |
| FR-ORG-005 | SQL-derived organization metrics and activity expose only consented professional records after consent | M | M13 | 10, 12§5,6 | backend/tests/integration/organizations/ + web/e2e | ☐ |
| FR-ORG-006 | Leave/revoke immediately ends organization access and writes an audit event | M | M13 | 03§3.1, 04§4.18, 12§7 | backend/tests/security/organizations/ | ☐ |
| FR-TASK-001 | Create task from free text; task is persisted **immediately** with raw input even befor… | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-002 | Create task from voice: audio → transcript → same pipeline as text; audio retained only… | M | M4 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-003 | Extraction returns: title, category, project, deadline, priority, estimate, subtasks — … | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-004 | Fields without grounding stay `null` or produce a clarification question; deadlines/pro… | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-005 | Confirm sheet: user reviews extracted fields and saves in ≤1 tap when correct | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-006 | Default categories Professional, Academic, Personal, Learning (each with sharing class)… | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-007 | Custom tags (many-to-many) | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-008 | Views: Today, Upcoming, Backlog, Completed (definitions in §4) | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-009 | Statuses: pending, in_progress, completed, cancelled with valid transitions (§4) | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-010 | Fields: priority, deadline, estimate (user/AI/final), actual time, started/completed ti… | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-011 | Reschedule (change deadline or planned block) with reason; increments reschedule count;… | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-012 | Subtasks: add, reorder, complete; parent progress shown | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-013 | Attachments/evidence: file upload, link, text; hosted limits 2 MB / 250 MB (ADR-020) | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-014 | Task origin recorded: manual, voice, ai_recommendation, meeting, external_assignment, r… | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-015 | Activity history: every state change is an append-only `task_events` row, viewable per … | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-016 | Time tracking: start/stop timer and manual time entries; actual time = sum of entries | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-021 | Independent per-task timers; different tasks may run concurrently, same-task duplicate timer rejected | M | M13 | 03§3.3, 04§4.5 | backend/tests/unit/test_time_tracking.py; mobile tasks screen | ◐ |
| FR-TASK-017 | Task dependencies (blocked-by) | S | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-018 | Recurring responsibilities via RRULE; instances generated ahead (14 days) | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-019 | Search and filter tasks by text, category, project, tag, status, date | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-TASK-020 | Soft delete with 30-day restore; hard delete from trash | M | M2 | 03§3.3, 04§4.4 | backend/tests/integration/tasks/ + tests/e2e/web/tasks + tests/e2e/mobile/tasks | ☑ |
| FR-CAL-001 | Internal calendar: day and week views | M | M8 | 09, 04§4.8 | backend/tests/integration/calendar/ + e2e | ☑ |
| FR-CAL-002 | Event kinds visually distinct: deadline marker, work block, fixed event, actual time (l… | M | M8 | 09, 04§4.8 | backend/tests/integration/calendar/ + e2e | ☑ |
| FR-CAL-003 | Fixed events incl. recurring (RRULE + exceptions) | M | M6 (model) / M8 (UI) | 09, 04§4.8 | backend/tests/integration/calendar/ + e2e | ☑ |
| FR-CAL-004 | Reminders scheduled on-device (Android); in-app list on web (ADR-020) | M | M8 | 09, 04§4.8 | backend/tests/integration/calendar/ + e2e | ☑ |
| FR-CAL-005 | Conflict detection: overlapping blocks/events, over-capacity days, deadline before plan… | M | M6/M8 | 09, 04§4.8 | backend/tests/integration/calendar/ + e2e | ☑ |
| FR-CAL-006 | Availability computation from working hours − fixed events − accepted blocks | M | M6 | 09, 04§4.8 | backend/tests/integration/calendar/ + e2e | ☑ |
| FR-CAL-007 | Drag/move work blocks manually (owner action, never AI) | S | M8 | 09, 04§4.8 | backend/tests/integration/calendar/ + e2e | ☑ |
| FR-CAL-008 | One-way import from Google Calendar (ICS URL or OAuth) | C | M8 | 09, 04§4.8 | backend/tests/integration/calendar/ + e2e | ☑ |
| FR-CAL-009 | Local two-hour check-in reminder per active task timer; cancellation follows that timer | M | M13 | 04§4.5, ADR-025 | apps/mobile/src/lib/timer-reminders.ts | ◐ |
| FR-DASH-001 | Periods: daily, weekly, monthly, custom range (Asia/Kolkata day boundaries) | M | M3 | 10 | backend/tests/unit/analytics/ + integration/analytics/ | ☑ |
| FR-DASH-002 | Metrics: productivity score, total time, completed, pending, overdue, completion rate, … | M | M3 | 10 | backend/tests/unit/analytics/ + integration/analytics/ | ☑ |
| FR-DASH-003 | Charts: completion, productivity trend, time distribution, daily timeline, consistency … | M | M3 | 10 | backend/tests/unit/analytics/ + integration/analytics/ | ☑ |
| FR-DASH-004 | Every metric computed from DB records via documented formulas (doc 10) | M | M3 | 10 | backend/tests/unit/analytics/ + integration/analytics/ | ☑ |
| FR-DASH-005 | Productivity score transparent: UI shows components and formula; no reward for long hou… | M | M3 | 10 | backend/tests/unit/analytics/ + integration/analytics/ | ☑ |
| FR-DASH-006 | Metrics with insufficient data show "Not enough data" instead of 0 | M | M3 | 10 | backend/tests/unit/analytics/ + integration/analytics/ | ☑ |
| FR-DASH-007 | Per-task recorded time and score plus 365-day activity heatmap | M | M13 | 10, 04§4.10 | backend/tests/unit/test_task_score.py; backend/tests/integration/test_analytics_api.py; mobile Tasks work log (`time-entries?task_id`) | ◐ |
| FR-LEARN-001 | Behavioural event collector records all learning signals (doc 07 §2) | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-002 | Routine discovery distinguishes routines from bursts | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-003 | Task understanding: likely category, project, similar tasks, duration, priority, depend… | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-004 | Duration learning with prediction interval and confidence | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-005 | Behavioural learning: preferred work periods, postponement patterns, interruptions, ses… | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-006 | Workload understanding: capacity vs commitments | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-007 | Every pattern stores supporting observations, sample count, confidence, last observed, … | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-008 | Maturity levels: rule-based → statistical → ML, gated by data thresholds | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-009 | User can view, confirm, dismiss and reset learned patterns | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-010 | No inference of motivation, mood, health or psychological state | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-LEARN-011 | Offline evaluation harness with metrics (doc 07 §8) | M | M5 | 07 | backend/tests/unit/learning/ + learning_eval/ | ☑ |
| FR-SCHED-001 | Generate schedule proposal for a task or a horizon (default 7 days) using OR-Tools CP-SAT | M | M6 | 09 | backend/tests/unit/scheduling/ + scheduling_bench/ | ☑ |
| FR-SCHED-002 | Hard constraints: fixed events immovable; accepted blocks not displaced silently; deadl… | M | M6 | 09 | backend/tests/unit/scheduling/ + scheduling_bench/ | ☑ |
| FR-SCHED-003 | Explanation per block (deterministic reasons; LLM only rephrases) | M | M6 | 09 | backend/tests/unit/scheduling/ + scheduling_bench/ | ☑ |
| FR-SCHED-004 | All schedule changes require approval (accept all / accept some / reject) | M | M6 | 09 | backend/tests/unit/scheduling/ + scheduling_bench/ | ☑ |
| FR-SCHED-005 | Infeasibility reported with the reason (e.g. "needs 6h, only 3.5h free before deadline") | M | M6 | 09 | backend/tests/unit/scheduling/ + scheduling_bench/ | ☑ |
| FR-SCHED-006 | Auto-classification only when confidence ≥ threshold (configurable, default 0.85) | M | M6 | 09 | backend/tests/unit/scheduling/ + scheduling_bench/ | ☑ |
| FR-SCHED-007 | Configurable auto-scheduling for low-risk recurring tasks (off by default) | C | M6 | 09 | backend/tests/unit/scheduling/ + scheduling_bench/ | ☑ |
| FR-AI-001 | Providers: Ollama, NVIDIA NIM, Gemini, Groq via adapters behind one interface | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-002 | Configurable routing per operation + fallback order | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-003 | Structured output validation (Pydantic) with one repair retry | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-004 | Timeouts, retries with backoff, circuit breaker, health status | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-005 | Usage tracking: tokens, latency, status, estimated cost | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-006 | Settings: add keys, choose models, test connection, set defaults, fallback order, disab… | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-007 | Keys encrypted at rest, never returned by API, never logged | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-008 | Quota exhaustion detection (HTTP 429/quota errors) → cooldown + fallback | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-009 | Core features work with all AI disabled | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-010 | STT: on-device Android primary; Groq Whisper opt-in; faster-whisper local mode (ADR-020) | M | M4 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-AI-011 | Embeddings in-process, never external; hosted per M7 memory check (ADR-020) | M | M4/M7 | 06 | backend/tests/unit/ai/ + ai_eval/ | ☑ |
| FR-RAG-001 | Chat assistant in AI Intelligence section | M | M7 | 08 | backend/tests/rag_eval/ + integration/rag/ | ☑ |
| FR-RAG-002 | Hybrid retrieval: SQL (structured intents) + pgvector + metadata filters (date/category… | M | M7 | 08 | backend/tests/rag_eval/ + integration/rag/ | ☑ |
| FR-RAG-003 | Answers cite sources (task/note/log IDs, clickable) | M | M7 | 08 | backend/tests/rag_eval/ + integration/rag/ | ☑ |
| FR-RAG-004 | Numbers in answers come from SQL tool results only | M | M7 | 08 | backend/tests/rag_eval/ + integration/rag/ | ☑ |
| FR-RAG-005 | "I don't have records for that" when retrieval is empty/insufficient | M | M7 | 08 | backend/tests/rag_eval/ + integration/rag/ | ☑ |
| FR-RAG-006 | Conversation history kept per thread; deletable | S | M7 | 08 | backend/tests/rag_eval/ + integration/rag/ | ☑ |
| FR-KNOW-001 | Vault auto-ingests task descriptions, completion notes, work logs, project notes, meeti… | M | M7 | 08 | backend/tests/integration/knowledge/ | ☑ |
| FR-KNOW-002 | Metadata: date, category, project, task ref, source, privacy class | M | M7 | 08 | backend/tests/integration/knowledge/ | ☑ |
| FR-KNOW-003 | Search UI: keyword everywhere; semantic where embeddings available (ADR-020) | M | M7 | 08 | backend/tests/integration/knowledge/ | ☑ |
| FR-KNOW-004 | Manual plain-text note creation by typing or Android real-time dictation; no rich editor | M | M7 | 08; M13 | backend/tests/integration/knowledge/; Android device review | ◐ |
| FR-KNOW-005 | Upload documents: PDF, DOCX, TXT, MD text extraction | S | M7 | 08 | backend/tests/integration/knowledge/ | ☑ |
| FR-REP-001 | Report types EOD, weekly, monthly, custom | M | M9 | 10 | backend/tests/integration/reports/ | ☑ |
| FR-REP-002 | Contents: period, completed, pending, overdue, projects, time, deliverables, achievemen… | M | M9 | 10 | backend/tests/integration/reports/ | ☑ |
| FR-REP-003 | Facts computed from DB; frozen into a snapshot at generation | M | M9 | 10 | backend/tests/integration/reports/ | ☑ |
| FR-REP-004 | Optional AI narrative validated against facts (no new numbers/entities) | M | M9 | 10 | backend/tests/integration/reports/ | ☑ |
| FR-REP-005 | Export PDF, XLSX, CSV | M | M9 | 10 | backend/tests/integration/reports/ | ☑ |
| FR-SHARE-001 | Secure read-only links (256-bit token, hashed at rest) | M | M9 | 10, 12 | backend/tests/security/sharing/ | ☑ |
| FR-SHARE-002 | Expiry (default 7 days) and revocation | M | M9 | 10, 12 | backend/tests/security/sharing/ | ☑ |
| FR-SHARE-003 | Sharing history + access log | M | M9 | 10, 12 | backend/tests/security/sharing/ | ☑ |
| FR-SHARE-004 | Shared scope = professional only by default; including other classes requires explicit … | M | M9 | 10, 12 | backend/tests/security/sharing/ | ☑ |
| FR-SHARE-005 | Scope enforced in backend when building the shared snapshot | M | M9 | 10, 12 | backend/tests/security/sharing/ | ☑ |
| FR-SHARE-006 | In-app share (Android share sheet / Web Share API / copy link) | M | M9 | 10, 12 | backend/tests/security/sharing/ | ☑ |
| FR-SYNC-001 | Android offline: create tasks, view synced tasks, change status, completion notes, time… | M | M10 | 11 | tests/sync/ + packages/sync-core/test | ☑ |
| FR-SYNC-002 | Web offline (IndexedDB) — deferred, web online-only in v1 (ADR-020) | C | later | 11 | tests/sync/ + packages/sync-core/test | ☑ |
| FR-SYNC-003 | Pending operation queue with idempotent replay | M | M10 | 11 | tests/sync/ + packages/sync-core/test | ☑ |
| FR-SYNC-004 | Pull by server sequence cursor; push by operation batch | M | M10 | 11 | tests/sync/ + packages/sync-core/test | ☑ |
| FR-SYNC-005 | Explicit conflict rules (doc 11 §6); no silent overwrite of newer data | M | M10 | 11 | tests/sync/ + packages/sync-core/test | ☑ |
| FR-SYNC-006 | Conflicts needing a human surface in a "Resolve conflicts" UI | M | M10 | 11 | tests/sync/ + packages/sync-core/test | ☑ |
| FR-SYNC-007 | Sync status visible (synced / pending N / error) | M | M10 | 11 | tests/sync/ + packages/sync-core/test | ☑ |
| FR-SYNC-008 | Voice capture offline: audio queued, transcribed when backend reachable | S | M10 | 11 | tests/sync/ + packages/sync-core/test | ☑ |
| FR-SEC-001 | TLS for any non-localhost traffic | M | M11 | 12 | backend/tests/security/ | ☑ |
| FR-SEC-002 | Audit log for security-relevant actions | M | M1 | 12 | backend/tests/security/ | ☑ |
| FR-SEC-003 | External AI disabled by default; per-category option "never send to external AI" (defau… | M | M4 | 12 | backend/tests/security/ | ☑ |
| FR-DATA-001 | Full data export (JSON + files ZIP) | M | M12 | 12§8 | tests/ops/ + integration/data/ | ☑ |
| FR-DATA-002 | Automated daily DB backup + restore procedure, tested | M | M1 | 12§8 | tests/ops/ + integration/data/ | ☑ |
| FR-DATA-003 | User-controlled deletion: per item, per category, entire account | M | M12 | 12§8 | tests/ops/ + integration/data/ | ☑ |
| FR-NOTIF-001 | Task reminders, deadline approaching (configurable lead), work block start | M | M8 | 15 M8 | backend/tests/integration/notifications/ + e2e mobile | ☑ |
| FR-NOTIF-002 | Daily plan prompt (configurable time) | S | M8 | 15 M8 | backend/tests/integration/notifications/ + e2e mobile | ☑ |
| FR-NOTIF-003 | Quiet hours | S | M8 | 15 M8 | backend/tests/integration/notifications/ + e2e mobile | ☑ |
| NFR-PERF-001 | Task create (text, no AI) API p95 | M | M2–M12 | 14 | tests/perf/ | ☑ |
| NFR-PERF-002 | Task appears in list after save (optimistic) | M | M2–M12 | 14 | tests/perf/ | ☑ |
| NFR-PERF-003 | Extraction with local LLM p95 | M | M2–M12 | 14 | tests/perf/ | ☑ |
| NFR-PERF-004 | Dashboard (monthly, 5k tasks) p95 | M | M2–M12 | 14 | tests/perf/ | ☑ |
| NFR-PERF-005 | Schedule solve, 7-day horizon, 50 tasks | M | M2–M12 | 14 | tests/perf/ | ☑ |
| NFR-PERF-006 | RAG answer p95 (local LLM) | M | M2–M12 | 14 | tests/perf/ | ☑ |
| NFR-PERF-007 | Android cold start to Today view | M | M2–M12 | 14 | tests/perf/ | ☑ |
| NFR-PERF-008 | Voice → confirm sheet | M | M2–M12 | 14 | tests/perf/ | ☑ |
| NFR-REL-001 | Zero data loss across sync scenarios in test matrix | M | M10 | 11 | tests/sync/fuzz | ☑ |
| NFR-REL-002 | Backup restore drill | M | M10 | 11 | tests/sync/fuzz | ☑ |
| NFR-SEC-001 | No high/critical findings from bandit, pip-audit, pnpm audit, gitleaks | 0 | M9/M12 | 12 | backend/tests/security/ | ☑ |
| NFR-A11Y-001 | WCAG 2.2 AA on web; TalkBack labels on Android | M | M12 | 05§6 | tests/e2e/web/a11y + manual | ☑ |
| NFR-COST-001 | Running cost | M | M11 | 13 | ADR review | ☑ |
| NFR-PORT-001 | Runs on Windows/macOS/Linux via Docker; backend also runs without Docker | M | M0/M2b/M11 | 13 | tests/ops/fresh_install | ☑ |
| NFR-MAINT-001 | Backend test coverage | M | all | 14§3 | CI coverage | ☑ |
| NFR-I18N-001 | Date parsing supports Indian conventions (DD/MM), "kal/parso" optional | M | M2 | 06§7 | backend/tests/ai_eval/extraction_golden | ☑ |

Total requirements: 131.

## Spec acceptance table → requirement mapping
| Spec acceptance area | Requirement IDs | Gate milestone |
|---|---|---|
| Task creation | FR-TASK-001, 002, 005 | M2 (text), M4 (voice) |
| Classification | FR-TASK-003/004, FR-LEARN-003 | M4/M5 |
| Task scheduling | FR-SCHED-001..005 | M6 |
| Learning | FR-LEARN-001, 007 | M5 |
| Prediction | FR-LEARN-004, 008 | M5 |
| Dashboard | FR-DASH-002, 004 | M3 |
| Analytics | FR-DASH-001 | M3 |
| RAG | FR-RAG-002..005 | M7 |
| Calendar | FR-CAL-001..006 | M6/M8 |
| Knowledge | FR-KNOW-001..003 | M7 |
| Reports | FR-REP-001..004 | M9 |
| PDF | FR-REP-005 | M9 |
| Sharing | FR-SHARE-001..005 | M9 |
| Offline | FR-SYNC-001 | M10 |
| Sync | FR-SYNC-003..006, NFR-REL-001 | M10 |
| AI gateway | FR-AI-002..004, 008 | M4 |
| Local mode | FR-AI-009, NFR-PORT-001 | M4/M12 |
