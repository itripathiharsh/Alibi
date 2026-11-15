"""Tests for PLE Routine Detector and Burst Exclusion Rule (doc 07 §6, AC-PLE-4)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.learning.routines import PLERoutineDetector
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace


@pytest.mark.asyncio
async def test_burst_cluster_produces_zero_routines(db_session: AsyncSession) -> None:
    """AC-PLE-4: A burst cluster (all occurrences within a 10-day window) produces 0 routines."""
    user_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    db_session.add(
        User(id=user_id, email=f"burst_{uuid.uuid4().hex[:6]}@example.com", password_hash="h")
    )
    db_session.add(Workspace(id=ws_id, user_id=user_id, name="W", is_default=True))
    await db_session.flush()

    now = datetime(2026, 11, 1, 10, 0, tzinfo=UTC)
    # Create 6 tasks in 8 days (burst pattern)
    for i in range(6):
        t = Task(
            user_id=user_id,
            workspace_id=ws_id,
            title="Update tax filing paperwork",
            status="completed",
            actual_min=45,
            created_at=now + timedelta(days=i),
            completed_at=now + timedelta(days=i, hours=1),
        )
        db_session.add(t)
    await db_session.commit()

    detector = PLERoutineDetector(db_session)
    routines = await detector.detect_user_routines(user_id)
    # Must reject burst cluster (span < 21 days and burst concentration)
    assert len(routines) == 0


@pytest.mark.asyncio
async def test_valid_weekly_routine_detected(db_session: AsyncSession) -> None:
    """A periodic task spanning 28 days across 5 weeks is successfully detected."""
    user_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    db_session.add(
        User(id=user_id, email=f"routine_{uuid.uuid4().hex[:6]}@example.com", password_hash="h")
    )
    db_session.add(Workspace(id=ws_id, user_id=user_id, name="W", is_default=True))
    await db_session.flush()

    base = utc_now() - timedelta(days=28)
    # 5 occurrences, exactly 7 days apart (span = 28 days) ending today
    for i in range(5):
        t = Task(
            user_id=user_id,
            workspace_id=ws_id,
            title="Weekly team retrospective meeting",
            status="completed",
            actual_min=60,
            created_at=base + timedelta(days=7 * i),
            completed_at=base + timedelta(days=7 * i, hours=1),
        )
        db_session.add(t)
    await db_session.commit()

    detector = PLERoutineDetector(db_session)
    routines = await detector.detect_user_routines(user_id)
    assert len(routines) == 1
    r = routines[0]
    assert r.periodicity == "weekly"
    assert r.sample_count == 5
    assert r.is_burst is False
    assert r.confidence > 0.4
