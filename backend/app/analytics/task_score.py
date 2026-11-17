"""Transparent per-task execution score, separate from overall productivity score."""

from datetime import datetime


def calculate_task_score(
    *,
    completed_at: datetime | None,
    deadline_at: datetime | None,
    estimate_min: int | None,
    actual_min: int,
) -> tuple[int | None, list[str]]:
    """Score a completed task using only available deadline and estimate evidence.

    Each available signal contributes equally. Estimate accuracy decreases linearly
    with relative deviation and bottoms out at zero; there is no hours-worked bonus.
    """
    if completed_at is None:
        return None, []

    components: list[float] = []
    basis: list[str] = []
    if deadline_at is not None:
        components.append(100.0 if completed_at <= deadline_at else 0.0)
        basis.append("deadline_met")
    if estimate_min is not None and estimate_min > 0 and actual_min > 0:
        accuracy = max(0.0, 100.0 * (1.0 - abs(actual_min - estimate_min) / estimate_min))
        components.append(accuracy)
        basis.append("estimate_accuracy")

    if not components:
        return None, basis
    return round(sum(components) / len(components)), basis
