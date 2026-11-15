"""Integration tests for Analytics API endpoints.

Tests summary, midnight-spanning time entries (AC-M3-3), formula, productivity score,
and chart endpoints against live database fixtures.
"""

import uuid
from datetime import timedelta

import pytest
import uuid6

from app.core.security import create_access_token
from app.models.category import Category
from app.models.device import Device
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.workspace import Workspace
from app.services.analytics_service import resolve_period


@pytest.mark.asyncio
async def test_analytics_formula_endpoint(client):
    """GET /api/v1/analytics/formula returns formula version 1 with transparent rules."""
    res = await client.get("/api/v1/analytics/formula")
    assert res.status_code == 200
    data = res.json()
    assert data["formula_version"] == 1
    assert "weights" in data
    assert data["weights"]["completion_weight"] == 0.5
    assert len(data["rules"]) > 0


@pytest.mark.asyncio
async def test_analytics_summary_and_midnight_spanning_time(client, db_session):
    """GET /api/v1/analytics/summary correctly calculates metrics and splits midnight-spanning entries (AC-M3-3)."""
    user = User(
        id=uuid6.uuid7(),
        email=f"analytics-api-{uuid.uuid4().hex[:6]}@example.com",
        display_name="Analytics API User",
        password_hash="hash",
    )
    workspace = Workspace(
        id=uuid6.uuid7(),
        user_id=user.id,
        name="Personal",
        is_default=True,
    )
    device = Device(
        id=uuid6.uuid7(),
        user_id=user.id,
        name="Test Device",
        platform="web",
    )
    category = Category(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        name="Work",
        slug="work",
        color="#3B82F6",
        sharing_class="professional",
    )
    db_session.add_all([user, workspace, device, category])
    await db_session.flush()

    token = create_access_token(user_id=user.id, device_id=device.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Determine current weekly boundary
    start_utc, end_utc = resolve_period("weekly", "Asia/Kolkata")

    # Add 3 completed tasks
    for i in range(3):
        t = Task(
            id=uuid6.uuid7(),
            user_id=user.id,
            workspace_id=workspace.id,
            category_id=category.id,
            title=f"Completed Task {i}",
            status="completed",
            priority=2,
            deadline_at=start_utc + timedelta(days=2),
            completed_at=start_utc + timedelta(days=2, hours=1),
            estimate_final_min=60,
            actual_min=60,
        )
        db_session.add(t)

    # Add 1 task spanning the start boundary:
    # Started 30 min before start_utc, ended 90 min after start_utc (Total: 120 min)
    # The overlapping portion inside this week is exactly 90 min!
    task_span = Task(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        title="Spanning Task",
        status="in_progress",
    )
    db_session.add(task_span)
    await db_session.flush()

    te = TimeEntry(
        id=uuid6.uuid7(),
        user_id=user.id,
        task_id=task_span.id,
        started_at=start_utc - timedelta(minutes=30),
        ended_at=start_utc + timedelta(minutes=90),
        duration_min=120,
    )
    db_session.add(te)
    await db_session.flush()

    res = await client.get("/api/v1/analytics/summary?period=weekly", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["tasks_completed"] == 3
    # Exactly 90 minutes within period
    assert data["total_time_min"] == 90
    assert data["completion_rate"] is not None


@pytest.mark.asyncio
async def test_analytics_charts_endpoints(client, db_session):
    """GET /api/v1/analytics/charts/* endpoints return formatted chart datasets."""
    user = User(
        id=uuid6.uuid7(),
        email=f"charts-api-{uuid.uuid4().hex[:6]}@example.com",
        display_name="Charts API User",
        password_hash="hash",
    )
    workspace = Workspace(
        id=uuid6.uuid7(),
        user_id=user.id,
        name="Personal",
        is_default=True,
    )
    device = Device(
        id=uuid6.uuid7(),
        user_id=user.id,
        name="Test Device",
        platform="web",
    )
    cat = Category(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        name="Engineering",
        slug="engineering",
        color="#10B981",
        sharing_class="professional",
    )
    db_session.add_all([user, workspace, device, cat])
    await db_session.flush()

    token = create_access_token(user_id=user.id, device_id=device.id)
    headers = {"Authorization": f"Bearer {token}"}

    start_utc, end_utc = resolve_period("weekly", "Asia/Kolkata")

    # Add tasks
    t1 = Task(
        id=uuid6.uuid7(),
        user_id=user.id,
        workspace_id=workspace.id,
        category_id=cat.id,
        title="Chart Task 1",
        status="completed",
        completed_at=start_utc + timedelta(days=1),
        estimate_final_min=45,
        actual_min=50,
    )
    db_session.add(t1)
    await db_session.flush()

    # Time entry
    te = TimeEntry(
        id=uuid6.uuid7(),
        user_id=user.id,
        task_id=t1.id,
        started_at=start_utc + timedelta(days=1),
        ended_at=start_utc + timedelta(days=1, minutes=50),
        duration_min=50,
    )
    db_session.add(te)
    await db_session.flush()

    # 1. Completion trend
    r1 = await client.get(
        "/api/v1/analytics/charts/completion-trend?period=weekly", headers=headers
    )
    assert r1.status_code == 200
    trend = r1.json()
    assert len(trend) == 7
    assert sum(p["completed_count"] for p in trend) == 1

    # 2. Time distribution
    r2 = await client.get(
        "/api/v1/analytics/charts/time-distribution?period=weekly", headers=headers
    )
    assert r2.status_code == 200
    dist = r2.json()
    assert len(dist) == 1
    assert dist[0]["category_name"] == "Engineering"
    assert dist[0]["total_min"] == 50

    # 3. Consistency heatmap
    r3 = await client.get("/api/v1/analytics/charts/consistency-heatmap?days=30", headers=headers)
    assert r3.status_code == 200
    heatmap = r3.json()
    assert len(heatmap) > 0

    # 4. Est vs Actual
    r4 = await client.get("/api/v1/analytics/charts/est-vs-actual?period=weekly", headers=headers)
    assert r4.status_code == 200
    eva = r4.json()
    assert len(eva) == 1
    assert eva[0]["estimate_min"] == 45
    assert eva[0]["actual_min"] == 50

    # 5. Category workload
    r5 = await client.get(
        "/api/v1/analytics/charts/category-workload?period=weekly", headers=headers
    )
    assert r5.status_code == 200
    workload = r5.json()
    assert len(workload) == 1
    assert workload[0]["category_name"] == "Engineering"
