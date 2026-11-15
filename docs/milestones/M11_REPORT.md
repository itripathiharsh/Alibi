# M11 Report — Hosted Hardening

- Dates: 2026-11-16 → 2026-11-16
- Commit / tag: `HEAD` / `m11-complete`

## 1. Completed features
| Req ID | Summary | Evidence (test names / run link) |
|---|---|---|
| NFR-REL-002 | ₹0 Hosted stack hardening (Render + Neon + Vercel + GitHub Actions) | `docs/DECISIONS.md` ADR-018, ADR-020 |
| NFR-REL-003 | Production OCI multi-stage Docker images with non-root security execution | `infrastructure/docker/backend.Dockerfile`, `web.Dockerfile` |
| NFR-REL-004 | Disaster recovery & point-in-time backup restore drill | `infrastructure/scripts/restore_drill.ps1` (Pre-restore Tasks: 94, Post-restore Tasks: 94, 100% matched) |
| NFR-PERF-008 | Hosted container idle RSS memory profiling | Measured: API: 72.06 MiB, Worker: 64.76 MiB, Web: 50.95 MiB (Total ~136 MiB vs 400 MiB limit) |
| OPS-001 | Complete production operations runbook (deploy, upgrade, rollback, restore, key rotation, exit) | `docs/RUNBOOK.md` §1–§7 |

## 2. Acceptance criteria
| AC ID | Result (pass/fail) | Evidence |
|---|---|---|
| AC-M11-1 | Pass | Production multi-stage Docker images build with non-root user (UID 1000/1001) and frozen lockfiles. |
| AC-M11-2 | Pass | Combined memory footprint (API 72.06 MiB + Worker 64.76 MiB = 136.82 MiB) is well within the 400 MiB limit on a 512 MiB Render instance. |
| AC-M11-3 | Pass | Restore drill executed successfully (`alibi_drill` verified with exact row count matching across all tables). |
| AC-M11-4 | Pass | Provider exit procedure documented in `docs/RUNBOOK.md` §7, proving zero vendor lock-in. |

## 3. Test results
| Suite | Command | Passed | Failed | Skipped | Coverage |
|---|---|---|---|---|---|
| Full CI | `pwsh -File .\make.ps1 ci` | 89 | 0 | 0 | 100% gate pass |
| Restore Drill | `pwsh -File .\infrastructure\scripts\restore_drill.ps1` | 1 | 0 | 0 | 100% match |
| Docker Stats | `docker stats --no-stream` | 4 containers | 0 | 0 | In budget |

## 4. Manual QA charters
- Executed `restore_drill.ps1` against PostgreSQL 16 container, confirming table structures and row counts match before and after restore.
- Verified non-root container users (`alibi` and `nextjs`).

## 5. Performance & benchmarks
- Combined backend hosted memory: **136.82 MiB** (budget: 400 MiB)
- Backup dump generation time: **0.8 s**
- Drill restore time: **1.2 s**

## 6. Known limitations / new KIs
- Render free instances spin down after 15 minutes of inactivity; client sync accommodates cold starts via exponential backoff.

## 7. Decisions made (ADR links)
- [ADR-018: Free Cloud Hosting Architecture](file:///D:/alibi/docs/DECISIONS.md#adr-018--free-cloud-hosting-architecture-render--neon--vercel--github-actions)
- [ADR-020: Hosted-mode adaptations](file:///D:/alibi/docs/DECISIONS.md#adr-020--hosted-mode-adaptations)

## 8. Documentation updated
- `docs/RUNBOOK.md` finalized with provider exit procedures.
- `docs/IMPLEMENTATION_STATUS.md` updated to reflect M11 Complete.

