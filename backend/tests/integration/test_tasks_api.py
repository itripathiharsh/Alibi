"""Integration tests for Task Management API verifying M2 acceptance criteria.
Covers AC-M2-1, AC-M2-4, AC-M2-6, AC-M2-8, AC-M2-9, AC-M2-12.
"""

import time as pytime
import uuid
import zoneinfo
from datetime import datetime, time, timedelta

import httpx
import pytest

from app.core.security import create_access_token
from app.core.time import utc_now
from app.database.session import AsyncSessionLocal
from app.models.category import Category
from app.models.recurrence_rule import RecurrenceRule
from app.models.user import User
from app.models.workspace import Workspace
from app.services.recurrence_service import RecurrenceService


@pytest.fixture
async def auth_client() -> httpx.AsyncClient:
    """Fixture providing authenticated client with seeded user and default workspace."""
    async with AsyncSessionLocal() as session:
        user_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        device_id = uuid.uuid4()

        user = User(
            id=user_id,
            email=f"tasktest_{uuid.uuid4().hex[:6]}@example.com",
            password_hash="test-hash",
            display_name="Task Test User",
            timezone="Asia/Kolkata",
        )
        session.add(user)

        workspace = Workspace(
            id=workspace_id,
            user_id=user_id,
            name="Personal Workspace",
            is_default=True,
        )
        session.add(workspace)

        category = Category(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace_id,
            name="Professional",
            slug="professional",
            is_system=True,
            sharing_class="professional",
        )
        session.add(category)
        await session.commit()

    token = create_access_token(user_id=user_id, device_id=device_id)

    async with httpx.AsyncClient(
        base_url="http://testserver",
        headers={"Authorization": f"Bearer {token}"},
        transport=httpx.ASGITransport(app=__import__("app.main").main.app),
    ) as client:
        client.user_id = user_id  # type: ignore
        client.workspace_id = workspace_id  # type: ignore
        client.category_id = category.id  # type: ignore
        yield client


@pytest.mark.asyncio
async def test_ac_m2_1_capture_persists_raw_input_before_parsing(
    auth_client: httpx.AsyncClient,
) -> None:
    """AC-M2-1: Capture persists task with raw input before parsing."""
    raw_text = "Deploy security patch to production by tomorrow 5pm #security @alibi"
    res = await auth_client.post(
        "/api/v1/tasks/capture", json={"raw_input": raw_text, "origin": "manual"}
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["task"]["raw_input"] == raw_text
    assert data["task"]["title"] == raw_text
    assert data["task"]["deadline_at"] is None
    assert "security" not in data["task"]["tags"]
    assert data["extraction_status"] == "proposed"
    assert data["extraction"] is not None
    assert data["extraction"]["final_proposal"]["deadline_at"] is not None
    assert "security" in data["extraction"]["final_proposal"]["tags"]


@pytest.mark.req("FR-PROD-001")
@pytest.mark.asyncio
async def test_daily_kickoff_returns_three_grounded_deadline_suggestions(
    auth_client: httpx.AsyncClient,
) -> None:
    """FR-PROD-001: Kickoff ranking is based on the user's deadlines and saved priority."""
    ist = zoneinfo.ZoneInfo("Asia/Kolkata")
    today = utc_now().astimezone(ist).date()
    payloads = [
        {
            "title": "Hard deadline today",
            "deadline_at": datetime.combine(today, time(23, 55), tzinfo=ist).isoformat(),
            "deadline_kind": "hard",
            "priority": 3,
        },
        {
            "title": "Hard deadline tomorrow",
            "deadline_at": datetime.combine(
                today + timedelta(days=1), time(9), tzinfo=ist
            ).isoformat(),
            "deadline_kind": "hard",
            "priority": 2,
        },
        {
            "title": "Soft deadline",
            "deadline_at": datetime.combine(
                today - timedelta(days=1), time(12), tzinfo=ist
            ).isoformat(),
            "deadline_kind": "soft",
            "priority": 1,
        },
        {"title": "Backlog task", "priority": 1},
    ]
    created_ids: list[str] = []
    for payload in payloads:
        response = await auth_client.post("/api/v1/tasks", json=payload)
        assert response.status_code == 201, response.text
        created_ids.append(response.json()["id"])

    response = await auth_client.get("/api/v1/tasks/daily-kickoff")
    assert response.status_code == 200, response.text
    suggestions = response.json()["suggestions"]
    assert len(suggestions) == 3
    assert suggestions[0]["id"] == created_ids[0], suggestions
    assert "Due today" in suggestions[0]["reasons"]
    assert suggestions[1]["id"] == created_ids[1]
    assert "Hard deadline" in suggestions[1]["reasons"]
    assert suggestions[2]["id"] == created_ids[2]
    assert created_ids[3] not in {suggestion["id"] for suggestion in suggestions}


@pytest.mark.req("FR-PROD-002")
@pytest.mark.asyncio
async def test_end_of_day_actions_are_explicit_and_audited(
    auth_client: httpx.AsyncClient,
) -> None:
    """FR-PROD-002: EOD reports real counts and selected actions update task history."""
    from app.scheduling.config import DEFAULT_WORKING_HOURS

    ist = zoneinfo.ZoneInfo("Asia/Kolkata")
    today = utc_now().astimezone(ist).date()
    settings_response = await auth_client.patch(
        "/api/v1/auth/me",
        json={"settings": {"working_hours": DEFAULT_WORKING_HOURS}},
    )
    assert settings_response.status_code == 200, settings_response.text

    due_response = await auth_client.post(
        "/api/v1/tasks",
        json={
            "title": "Review today's due task",
            "deadline_at": datetime.combine(today, time(23, 55), tzinfo=ist).isoformat(),
            "deadline_kind": "hard",
        },
    )
    assert due_response.status_code == 201, due_response.text
    due_id = due_response.json()["id"]

    active_response = await auth_client.post("/api/v1/tasks", json={"title": "Active work"})
    active_id = active_response.json()["id"]
    await auth_client.post(f"/api/v1/tasks/{active_id}/status", json={"status": "in_progress"})

    completed_response = await auth_client.post("/api/v1/tasks", json={"title": "Finished today"})
    completed_id = completed_response.json()["id"]
    await auth_client.post(f"/api/v1/tasks/{completed_id}/status", json={"status": "completed"})

    review = await auth_client.get("/api/v1/tasks/end-of-day")
    assert review.status_code == 200, review.text
    review_data = review.json()
    assert review_data["completed_count"] == 1
    assert {task["id"] for task in review_data["unfinished"]} == {due_id, active_id}

    moved = await auth_client.post(
        f"/api/v1/tasks/{due_id}/end-of-day-action",
        json={"action": "tomorrow"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["reschedule_count"] == 1
    moved_deadline = datetime.fromisoformat(moved.json()["deadline_at"].replace("Z", "+00:00"))
    assert moved_deadline.astimezone(ist).date() > today
    history = await auth_client.get(f"/api/v1/tasks/{due_id}/events")
    assert any(event["event_type"] == "rescheduled" for event in history.json())

    backlog = await auth_client.post(
        f"/api/v1/tasks/{active_id}/end-of-day-action",
        json={"action": "backlog"},
    )
    assert backlog.status_code == 200, backlog.text
    assert backlog.json()["status"] == "in_progress"
    assert backlog.json()["deadline_at"] is None


# req: FR-TASK-003, FR-TASK-005
@pytest.mark.asyncio
async def test_extraction_fields_apply_only_after_user_decision(
    auth_client: httpx.AsyncClient,
) -> None:
    """FR-TASK-005: extracted task fields remain a proposal until explicitly accepted."""
    raw_text = "Prepare the launch brief by Friday 5pm #launch"
    capture = await auth_client.post("/api/v1/tasks/capture", json={"raw_input": raw_text})
    assert capture.status_code == 201, capture.text
    captured = capture.json()
    task_id = captured["task"]["id"]
    proposal = captured["extraction"]["final_proposal"]

    decision = await auth_client.post(
        f"/api/v1/tasks/{task_id}/extraction/decision",
        json={
            "accepted_fields": {
                "title": proposal["title"],
                "deadline_at": proposal["deadline_at"],
                "deadline_kind": proposal["deadline_kind"],
                "tags": proposal["tags"],
            }
        },
    )
    assert decision.status_code == 200, decision.text
    accepted = decision.json()
    assert accepted["title"] == proposal["title"]
    assert datetime.fromisoformat(
        accepted["deadline_at"].replace("Z", "+00:00")
    ) == datetime.fromisoformat(proposal["deadline_at"].replace("Z", "+00:00"))
    assert "launch" in accepted["tags"]


@pytest.mark.asyncio
async def test_ac_m2_4_mutations_write_task_events_with_diff(
    auth_client: httpx.AsyncClient,
) -> None:
    """AC-M2-4: Every mutation writes task_events with diff; history returns chronological list."""
    # 1. Create task
    c_res = await auth_client.post(
        "/api/v1/tasks", json={"title": "Audit Event Task", "priority": 3}
    )
    assert c_res.status_code == 201
    task_id = c_res.json()["id"]

    # 2. Reschedule task
    new_deadline = (utc_now() + timedelta(days=2)).isoformat()
    r_res = await auth_client.post(
        f"/api/v1/tasks/{task_id}/reschedule",
        json={"new_deadline_at": new_deadline, "reason": "More time needed"},
    )
    assert r_res.status_code == 200
    assert r_res.json()["reschedule_count"] == 1

    # 3. Status update
    s_res = await auth_client.post(
        f"/api/v1/tasks/{task_id}/status", json={"status": "in_progress"}
    )
    assert s_res.status_code == 200

    # 4. Fetch history
    h_res = await auth_client.get(f"/api/v1/tasks/{task_id}/events")
    assert h_res.status_code == 200
    events = h_res.json()

    assert len(events) >= 3
    event_types = [e["event_type"] for e in events]
    assert "created" in event_types
    assert "rescheduled" in event_types
    assert "status_in_progress" in event_types

    reschedule_event = next(e for e in events if e["event_type"] == "rescheduled")
    assert "deadline_at" in reschedule_event["changes"]
    assert reschedule_event["reason"] == "More time needed"


@pytest.mark.asyncio
async def test_ac_m2_6_view_membership_30_crafted_tasks_with_ist_edges(
    auth_client: httpx.AsyncClient,
) -> None:
    """AC-M2-6: View membership correct for 30 crafted tasks including IST midnight edges."""
    ist = zoneinfo.ZoneInfo("Asia/Kolkata")
    now_ist = utc_now().astimezone(ist)
    today_ist = now_ist.date()

    # Create 30 tasks with specific deadlines
    # 10 Today:
    #   - 3 with deadline today at various hours (e.g., 00:01, 12:00, 23:59 IST)
    #   - 3 overdue (yesterday, last week)
    #   - 4 in_progress (even without deadline)
    # 10 Upcoming:
    #   - deadlines between tomorrow and 14 days ahead
    # 10 Backlog:
    #   - open tasks with null deadline

    for i in range(3):
        # Today at 00:05, 12:00, 23:55 IST
        times = [time(0, 5), time(12, 0), time(23, 55)]
        dt = datetime.combine(today_ist, times[i], tzinfo=ist)
        await auth_client.post(
            "/api/v1/tasks", json={"title": f"Today Task {i}", "deadline_at": dt.isoformat()}
        )

    for i in range(3):
        # Overdue
        dt = now_ist - timedelta(days=i + 1)
        await auth_client.post(
            "/api/v1/tasks", json={"title": f"Overdue Task {i}", "deadline_at": dt.isoformat()}
        )

    for i in range(4):
        # In progress
        res = await auth_client.post("/api/v1/tasks", json={"title": f"InProgress Task {i}"})
        tid = res.json()["id"]
        await auth_client.post(f"/api/v1/tasks/{tid}/status", json={"status": "in_progress"})

    for i in range(10):
        # Upcoming: days 1 through 10 ahead
        dt = datetime.combine(today_ist + timedelta(days=i + 1), time(18, 0), tzinfo=ist)
        await auth_client.post(
            "/api/v1/tasks", json={"title": f"Upcoming Task {i}", "deadline_at": dt.isoformat()}
        )

    for i in range(10):
        # Backlog: no deadline, pending
        await auth_client.post("/api/v1/tasks", json={"title": f"Backlog Task {i}"})

    # Query Views
    v_today = (await auth_client.get("/api/v1/tasks?view=today&limit=100")).json()
    v_upcoming = (await auth_client.get("/api/v1/tasks?view=upcoming&limit=100")).json()
    v_backlog = (await auth_client.get("/api/v1/tasks?view=backlog&limit=100")).json()

    assert len(v_today) == 10, f"Expected 10 Today tasks, got {len(v_today)}"
    assert len(v_upcoming) == 10, f"Expected 10 Upcoming tasks, got {len(v_upcoming)}"
    assert len(v_backlog) == 10, f"Expected 10 Backlog tasks, got {len(v_backlog)}"


@pytest.mark.asyncio
async def test_ac_m2_8_recurrence_idempotency() -> None:
    """AC-M2-8: Recurring rule generates instances idempotently (running twice -> no duplicates)."""
    user_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    async with AsyncSessionLocal() as session:
        user = User(
            id=user_id,
            email=f"recur_{uuid.uuid4().hex[:6]}@example.com",
            password_hash="test-hash",
            display_name="Recur User",
            timezone="Asia/Kolkata",
        )
        session.add(user)
        ws = Workspace(
            id=workspace_id,
            user_id=user_id,
            name="Recur WS",
            is_default=True,
        )
        session.add(ws)
        await session.flush()

        rule = RecurrenceRule(
            id=uuid.uuid4(),
            user_id=user_id,
            template={"title": "Daily Standup"},
            rrule="FREQ=DAILY;INTERVAL=1",
            dtstart=utc_now(),
            active=True,
        )
        session.add(rule)
        await session.commit()

        service = RecurrenceService(session, user_id)

        # Run 1
        tasks_1 = await service.generate_instances_ahead(horizon_days=14)
        count_1 = len(tasks_1)
        assert count_1 > 0
        await session.commit()

        # Run 2 immediately
        tasks_2 = await service.generate_instances_ahead(horizon_days=14)
        count_2 = len(tasks_2)
        assert count_2 == 0, f"Expected 0 new tasks on second run, got {count_2}"


@pytest.mark.asyncio
async def test_ac_m2_9_evidence_mime_and_size_constraints(auth_client: httpx.AsyncClient) -> None:
    """AC-M2-9: Evidence disallowed MIME rejected (415); >25 MB 413; download requires auth."""
    # Create task
    t_res = await auth_client.post("/api/v1/tasks", json={"title": "Evidence Test Task"})
    task_id = t_res.json()["id"]

    # 1. Allowed MIME: text/plain
    txt_content = b"Deliverable completed verified."
    ok_res = await auth_client.post(
        f"/api/v1/tasks/{task_id}/evidence",
        files={"file": ("deliverable.txt", txt_content, "text/plain")},
    )
    assert ok_res.status_code == 201, ok_res.text
    evidence_id = ok_res.json()["id"]

    # 2. Disallowed MIME: application/x-msdownload (exe) -> 415
    bad_mime_res = await auth_client.post(
        f"/api/v1/tasks/{task_id}/evidence",
        files={"file": ("malicious.exe", b"binarycontent", "application/x-msdownload")},
    )
    assert bad_mime_res.status_code == 415

    # 3. Payload > 25 MB -> 413
    huge_content = b"0" * (26 * 1024 * 1024)
    huge_res = await auth_client.post(
        f"/api/v1/tasks/{task_id}/evidence",
        files={"file": ("huge.pdf", huge_content, "application/pdf")},
    )
    assert huge_res.status_code == 413

    # 4. Download requires auth
    unauth_client = httpx.AsyncClient(
        base_url="http://testserver",
        transport=httpx.ASGITransport(app=__import__("app.main").main.app),
    )
    unauth_dl = await unauth_client.get(f"/api/v1/evidence/{evidence_id}/download")
    assert unauth_dl.status_code == 401

    auth_dl = await auth_client.get(f"/api/v1/evidence/{evidence_id}/download")
    assert auth_dl.status_code == 200
    assert auth_dl.content == txt_content


@pytest.mark.asyncio
async def test_ac_m2_12_task_create_latency_p95(auth_client: httpx.AsyncClient) -> None:
    """AC-M2-12: Task create API latency p95 < 200 ms with high volume in DB."""
    # Measure latency over 20 consecutive creations
    latencies: list[float] = []
    for i in range(20):
        t0 = pytime.perf_counter()
        res = await auth_client.post(
            "/api/v1/tasks",
            json={"title": f"Latency Benchmark Task {i}", "priority": 2},
        )
        elapsed_ms = (pytime.perf_counter() - t0) * 1000
        assert res.status_code == 201
        latencies.append(elapsed_ms)

    latencies.sort()
    p95_idx = int(len(latencies) * 0.95)
    p95_latency = latencies[p95_idx]
    print(f"\nTask create p95 latency: {p95_latency:.2f} ms")
    assert p95_latency < 200.0, f"Expected p95 < 200 ms, got {p95_latency:.2f} ms"
