"""Deterministic Greedy Scheduler (doc 09 §4, AC-SCH-5, AC-SCH-7).

Provides earliest-deadline-first (EDF) + priority chunk placement into free working hours.
Used as robust standalone solver and CP-SAT fallback.
"""

from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.scheduling.config import DEFAULT_WORKING_HOURS


def _parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s)


class GreedyScheduler:
    """Deterministic, constraint-satisfying greedy scheduler."""

    def solve(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        horizon_start = _parse_iso(snapshot["horizon_start"])
        horizon_end = _parse_iso(snapshot["horizon_end"])
        tasks = snapshot.get("tasks", [])
        blocked = snapshot.get("blocked_intervals", [])
        timezone = ZoneInfo(snapshot.get("timezone", "UTC"))
        working_hours = snapshot.get("working_hours", DEFAULT_WORKING_HOURS)
        min_block_min = int(snapshot.get("min_block_min", 30))
        max_daily_focus_min = int(snapshot.get("max_daily_focus_min", 480))
        preferred_session_min = int(snapshot.get("preferred_session_min", 60))
        preferred_hours = {
            int(hour)
            for hour in snapshot.get("preferred_hours", [])
            if isinstance(hour, int) and 0 <= hour <= 23
        }

        # Parse blocked intervals
        busy_intervals: list[tuple[datetime, datetime]] = []
        for b in blocked:
            busy_intervals.append((_parse_iso(b["start_at"]), _parse_iso(b["end_at"])))

        # Generate candidate slots using each user's local weekday preferences.
        free_slots: list[tuple[datetime, datetime]] = []
        cur_day = horizon_start.astimezone(timezone).date()
        end_day = (horizon_end - timedelta(microseconds=1)).astimezone(timezone).date()

        while cur_day <= end_day:
            day_hours = (
                working_hours.get(cur_day.strftime("%A").lower())
                if isinstance(working_hours, dict)
                else None
            )
            if day_hours is None and isinstance(working_hours, dict) and "start" in working_hours:
                # Accept older single-window snapshots during the transition.
                day_hours = {"enabled": True, **working_hours}
            if day_hours is None:
                day_hours = DEFAULT_WORKING_HOURS[cur_day.strftime("%A").lower()]

            if not day_hours.get("enabled", True):
                cur_day += timedelta(days=1)
                continue

            day_start = datetime.combine(
                cur_day, time.fromisoformat(str(day_hours["start"])), tzinfo=timezone
            )
            day_end = datetime.combine(
                cur_day, time.fromisoformat(str(day_hours["end"])), tzinfo=timezone
            )

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
        daily_focus_used: dict[Any, int] = {}

        for task in sorted_tasks:
            raw_remaining = task.get("remaining_min")
            if raw_remaining is None or int(raw_remaining) <= 0:
                unscheduled.append(
                    {
                        "task_id": task["id"],
                        "title": task["title"],
                        "needed_min": None,
                        "reason": "NO_ESTIMATE",
                    }
                )
                continue

            rem_min = int(raw_remaining)
            dl_str = task.get("deadline_at")
            deadline_dt = _parse_iso(dl_str) if dl_str else None
            placed_chunks: list[dict[str, Any]] = []

            # Chunk into manageable work blocks and respect the daily focus cap.
            while rem_min > 0:
                placed = False
                slot_candidates: list[tuple[int, float, datetime, int, int]] = []
                for idx, (slot_start, slot_end) in enumerate(free_slots):
                    day = slot_start.astimezone(timezone).date()
                    remaining_daily_focus = max_daily_focus_min - daily_focus_used.get(day, 0)
                    chunk_dur = min(preferred_session_min, rem_min, remaining_daily_focus)
                    if chunk_dur < min_block_min and rem_min > chunk_dur:
                        continue
                    if chunk_dur <= 0:
                        continue
                    chunk_delta = timedelta(minutes=chunk_dur)
                    candidate_starts = [
                        datetime.combine(day, time(hour), tzinfo=timezone)
                        for hour in sorted(preferred_hours)
                        if preferred_hours
                        and datetime.combine(day, time(hour), tzinfo=timezone) >= slot_start
                        and datetime.combine(day, time(hour), tzinfo=timezone) + chunk_delta
                        <= slot_end
                    ]
                    candidates = [(candidate, 0) for candidate in candidate_starts]
                    candidates.append(
                        (
                            slot_start,
                            0 if slot_start.astimezone(timezone).hour in preferred_hours else 1,
                        )
                    )
                    for candidate, preference_cost in candidates:
                        distance = min(
                            (
                                abs(
                                    (
                                        candidate
                                        - datetime.combine(day, time(hour), tzinfo=timezone)
                                    ).total_seconds()
                                )
                                for hour in preferred_hours
                            ),
                            default=0.0,
                        )
                        slot_candidates.append(
                            (preference_cost, distance, candidate, idx, chunk_dur)
                        )

                for _, _, prop_start, idx, chunk_dur in sorted(slot_candidates):
                    slot_start, slot_end = free_slots[idx]
                    day = slot_start.astimezone(timezone).date()
                    chunk_delta = timedelta(minutes=chunk_dur)
                    # Check if fits in slot
                    if prop_start >= slot_start and prop_start + chunk_delta <= slot_end:
                        prop_end = prop_start + chunk_delta

                        # Check hard deadline if present
                        if (
                            deadline_dt
                            and task.get("deadline_kind") == "hard"
                            and prop_end > deadline_dt
                        ):
                            continue

                        # Reason codes
                        reasons = []
                        if deadline_dt:
                            reasons.append("DEADLINE_SOON")
                        if (
                            preferred_hours
                            and prop_start.astimezone(timezone).hour in preferred_hours
                        ):
                            reasons.append("PREFERRED_WINDOW")
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
                        daily_focus_used[day] = daily_focus_used.get(day, 0) + chunk_dur

                        # Preserve free time before and after a preferred start window.
                        replacement_slots = []
                        if slot_start < prop_start:
                            replacement_slots.append((slot_start, prop_start))
                        if prop_end < slot_end:
                            replacement_slots.append((prop_end, slot_end))
                        free_slots[idx : idx + 1] = replacement_slots

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
