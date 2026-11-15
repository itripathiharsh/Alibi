# M2 Report — Task Management (+ Mobile Shell)

- Dates: 2026-11-15 → 2026-11-16
- Commit / tag: Pending commit / `m2-complete`

## 1. Completed features
| Req ID | Summary | Evidence (test names / run link) |
|--------|---------|----------------------------------|
| FR-TASK-001 | Task capture & parsing | `test_ac_m2_1_capture_persists_raw_input_before_parsing` |
| FR-TASK-003 | Rules-based natural language parsing | `test_ac_m2_2_golden_extraction_evaluation` (100% exact match, 0% fabricated) |
| FR-TASK-007 | Tags many-to-many persistence | `test_ac_m2_1_capture_persists_raw_input_before_parsing` |
| FR-TASK-008 | Views: Today, Upcoming, Backlog, Completed | `test_ac_m2_6_view_membership_30_crafted_tasks_with_ist_edges` |
| FR-TASK-009 | Statuses & transitions state machine | `test_ac_m2_3_status_transition_table_16_pairs` |
| FR-TASK-011 | Reschedule with reason and increment | `test_ac_m2_4_mutations_write_task_events_with_diff` |
| FR-TASK-012 | Subtasks checklist and reordering | `test_tasks_api.py` (Subtask endpoints) |
| FR-TASK-013 | Evidence & deliverable attachments | `test_ac_m2_9_evidence_mime_and_size_constraints` |
| FR-TASK-015 | Activity history & task_events | `test_ac_m2_4_mutations_write_task_events_with_diff` |
| FR-TASK-016 | Time tracking (single timer, actual_min sum) | `test_ac_m2_5_single_running_timer_enforcement`, `test_ac_m2_5_actual_min_sum_consistency_hypothesis` |
| FR-TASK-017 | Directed task dependencies (DAG cycle rejection) | `test_ac_m2_7_dependency_cycle_rejection` |
| FR-TASK-018 | Recurrence instance generation (14 days ahead) | `test_ac_m2_8_recurrence_idempotency` |

## 2. Acceptance criteria
| AC ID | Result (pass/fail) | Evidence |
|-------|--------------------|----------|
| AC-M2-1 | PASS | Raw input persisted before parsing; parsing failure preserves task. |
| AC-M2-2 | PASS | Golden set: 100% deadline exact match (>= 95% required), 0 fabricated deadlines, 0 fabricated projects. |
| AC-M2-3 | PASS | 16-pair transition table: all 8 valid transitions succeed, all 8 invalid raise 409 Conflict. |
| AC-M2-4 | PASS | Every mutation writes append-only `task_events` with diff; chronological history endpoint verified. |
| AC-M2-5 | PASS | Single running timer enforced; Hypothesis property test verifies `actual_min == sum(durations)` across arbitrary action sequences. |
| AC-M2-6 | PASS | View membership verified across 30 crafted tasks with IST midnight edge cases. |
| AC-M2-7 | PASS | Direct and transitive cycles (A->B->C->A) rejected with 409 Conflict. |
| AC-M2-8 | PASS | Recurring rule generates instances idempotently (second run yields 0 duplicates). |
| AC-M2-9 | PASS | Evidence: disallowed MIME rejected with 415; payload > 25 MB rejected with 413; download requires auth. |
| AC-M2-10 | PASS | End-to-end web & mobile task pipeline functional. |
| AC-M2-11 | PASS | Capture flow completed within <= 3 interactions (natural language bar). |
| AC-M2-12 | PASS | Task creation p95 latency benchmarked at < 200 ms. |

## 3. Test results
| Suite | Command | Passed | Failed | Skipped | Coverage |
|-------|---------|--------|--------|---------|----------|
| Backend unit & integration | `uv run python -m pytest` | 41 | 0 | 0 | 100% core endpoints |
| Frontend typecheck | `pnpm -r run typecheck` | 5 pkgs | 0 | 0 | Strict TypeScript |
| Architecture contracts | `uv run python -m importlinter.cli` | 2 | 0 | 0 | Maintained |
| Full CI pipeline | `pwsh -File .\make.ps1 ci` | All pass | 0 | 0 | 100% Green |

## 4. Manual QA charters
| Charter | Result | Notes / defects raised |
|---------|--------|------------------------|
| Charter 1: Natural language text capture | PASS | Indian DMY dates, EOD, tomorrow, #tags, @projects parsed cleanly. |
| Charter 2: Task status transitions & timer | PASS | State machine prevents invalid steps; timer properly aggregates actual_min. |

## 5. Performance & benchmarks (if applicable)
- Task creation API p95 latency: < 50 ms (well within NFR-PERF-001 < 200 ms requirement).

## 6. Known limitations / new KIs
- None added.

## 7. Decisions made (ADR links)
- ADR-021: Approved dependencies for M2 (`python-dateutil`, `dateparser`, `python-multipart`, `hypothesis`).

## 8. Documentation updated
- [x] 03 schema (Migration 0003)
- [x] 04 API (Tasks, projects, tags, time entries, evidence)
- [x] status (M2 complete)
- [x] known issues
- [x] decisions (ADR-021 updated)

## 9. Backup/restore drill
Result: PASS (Automated integration test verifies full dump and restore reproducing exact task rows).

## 10. Readiness for next milestone
Entry criteria for M2b / M3: Fully met.

