# M10 Report — Android Offline Support & Sync (re-audit correction)

- Dates: 2026-11-16 → 2026-11-16
- Original tag: `m10-complete` (historical; retained)
- Current milestone state: **Reopened / In progress** after the 2026-11-18 whole-app audit found the Android UI was not connected to local storage or sync.

## 1. Completed features
| Req ID | Summary | Evidence (test names / run link) |
|---|---|---|
| FR-SYNC-001 | Server sync endpoints and a partial Android task/timer offline path | Sync API tests plus new local SQLite/outbox integration; full offline entity scope remains incomplete |
| FR-SYNC-003 | Savepoint-isolated push processing with duplicate idempotency | `test_sync_push_idempotency_and_duplicate_handling` |
| FR-SYNC-004 | Incremental pull and bootstrap endpoints | `test_sync_pull_and_bootstrap_endpoints`; first-bootstrap engine regression added |
| FR-SYNC-005 | Server title-conflict detection and surfacing API | `test_sync_conflict_surfacing_and_resolution`; Android conflict resolution UI is not implemented |
| FR-SYNC-006 | Open conflict resolution API | Server API exists; Android conflict UI remains open |
| FR-SYNC-007 | Shared sync core with outbox coalescing, retry restoration, bootstrap, and engine cycle | `packages/sync-core/tests/sync-core.test.mjs` (7 tests after re-audit) |

## 2. Acceptance criteria
| AC ID | Result (pass/fail) | Evidence |
|---|---|---|
| AC-M10-1 | Incomplete | Only selected server and sync-core cases run; the required S1–S15 matrix, fuzz tests, and device cases have not passed. |
| AC-M10-2 | Partial | Coalescing, network retry restoration, and initial bootstrap have unit coverage; complete migration/outbox preservation is not yet tested on Android. |
| AC-M10-3 | Partial | Backoff function is unit-tested; server cold-start retry and offline cold-start performance are not measured on device. |
| AC-M10-4 | Incomplete | First bootstrap path is covered; backup epoch reset with real pending SQLite operations has not been verified end-to-end. |

## 3. Test results
| Suite | Command | Passed | Failed | Skipped | Coverage |
|---|---|---|---|---|---|
| Original 2026-11-16 CI record | `pwsh -File .\make.ps1 ci` | Historical | — | — | It did not validate Android local persistence; it is not evidence that M10's offline exit gate passed. |
| Re-audit sync-core | `pnpm --filter @alibi/sync-core test` | 7 | 0 | 0 | Coalescing, backoff, retry restoration, bootstrap, engine cycle |
| Re-audit backend | `uv run python -m pytest -q -rA` | 102 | 0 | 0 | Full backend suite passes, including offline timer finalization regression |
| Device QA | Airplane-mode, relaunch, outbox recovery, conflicts | Not run | — | — | No Android device/emulator is currently attached |

## 4. Manual QA charters
- Previous manual checks covered server idempotency and title conflict APIs only. They did not exercise Android task storage in airplane mode.

## 5. Performance & benchmarks
- Batch push latency (20 operations): **14.2 ms**
- Bootstrap payload assembly: **8.1 ms**
- Incremental pull query latency: **2.3 ms**

## 6. Known limitations / new KIs
- Android task capture/read/status and task timers now have a partial SQLite/outbox path (ADR-026). This work has not been device-tested.
- Calendar, Vault, voice/file uploads, other syncable entities, Android conflict UI, complete M10 scenarios/fuzz, and cold-start performance remain outstanding (KI-016).
- Web offline remains deferred to post-v1 per ADR-020.

## 7. Decisions made (ADR links)
- [ADR-020: Hosted-mode adaptations and web offline deferral](file:///D:/alibi/docs/DECISIONS.md#adr-020--hosted-mode-adaptations)

## 8. Documentation updated
- `docs/IMPLEMENTATION_STATUS.md` now records M10 as reopened and in progress; `m10-complete` is historical only.
- `openapi.json` and `@alibi/api-client` were regenerated after the organization ownership-transfer endpoint.
- Re-audit correction recorded 2026-11-18. Do not mark M10 complete until every exit-gate item is verified.

