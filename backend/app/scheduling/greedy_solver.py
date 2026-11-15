"""Deterministic Greedy Scheduler (doc 09 §4, AC-SCH-5, AC-SCH-7).

Provides earliest-deadline-first (EDF) + priority chunk placement into free working hours.
Used as robust standalone solver and CP-SAT fallback.
"""

from datetime import UTC, datetime, time, timedelta
from typing import Any


def _parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s)


class GreedyScheduler:
    """Deterministic, constraint-satisfying greedy scheduler."""

    def solve(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        horizon_start = _parse_iso(snapshot["horizon_start"])
        horizon_end = _parse_iso(snapshot["horizon_end"])
        tasks = snapshot.get("tasks", [])
        blocked = snapshot.get("blocked_intervals", [])

        # Parse blocked intervals
        busy_intervals: list[tuple[datetime, datetime]] = []
        for b in blocked:
            busy_intervals.append((_parse_iso(b["start_at"]), _parse_iso(b["end_at"])))

        # Generate candidate daily working slots (e.g. 09:00 to 18:00)
        free_slots: list[tuple[datetime, datetime]] = []
        cur_day = horizon_start.date()
        end_day = horizon_end.date()

        while cur_day <= end_day:
            day_start = datetime.combine(cur_day, time(9, 0), tzinfo=UTC)
            day_end = datetime.combine(cur_day, time(18, 0), tzinfo=UTC)

            # Restrict to horizon
            slot_s = max(horizon_start, day_start)
            slot_e = min(horizon_end, day_end)

            if slot_e > slot_s:
                # Subtract busy intervals
                current_ranges = [(slot_s, slot_e)]
                for b_start, b_end in busy_intervals:
                    new_ranges = []
                    for r_start, r_end in current_ranges:
                        if b_end <= r_start or b_start >= r_end:
                            new_ranges.append((r_start, r_end))
                        else:
                            if b_start > r_start:
                                new_ranges.append((r_start, b_start))
                            if b_end < r_end:
                                new_ranges.append((b_end, r_end))
                    current_ranges = new_ranges

                free_slots.extend(current_ranges)

            cur_day += timedelta(days=1)

        # Sort tasks by deadline (EDF) and priority
        def task_sort_key(t: dict[str, Any]) -> tuple[int, datetime, int]:
            has_dl = 0 if t.get("deadline_at") else 1
            dl_dt = (
                _parse_iso(t["deadline_at"])
                if t.get("deadline_at")
                else datetime.max.replace(tzinfo=UTC)
            )
            pri = int(t.get("priority") or 4)
            return (has_dl, dl_dt, pri)

        sorted_tasks = sorted(tasks, key=task_sort_key)

        proposals: list[dict[str, Any]] = []
        unscheduled: list[dict[str, Any]] = []

        for task in sorted_tasks:
            rem_min = int(task.get("remaining_min") or 30)
            dl_str = task.get("deadline_at")
            deadline_dt = _parse_iso(dl_str) if dl_str else None
            placed_chunks: list[dict[str, Any]] = []

            # Chunk into max 60-min blocks
            while rem_min > 0:
                chunk_dur = min(60, rem_min)
                chunk_delta = timedelta(minutes=chunk_dur)
                placed = False

                for idx, (slot_start, slot_end) in enumerate(free_slots):
                    # Check if fits in slot
                    if slot_end - slot_start >= chunk_delta:
                        prop_start = slot_start
                        prop_end = slot_start + chunk_delta

                        # Check hard deadline if present
                        if deadline_dt and prop_end > deadline_dt:
                            continue

                        # Reason codes
                        reasons = []
                        if deadline_dt:
                            reasons.append("DEADLINE_SOON")
                        if int(task.get("priority") or 4) <= 2:
                            reasons.append(f"HIGH_PRIORITY(P{task.get('priority')})")
                        if not reasons:
                            reasons.append("EARLIEST_AVAILABLE_SLOT")

                        placed_chunks.append(
                            {
                                "task_id": task["id"],
                                "title": task["title"],
                                "start_at": prop_start.isoformat(),
                                "end_at": prop_end.isoformat(),
                                "duration_min": chunk_dur,
                                "reasons": reasons,
                            }
                        )

                        # Update remaining slot
                        if slot_end > prop_end:
                            free_slots[idx] = (prop_end, slot_end)
                        else:
                            free_slots.pop(idx)

                        rem_min -= chunk_dur
                        placed = True
                        break

                if not placed:
                    break

            if rem_min == 0:
                proposals.extend(placed_chunks)
            else:
                # Rollback partial chunks if task could not be scheduled
                reason = "NO_CAPACITY_BEFORE_DEADLINE" if deadline_dt else "OUTSIDE_HORIZON"
                unscheduled.append(
                    {
                        "task_id": task["id"],
                        "title": task["title"],
                        "needed_min": task.get("remaining_min"),
                        "reason": reason,
                    }
                )

        return {
            "solver_status": "greedy",
            "proposals": proposals,
            "unscheduled": unscheduled,
            "displacements": [],
            "objective": {
                "unscheduled_count": len(unscheduled),
                "scheduled_blocks": len(proposals),
            },
        }
