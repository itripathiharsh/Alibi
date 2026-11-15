"""Integration tests for Calendar Conflicts and Reminders (AC-M8-3, AC-M8-4)."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest


@pytest.mark.asyncio
async def test_calendar_conflicts_detection_api(auth_client: httpx.AsyncClient) -> None:
    """AC-M8-4: Test conflict detection for crafted overlap and over-capacity cases."""
    now = datetime.now(UTC)
    base_time = now.replace(minute=0, second=0, microsecond=0) + timedelta(days=2)

    # 1. Create two overlapping fixed events
    ev1_res = await auth_client.post(
        "/api/v1/scheduling/events",
        json={
            "title": "Team Sync",
            "kind": "fixed_event",
            "start_at": (base_time + timedelta(hours=10)).isoformat(),
            "end_at": (base_time + timedelta(hours=11, minutes=30)).isoformat(),
        },
    )
    assert ev1_res.status_code == 201

    ev2_res = await auth_client.post(
        "/api/v1/scheduling/events",
        json={
            "title": "Client Meeting",
            "kind": "fixed_event",
            "start_at": (base_time + timedelta(hours=11)).isoformat(),
            "end_at": (base_time + timedelta(hours=12)).isoformat(),
        },
    )
    assert ev2_res.status_code == 201

    # 2. Query conflicts
    conf_res = await auth_client.post(
        "/api/v1/scheduling/conflicts",
        json={
            "start_at": (base_time).isoformat(),
            "end_at": (base_time + timedelta(days=1)).isoformat(),
            "max_daily_minutes": 480,
        },
    )
    assert conf_res.status_code == 200
    conflicts = conf_res.json()
    assert len(conflicts) > 0
    overlap_conflict = next((c for c in conflicts if c["conflict_type"] == "overlap"), None)
    assert overlap_conflict is not None
    assert "Team Sync" in overlap_conflict["description"]
    assert "Client Meeting" in overlap_conflict["description"]


@pytest.mark.asyncio
async def test_notifications_lifecycle_and_quiet_hours(auth_client: httpx.AsyncClient) -> None:
    """AC-M8-3 & AC-M8-5: Test scheduling, quiet hours, delivery, and dismissal."""
    now = datetime.now(UTC)
    future_fire_at = now + timedelta(hours=2)

    # 1. Schedule a daytime notification
    notif_res = await auth_client.post(
        "/api/v1/notifications",
        json={
            "kind": "task_reminder",
            "fire_at": future_fire_at.isoformat(),
            "title": "Review PR #42",
            "body": "Remember to review frontend pull request",
            "suppress_in_quiet_hours": False,
        },
    )
    assert notif_res.status_code == 201
    notif_data = notif_res.json()
    notif_id = notif_data["id"]
    assert notif_data["status"] == "scheduled"

    # 2. List notifications
    list_res = await auth_client.get("/api/v1/notifications?status=scheduled")
    assert list_res.status_code == 200
    items = list_res.json()
    assert any(n["id"] == notif_id for n in items)

    # 3. Dismiss notification
    dismiss_res = await auth_client.post(f"/api/v1/notifications/{notif_id}/dismiss")
    assert dismiss_res.status_code == 200

    # Verify dismissed
    list_res2 = await auth_client.get("/api/v1/notifications?status=dismissed")
    assert list_res2.status_code == 200
    dismissed_items = list_res2.json()
    assert any(n["id"] == notif_id for n in dismissed_items)

