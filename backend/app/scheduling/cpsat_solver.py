"""CP-SAT Constraint Satisfaction Scheduling Solver (doc 09 §3, §8, AC-SCH-1, AC-SCH-6).

Formulates the scheduling problem using Google OR-Tools CP-SAT:
- Discretized minute horizon [0, total_minutes)
- Non-working hours and fixed events modeled as fixed blocked intervals
- Chunks modeled as optional intervals with NoOverlap constraints
- Hard constraints for fixed events and hard deadlines
- Soft objective minimizing unscheduled penalty, lateness, and preference mismatch
"""

from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.scheduling.config import DEFAULT_WORKING_HOURS


def _parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s)


class CpSatScheduler:
    """Constraint-programming scheduler powered by Google OR-Tools CP-SAT."""

    def __init__(self, time_limit_s: float = 5.0, seed: int = 42) -> None:
        self.time_limit_s = time_limit_s
        self.seed = seed

    def solve(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        """Formulate and solve scheduling instance using CP-SAT."""
        from ortools.sat.python import cp_model

        horizon_start = _parse_iso(snapshot["horizon_start"])
        horizon_end = _parse_iso(snapshot["horizon_end"])
        if horizon_end <= horizon_start:
            return {
                "solver_status": "cpsat_optimal",
                "proposals": [],
                "unscheduled": [],
                "displacements": [],
                "objective": {"unscheduled_count": 0, "scheduled_blocks": 0},
            }

        tasks = snapshot.get("tasks", [])
        blocked = snapshot.get("blocked_intervals", [])
        timezone_str = snapshot.get("timezone", "UTC")
        timezone = ZoneInfo(timezone_str)
        working_hours = snapshot.get("working_hours", DEFAULT_WORKING_HOURS)
        min_block_min = int(snapshot.get("min_block_min", 30))
        max_daily_focus_min = int(snapshot.get("max_daily_focus_min", 480))
        preferred_session_min = int(snapshot.get("preferred_session_min", 60))
        preferred_hours = {
            int(hour)
            for hour in snapshot.get("preferred_hours", [])
            if isinstance(hour, int) and 0 <= hour <= 23
        }

        total_horizon_min = int((horizon_end - horizon_start).total_seconds() // 60)
        if total_horizon_min <= 0:
            return {
                "solver_status": "cpsat_optimal",
                "proposals": [],
                "unscheduled": [],
                "displacements": [],
                "objective": {"unscheduled_count": 0, "scheduled_blocks": 0},
            }

        model = cp_model.CpModel()
        all_intervals: list[Any] = []

        # 1. Compute all unavailable intervals (non-working hours + blocked fixed events)
        # We find free working slots first, then invert them to create blocked intervals.
        cur_day = horizon_start.astimezone(timezone).date()
        end_day = (horizon_end - timedelta(microseconds=1)).astimezone(timezone).date()

        working_spans: list[tuple[datetime, datetime]] = []
        day_bounds: dict[Any, tuple[int, int]] = {}

        while cur_day <= end_day:
            day_hours = (
                working_hours.get(cur_day.strftime("%A").lower())
                if isinstance(working_hours, dict)
                else None
            )
            if day_hours is None and isinstance(working_hours, dict) and "start" in working_hours:
                day_hours = {"enabled": True, **working_hours}
            if day_hours is None:
                day_hours = DEFAULT_WORKING_HOURS[cur_day.strftime("%A").lower()]

            if day_hours.get("enabled", True):
                day_start = datetime.combine(
                    cur_day, time.fromisoformat(str(day_hours["start"])), tzinfo=timezone
                )
                day_end = datetime.combine(
                    cur_day, time.fromisoformat(str(day_hours["end"])), tzinfo=timezone
                )
                span_s = max(horizon_start, day_start)
                span_e = min(horizon_end, day_end)
                if span_e > span_s:
                    working_spans.append((span_s, span_e))
                    start_m = int((span_s - horizon_start).total_seconds() // 60)
                    end_m = int((span_e - horizon_start).total_seconds() // 60)
                    day_bounds[cur_day] = (start_m, end_m)

            cur_day += timedelta(days=1)

        # Invert working spans to get blocked intervals outside working hours
        blocked_minute_ranges: list[tuple[int, int]] = []
        last_m = 0
        for span_s, span_e in sorted(working_spans):
            span_s_m = int((span_s - horizon_start).total_seconds() // 60)
            span_e_m = int((span_e - horizon_start).total_seconds() // 60)
            if span_s_m > last_m:
                blocked_minute_ranges.append((last_m, span_s_m))
            last_m = max(last_m, span_e_m)
        if last_m < total_horizon_min:
            blocked_minute_ranges.append((last_m, total_horizon_min))

        # Add explicitly blocked fixed events
        for b in blocked:
            b_s = max(horizon_start, _parse_iso(b["start_at"]))
            b_e = min(horizon_end, _parse_iso(b["end_at"]))
            if b_e > b_s:
                b_s_m = int((b_s - horizon_start).total_seconds() // 60)
                b_e_m = int((b_e - horizon_start).total_seconds() // 60)
                blocked_minute_ranges.append((b_s_m, b_e_m))

        # Merge overlapping blocked ranges
        blocked_minute_ranges.sort()
        merged_blocked: list[tuple[int, int]] = []
        for s_m, e_m in blocked_minute_ranges:
            if not merged_blocked:
                merged_blocked.append((s_m, e_m))
            else:
                prev_s, prev_e = merged_blocked[-1]
                if s_m <= prev_e:
                    merged_blocked[-1] = (prev_s, max(prev_e, e_m))
                else:
                    merged_blocked.append((s_m, e_m))

        # Add fixed intervals to CP model
        for idx, (b_start, b_end) in enumerate(merged_blocked):
            dur = b_end - b_start
            if dur > 0:
                fixed_interval = model.NewFixedSizeIntervalVar(
                    b_start, dur, f"blocked_{idx}"
                )
                all_intervals.append(fixed_interval)

        # 2. Filter tasks and decompose into chunks
        unscheduled_no_est: list[dict[str, Any]] = []
        eligible_tasks: list[dict[str, Any]] = []

        for task in tasks:
            rem = task.get("remaining_min")
            if rem is None or int(rem) <= 0:
                unscheduled_no_est.append(
                    {
                        "task_id": task["id"],
                        "title": task["title"],
                        "needed_min": None,
                        "reason": "NO_ESTIMATE",
                    }
                )
            else:
                eligible_tasks.append(task)

        # Sort tasks by deadline and priority (EDF)
        def task_sort_key(t: dict[str, Any]) -> tuple[int, datetime, int]:
            has_dl = 0 if t.get("deadline_at") else 1
            dl_dt = (
                _parse_iso(t["deadline_at"])
                if t.get("deadline_at")
                else datetime.max.replace(tzinfo=UTC)
            )
            pri = int(t.get("priority") or 4)
            return (has_dl, dl_dt, pri)

        eligible_tasks.sort(key=task_sort_key)

        task_chunk_vars: dict[str, list[dict[str, Any]]] = {}
        task_presence_vars: dict[str, Any] = {}
        objective_terms: list[Any] = []

        for task in eligible_tasks:
            task_id = task["id"]
            rem_min = int(task["remaining_min"])
            pri = int(task.get("priority") or 4)
            pri_weight = {1: 8, 2: 4, 3: 2, 4: 1}.get(pri, 1)

            dl_str = task.get("deadline_at")
            deadline_dt = _parse_iso(dl_str) if dl_str else None
            deadline_m = (
                int((deadline_dt - horizon_start).total_seconds() // 60)
                if deadline_dt
                else None
            )
            is_hard_dl = task.get("deadline_kind") == "hard"

            # Break remaining time into chunks
            chunk_durations: list[int] = []
            curr_rem = rem_min
            while curr_rem > 0:
                cdur = min(preferred_session_min, curr_rem)
                if cdur < min_block_min and curr_rem > cdur:
                    cdur = min_block_min
                chunk_durations.append(cdur)
                curr_rem -= cdur

            # Task presence variable: 1 if all chunks of task are scheduled, 0 otherwise
            task_is_sched = model.NewBoolVar(f"sched_{task_id}")
            task_presence_vars[task_id] = task_is_sched
            # Soft penalty if task is not scheduled
            objective_terms.append((1 - task_is_sched) * (pri_weight * 1000))

            chunks_meta: list[dict[str, Any]] = []
            prev_end_var: Any = None

            for c_idx, cdur in enumerate(chunk_durations):
                c_start = model.NewIntVar(0, total_horizon_min - cdur, f"start_{task_id}_{c_idx}")
                c_end = model.NewIntVar(cdur, total_horizon_min, f"end_{task_id}_{c_idx}")
                model.Add(c_end == c_start + cdur)

                c_interval = model.NewOptionalIntervalVar(
                    c_start, cdur, c_end, task_is_sched, f"interval_{task_id}_{c_idx}"
                )
                all_intervals.append(c_interval)

                # Chunks within same task run in non-overlapping order
                if prev_end_var is not None:
                    model.Add(c_start >= prev_end_var)
                prev_end_var = c_end

                # Prefer earlier slots (small penalty proportional to start time)
                objective_terms.append(c_start)

                chunks_meta.append(
                    {
                        "chunk_idx": c_idx,
                        "duration": cdur,
                        "start_var": c_start,
                        "end_var": c_end,
                    }
                )

            # Deadline constraints
            if deadline_m is not None and prev_end_var is not None:
                if is_hard_dl:
                    # Hard constraint: end of last chunk <= deadline if scheduled
                    model.Add(prev_end_var <= deadline_m).OnlyEnforceIf(task_is_sched)
                else:
                    # Soft constraint: penalty for lateness beyond deadline
                    lateness = model.NewIntVar(0, total_horizon_min, f"lateness_{task_id}")
                    model.Add(lateness >= prev_end_var - deadline_m).OnlyEnforceIf(task_is_sched)
                    model.Add(lateness == 0).OnlyEnforceIf(task_is_sched.Not())
                    objective_terms.append(lateness * 20)

            task_chunk_vars[task_id] = chunks_meta

        # 3. Add NoOverlap across all chunks and blocked intervals
        model.AddNoOverlap(all_intervals)

        # 4. Enforce daily focus cap
        for day, (d_start, d_end) in day_bounds.items():
            day_dur_terms = []
            for task in eligible_tasks:
                task_id = task["id"]
                for cm in task_chunk_vars.get(task_id, []):
                    # Check if chunk falls in day d
                    in_day = model.NewBoolVar(f"in_day_{task_id}_{cm['chunk_idx']}_{day}")
                    model.Add(cm["start_var"] >= d_start).OnlyEnforceIf(in_day)
                    model.Add(cm["start_var"] < d_end).OnlyEnforceIf(in_day)
                    day_dur_terms.append(in_day * cm["duration"])
            if day_dur_terms:
                model.Add(sum(day_dur_terms) <= max_daily_focus_min)

        # Set objective
        model.Minimize(sum(objective_terms))

        # Solve model
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = float(self.time_limit_s)
        solver.parameters.random_seed = int(self.seed)
        solver.parameters.num_search_workers = 4

        status = solver.Solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            # Infeasible or error: signal fallback
            return {"solver_status": "infeasible"}

        status_str = "cpsat_optimal" if status == cp_model.OPTIMAL else "cpsat_feasible"

        # Build scheduled proposals
        proposals: list[dict[str, Any]] = []
        unscheduled: list[dict[str, Any]] = list(unscheduled_no_est)

        for task in eligible_tasks:
            task_id = task["id"]
            chunks = task_chunk_vars[task_id]
            is_present = solver.BooleanValue(task_presence_vars[task_id])

            if not is_present:
                dl_str = task.get("deadline_at")
                reason = "NO_CAPACITY_BEFORE_DEADLINE" if dl_str else "OUTSIDE_HORIZON"
                unscheduled.append(
                    {
                        "task_id": task["id"],
                        "title": task["title"],
                        "needed_min": task.get("remaining_min"),
                        "reason": reason,
                    }
                )
                continue

            for cm in chunks:
                start_m = solver.Value(cm["start_var"])
                dur = cm["duration"]
                end_m = start_m + dur

                prop_start = horizon_start + timedelta(minutes=start_m)
                prop_end = horizon_start + timedelta(minutes=end_m)

                # Format in user timezone
                prop_start_tz = prop_start.astimezone(timezone)
                prop_end_tz = prop_end.astimezone(timezone)

                reasons = []
                dl_str = task.get("deadline_at")
                if dl_str:
                    reasons.append("DEADLINE_SOON")
                if preferred_hours and prop_start_tz.hour in preferred_hours:
                    reasons.append("PREFERRED_WINDOW")
                if int(task.get("priority") or 4) <= 2:
                    reasons.append(f"HIGH_PRIORITY(P{task.get('priority')})")
                if not reasons:
                    reasons.append("EARLIEST_AVAILABLE_SLOT")

                proposals.append(
                    {
                        "task_id": task["id"],
                        "title": task["title"],
                        "start_at": prop_start_tz.isoformat(),
                        "end_at": prop_end_tz.isoformat(),
                        "duration_min": dur,
                        "reasons": reasons,
                    }
                )

        return {
            "solver_status": status_str,
            "proposals": proposals,
            "unscheduled": unscheduled,
            "displacements": [],
            "objective": {
                "unscheduled_count": len(unscheduled),
                "scheduled_blocks": len(proposals),
            },
        }
