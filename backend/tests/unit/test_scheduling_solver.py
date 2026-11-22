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


def test_cpsat_solver_executes_and_reports_cpsat_status() -> None:
    """AC-SCH-7: When OR-Tools is installed, SchedulingSolver executes CP-SAT and reports status."""
    solver = SchedulingSolver()
    snapshot = {
        "horizon_start": "2026-11-17T09:00:00Z",
        "horizon_end": "2026-11-17T18:00:00Z",
        "working_hours": {"start": "09:00", "end": "18:00"},
        "tasks": [
            {
                "id": "task-cp-1",
                "title": "Architectural Review",
                "priority": 1,
                "remaining_min": 60,
                "deadline_at": "2026-11-17T12:00:00Z",
                "deadline_kind": "hard",
            },
            {
                "id": "task-cp-2",
                "title": "Security audit",
                "priority": 2,
                "remaining_min": 60,
                "deadline_at": "2026-11-17T17:00:00Z",
            },
        ],
        "blocked_intervals": [
            {
                "id": "fixed-lunch",
                "title": "Team lunch",
                "kind": "fixed_event",
                "start_at": "2026-11-17T12:00:00Z",
                "end_at": "2026-11-17T13:00:00Z",
            }
        ],
    }

    result = solver.solve(snapshot)
    assert result["solver_status"] in ("cpsat_optimal", "cpsat_feasible")
    assert len(result["proposals"]) == 2
    assert "solve_ms" in result

    # Check non-overlapping with fixed event
    lunch_s = datetime.fromisoformat("2026-11-17T12:00:00Z")
    lunch_e = datetime.fromisoformat("2026-11-17T13:00:00Z")
    for p in result["proposals"]:
        start = datetime.fromisoformat(p["start_at"])
        end = datetime.fromisoformat(p["end_at"])
        assert not (start < lunch_e and end > lunch_s), (
            f"CP-SAT block {p} overlaps with fixed event"
        )
        assert len(p["reasons"]) >= 1

    # Hard deadline check for task-cp-1: must finish <= 12:00
    p1 = [p for p in result["proposals"] if p["task_id"] == "task-cp-1"][0]
    assert datetime.fromisoformat(p1["end_at"]) <= datetime.fromisoformat("2026-11-17T12:00:00Z")


def test_cpsat_solver_respects_explicit_greedy_override() -> None:
    """AC-SCH-7: Explicit request for greedy scheduler returns solver_status='greedy'."""
    solver = SchedulingSolver()
    snapshot = {
        "horizon_start": "2026-11-17T09:00:00Z",
        "horizon_end": "2026-11-17T18:00:00Z",
        "solver": "greedy",
        "tasks": [
            {"id": "t1", "title": "A", "priority": 1, "remaining_min": 60, "deadline_at": None}
        ],
        "blocked_intervals": [],
    }

    result = solver.solve(snapshot)
    assert result["solver_status"] == "greedy"
    assert len(result["proposals"]) == 1


def test_regression_KI_028_cpsat_schedules_task_when_first_free_slot_is_far_away() -> None:
    """Regression: with a Sunday-night horizon and weekends off, the first slot is Monday 09:00
    (~1,755 minutes away). The old objective charged 1 per minute of delay but only 1,000 for
    dropping a priority-4 task, so CP-SAT reported "optimal" while scheduling nothing."""
    solver = SchedulingSolver()
    snapshot = {
        "horizon_start": "2026-11-21T22:15:00Z",  # Sunday 03:45 in Asia/Kolkata
        "horizon_end": "2026-11-28T22:15:00Z",
        "timezone": "Asia/Kolkata",
        "tasks": [
            {
                "id": "task-far-1",
                "title": "Finalize Q4 presentation slides",
                "priority": 4,
                "remaining_min": 60,
                "deadline_at": None,
            }
        ],
        "blocked_intervals": [],
    }

    result = solver.solve(snapshot)

    assert result["solver_status"] in ("cpsat_optimal", "cpsat_feasible")
    assert result["unscheduled"] == []
    assert len(result["proposals"]) == 1
    start = datetime.fromisoformat(result["proposals"][0]["start_at"])
    assert start.weekday() < 5, "must land on a working weekday"
