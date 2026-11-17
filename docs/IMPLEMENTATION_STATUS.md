# Implementation Status

_Last updated: 2026-11-18 by agent (M13 task diary/work-log UX; v1.0.0 remains released)_

## Current milestone
**M13 — Personal Android refresh, public signup, organization web portal, and time-tracking UX** · state: **In progress** · entry criteria: ✅ M12/v1.0 release complete; six-tab navigation, public signup, organization/consent product model, concurrent task timers, and separate task score approved by owner (ADR-022/023/024/025)

## Milestones
| Milestone | State | Started | Completed | Tag | Report |
|-----------|-------|---------|-----------|-----|--------|
| M0 Environment & architecture | Complete | 2026-11-13 | 2026-11-15 | `m0-complete` | [M0 Report](milestones/M0_REPORT.md) |
| M1 Database & authentication | Complete | 2026-11-15 | 2026-11-15 | `m1-complete` | [M1 Report](milestones/M1_REPORT.md) |
| M2 Task management (+ mobile shell) | Complete | 2026-11-15 | 2026-11-16 | `m2-complete` | [M2 Report](milestones/M2_REPORT.md) |
| M2b Early hosted deployment (ADR-018/020) | Complete | 2026-11-16 | 2026-11-16 | `m2b-complete` | [M2b Report](milestones/M2b_REPORT.md) |
| M3 Dashboard & analytics | Complete | 2026-11-16 | 2026-11-16 | `m3-complete` | [M3 Report](milestones/M3_REPORT.md) |
| M4 AI gateway (+ voice) | Complete | 2026-11-16 | 2026-11-16 | `m4-complete` | [M4 Report](milestones/M4_REPORT.md) |
| M5 Personal Learning Engine | Complete | 2026-11-16 | 2026-11-16 | `m5-complete` | [M5 Report](milestones/M5_REPORT.md) |
| M6 Scheduling (+ minimal calendar) | Complete | 2026-11-16 | 2026-11-16 | `m6-complete` | [M6 Report](milestones/M6_REPORT.md) |
| M7 RAG & Knowledge Vault | Complete | 2026-11-16 | 2026-11-16 | `m7-complete` | [M7 Report](milestones/M7_REPORT.md) |
| M8 Calendar & reminders | Complete | 2026-11-16 | 2026-11-16 | `m8-complete` | [M8 Report](milestones/M8_REPORT.md) |
| M9 Reports & sharing | Complete | 2026-11-16 | 2026-11-16 | `m9-complete` | [M9 Report](milestones/M9_REPORT.md) |
| M10 Offline & sync | Complete | 2026-11-16 | 2026-11-16 | `m10-complete` | [M10 Report](milestones/M10_REPORT.md) |
| M11 Hosted hardening | Complete | 2026-11-16 | 2026-11-16 | `m11-complete` | [M11 Report](milestones/M11_REPORT.md) |
| M12 Integration & hardening | Complete | 2026-11-16 | 2026-11-16 | `v1.0.0` | [M12 Report](milestones/M12_REPORT.md) |
| M13 Android app visual refresh | In progress | 2026-11-17 | — | — | [M13 Plan](milestones/M13_PLAN.md) |

States: Not started · Planning · In progress · Blocked · In QA · Complete.

## Requirement progress
See `16_REQUIREMENTS_TRACEABILITY.md` (status column). Summary: **124 / 134 previously passing; the three FR-TASK-021/FR-CAL-009/FR-DASH-007 additions are in progress. FR-AUTH-007 remains unverified. FR-ORG-001..006 implementation is in progress and has no test evidence yet.**

## Latest test evidence
| Date | Commit | Suite | Result | Link |
|------|--------|-------|--------|------|
| 2026-11-15 | Task 6 & 7 | Full CI Pipeline (Backend + Client) | 17 passed, 3 packages typechecked | `make.ps1 ci` (ruff, mypy, import-linter, openapi-staleness, pytest, tsc) |
| 2026-11-15 | Task 8 | Next.js Dashboard Build | 8 static pages generated, TS strict clean | `pnpm --filter @alibi/web build` |
| 2026-11-15 | Task 9 | Mobile Shell Typecheck & Android Export | 2564 modules bundled, Android JS bundle 3MB exported, 0 errors | `pnpm --filter @alibi/mobile typecheck` && `expo export` |
| 2026-11-15 | Task 10 | Docker Compose 4-Service Stack | All 4 services healthy (api, worker, web, postgres); idle RSS api=56.6MB, worker=54.7MB, web=36.4MB | `docker compose up -d` && `docker stats --no-stream` |
| 2026-11-15 | Task 11 | GitHub Actions & Pre-commit Workflows | Path-filtered CI (backend, frontend, mobile, security) + pre-commit hooks configured | YAML schema validation & gitleaks integration |
| 2026-11-15 | Task 12 | Exit Gate Verification & M0 Report | All AC-M0-1..6 passing; doctor green, compose healthy, gitleaks verified, CI green | `docs/milestones/M0_REPORT.md` |
| 2026-11-15 | M1 Full CI | Milestone M1 CI Pipeline | 30 tests passed, 5 packages/apps typechecked, Next.js build clean | `make.ps1 ci` & `docs/milestones/M1_REPORT.md` |
| 2026-11-16 | M2 Full CI | Milestone M2 CI Pipeline | 41 tests passed (Hypothesis + Golden 160 items 100% exact match), Next.js build clean, 5 pkgs typechecked | `make.ps1 ci` & `docs/milestones/M2_REPORT.md` |
| 2026-11-16 | M12 Full CI | Release v1.0.0 Full CI Pipeline | 91 backend tests passed, 5 sync-core tests passed, 6 workspace packages typechecked, web Next.js standalone clean | `make.ps1 ci` & `docs/milestones/M12_REPORT.md` |
| 2026-11-16 | Release Build | Mobile Android APK & UI Motion Release | Assembled debug APK (139.4 MB, Hermes, C++ CMake, full ABI support); Web & Mobile tactile animations; 100% checks green | `assembleDebug` & `D:\alibi\apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk` |
| 2026-11-18 | M13 time tracking | Targeted backend tests | 10 passed, including concurrent timer, task score, and analytics endpoint tests | `uv run python -m pytest tests/unit/test_task_score.py tests/unit/test_time_tracking.py tests/integration/test_analytics_api.py -q` |
| 2026-11-18 | M13 time tracking | Mobile and API client typechecks | Mobile `tsc --noEmit` passed; OpenAPI export and API-client codegen/typecheck passed | `pnpm --filter @alibi/mobile typecheck`; `make.ps1 openapi`; `make.ps1 client` |
| 2026-11-18 | M13 task work log | Mobile typecheck | Learned-routine capture suggestions, task session history, live session duration and recorded-session bars typecheck cleanly | `pnpm --filter @alibi/mobile typecheck` |
| 2026-11-18 | M13 task work log | Full static check | Mobile typecheck passed separately; `make.ps1 check` stops at backend Ruff with 26 existing lint diagnostics in model files, so workspace checks after that stage did not run | `make.ps1 check`; see KI-015 |
| 2026-11-18 | M13 time tracking | Android release APK | `assembleRelease` passed; APK is 61.3 MiB, v2 signature verified, contains Expo Notifications and Android notification permissions; signed with the repository's debug keystore | `apps/mobile/android/gradlew.bat -p apps/mobile/android assembleRelease --max-workers=1`; `aapt dump permissions`; `apksigner verify` |

## Current work
- M0–M12 remain complete; v1.0.0 remains the released baseline.
- M13 is refreshing mobile Home, Tasks, Calendar, Insights, Vault, Profile, capture, and event surfaces.
- M13 adds independent per-task timers, Android two-hour local reminders, SQL-backed task activity/scoring and a 365-day activity heatmap. The existing overall productivity score is unchanged. Signup renders without a server probe; normal app navigation no longer runs automatic host discovery.
- Mobile Home and Tasks capture no longer present canned task templates. They show at most three active PLE routines only when confidence ≥ 0.7 and sample count ≥ 4; selecting one fills capture text for review. Task titles open a work-log sheet with live/ended sessions, actual start/end timestamps, durations and per-session bars from `/time-entries`; the checklist keeps completed tasks crossed out and labels timer stop as Pause. Mobile typecheck passed; device visual and timer UX review remain outstanding.
- M13 local migration `0013` applied successfully. Targeted backend tests passed (10); mobile typecheck, generated API client checks, and Android release assembly passed. Physical-device notification delivery remains to verify.
- Android release APK now builds successfully and is copied to `apk/ALIBI-0.1.0.apk` for the existing download link (SHA-256 `1EE0D4A0BBF932FA586B66137FEC9E73DCE6ED54C58246C0A601C3618716830C`). `apksigner verify` confirms the v2 signature. It uses the repository's debug signing key; production distribution still needs an owner-managed release key. No Android device/emulator was attached, so actual two-hour delivery/permission behavior is unverified.
- Observed free-host cold start was 64.3 seconds. UI startup no longer waits for health discovery or setup-status, but first real data/signup requests still depend on Render waking (KI-013); no paid keep-alive has been enabled.
- Backend account-owned tables and protected operations use authenticated `user_id`. Public signup provisions a separate default workspace and categories; write paths that accept category, project, workspace, task, or calendar-event IDs now validate ownership before saving. No teams or shared workspace are introduced.
- M13 account check: mobile typecheck passed; public signup and owner-scoped writes are included in the rebuilt APK. Auth end-to-end tests have not been run and device visual review remains outstanding.
- Owner selected six mobile tabs. ADR-022 and the mobile navigation guidance record that choice; web remains at four destinations.
- Owner changed the web product direction on 2026-11-17. ADR-024 and M13 now cover a role-aware organization portal; member invitation requires explicit, versioned professional-only consent, and only post-consent professional activity is reportable. The public landing routes remain unchanged. Parent access is future scope only.
- Organization migration/models, role-protected APIs, professional-only SQL analytics, web invite/consent/revoke/leave flows, and signed-in organization portal pages are implemented in M13. Migration `0012` has been applied to the local Docker database. No organization tests have been run; two-account isolation checks remain outstanding. Do not claim this feature complete.
- M13 checks: organization backend Ruff, strict mypy and compileall passed; migration `0012` upgrade ran in the local Docker database and downgrade SQL generated offline; OpenAPI was regenerated and `@alibi/api-client` codegen/typecheck passed; `pnpm --filter @alibi/web typecheck`, the local Docker production image build, and the Next.js production build all passed with type validation enabled after fixing React 18/19 type resolution (KI-007). The organization route returns 401 without authentication as expected. No tests were run. Prior mobile typecheck and signed APK evidence remain as above. No Android device/emulator was attached. Do not mark M13 complete.
- 2026-11-17 web UX follow-up: replaced the blue login/signup cards with ALIBI-branded auth layouts and an animated task→plan→reminder illustration; added a pause control and reduced-motion handling. Added a desktop sidebar toggle that releases the sidebar width when collapsed. `pnpm --filter @alibi/web typecheck`, `pnpm --filter @alibi/web build`, and `docker compose up -d --build web` passed; local `/login`, `/signup`, and `/dashboard` returned HTTP 200. This is build/smoke evidence only, not auth or organization behavior test evidence.
- 2026-11-17 auth motion revision: changed the login/signup visual from subtle decorative motion to an autoplaying three-stage workflow with a progressing step track, shifting task card, changing plan/reminder copy, sliding notification, and ringing bell. Reduced-motion mode slows the movement rather than flattening it; the user can still pause/play it. Web typecheck/build passed; rebuilt Docker web; `/login` returned HTTP 200 and served the workflow markup and animation CSS.
- 2026-11-17 organization layout follow-up: changed the desktop app shell to offset the header and page column by the open 16rem rail, with consistent 2rem content gutters; the column returns to full width when collapsed. Web typecheck/build passed, the generated CSS contains the calculated sidebar-aware width, Docker web is healthy, and `/dashboard` returns HTTP 200.

## Open blockers
- FR-AUTH-007 API/E2E regression tests are outstanding; FR-ORG-001..006 lack test evidence and two-account isolation verification; Android device review remains outstanding.

## Update rules
Update this file in the same commit as any feature change. "Complete" requires a linked test run.
