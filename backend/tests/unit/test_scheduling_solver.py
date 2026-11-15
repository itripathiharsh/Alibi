"""Tests for Scheduling Solver and Greedy Scheduler (doc 09 §4, AC-SCH-1, AC-SCH-5, AC-SCH-6)."""

from datetime import datetime

from app.scheduling.greedy_solver import GreedyScheduler
from app.scheduling.solver import SchedulingSolver


def test_greedy_scheduler_satisfies_hard_constraints() -> None:
    """AC-SCH-1: Blocks never overlap with fixed events and stay strictly within working hours."""
    scheduler = GreedyScheduler()

    snapshot = {
        "horizon_start": "2026-11-17T09:00:00Z",
        "horizon_end": "2026-11-17T18:00:00Z",
        "working_hours": {"start": "09:00", "end": "18:00"},
        "tasks": [
            {
                "id": "task-1",
                "title": "High priority client deck",
                "priority": 1,
                "remaining_min": 60,
                "deadline_at": "2026-11-17T12:00:00Z",
            },
            {
                "id": "task-2",
                "title": "Refactor database migrations",
                "priority": 2,
                "remaining_min": 90,
                "deadline_at": "2026-11-17T17:00:00Z",
            },
        ],
        "blocked_intervals": [
            {
                "id": "evt-1",
                "title": "Team Standup",
                "kind": "fixed_event",
                "start_at": "2026-11-17T10:00:00Z",
                "end_at": "2026-11-17T11:00:00Z",
            }
        ],
    }

    result = scheduler.solve(snapshot)
    proposals = result["proposals"]
    assert len(proposals) >= 2

    # Verify no block overlaps with Team Standup (10:00 to 11:00)
    for p in proposals:
        start = datetime.fromisoformat(p["start_at"])
        end = datetime.fromisoformat(p["end_at"])

        # AC-SCH-5: Every block must have >= 1 reason code
        assert len(p["reasons"]) >= 1

        # Check standup overlap
        standup_start = datetime.fromisoformat("2026-11-17T10:00:00Z")
        standup_end = datetime.fromisoformat("2026-11-17T11:00:00Z")
        assert not (start < standup_end and end > standup_start), (
            f"Block {p} overlaps with fixed event"
        )

        # Check within working hours
        assert start.hour >= 9
        assert end.hour <= 18 or (end.hour == 18 and end.minute == 0)


def test_scheduling_is_deterministic() -> None:
    """AC-SCH-6: Same snapshot input yields identical proposals and timings."""
    solver = SchedulingSolver()
    snapshot = {
        "horizon_start": "2026-11-17T09:00:00Z",
        "horizon_end": "2026-11-18T18:00:00Z",
        "tasks": [
            {"id": "t1", "title": "A", "priority": 2, "remaining_min": 60, "deadline_at": None},
            {"id": "t2", "title": "B", "priority": 1, "remaining_min": 30, "deadline_at": None},
        ],
        "blocked_intervals": [],
    }

    res1 = solver.solve(snapshot)
    res2 = solver.solve(snapshot)

    assert res1["proposals"] == res2["proposals"]
    assert res1["unscheduled"] == res2["unscheduled"]
