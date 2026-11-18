"""Integration tests for Scheduling and Proposal API (AC-SCH-3, AC-SCH-4)."""

from datetime import UTC, datetime, timedelta

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
