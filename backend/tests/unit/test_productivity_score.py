"""Unit tests for Productivity Score v1 invariants and rules.

Implements AC-M3-2, AC-AN-2, and doc 10 §3:
1. Hours scaling invariance: logging hours does not raise or lower score.
2. Reasonable reschedule not penalised.
3. Cancelled tasks strictly excluded.
4. Insufficient data (< 3 tasks) returns null score.
"""

import uuid
from datetime import timedelta

import pytest
import uuid6

from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.workspace import Workspace
from app.services.analytics_service import AnalyticsService, resolve_period


@pytest.mark.asyncio
async def test_insufficient_data_returns_null(db_session):
    """When fewer than 3 tasks exist in the period, score must return null."""
    start_utc, end_utc = resolve_period("weekly", "Asia/Kolkata")
    user = User(
        id=uuid6.uuid7(),
        email=f"score-insuf-{uuid.uuid4().hex[:6]}@example.com",
        display_name="Score Test User",
        password_hash="hash",
    )
    workspace = Workspace(
        id=uuid6.uuid7(),
        user_id=user.id,
        name="Personal",
        is_default=True,
    )
    db_session.add_all([user, workspace])
    await db_session.flush()

    # Only 2 tasks in period
    t1 = Task(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        title="Task 1",
        status="completed",
        completed_at=start_utc + timedelta(days=1),
        deadline_at=start_utc + timedelta(days=2),
    )
    t2 = Task(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        title="Task 2",
        status="pending",
        deadline_at=start_utc + timedelta(days=3),
    )
    db_session.add_all([t1, t2])
    await db_session.flush()

    service = AnalyticsService(db_session)
    res = await service.get_productivity_score(user_id=user.id, period="weekly")

    assert res.score is None
    assert res.insufficient_data is True
    assert "fewer than 3 tasks" in (res.message or "")


@pytest.mark.asyncio
async def test_hours_scaling_invariance(db_session):
    """Doubling or 10x-ing logged hours must leave the productivity score strictly unchanged."""
    user = User(
        id=uuid6.uuid7(),
        email=f"score-hours-{uuid.uuid4().hex[:6]}@example.com",
        display_name="Score Invariance User",
        password_hash="hash",
    )
    workspace = Workspace(
        id=uuid6.uuid7(),
        user_id=user.id,
        name="Personal",
        is_default=True,
    )
    db_session.add_all([user, workspace])
    await db_session.flush()

    start_utc, end_utc = resolve_period("weekly", "Asia/Kolkata")

    # Create 4 tasks inside the current weekly period
    tasks = []
    for i in range(4):
        t = Task(
            id=uuid6.uuid7(),
            user_id=user.id,
            workspace_id=workspace.id,
            title=f"Task {i}",
            status="completed",
            priority=2,
            deadline_at=start_utc + timedelta(days=2),
            completed_at=start_utc + timedelta(days=1),  # On time
            estimate_final_min=60,
            actual_min=60,
        )
        tasks.append(t)
    db_session.add_all(tasks)
    await db_session.flush()

    service = AnalyticsService(db_session)
    score_before = await service.get_productivity_score(user_id=user.id, period="weekly")
    assert score_before.score is not None

    # Add 100 hours of time entries inside the period
    for t in tasks:
        te = TimeEntry(
            id=uuid6.uuid7(),
            user_id=user.id,
            task_id=t.id,
            started_at=start_utc + timedelta(days=1),
            ended_at=start_utc + timedelta(days=1, hours=2),
            duration_min=120,
        )
        db_session.add(te)
    await db_session.flush()

    score_after = await service.get_productivity_score(user_id=user.id, period="weekly")
    assert score_after.score == score_before.score


@pytest.mark.asyncio
async def test_reasonable_reschedule_not_penalised(db_session):
    """A task completed on or before its rescheduled deadline is treated as on-time."""
    user = User(
        id=uuid6.uuid7(),
        email=f"score-resched-{uuid.uuid4().hex[:6]}@example.com",
        display_name="Reschedule Test User",
        password_hash="hash",
    )
    workspace = Workspace(
        id=uuid6.uuid7(),
        user_id=user.id,
        name="Personal",
        is_default=True,
    )
    db_session.add_all([user, workspace])
    await db_session.flush()

    start_utc, end_utc = resolve_period("weekly", "Asia/Kolkata")

    # 3 completed tasks: 1 with 1 reasonable reschedule completed by new deadline
    t1 = Task(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        title="Rescheduled Task",
        status="completed",
        priority=3,
        reschedule_count=1,
        deadline_at=start_utc + timedelta(days=3),
        completed_at=start_utc + timedelta(days=2),  # completed before new deadline
        estimate_final_min=60,
        actual_min=60,
    )
    t2 = Task(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        title="Task 2",
        status="completed",
        priority=3,
        deadline_at=start_utc + timedelta(days=2),
        completed_at=start_utc + timedelta(days=1),
        estimate_final_min=60,
        actual_min=60,
    )
    t3 = Task(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        title="Task 3",
        status="completed",
        priority=3,
        deadline_at=start_utc + timedelta(days=2),
        completed_at=start_utc + timedelta(days=1),
        estimate_final_min=60,
        actual_min=60,
    )
    db_session.add_all([t1, t2, t3])
    await db_session.flush()

    service = AnalyticsService(db_session)
    res = await service.get_productivity_score(user_id=user.id, period="weekly")

    assert res.score == 100
    assert res.on_time_component == 1.0


@pytest.mark.asyncio
async def test_cancelled_tasks_excluded(db_session):
    """Cancelled tasks must be excluded from completion rate and score denominators."""
    user = User(
        id=uuid6.uuid7(),
        email=f"score-cancel-{uuid.uuid4().hex[:6]}@example.com",
        display_name="Cancel Test User",
        password_hash="hash",
    )
    workspace = Workspace(
        id=uuid6.uuid7(),
        user_id=user.id,
        name="Personal",
        is_default=True,
    )
    db_session.add_all([user, workspace])
    await db_session.flush()

    start_utc, end_utc = resolve_period("weekly", "Asia/Kolkata")

    # 3 completed tasks inside weekly period
    for i in range(3):
        t = Task(
            id=uuid6.uuid7(),
            user_id=user.id,
            workspace_id=workspace.id,
            title=f"Completed {i}",
            status="completed",
            priority=3,
            deadline_at=start_utc + timedelta(days=2),
            completed_at=start_utc + timedelta(days=1),
            estimate_final_min=60,
            actual_min=60,
        )
        db_session.add(t)

    # 5 cancelled tasks
    for i in range(5):
        t = Task(
            id=uuid6.uuid7(),
            user_id=user.id,
            workspace_id=workspace.id,
            title=f"Cancelled {i}",
            status="cancelled",
            priority=1,
            deadline_at=start_utc + timedelta(days=2),
        )
        db_session.add(t)
    await db_session.flush()

    service = AnalyticsService(db_session)
    res = await service.get_productivity_score(user_id=user.id, period="weekly")

    # If cancelled tasks were counted, completion would be 3 / 8 = 37.5%
    # With cancelled excluded, completion is 3 / 3 = 100%
    assert res.completion_component == 1.0
    assert res.score == 100
