"""Performance benchmark for Analytics Dashboard queries.

Implements NFR-PERF-004 and AC-M3-4:
Proves that the monthly dashboard summary query achieves p95 latency < 800 ms.
"""

import time
import uuid
import zoneinfo
from datetime import datetime, timedelta

import pytest
import uuid6

from app.models.category import Category
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.workspace import Workspace
from app.services.analytics_service import AnalyticsService


@pytest.mark.asyncio
async def test_monthly_dashboard_query_latency(db_session):
    """Benchmark monthly summary query to verify p95 latency < 800 ms (NFR-PERF-004)."""
    tz = zoneinfo.ZoneInfo("UTC")
    now = datetime.now(tz)
    user = User(
        id=uuid6.uuid7(),
        email=f"perf-{uuid.uuid4().hex[:6]}@example.com",
        display_name="Benchmark User",
        password_hash="hash",
    )
    workspace = Workspace(
        id=uuid6.uuid7(),
        user_id=user.id,
        name="Benchmark Workspace",
        is_default=True,
    )
    category = Category(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        name="Engineering",
        slug="engineering",
        color="#2563EB",
        sharing_class="professional",
    )
    db_session.add_all([user, workspace, category])
    await db_session.flush()

    # Bulk insert 500 tasks and 1,000 time entries for realistic indexing profile
    tasks = []
    time_entries = []
    for i in range(500):
        t_id = uuid6.uuid7()
        comp_at = now - timedelta(days=i % 28, hours=i % 24)
        t = Task(
            id=t_id,
            user_id=user.id,
            workspace_id=workspace.id,
            category_id=category.id,
            title=f"Benchmark Task {i}",
            status="completed" if i % 2 == 0 else "pending",
            priority=2,
            deadline_at=comp_at + timedelta(days=1),
            completed_at=comp_at if i % 2 == 0 else None,
            estimate_final_min=45,
            actual_min=45 if i % 2 == 0 else 0,
        )
        tasks.append(t)

        for j in range(2):
            st = comp_at - timedelta(minutes=30 * (j + 1))
            et = comp_at - timedelta(minutes=30 * j)
            te = TimeEntry(
                id=uuid6.uuid7(),
                user_id=user.id,
                task_id=t_id,
                started_at=st,
                ended_at=et,
                duration_min=30,
            )
            time_entries.append(te)

    db_session.add_all(tasks)
    db_session.add_all(time_entries)
    await db_session.commit()

    service = AnalyticsService(db_session)

    # Measure execution latency over 10 consecutive runs
    durations = []
    for _ in range(10):
        t0 = time.perf_counter()
        res = await service.get_summary(user_id=user.id, period="monthly")
        durations.append((time.perf_counter() - t0) * 1000)  # ms
        assert res.tasks_completed > 0

    durations.sort()
    # 95th percentile
    p95_ms = durations[int(0.95 * len(durations))]
    print(f"\n[PERF] Monthly summary query latency: p95 = {p95_ms:.2f} ms (Target < 800 ms)")

    assert p95_ms < 800, f"Query p95 latency {p95_ms:.2f} ms exceeded 800 ms threshold"
