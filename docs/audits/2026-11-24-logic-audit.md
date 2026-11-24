# Logic audit — 2026-11-24

Owner request: check the AI logic, route every way of creating a task through one place, and go through the whole app's logic for issues.

Branch `fix/one-task-path-and-logic-audit` (from `main` at b044379). Decision record: ADR-034. Open items: KI-049..KI-055.

## 1. One way to add a task (ADR-034)

Before this change the phone had six separate add paths, each with its own rules:

| Entry point | Before | Problems |
|---|---|---|
| Today write line | Phone store + server date parser | Its own copy of the parser call |
| Tasks tab "+" | Own add modal; posted to `/tasks/capture` with a 6 s timeout and a retry, then saved on the phone | A slow answer could save the task twice; the server dropped the estimate (B5) |
| Insights "Quick add" / mic | Own add modal (a second copy of the Tasks modal), server first, phone as fallback | Same as above |
| Add screen (`/capture`) | Posted to the server; never wrote to the phone store | Offline adds failed; the new task did not show on Today until the next sync |
| Widget "Say a task" | Phone store + its own parser call | Fine, but a third copy of the same code |
| Ask ALIBI "Approve" | Phone store, never synced, no origin | Task waited for an unrelated sync; counted as a manual task |

Now all of them call `apps/mobile/src/lib/task-intake.ts`:

- `addTask()` saves to the on-device store and queues the upload; `requestSync()` uploads 1.5 s later (several changes share one sync).
- `addTaskFromText()` reads date words ("kal 5 baje", "shaam ko") through the server's rules parser when it answers within 4 s; slow, offline or signed-out keeps the words as written. A date or estimate the user picked always wins.
- Text that holds several tasks is never saved straight away: it opens the review list (`splitForReview()`; offline it splits at new lines and commas and says no dates were read). A split is a proposal until the user accepts it (AGENTS.md §2).
- The Tasks "+" button, the Insights shortcuts and the Today mic open the one Add screen. The Add screen also saves notes (once; it used to save each note twice, see M11).

## 2. AI logic

Backend tests named `test_b*` or `test_regression_KI_*` are in `backend/tests/integration/test_logic_audit_fixes.py`.

| ID | Finding | Fix | Test |
|---|---|---|---|
| B1 | **Owner's API keys could be sent to any address.** With no key of their own, a user's saved base URL and model were used with the server's key pool, so any account could point the owner's keys at a host it controls. In hosted mode a saved URL could also reach internal addresses (cloud metadata, localhost). | Server keys only go to the provider's own endpoint. A user's base URL applies to that user's key only, and in hosted mode must be public https (no IP literals in private ranges, no localhost/`.local`/`.internal`, every DNS answer public). Ollama is refused in hosted mode. | `test_regression_KI_056_*`, `test_b1_hosted_*`, `tests/unit/test_endpoint_policy.py` |
| B4 | **Assistant invented step durations.** "Break down X" answered with made-up steps and minutes. | It names the task, says it won't guess durations, and points to writing the steps on the Add screen; without a task name it asks which one. | `tests/unit/test_assistant_breakdown.py` |
| B7 | **OpenRouter settings could never be saved.** The `chk_ai_provider_name` constraint did not list `openrouter` (500 on save). | Migration 0017 (downgrade keeps existing rows with `NOT VALID`). | migration up/down run |
| B8 | **Web AI settings page always failed.** It sent no `Authorization` header (401 on every call). | Uses the signed-in session token; shows the server's error under the address field. | web typecheck |
| A1 | Ask ALIBI claimed a "Zero Hallucination Guarantee", a welcome text promising it "will never fabricate", and a quick prompt ("Break down my upcoming work") that only led to "which task?". | Claims removed; the prompt became "What did I finish this week?". | phone typecheck |
| A2 | A test sent a dummy key to the real Groq API (AGENTS.md §6). | The test stubs the provider's answer. | `test_ai_settings_api.py` |

## 3. Sync and server data

| ID | Finding | Fix | Test |
|---|---|---|---|
| S1 | **One bad change blocked all later uploads.** Any exception in one sync op failed the whole push (500), and the phone retried the same batch forever. | Each op runs in a savepoint; a failing op is `rejected` with a plain message, the rest apply. | `test_regression_KI_057_one_bad_sync_op_no_longer_blocks_the_rest` |
| B2 | Tasks created offline lost their estimate (the server read only `estimate_min`). | Reads `estimate_user_min` / `estimate_final_min` / `estimate_min`, 1..10080 min. | `test_b2_*` |
| B3 | Reschedule counts made on the phone never reached the server. | Sync applies `reschedule_count`, keeping the highest value. | `test_b3_*` |
| B5 | `/tasks/capture` dropped the user's estimate. | New `estimate_user_min` field. | `test_b5_b6_*` |
| B6 | Re-sending a create with the same client id returned 500. | Returns the existing task (409 if the id belongs to another account). | `test_b5_b6_*` |
| B10 | Evidence uploads were written to a hard-coded `D:/alibi/data/evidence` path, which on the Linux host became a stray relative folder (`backend/D:` in test runs). `ALIBI_STORAGE_DIR` was documented but never read. A file name with folders in it ("a/b.pdf") failed with 500. | Files go to `ALIBI_STORAGE_DIR/evidence/<user>/`, keeping only the last part of the name. Files saved earlier keep their stored path and still download. Tests write to a temporary folder. | `test_b10_*` |

## 4. Phone

| ID | Finding | Fix |
|---|---|---|
| M1 | Opening a list replaced the cache with the server copy, hiding tasks added or edited on the phone that had not uploaded yet. | Tasks with a queued change keep the phone copy; phone-only tasks stay listed. |
| M2 | A task whose upload once failed or conflicted never took server changes again. | Only queued, retrying or in-flight changes protect a task. |
| M3 | Ops left "in flight" when the app was killed never retried; two syncs could run at once. | In-flight ops return to retry at the start of each sync; syncs run one at a time. |
| M4 | Create/update uploads missed estimates, the real created/finished times and the reschedule count. | Payloads carry them. |
| M5 | The Tasks tab fetched before uploading, so a just-added task vanished until the next refresh. | Upload first, then fetch. |
| M6 | Chief of Staff "Calendar busy" was 30 minutes per running timer (a made-up number). | Minutes of calendar events inside today's working window. |
| M7 | "Up next" reminders always said "15 minutes left" whatever lead the user set; evening and inactivity texts claimed "Today was productive", "Great output today", "2 din se ek bhi task log nahi kiya", "48 hours ago", "Monday blues" (every day). | Reminders state the real lead and due time; claims the phone cannot know are gone. Older scheduled reminders are replaced. |
| M8 | Check-in "Done" left the task's clock running; "Tomorrow" counted from the tap time (due 18:00 became 18:20 tomorrow; answered next morning, the morning's tap time). | Done ends the clock (`setTaskDoneOffline`); Tomorrow keeps the time of day (`moveTaskToTomorrowOffline`). |
| M9 | "Tomorrow" meant three different things: check-in (tap time + 1 day), evening sweep (23:59), Tasks bulk action (server: next work start; offline: 23:59, uncounted). | One rule everywhere: the day after today at the task's time (18:00 if none), counted as a move. |
| M10 | Tasks bulk Done/Tomorrow/Trash, the focus-notice Done/Pause and the Today/Insights ticks wrote to the server directly and to the phone, so one tap was sent twice and the second copy could conflict. | Saved on the phone and uploaded by sync, like every other change. |
| M11 | The Add screen's Note mode saved each note to the phone outbox **and** posted it, creating it twice on the server. | Phone store only. |
| M12 | Work notifications (Pause, Done, Start now) changed the phone but never asked for an upload. | They request a sync. |
| M13 | `timer-reminders.ts` registered a second, silent notification handler on import, so opening Settings muted in-app notification sounds. | Removed; `_layout.tsx` registers the one handler. |

Dead code removed: `capture-review-sheet.tsx`, `task-extraction.ts`, `saveBrainDumpItems`, `getRandomWittyCopy`, the two add modals (about 1,500 lines).

## 5. Open items

Logged in `KNOWN_ISSUES.md`:

- KI-049 DNS rebinding window on user-saved provider addresses.
- KI-050 Web quick capture saves the sentence as the title and never applies the parsed date.
- KI-051 Two "working day" settings (Profile working window 09:00–18:00, Settings Start/End Day 09:00–21:00).
- KI-052 Morning and evening reminders are fixed at 09:00 and 20:00.
- KI-053 The learning collector's hooks (`on_task_created`, `on_task_completed`, `on_task_rescheduled`) are never called.
- KI-054 The AI gateway commits the request's database session while logging usage.
- KI-055 Device QA for everything above (the phone app has no unit-test runner).

The `backend/D:` folder left by earlier test runs holds only test uploads; it is untracked and can be deleted by hand. New runs no longer create it (B10).

## 6. Verification

- Backend (WSL, PostgreSQL 16 + pgvector): `ruff check`, `ruff format --check`, `mypy --strict app` (171 files), `lint-imports` (2 contracts kept), migration 0017 up/down/up, full `pytest`: 203 passed, 1 failed (`test_backup_restore`, which needs PowerShell and always fails on Linux; RUNBOOK §8). The storage-folder test (`test_b10_*`) fails on the old evidence code.
- `pnpm --filter @alibi/mobile typecheck`, `@alibi/web typecheck`, `@alibi/api-client typecheck` (client regenerated from the new OpenAPI), `@alibi/sync-core test` (8/8).
- Not verified: anything on a device (KI-055).
