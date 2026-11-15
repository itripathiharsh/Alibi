"""Integration test proving Materialized View rollup equivalence.

Implements AC-M3-1, AC-AN-1, and doc 10 §7:
Proves that `mv_daily_task_stats` aggregates strictly equal base-table results.
"""

import uuid
import zoneinfo
from datetime import datetime, timedelta

import pytest
import uuid6
from sqlalchemy import func, select, text

from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace


@pytest.mark.asyncio
async def test_mv_daily_task_stats_equals_base_table(db_session):
    """Verify that mv_daily_task_stats completed_count and on_time_count equal base-table queries."""
    tz = zoneinfo.ZoneInfo("Asia/Kolkata")
    now_local = datetime.now(tz)
    user = User(
        id=uuid6.uuid7(),
        email=f"mv-test-{uuid.uuid4().hex[:6]}@example.com",
        display_name="MV Test User",
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

    # Seed 10 completed tasks with varying deadlines
    for i in range(10):
        comp_time = now_local - timedelta(days=(i % 3), hours=i)
        # Half on time, half late
        deadline_time = (
            comp_time + timedelta(hours=1) if (i % 2 == 0) else comp_time - timedelta(hours=1)
        )
        t = Task(
            id=uuid6.uuid7(),
            user_id=user.id,
            workspace_id=workspace.id,
            title=f"MV Task {i}",
            status="completed",
            completed_at=comp_time.astimezone(zoneinfo.ZoneInfo("UTC")),
            deadline_at=deadline_time.astimezone(zoneinfo.ZoneInfo("UTC")),
        )
        db_session.add(t)
    await db_session.commit()

    # Refresh materialized view
    await db_session.execute(text("REFRESH MATERIALIZED VIEW mv_daily_task_stats;"))
    await db_session.commit()

    # Query from base table
    base_query = (
        select(
            func.date(func.timezone("Asia/Kolkata", Task.completed_at)).label("stat_date"),
            func.count(Task.id).label("completed_count"),
            func.count(
                func.nullif(
                    Task.completed_at <= Task.deadline_at,
                    False,
                )
            ).label("on_time_count"),
        )
        .where(
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
            Task.status == "completed",
            Task.completed_at.is_not(None),
        )
        .group_by("stat_date")
        .order_by("stat_date")
    )
    base_rows = (await db_session.execute(base_query)).all()

    # Query from materialized view
    mv_query = text(
        """
        SELECT stat_date, completed_count, on_time_count
        FROM mv_daily_task_stats
        WHERE user_id = :uid
        ORDER BY stat_date
        """
    )
    mv_rows = (await db_session.execute(mv_query, {"uid": user.id})).all()

    assert len(base_rows) > 0
    assert len(base_rows) == len(mv_rows)

    for b, m in zip(base_rows, mv_rows, strict=True):
        assert b[0] == m[0], f"Date mismatch: base {b[0]} != mv {m[0]}"
        assert int(b[1]) == int(m[1]), (
            f"Completed count mismatch on {b[0]}: base {b[1]} != mv {m[1]}"
        )
        assert int(b[2]) == int(m[2]), f"On-time count mismatch on {b[0]}: base {b[2]} != mv {m[2]}"
