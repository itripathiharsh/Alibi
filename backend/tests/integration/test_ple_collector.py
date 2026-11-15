"""Integration tests for PLE Collector and observation immutability (AC-PLE-1, AC-DB-3)."""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.learning.collector import PLECollector
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace


@pytest.mark.asyncio
async def test_ple_collector_creates_immutable_observations(db_session: AsyncSession) -> None:
    """AC-PLE-1 & AC-DB-3: Collector appends observations; UPDATE is rejected by trigger."""
    user_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    user = User(id=user_id, email=f"col_{uuid.uuid4().hex[:6]}@example.com", password_hash="h")
    ws = Workspace(id=ws_id, user_id=user_id, name="W", is_default=True)
    db_session.add(user)
    db_session.add(ws)
    await db_session.flush()

    task = Task(
        user_id=user_id,
        workspace_id=ws_id,
        title="Test task for observations",
        raw_input="Test task for observations",
        status="pending",
    )
    db_session.add(task)
    await db_session.flush()

    collector = PLECollector(db_session)
    obs = await collector.on_task_created(
        user_id=user_id,
        task_id=task.id,
        category="professional",
        origin="voice",
        has_deadline=True,
        estimate_user_min=45,
    )
    await db_session.commit()

    assert obs.id is not None
    assert obs.observation_type == "task_created"
    assert obs.features["category"] == "professional"

    # Attempting to UPDATE an observation must be rejected by append-only trigger
    with pytest.raises(DBAPIError) as exc:
        await db_session.execute(
            text("UPDATE behavior_observations SET observation_type = 'tampered' WHERE id = :id"),
            {"id": obs.id},
        )
    assert "is append-only" in str(exc.value)
