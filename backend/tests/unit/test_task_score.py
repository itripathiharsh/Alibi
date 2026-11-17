"""FR-DASH-007 per-task score behavior."""

from datetime import UTC, datetime, timedelta

from app.analytics.task_score import calculate_task_score


def test_fr_dash_007_task_score_uses_available_evidence_without_hours_bonus() -> None:
    completed = datetime(2026, 11, 18, 12, tzinfo=UTC)
    deadline = completed + timedelta(hours=1)
    score, basis = calculate_task_score(
        completed_at=completed,
        deadline_at=deadline,
        estimate_min=60,
        actual_min=60,
    )
    assert score == 100
    assert basis == ["deadline_met", "estimate_accuracy"]

    longer_actual, _ = calculate_task_score(
        completed_at=completed,
        deadline_at=deadline,
        estimate_min=60,
        actual_min=90,
    )
    assert longer_actual == 75


def test_task_score_is_unavailable_without_a_target_or_before_completion() -> None:
    now = datetime.now(UTC)
    assert calculate_task_score(
        completed_at=None,
        deadline_at=now,
        estimate_min=30,
        actual_min=30,
    ) == (None, [])
    assert calculate_task_score(
        completed_at=now,
        deadline_at=None,
        estimate_min=None,
        actual_min=30,
    ) == (None, [])


def test_task_score_rewards_deadline_adherence_when_no_estimate_exists() -> None:
    completed = datetime.now(UTC)
    assert calculate_task_score(
        completed_at=completed,
        deadline_at=completed - timedelta(minutes=1),
        estimate_min=None,
        actual_min=500,
    ) == (0, ["deadline_met"])


def test_task_score_does_not_treat_untracked_time_as_zero_actual() -> None:
    completed = datetime.now(UTC)
    assert calculate_task_score(
        completed_at=completed,
        deadline_at=completed + timedelta(hours=1),
        estimate_min=30,
        actual_min=0,
    ) == (100, ["deadline_met"])
