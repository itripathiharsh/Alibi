# 01 — Product Requirements

Source: ALIBI Product & Technical Requirements (owner-approved). This document restates it as **testable, ID'd requirements**.
Every requirement ID appears in `16_REQUIREMENTS_TRACEABILITY.md` with its milestone and tests.

Priority: **M** = must (release-blocking), **S** = should, **C** = could/later.

## 1. Product summary
ALIBI pairs a private personal productivity app for individuals with an organization web portal for owners and team leads.
The Android app captures tasks, schedules work, tracks time and learns the user's patterns. The web portal manages an organization
and reports professional-only activity from members who explicitly consented to join.

Core loop: Capture → Organize → Schedule → Execute → Learn → Analyze → Report.

**Owner amendments 2026-11-17 (ADR-024):** the public marketing/landing pages remain unchanged. The web product is an organization workspace for owners and team leads; individual users use Android for personal ALIBI features. Members join by invitation and explicitly consent to professional activity reporting. Parent access is a future, separately consented capability. AI is opt-in cloud (off by default); Ollama is dev/local only.

### Users
- **Individual account holder** (self-service sign-up): full access to their own data and devices in the Android app.
- **Organization owner**: creates an organization, invites people, manages team-lead access and sees consented professional-only reporting.
- **Team lead**: views professional-only work and SQL-grounded metrics for organization members.
- **Organization member**: uses the Android app for personal ALIBI features and can accept/revoke professional activity sharing for an organization through the invitation/sharing web flow.
- **Service operator**: configures and operates the ALIBI server; has no product-level access to account data through the client.
- **Share recipient** (unauthenticated, link-based): read-only access to one report snapshot, professional scope by default.

### Out of scope for v1 (explicitly)
iOS app; parent/guardian portal (future, explicit consent required); collaborative editing; Notion-like document editor; Google Calendar two-way sync (one-way import is **C**);
email/Slack integrations; payments; push notifications via a paid service; psychological inference.

## 2. Functional requirements

### 2.1 Authentication & account (AUTH)
| ID | Req | P |
|----|-----|---|
| FR-AUTH-001 | Owner account created via CLI `make create-user` or first-run setup screen (only when zero users exist) | M |
| FR-AUTH-002 | Login with email + password; Argon2id hashing | M |
| FR-AUTH-003 | Access token (15 min) + rotating refresh token (30 days); refresh-token reuse revokes the family | M |
| FR-AUTH-004 | Device registration (name, platform) on login; owner can list and revoke devices | M |
| FR-AUTH-005 | Password change invalidates all refresh tokens except current | M |
| FR-AUTH-006 | Login rate limiting (5 failures / 15 min / IP+email) | M |
| FR-AUTH-007 | Public self-sign-up creates an isolated account, default workspace and system categories; duplicate emails are rejected and signup attempts are rate limited | M |

### 2.1a Organizations & professional reporting (ORG)
| ID | Req | P |
|----|-----|---|
| FR-ORG-001 | An account can create an organization and become its owner; organization membership is separate from personal ownership of records | M |
| FR-ORG-002 | Owners and team leads can create expiring, revocable invitation links for member or team-lead roles | M |
| FR-ORG-003 | A member must explicitly accept professional-only activity sharing before joining; consent is versioned, visible, and revocable | M |
| FR-ORG-004 | Owners and team leads can see only consented members; authorization is enforced by role in the backend | M |
| FR-ORG-005 | Organization dashboards show SQL-derived professional-only productivity score, task activity, time and category breakdowns; exclude personal, academic, learning, uncategorized tasks, notes and attachments | M |
| FR-ORG-006 | Members can leave an organization or revoke consent; access to their live activity ends immediately and the event is audit-logged | M |

### 2.2 Task management (TASK)
| ID | Req | P |
|----|-----|---|
| FR-TASK-001 | Create task from free text; task is persisted **immediately** with raw input even before parsing finishes | M |
| FR-TASK-002 | Create task from voice: audio → transcript → same pipeline as text; audio retained only if user opts in | M |
| FR-TASK-003 | Extraction returns: title, category, project, deadline, priority, estimate, subtasks — each with confidence and grounding evidence | M |
| FR-TASK-004 | Fields without grounding stay `null` or produce a clarification question; deadlines/projects are never invented | M |
| FR-TASK-005 | Confirm sheet: user reviews extracted fields and saves in ≤1 tap when correct | M |
| FR-TASK-006 | Default categories Professional, Academic, Personal, Learning (each with sharing class) + custom categories | M |
| FR-TASK-007 | Custom tags (many-to-many) | M |
| FR-TASK-008 | Views: Today, Upcoming, Backlog, Completed (definitions in §4) | M |
| FR-TASK-009 | Statuses: pending, in_progress, completed, cancelled with valid transitions (§4) | M |
| FR-TASK-010 | Fields: priority, deadline, estimate (user/AI/final), actual time, started/completed timestamps, notes, project, origin | M |
| FR-TASK-011 | Reschedule (change deadline or planned block) with reason; increments reschedule count; logged as event | M |
| FR-TASK-012 | Subtasks: add, reorder, complete; parent progress shown | M |
| FR-TASK-013 | Attachments/evidence: file upload, link, text; completion evidence optional on complete. Hosted: files ≤ 2 MB, 250 MB quota, uploads from Android (ADR-020) | M |
| FR-TASK-014 | Task origin recorded: manual, voice, ai_recommendation, meeting, external_assignment, recurring | M |
| FR-TASK-015 | Activity history: every state change is an append-only `task_events` row, viewable per task | M |
| FR-TASK-016 | Time tracking: start/stop timer and manual time entries; actual time = sum of entries | M |
| FR-TASK-017 | Task dependencies (blocked-by) | S |
| FR-TASK-018 | Recurring responsibilities via RRULE; instances generated ahead (14 days) | M |
| FR-TASK-019 | Search and filter tasks by text, category, project, tag, status, date | M |
| FR-TASK-020 | Soft delete with 30-day restore; hard delete from trash | M |

### 2.3 Calendar & time (CAL)
| ID | Req | P |
|----|-----|---|
| FR-CAL-001 | Internal calendar: day and week views | M |
| FR-CAL-002 | Event kinds visually distinct: deadline marker, work block, fixed event, actual time (logged) | M |
| FR-CAL-003 | Fixed events incl. recurring (RRULE + exceptions) | M |
| FR-CAL-004 | Reminders: local notifications scheduled on the Android device (no server push); in-app list on web (ADR-020) | M |
| FR-CAL-005 | Conflict detection: overlapping blocks/events, over-capacity days, deadline before planned completion | M |
| FR-CAL-006 | Availability computation from working hours − fixed events − accepted blocks | M |
| FR-CAL-007 | Drag/move work blocks manually (owner action, never AI) | S |
| FR-CAL-008 | One-way import from Google Calendar (ICS URL or OAuth) | C |

### 2.4 Dashboard & analytics (DASH)
| ID | Req | P |
|----|-----|---|
| FR-DASH-001 | Periods: daily, weekly, monthly, custom range (Asia/Kolkata day boundaries) | M |
| FR-DASH-002 | Metrics: productivity score, total time, completed, pending, overdue, completion rate, efficiency, est-vs-actual, category workload | M |
| FR-DASH-003 | Charts: completion, productivity trend, time distribution, daily timeline, consistency heatmap, est-vs-actual, category progress | M |
| FR-DASH-004 | Every metric computed from DB records via documented formulas (doc 10) | M |
| FR-DASH-005 | Productivity score transparent: UI shows components and formula; no reward for long hours; no penalty for reasonable rescheduling | M |
| FR-DASH-006 | Metrics with insufficient data show "Not enough data" instead of 0 | M |

### 2.5 Personal Learning Engine (LEARN)
| ID | Req | P |
|----|-----|---|
| FR-LEARN-001 | Behavioural event collector records all learning signals (doc 07 §2) | M |
| FR-LEARN-002 | Routine discovery distinguishes routines from bursts | M |
| FR-LEARN-003 | Task understanding: likely category, project, similar tasks, duration, priority, dependencies | M |
| FR-LEARN-004 | Duration learning with prediction interval and confidence | M |
| FR-LEARN-005 | Behavioural learning: preferred work periods, postponement patterns, interruptions, session length | M |
| FR-LEARN-006 | Workload understanding: capacity vs commitments | M |
| FR-LEARN-007 | Every pattern stores supporting observations, sample count, confidence, last observed, last updated | M |
| FR-LEARN-008 | Maturity levels: rule-based → statistical → ML, gated by data thresholds | M |
| FR-LEARN-009 | User can view, confirm, dismiss and reset learned patterns | M |
| FR-LEARN-010 | No inference of motivation, mood, health or psychological state | M |
| FR-LEARN-011 | Offline evaluation harness with metrics (doc 07 §8) | M |

### 2.6 Scheduling (SCHED)
| ID | Req | P |
|----|-----|---|
| FR-SCHED-001 | Generate schedule proposal for a task or a horizon (default 7 days) using OR-Tools CP-SAT | M |
| FR-SCHED-002 | Hard constraints: fixed events immovable; accepted blocks not displaced silently; deadlines; dependencies; working hours | M |
| FR-SCHED-003 | Explanation per block (deterministic reasons; LLM only rephrases) | M |
| FR-SCHED-004 | All schedule changes require approval (accept all / accept some / reject) | M |
| FR-SCHED-005 | Infeasibility reported with the reason (e.g. "needs 6h, only 3.5h free before deadline") | M |
| FR-SCHED-006 | Auto-classification only when confidence ≥ threshold (configurable, default 0.85) | M |
| FR-SCHED-007 | Configurable auto-scheduling for low-risk recurring tasks (off by default) | C |

### 2.7 AI gateway (AI)
| ID | Req | P |
|----|-----|---|
| FR-AI-001 | Providers: Ollama, NVIDIA NIM, Gemini, Groq via adapters behind one interface | M |
| FR-AI-002 | Configurable routing per operation + fallback order | M |
| FR-AI-003 | Structured output validation (Pydantic) with one repair retry | M |
| FR-AI-004 | Timeouts, retries with backoff, circuit breaker, health status | M |
| FR-AI-005 | Usage tracking: tokens, latency, status, estimated cost | M |
| FR-AI-006 | Settings: add keys, choose models, test connection, set defaults, fallback order, disable external | M |
| FR-AI-007 | Keys encrypted at rest, never returned by API, never logged | M |
| FR-AI-008 | Quota exhaustion detection (HTTP 429/quota errors) → cooldown + fallback | M |
| FR-AI-009 | Core features work with all AI disabled | M |
| FR-AI-010 | Speech-to-text: on-device Android recognition primary; optional Groq Whisper (opt-in); faster-whisper in local mode (ADR-020) | M |
| FR-AI-011 | Embeddings never use an external call; computed in-process where the memory budget allows (local mode always; hosted per M7 measurement) (ADR-020) | M |

### 2.8 RAG assistant & Knowledge Vault (RAG / KNOW)
| ID | Req | P |
|----|-----|---|
| FR-RAG-001 | Chat assistant in AI Intelligence section | M |
| FR-RAG-002 | Hybrid retrieval: SQL (structured intents) + pgvector + metadata filters (date/category/project) | M |
| FR-RAG-003 | Answers cite sources (task/note/log IDs, clickable) | M |
| FR-RAG-004 | Numbers in answers come from SQL tool results only | M |
| FR-RAG-005 | "I don't have records for that" when retrieval is empty/insufficient | M |
| FR-RAG-006 | Conversation history kept per thread; deletable | S |
| FR-KNOW-001 | Vault auto-ingests task descriptions, completion notes, work logs, project notes, meeting notes, uploads, decisions, deliverables | M |
| FR-KNOW-002 | Metadata: date, category, project, task ref, source, privacy class | M |
| FR-KNOW-003 | Simple search UI with filters: keyword everywhere; semantic where embeddings are available (ADR-020) | M |
| FR-KNOW-004 | Manual note creation (plain text/markdown, no rich editor) | M |
| FR-KNOW-005 | Upload documents: PDF, DOCX, TXT, MD text extraction | S |

### 2.9 Reports & sharing (REP / SHARE)
| ID | Req | P |
|----|-----|---|
| FR-REP-001 | Report types EOD, weekly, monthly, custom | M |
| FR-REP-002 | Contents: period, completed, pending, overdue, projects, time, deliverables, achievements, notes, next priorities | M |
| FR-REP-003 | Facts computed from DB; frozen into a snapshot at generation | M |
| FR-REP-004 | Optional AI narrative validated against facts (no new numbers/entities) | M |
| FR-REP-005 | Export PDF, XLSX, CSV | M |
| FR-SHARE-001 | Secure read-only links (256-bit token, hashed at rest) | M |
| FR-SHARE-002 | Expiry (default 7 days) and revocation | M |
| FR-SHARE-003 | Sharing history + access log | M |
| FR-SHARE-004 | Shared scope = professional only by default; including other classes requires explicit per-share opt-in | M |
| FR-SHARE-005 | Scope enforced in backend when building the shared snapshot | M |
| FR-SHARE-006 | In-app share (Android share sheet / Web Share API / copy link) | M |

### 2.10 Offline & sync (SYNC)
| ID | Req | P |
|----|-----|---|
| FR-SYNC-001 | Android offline: create tasks, view synced tasks, change status, completion notes, time entries, cached calendar | M |
| FR-SYNC-002 | Web offline: read cached data + queue task creates/status changes (IndexedDB) — deferred, web is online-only in v1 (ADR-020) | C |
| FR-SYNC-003 | Pending operation queue with idempotent replay | M |
| FR-SYNC-004 | Pull by server sequence cursor; push by operation batch | M |
| FR-SYNC-005 | Explicit conflict rules (doc 11 §6); no silent overwrite of newer data | M |
| FR-SYNC-006 | Conflicts needing a human surface in a "Resolve conflicts" UI | M |
| FR-SYNC-007 | Sync status visible (synced / pending N / error) | M |
| FR-SYNC-008 | Voice capture offline: audio queued, transcribed when backend reachable | S |

### 2.11 Security, privacy, data (SEC / DATA)
| ID | Req | P |
|----|-----|---|
| FR-SEC-001 | TLS for any non-localhost traffic | M |
| FR-SEC-002 | Audit log for security-relevant actions | M |
| FR-SEC-003 | External AI disabled by default; per-category option "never send to external AI" (default ON for Personal) | M |
| FR-DATA-001 | Full data export (JSON + files ZIP) | M |
| FR-DATA-002 | Automated daily DB backup + restore procedure, tested | M |
| FR-DATA-003 | User-controlled deletion: per item, per category, entire account | M |

### 2.12 Notifications (NOTIF)
| ID | Req | P |
|----|-----|---|
| FR-NOTIF-001 | Task reminders, deadline approaching (configurable lead), work block start | M |
| FR-NOTIF-002 | Daily plan prompt (configurable time) | S |
| FR-NOTIF-003 | Quiet hours | S |

## 3. Non-functional requirements
| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PERF-001 | Task create (text, no AI) API p95 | < 200 ms local |
| NFR-PERF-002 | Task appears in list after save (optimistic) | < 100 ms |
| NFR-PERF-003 | Extraction with local LLM p95 | < 8 s (benchmark-dependent; rules-only path < 300 ms) |
| NFR-PERF-004 | Dashboard (monthly, 5k tasks) p95 | < 800 ms |
| NFR-PERF-005 | Schedule solve, 7-day horizon, 50 tasks | < 5 s (hard limit 10 s, fallback greedy) |
| NFR-PERF-006 | RAG answer p95 (local LLM) | < 15 s; retrieval alone < 500 ms |
| NFR-PERF-007 | Android cold start to Today view | < 2.5 s mid-range device |
| NFR-PERF-008 | Voice → confirm sheet | < 6 s for 10 s utterance (local small model, benchmark-dependent) |
| NFR-REL-001 | Zero data loss across sync scenarios in test matrix | 100% |
| NFR-REL-002 | Backup restore drill | Passes every milestone from M1 |
| NFR-SEC-001 | No high/critical findings from bandit, pip-audit, pnpm audit, gitleaks | 0 |
| NFR-A11Y-001 | WCAG 2.2 AA on web; TalkBack labels on Android | AA |
| NFR-COST-001 | Running cost | ₹0 |
| NFR-PORT-001 | Runs on Windows/macOS/Linux via Docker; backend also runs without Docker | yes |
| NFR-MAINT-001 | Backend test coverage | ≥ 85% domain modules, ≥ 80% overall |
| NFR-I18N-001 | Date parsing supports Indian conventions (DD/MM), "kal/parso" optional | DD/MM M; Hinglish C |

## 4. Business rules
**Task views** (all evaluated in user timezone):
- *Today*: status ∈ {pending, in_progress} AND (deadline date = today OR work block today OR overdue OR status = in_progress).
- *Upcoming*: open tasks with deadline or work block in (today, today+14d].
- *Backlog*: open tasks with no deadline and no future work block.
- *Completed*: status = completed, newest first. Cancelled visible via filter.

**Status transitions:** pending→in_progress, pending→completed, pending→cancelled, in_progress→pending (pause), in_progress→completed,
in_progress→cancelled, completed→pending (reopen, logged), cancelled→pending (restore, logged). Anything else = 409.

**Overdue:** open task with `deadline_at < now()`.

**Reasonable reschedule** (not penalised): changed ≥ 24 h before the original deadline, OR task still completed by the new deadline
with ≤ 2 reschedules. Definition used by analytics (doc 10).

**Clarification policy:** if a field is required for scheduling (estimate) and missing, ALIBI may ask *one* clarification question;
deadline and project are never asked for unless user enabled "ask me for deadlines".

## 5. Success criteria for v1 release
1. All **M** requirements pass their acceptance tests (doc 14) on Android device + Chrome + Firefox.
2. 14-day dogfooding by the owner with ≥ 100 real tasks and zero data-loss incidents.
3. Duration predictions beat the "user's own estimate" baseline MAE once maturity L2 is reached (doc 07 §8).
4. Fully functional with external AI disabled and with network disconnected (Android).
