# 09 — Scheduling Engine

## 1. Principles
Solver decides, humans approve. Fixed events are immovable. Accepted blocks are never silently displaced. Every block has deterministic reasons.

## 2. Inputs (snapshot, hashed → `input_hash`)
- Horizon `[H0, H1)` (default now rounded up to next 15 min → +7 days).
- Working hours per weekday (user settings) + optional per-day overrides; quiet hours excluded.
- Fixed events (expanded recurrences) → blocked intervals.
- Existing accepted work blocks → blocked unless `allow_displacement` and listed as displaceable (then soft penalty + needs approval).
- Tasks to schedule: open tasks in scope with `remaining_min = max(estimate_final or AI p50/p75 − actual_min, 15)`, deadline, priority, dependencies, category, preferred block length (learned), min block 30 (settings).
- Preferences: hour-of-day weights per category from learned_patterns (only if pattern confidence ≥ 0.6; else neutral).
- Capacity: max focus minutes/day (settings) and realistic capacity (doc 07 §8, soft).

## 3. Model (OR-Tools CP-SAT)
Time discretised in 15-min slots. For each task *t* split into up to `k_t = ceil(remaining/preferred_block)` chunks (chunk length ∈ [min_block, preferred_block], sum = remaining).
- Interval variables per chunk (optional intervals if task may stay unscheduled).
- **Hard:**
  - `NoOverlap` over all chunks + blocked intervals (fixed events, accepted blocks, outside working hours modelled as fixed blocked intervals).
  - Chunk end ≤ deadline for `deadline_kind=hard` **if feasible**; modelled as hard when an initial feasibility check passes, else relaxed to soft with large penalty and reported (FR-SCHED-005).
  - Dependencies: if A is completed, no constraint; if A is in this solve, every chunk of B starts ≥ end of A's last chunk (and B is optional-unscheduled if A is); if A is open but not in this solve and has no accepted block, B stays unscheduled with reason `WAITING_ON_DEPENDENCY`.
  - Daily focus cap: Σ chunk minutes per day ≤ max_daily_focus_min.
- **Soft objective (minimise weighted sum, integer weights in `scheduling/config.py`):**
  | Term | Weight (default) |
  |------|-----------------|
  | unscheduled task penalty × priority factor (P1=8,P2=4,P3=2,P4/none=1) | 1000 |
  | lateness minutes for soft deadlines | 20/min |
  | earliness reward for tasks with deadline ≤ 48 h (start time) | 2/slot |
  | preference mismatch (1 − hour weight) per slot | 3/slot |
  | fragmentation (number of chunks beyond 1) | 30/chunk |
  | exceeding realistic capacity per day (minutes over) | 5/min |
  | displacement of an existing block (only if allowed) | 400/block |
- Solver params: `max_time_in_seconds=5`, `num_search_workers=4` (configurable by hardware), fixed random seed for reproducibility.
- Status mapping: OPTIMAL/FEASIBLE → proposal; INFEASIBLE/UNKNOWN → greedy fallback.

## 4. Greedy fallback (deterministic)
Earliest-deadline-first, then priority, then creation date; place chunks in earliest free slot respecting all hard constraints; used when CP-SAT fails/times out or OR-Tools unavailable. Proposal labelled `solver_status=greedy`.

## 5. Explanations (FR-SCHED-003)
Each proposed block gets reason codes computed from the model (not the LLM):
`DEADLINE_SOON(deadline)`, `HIGH_PRIORITY(p)`, `PREFERRED_WINDOW(category, n_sessions)`, `ONLY_FREE_SLOT_BEFORE_DEADLINE`, `AFTER_DEPENDENCY(task)`, `SPLIT_FOR_SESSION_LENGTH(median)`, `CAPACITY_BALANCING(day)`.
Unscheduled reasons: `NO_CAPACITY_BEFORE_DEADLINE(needed, available)`, `WAITING_ON_DEPENDENCY`, `NO_ESTIMATE` (asks user), `OUTSIDE_HORIZON`.
Optional LLM (`DAILY_PLAN_NARRATIVE`) rewrites codes into a friendly paragraph; validator ensures no new tasks/times/numbers.

## 6. Proposal lifecycle (FR-SCHED-004)
`proposed` → user decision → `accepted | partially_accepted | rejected`. Auto `expired` after 24 h or when its start passes; `superseded` when a newer proposal for overlapping scope is generated.
On decision: recompute `input_hash` from current DB; mismatch → `409 proposal_stale` (client offers regenerate). Accepted blocks inserted as `calendar_events(kind=work_block, source=ai_accepted)` in one transaction; displacements applied only for explicitly ticked items.
Every decision emits `proposal_decision` observation.

## 7. Permissions matrix
| Action | AI alone | Needs approval | Never |
|--------|----------|---------------|-------|
| Classify category (conf ≥ threshold) | ✓ (visible, undoable) | | |
| Set deadline | | | ✓ (only user/grounded extraction) |
| Create work block | | ✓ | |
| Move accepted block | | ✓ (per block) | |
| Move/delete fixed event | | | ✓ |
| Auto-schedule recurring low-risk (C, off) | configurable later | | |

## 8. Tests & benchmarks
- Unit: constraint builders; reason codes; chunking math; greedy.
- Property tests (Hypothesis): for random worlds, every proposal satisfies: no overlap with fixed events/accepted blocks, inside working hours, hard deadlines met when reported feasible, dependencies ordered, daily cap respected.
- Benchmark suite `backend/tests/scheduling_bench/`: worlds of 10/50/150 tasks × 7/14 days; record solve time, objective, unscheduled count; compare to greedy. Targets: 50 tasks/7 days < 5 s, objective ≤ greedy on 100% of seeds, ≥ 10% better on ≥ 70% of seeds.
- Infeasibility: crafted case "6 h work, 3.5 h free before deadline" → reason with numbers 360/210.

## 9. Acceptance criteria
- AC-SCH-1 Property tests pass 1,000 examples with 0 hard-constraint violations.
- AC-SCH-2 Benchmarks meet targets; results in M6 report.
- AC-SCH-3 Fixed events never appear in displacements (test + DB-level check in apply).
- AC-SCH-4 Stale proposal rejected with 409.
- AC-SCH-5 Every block has ≥ 1 reason code; every unscheduled task has a reason.
- AC-SCH-6 Same input + seed → identical proposal (determinism).
- AC-SCH-7 Works with learning at L0 (neutral preferences) and with OR-Tools forced unavailable (greedy).
