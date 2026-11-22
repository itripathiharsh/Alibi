# 11 — Offline & Synchronization

Goal: ALIBI is useful offline and **never silently loses data** (NFR-REL-001).

## 1. Scope offline (FR-SYNC-001)
> **ADR-020:** web offline (FR-SYNC-002) is deferred (C); in v1 the web is online-only, so the "Web offline" column and the Dexie store in §2 are **not built**. Android must also treat a sleeping hosted server (~1 min cold start) as "reachable but slow": backoff, no error UI.

| Capability | Android offline | Web offline (deferred) |
|-----------|-----------------|-------------|
| Create task (raw capture) | ✓ | ✓ (queued) |
| View synced tasks, subtasks, projects, categories, tags | ✓ | ✓ (cached) |
| Change status, edit fields, subtasks | ✓ | ✓ status only (S) |
| Completion notes, time entries/timer | ✓ | — |
| Cached calendar (−7…+30 days) | ✓ | ✓ read |
| Voice capture | ✓ audio queued (or device STT if available) | — |
| Extraction / scheduling / RAG / reports | ✗ (unless backend reachable on LAN) | ✗ |

## 2. Local storage
- **Android:** expo-sqlite + Drizzle. Tables mirror syncable server tables (subset of columns) + `outbox`, `sync_state`, `conflicts`. Encrypted at rest relies on Android file-based encryption (device default); no secrets in SQLite (tokens in secure-store).
- **Web (deferred, ADR-020):** Dexie (IndexedDB): `tasks`, `categories`, `projects`, `tags`, `calendar_cache`, `outbox`, `sync_state`. Cleared on logout.
- UI reads local store; writes go to local store + outbox in **one local transaction**.

## 3. Entities synced
users.settings (pull only), workspaces, categories, projects, tags, task_tags, tasks, subtasks, task_dependencies, recurrence_rules (pull only), time_entries, evidence (metadata; files uploaded separately), calendar_events, work_logs, notes (manual only), notifications (pull only), sync_conflicts.

## 4. Protocol
### 4.1 Operation format (outbox row)
```json
{ "op_id":"uuidv7", "entity_type":"task", "entity_id":"uuidv7", "op_type":"create|update|delete|command",
  "base_version": 3, "fields": {"status":"completed","completed_at":"..."}, "field_base_versions": {"status":3},
  "command": null, "client_ts":"2026-11-13T10:00:00+05:30", "attempts":0, "state":"pending|inflight|done|failed|conflict" }
```
- Updates carry **only changed fields** (field-level ops).
- Commands for invariant-heavy actions: `task.set_status`, `timer.start`, `timer.stop`, `task.reschedule` — server runs the same service logic as the REST endpoint.
- Consecutive updates to the same entity in the outbox are **coalesced** before push (keep earliest base version, latest values) — reduces conflicts.

### 4.2 Push
`POST /sync/push` with ≤ 200 ops in creation order. Server processes each op in its own savepoint:
1. `op_id` already in `sync_operations` → return stored result (`duplicate`).
2. Entity missing & op=create → insert (ID from client) → `applied`.
3. op=update: compare `field_base_versions[f]` with server `field_versions[f]`:
   - equal → apply field, bump field version.
   - server newer → resolve with rules §6 → `merged` or `conflict`.
4. Validation errors → `rejected` with reason (client marks op failed, shows banner, keeps local data with "not synced" flag; never deleted).
Response returns current server entity for every touched entity so the client overwrites local with authoritative state.

### 4.3 Pull
`GET /sync/pull?since_seq=N` → changes ordered by `server_seq`, includes tombstones. Client applies in a transaction and stores `next_seq`. `next_seq` is the seq of the last change *returned* (never a row beyond the page), and the client repeats the pull while `has_more` is true.
Pull **after** push in each cycle. Local rows with pending outbox ops: pulled values applied to fields **not** pending; pending fields keep local value until the push result arrives.

**Server epoch:** `/api/v1/meta` and every pull response include `server_epoch` (UUID regenerated whenever the DB is restored from backup). If a client's stored epoch differs, it discards its cursor and re-bootstraps while **keeping its outbox**, which is then pushed (ops are idempotent by `op_id`).

### 4.4 Triggers & backoff
App foreground, connectivity regained, after local write (debounced 2 s), every 15 min while foreground, background task (Android ~15 min best effort).
Backoff: 2 s → 4 → 8 … max 5 min with jitter; auth error → refresh token then retry once; 4xx validation → no retry.

### 4.5 Bootstrap
New device: `/sync/bootstrap` pages full snapshot (open tasks + last 90 days completed + all categories/projects/tags + calendar −7…+30), then pull from snapshot's seq.

## 5. Clocks & IDs
- IDs are client UUIDv7 → no ID collisions/merges.
- Ordering decisions use **versions**, never device clocks. `client_ts` is informational (and becomes `occurred_at` for events, clamped to [created_at, server_now+5min]).

## 6. Conflict rules (FR-SYNC-005)
| Field / case | Rule |
|--------------|------|
| title, description, notes, completion_note | if both changed: server value kept; the local value is saved in `sync_conflicts` (open) and the user picks one in the Resolve UI. Never auto-merged textually, never discarded. |
| status | Precedence for concurrent changes: `completed` > `cancelled` > `in_progress` > `pending`, **unless** a later explicit reopen (completed→pending command) arrived with base version ≥ server's completion version. Losing transition recorded as task_event with actor `sync`. |
| completed_at | follows winning status; earliest completion time if both completed |
| priority, category_id, project_id, deadline_at, estimates | field-level last-writer-by-version: if server field changed since base → **conflict** record; server value kept until user resolves (deadline is "important schedule" → never auto-overwritten) |
| subtasks | per-subtask entity; `is_done` true wins over false for concurrent edits |
| time_entries | append-only semantics: creates never conflict; concurrent edits to same entry → conflict; two running timers from two devices → server keeps earliest-started running, stops the other at the later one's start time, logs event, notifies |
| delete vs update | update on a tombstoned entity → `conflict` with option "restore with my changes"; delete on a modified entity → delete applies only if base version = current, else conflict |
| create with same natural key (tags name) | merge into existing, remap local ID (server returns `remap`) |
| calendar fixed events | same as priority/deadline (conflict, server kept) |
Conflict notifications appear as badge on Tasks tab + "Resolve conflicts" screen (FR-SYNC-006).

## 7. Files (evidence, voice)
Uploaded separately via resumable-ish chunked POST (5 MB chunks) after the metadata op is applied; local file kept until server confirms `sha256`. Voice: `voice_capture` command uploads audio, server transcribes, updates placeholder task, extraction proposal arrives via pull (`parse_status=proposed`).

## 8. Sync status UX (FR-SYNC-007)
Header indicator: ✓ Synced · ↻ Syncing · ● N pending · ⚠ Error (tap → details, retry). Per-task "not synced" dot for failed/rejected ops.

## 9. Test matrix (must all pass — AC-SYNC)
Automated with two simulated clients against a real backend (`tests/sync/` using `packages/sync-core` in Node + pytest server), plus Maestro on device for the starred rows.

| # | Scenario | Expected |
|---|----------|----------|
| S1★ | Create 20 tasks offline, reconnect | 20 tasks on server, IDs equal, no dupes |
| S2 | Push same batch twice (network drop after server commit) | idempotent, 20 rows |
| S3 | Device A completes, Device B edits title concurrently | completed + B's title (different fields merge) |
| S4 | A and B edit title concurrently | server value kept, conflict for loser, visible in UI |
| S5 | A completes, B cancels concurrently | completed wins; cancel recorded as event |
| S6 | A deletes, B edits | conflict, restore option works |
| S7★ | Timer started offline, stopped offline, synced | time entry correct duration, actual_min updated |
| S8 | Two devices start timers offline | one running timer after sync, other stopped, notification |
| S9 | Deadline changed on both | conflict, no silent overwrite |
| S10 | 1,000 ops queued, app killed mid-push | after restart all ops eventually applied once |
| S11 | Server restore from backup older than client seq | client detects `seq` regression (server epoch id) → full re-bootstrap with local pending ops preserved |
| S12 | Token expired while offline 40 days | refresh fails → login → outbox preserved and pushed |
| S13★ | Voice capture offline | placeholder task immediately; transcribed and proposal after reconnect |
| S14 | Schema/app version mismatch (min_client_version) | push refused with upgrade message; outbox preserved |
| S15 | Randomised fuzz: 2–3 clients, 500 random ops, random partitions (Hypothesis stateful) | final states converge; every local write either applied, merged, or in an open conflict (zero vanished writes) |

## 10. Acceptance criteria
- AC-SYNC-1 All 15 scenarios pass in CI (S1/S7/S13 also on physical/emulated Android via Maestro).
- AC-SYNC-2 Convergence + zero-vanished-writes invariant holds over 200 fuzz seeds.
- AC-SYNC-3 Airplane-mode manual QA script (doc 14 §7) passes on a real device.
- AC-SYNC-4 Sync of 5,000-task account bootstrap < 30 s on LAN.
