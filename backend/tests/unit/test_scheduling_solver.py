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


def test_schedule_uses_user_timezone_and_weekday_working_hours() -> None:
    """FR-SCHED-002: User work windows are interpreted in their configured timezone."""
    snapshot = {
        "horizon_start": "2026-11-16T00:00:00Z",
        "horizon_end": "2026-11-16T08:00:00Z",
        "timezone": "Asia/Kolkata",
        "working_hours": {
            "monday": {"enabled": True, "start": "09:00", "end": "17:00"},
            "saturday": {"enabled": False, "start": "09:00", "end": "17:00"},
        },
        "max_daily_focus_min": 60,
        "tasks": [
            {"id": "task-1", "title": "Review draft", "remaining_min": 60, "deadline_at": None}
        ],
        "blocked_intervals": [],
    }

    result = GreedyScheduler().solve(snapshot)
    assert result["proposals"][0]["start_at"] == "2026-11-16T09:00:00+05:30"
    assert result["proposals"][0]["end_at"] == "2026-11-16T10:00:00+05:30"


def test_unestimated_task_is_not_given_a_fabricated_schedule_duration() -> None:
    """FR-SCHED-002: Work without a recorded estimate stays unscheduled for review."""
    snapshot = {
        "horizon_start": "2026-11-17T09:00:00Z",
        "horizon_end": "2026-11-17T18:00:00Z",
        "working_hours": {"start": "09:00", "end": "18:00"},
        "tasks": [{"id": "task-1", "title": "Review draft", "remaining_min": None}],
        "blocked_intervals": [],
    }

    result = GreedyScheduler().solve(snapshot)
    assert result["proposals"] == []
    assert result["unscheduled"] == [
        {"task_id": "task-1", "title": "Review draft", "needed_min": None, "reason": "NO_ESTIMATE"}
    ]


def test_learned_session_length_and_focus_window_shape_proposal() -> None:
    """FR-LEARN-005: Reliable personal patterns influence block length and start time."""
    snapshot = {
        "horizon_start": "2026-11-17T00:00:00Z",
        "horizon_end": "2026-11-17T14:00:00Z",
        "timezone": "Asia/Kolkata",
        "working_hours": {"tuesday": {"enabled": True, "start": "09:00", "end": "17:00"}},
        "preferred_session_min": 45,
        "preferred_hours": [14],
        "tasks": [{"id": "task-1", "title": "Review draft", "remaining_min": 90}],
        "blocked_intervals": [],
    }

    proposals = GreedyScheduler().solve(snapshot)["proposals"]
    assert [item["duration_min"] for item in proposals] == [45, 45]
    assert proposals[0]["start_at"] == "2026-11-17T14:00:00+05:30"
    assert all("PREFERRED_WINDOW" in item["reasons"] for item in proposals)
