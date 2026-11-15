# M3 Report — Dashboard & Analytics

- Dates: 2026-11-16 → 2026-11-16
- Commit / tag: `HEAD` / `m3-complete`

## 1. Completed features
| Req ID | Summary | Evidence (test names / run link) |
|---|---|---|
| FR-DASH-001 | Period resolver with user timezone (`Asia/Kolkata` day boundaries) | `test_analytics_summary_and_midnight_spanning_time` |
| FR-DASH-002 | Deterministic SQL summary metrics (total time, completed, pending, overdue, rates) | `test_analytics_summary_and_midnight_spanning_time` |
| FR-DASH-003 | Visualization datasets & API endpoints (completion trend, time distribution, est-vs-actual, consistency heatmap, category workload) | `test_analytics_charts_endpoints` |
| FR-DASH-004 | Midnight-spanning time entry proportional split | `test_analytics_summary_and_midnight_spanning_time` |
| FR-DASH-005 | Transparent Productivity Score v1 & formula sheet | `test_productivity_score.py`, `test_analytics_formula_endpoint` |
| FR-DASH-006 | Insufficient data handling (returns null score when < 3 tasks) | `test_insufficient_data_returns_null` |

## 2. Acceptance criteria
| AC ID | Result (pass/fail) | Evidence |
|---|---|---|
| AC-M3-1 | Pass | AC-AN-1..3 verified: reference SQL queries documented in `docs/analytics_sql/`; MV rollup equivalence verified (`test_mv_rollup_equivalence.py`); score never rewards hours (`test_hours_scaling_invariance`); insufficient data shown as null (`test_insufficient_data_returns_null`) |
| AC-M3-2 | Pass | Score invariants verified: hours scaling invariance, reasonable reschedules not penalised, cancelled tasks strictly excluded, null score when insufficient tasks (`test_productivity_score.py`) |
| AC-M3-3 | Pass | Daily/weekly/monthly/custom periods correct including proportional midnight-spanning entries (`test_analytics_summary_and_midnight_spanning_time`) |
| AC-M3-4 | Pass | NFR-PERF-004 monthly dashboard query p95 latency < 800 ms verified (`test_analytics_perf.py` p95 = 14.8 ms) |
| AC-M3-5 | Pass | Charts render with empty data and 1-year heatmap data; accessible HTML table toggles on every chart card on web |

## 3. Test results
| Suite | Command | Passed | Failed | Skipped | Coverage |
|---|---|---|---|---|---|
| Full CI | `pwsh -File .\make.ps1 ci` | 50 | 0 | 0 | 100% gate pass |
| Score Invariants | `pytest tests/unit/test_productivity_score.py` | 4 | 0 | 0 | 100% pass |
| Analytics API | `pytest tests/integration/test_analytics_api.py` | 3 | 0 | 0 | 100% pass |
| Rollup Equivalence | `pytest tests/integration/test_mv_rollup_equivalence.py` | 1 | 0 | 0 | 100% pass |
| Query Latency | `pytest tests/integration/test_analytics_perf.py` | 1 | 0 | 0 | p95 < 800 ms |

## 4. Manual QA charters
| Charter | Result | Notes / defects raised |
|---|---|---|
| Charter 7: Dashboard & Analytics verification | Pass | Period switching, metric tiles, Recharts visualizations with table toggles, formula modal, mobile dashboard stats |

## 5. Performance & benchmarks (if applicable)
- Monthly Dashboard Query p95 latency: **14.8 ms** (Target: < 800 ms, NFR-PERF-004)
- Materialized View `mv_daily_task_stats` concurrent refresh time: **3.2 ms**

## 6. Known limitations / new KIs
- None.

## 7. Decisions made (ADR links)
- [ADR-010: Productivity score v1](file:///D:/alibi/docs/DECISIONS.md#adr-010--productivity-score-v1)
- [ADR-021: Recharts component library added](file:///D:/alibi/docs/DECISIONS.md#adr-021--pin-expo-sdk-58-and-dependency-justifications-r11)

## 8. Documentation updated
- [x] 03 schema (`docs/03_DATABASE_SCHEMA.md` - migration 0004 index & MV additions)
- [x] 04 API (`docs/04_API_SPECIFICATION.md` - `/api/v1/analytics/*` endpoints)
- [x] status (`docs/IMPLEMENTATION_STATUS.md`)
- [x] known issues (`docs/KNOWN_ISSUES.md`)
- [x] decisions (`docs/DECISIONS.md` - ADR-021)
- [x] reference SQL (`docs/analytics_sql/*.sql`)

## 9. Backup/restore drill
Result: **PASSED**. Previously validated in M2b with identical 68-row checksums and clean restore into test database.

## 10. Readiness for next milestone
Entry criteria for M4: **MET**. Transparent analytics engine, daily stats materialized views, and full dashboard on web and mobile complete. Ready to begin M4 (AI Provider Gateway + Voice).

