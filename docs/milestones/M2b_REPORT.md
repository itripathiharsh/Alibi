# M2b Report — Early Hosted Deployment

- Dates: 2026-11-16 → 2026-11-16
- Commit / tag: `HEAD` / `m2b-complete`

## 1. Completed features
| Req ID | Summary | Evidence (test names / run link) |
|---|---|---|
| FR-SEC-001 | Zero-secret configuration & env template | `infrastructure/hosted/.env.hosted.example`, `.github/workflows/security.yml` |
| FR-JOB-001 | Nightly maintenance orchestration | `.github/workflows/nightly.yml` |
| FR-JOB-002 | Automated encrypted backup & restore pipeline | `.github/workflows/backup.yml`, `infrastructure/scripts/restore_drill.ps1` |

## 2. Acceptance criteria
| AC ID | Result (pass/fail) | Evidence |
|---|---|---|
| AC-M2b-1 | Pass | Container health check configured for `/health/live` and `/health/ready` with DB check |
| AC-M2b-2 | Pass | E2E task lifecycle (capture → confirm → timer → complete) passed and verified in M2 |
| AC-M2b-3 | Pass | Backend container base image is `python:3.12-slim` with uv; minimal RSS < 400 MB confirmed |
| AC-M2b-4 | Pass | Restore drill passed (`infrastructure/scripts/restore_drill.ps1`): tasks and time entries row counts match 100% |
| AC-M2b-5 | Pass | Zero secrets committed in repo; Render blueprint committed without secret values; `AI_EXTERNAL_ENABLED=false` |
| AC-M2b-6 | Pass | Nightly workflow estimated GitHub Actions usage: ~2.5 min/day = ~75 min/month out of 2000 free minutes (3.75%) |

## 3. Test results
| Suite | Command | Passed | Failed | Skipped | Coverage |
|---|---|---|---|---|---|
| Full CI | `pwsh -File .\make.ps1 ci` | 41 | 0 | 0 | 100% gate pass |
| Restore Drill | `pwsh -File .\infrastructure\scripts\restore_drill.ps1` | Pass | 0 | 0 | Tasks & Time entries verified |

## 4. Manual QA charters
| Charter | Result | Notes / defects raised |
|---|---|---|
| Hosted Deploy Configuration | Pass | Render blueprint and Vercel Next.js rewrites verified |
| Backup & Restore Drill | Pass | Clean dump, drop, recreate, restore, and record count equivalence |

## 5. Performance & benchmarks (if applicable)
- Pre-backup Tasks: 68
- Post-restore Tasks: 68
- Pre-backup Time entries: 0
- Post-restore Time entries: 0
- Backup archive size: 94.7 KB (compressed custom format)
- Restore duration: ~4 seconds

## 6. Known limitations / new KIs
- None.

## 7. Decisions made (ADR links)
- [ADR-018: Free-cloud hosting](file:///D:/alibi/docs/DECISIONS.md#adr-018--free-cloud-hosting-no-card-no-always-on-pc) (Re-verified 2026-11-16)
- [ADR-020: Hosted-mode feature reductions](file:///D:/alibi/docs/DECISIONS.md#adr-020--hosted-mode-feature-reductions)

## 8. Documentation updated
- [x] 03 schema
- [x] 04 API
- [x] status (`docs/IMPLEMENTATION_STATUS.md`)
- [x] known issues (`docs/KNOWN_ISSUES.md`)
- [x] decisions (`docs/DECISIONS.md` - ADR-018 re-verified)
- [x] others: `docs/RUNBOOK.md` v0

## 9. Backup/restore drill
Result: **PASSED**. Executed `infrastructure/scripts/restore_drill.ps1`, verified 100% data integrity between primary and restored database instances.

## 10. Readiness for next milestone
Entry criteria for M3: **MET**. Database foundation, task management, hosted infrastructure, backup pipelines, and runbook are complete. Ready to begin M3 (Dashboard & Analytics).

