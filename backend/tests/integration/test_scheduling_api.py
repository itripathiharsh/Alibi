"""Integration tests for Scheduling and Proposal API (AC-SCH-3, AC-SCH-4)."""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest


@pytest.mark.asyncio
async def test_scheduling_proposal_lifecycle_and_stale_rejection(
    auth_client: httpx.AsyncClient,
) -> None:
    """AC-SCH-3 & AC-SCH-4: Test proposal generation, stale 409 rejection, and acceptance."""
    # 1. Create a task to schedule
    t_res = await auth_client.post(
        "/api/v1/tasks",
        json={"title": "Finalize Q4 presentation slides", "estimate_user_min": 60},
    )
    assert t_res.status_code == 201

    # 2. Create a fixed event (e.g. Dentists appointment)
    now = datetime.now(UTC)
    evt_start = (now + timedelta(days=1)).replace(hour=14, minute=0, second=0, microsecond=0)
    evt_end = evt_start + timedelta(hours=1)
    ev_res = await auth_client.post(
        "/api/v1/scheduling/events",
        json={
            "title": "Dentist Appointment",
            "kind": "fixed_event",
            "start_at": evt_start.isoformat(),
            "end_at": evt_end.isoformat(),
        },
    )
    assert ev_res.status_code == 201

    # 3. Generate proposal
    prop_res = await auth_client.post(
        "/api/v1/scheduling/proposals/generate",
        json={"scope": "horizon", "horizon_days": 7},
    )
    assert prop_res.status_code == 200
    prop_data = prop_res.json()
    rec_id = prop_data["id"]
    assert prop_data["status"] == "proposed"

    # 4. Mutate tasks before deciding to trigger stale check (AC-SCH-4)
    await auth_client.post(
        "/api/v1/tasks/capture",
        json={"raw_input": "Another urgent task to change input hash", "origin": "manual"},
    )

    # 5. Deciding on stale proposal must return 409 Conflict
    decide_res = await auth_client.post(
        f"/api/v1/scheduling/proposals/{rec_id}/decide",
        json={"action": "accept"},
    )
    assert decide_res.status_code == 409
    assert "proposal_stale" in decide_res.json()["detail"]

    # 6. Generate fresh proposal and accept
    fresh_prop = await auth_client.post(
        "/api/v1/scheduling/proposals/generate",
        json={"scope": "horizon", "horizon_days": 7},
    )
    fresh_id = fresh_prop.json()["id"]

    accept_res = await auth_client.post(
        f"/api/v1/scheduling/proposals/{fresh_id}/decide",
        json={"action": "accept"},
    )
    assert accept_res.status_code == 200
    assert accept_res.json()["status"] in ("accepted", "partially_accepted")

    # 7. Check calendar events: work blocks must exist with source='ai_accepted'
    events_res = await auth_client.get("/api/v1/scheduling/events")
    assert events_res.status_code == 200
    events = events_res.json()
    assert any(e["kind"] == "fixed_event" and e["title"] == "Dentist Appointment" for e in events)
    assert any(e["kind"] == "work_block" and e["source"] == "ai_accepted" for e in events)


@pytest.mark.req("FR-PROD-005")
@pytest.mark.asyncio
async def test_focus_protection_uses_recorded_sessions_and_preserves_calendar_events(
    auth_client: httpx.AsyncClient,
) -> None:
    """FR-PROD-005: Only learned focus hours create blocks, and existing events stay in place."""
    from app.scheduling.config import DEFAULT_WORKING_HOURS

    ist = ZoneInfo("Asia/Kolkata")
    now = datetime.now(UTC).astimezone(ist)
    settings = await auth_client.patch(
        "/api/v1/auth/me",
        json={"settings": {"working_hours": DEFAULT_WORKING_HOURS}},
    )
    assert settings.status_code == 200, settings.text

    task_response = await auth_client.post("/api/v1/tasks", json={"title": "Recorded focus work"})
    assert task_response.status_code == 201, task_response.text
    task_id = task_response.json()["id"]
    for days_ago in (1, 2, 3):
        start = datetime.combine(
            now.date() - timedelta(days=days_ago),
            time(10, 0),
            tzinfo=ist,
        )
        entry = await auth_client.post(
            "/api/v1/time-entries",
            json={"task_id": task_id, "started_at": start.isoformat(), "duration_min": 45},
        )
        assert entry.status_code == 201, entry.text

    conflict_day = now.date() + timedelta(days=1)
    while conflict_day.weekday() >= 5:
        conflict_day += timedelta(days=1)
    event_start = datetime.combine(conflict_day, time(10, 0), tzinfo=ist)
    event = await auth_client.post(
        "/api/v1/scheduling/events",
        json={
            "title": "Existing appointment",
            "kind": "fixed_event",
            "start_at": event_start.isoformat(),
            "end_at": (event_start + timedelta(hours=1)).isoformat(),
        },
    )
    assert event.status_code == 201, event.text

    enabled = await auth_client.post(
        "/api/v1/scheduling/focus-protection",
        json={"enabled": True},
    )
    assert enabled.status_code == 200, enabled.text
    result = enabled.json()
    assert result["session_count"] == 3
    assert result["focus_start"].startswith("10:00")
    assert result["blocks_created"] > 0
    assert result["conflicts_skipped"] >= 1

    events = await auth_client.get("/api/v1/scheduling/events")
    assert events.status_code == 200, events.text
    calendar_events = events.json()
    assert any(item["title"] == "Existing appointment" for item in calendar_events)
    protected = [item for item in calendar_events if item["title"] == "ALIBI protected focus time"]
    assert protected
    assert all(item["kind"] == "fixed_event" for item in protected)

    disabled = await auth_client.post(
        "/api/v1/scheduling/focus-protection",
        json={"enabled": False},
    )
    assert disabled.status_code == 200, disabled.text
    events_after_disable = await auth_client.get("/api/v1/scheduling/events")
    assert all(
        item["title"] != "ALIBI protected focus time" for item in events_after_disable.json()
    )
