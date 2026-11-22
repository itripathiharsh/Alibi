"""Original due dates of overdue tasks and the time report (FR-TASK-023, FR-DASH-010, ADR-032)."""

import uuid
import zoneinfo
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.time_report import TimeReportBuilder, _split_by_day
from app.models.task import Task
from app.models.time_entry import TimeEntry

IST = zoneinfo.ZoneInfo("Asia/Kolkata")


@pytest.mark.asyncio
async def test_rescheduling_an_overdue_task_keeps_its_original_due_date(
    auth_client: httpx.AsyncClient,
) -> None:
    past = (datetime.now(UTC) - timedelta(days=2)).replace(microsecond=0)
    created = await auth_client.post(
        "/api/v1/tasks", json={"title": "Submit assignment", "deadline_at": past.isoformat()}
    )
    assert created.status_code == 201, created.text
    task_id = created.json()["id"]
    assert created.json()["original_deadline_at"] is None

    first = await auth_client.post(
        f"/api/v1/tasks/{task_id}/reschedule",
        json={"new_deadline_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
    )
    assert first.status_code == 200, first.text
    original = datetime.fromisoformat(first.json()["original_deadline_at"].replace("Z", "+00:00"))
    assert original == past

    # Moving it again keeps the first missed date.
    second = await auth_client.post(
        f"/api/v1/tasks/{task_id}/reschedule",
        json={"new_deadline_at": (datetime.now(UTC) + timedelta(days=3)).isoformat()},
    )
    again = datetime.fromisoformat(second.json()["original_deadline_at"].replace("Z", "+00:00"))
    assert again == past


@pytest.mark.asyncio
async def test_moving_a_future_due_date_is_not_recorded_as_missed(
    auth_client: httpx.AsyncClient,
) -> None:
    future = datetime.now(UTC) + timedelta(days=2)
    created = await auth_client.post(
        "/api/v1/tasks", json={"title": "Plan trip", "deadline_at": future.isoformat()}
    )
    task_id = created.json()["id"]
    moved = await auth_client.post(
        f"/api/v1/tasks/{task_id}/reschedule",
        json={"new_deadline_at": (future + timedelta(days=1)).isoformat()},
    )
    assert moved.json()["original_deadline_at"] is None


@pytest.mark.asyncio
async def test_offline_reschedule_through_sync_keeps_original_and_pulls_it(
    auth_client: httpx.AsyncClient,
) -> None:
    past = (datetime.now(UTC) - timedelta(days=1)).replace(microsecond=0)
    task_id = str(uuid.uuid4())
    now_iso = datetime.now(UTC).isoformat()
    create = {
        "op_id": str(uuid.uuid4()),
        "entity_type": "task",
        "entity_id": task_id,
        "op_type": "create",
        "payload": {"title": "Pay bill", "status": "pending", "deadline_at": past.isoformat()},
        "client_ts": now_iso,
    }
    pushed = await auth_client.post("/api/v1/sync/push", json={"operations": [create]})
    assert pushed.json()["results"][0]["result"] == "applied"
    update = {
        "op_id": str(uuid.uuid4()),
        "entity_type": "task",
        "entity_id": task_id,
        "op_type": "update",
        "base_version": pushed.json()["results"][0]["new_version"],
        "payload": {"deadline_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
        "client_ts": now_iso,
    }
    moved = await auth_client.post("/api/v1/sync/push", json={"operations": [update]})
    assert moved.json()["results"][0]["result"] in ("applied", "merged"), moved.text

    task = await auth_client.get(f"/api/v1/tasks/{task_id}")
    original = datetime.fromisoformat(task.json()["original_deadline_at"].replace("Z", "+00:00"))
    assert original == past


def test_session_across_midnight_is_split_by_local_day() -> None:
    start = datetime(2026, 11, 22, 23, 30, tzinfo=IST)
    end = datetime(2026, 11, 23, 0, 30, tzinfo=IST)
    shares = _split_by_day(start, end, 60, IST)
    assert shares == {date(2026, 11, 22): 30.0, date(2026, 11, 23): 30.0}


@pytest.mark.asyncio
async def test_time_report_counts_recorded_sessions_only(
    auth_client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user_id = auth_client.user_id  # type: ignore[attr-defined]
    workspace_id = auth_client.workspace_id  # type: ignore[attr-defined]
    now = datetime(2026, 11, 25, 18, 0, tzinfo=IST)  # Wednesday

    assignment = Task(
        id=uuid.uuid4(),
        user_id=user_id,
        workspace_id=workspace_id,
        title="Complete assignment",
        status="completed",
        origin="manual",
        estimate_final_min=45,
        completed_at=datetime(2026, 11, 25, 12, 0, tzinfo=IST),
    )
    calls = Task(
        id=uuid.uuid4(),
        user_id=user_id,
        workspace_id=workspace_id,
        title="Follow-up calls",
        status="pending",
        origin="manual",
    )
    no_time = Task(
        id=uuid.uuid4(),
        user_id=user_id,
        workspace_id=workspace_id,
        title="Quick reply",
        status="completed",
        origin="manual",
        completed_at=datetime(2026, 11, 25, 9, 0, tzinfo=IST),
    )
    db_session.add_all([assignment, calls, no_time])
    await db_session.flush()

    def session(task: Task, start: datetime, minutes: int) -> TimeEntry:
        return TimeEntry(
            id=uuid.uuid4(),
            user_id=user_id,
            task_id=task.id,
            started_at=start,
            ended_at=start + timedelta(minutes=minutes),
            duration_min=minutes,
            source="timer",
        )

    db_session.add_all(
        [
            # Two sessions on the assignment today: 25 + 35 = 60 minutes.
            session(assignment, datetime(2026, 11, 25, 10, 0, tzinfo=IST), 25),
            session(assignment, datetime(2026, 11, 25, 11, 0, tzinfo=IST), 35),
            # 20 minutes of calls on Monday.
            session(calls, datetime(2026, 11, 23, 15, 0, tzinfo=IST), 20),
            # Last week: outside "this week".
            session(calls, datetime(2026, 11, 18, 15, 0, tzinfo=IST), 40),
        ]
    )
    await db_session.commit()

    builder = TimeReportBuilder(db_session)
    today = await builder.build(user_id, "Asia/Kolkata", "daily", now=now)
    assert today.total_minutes == 60
    assert today.today_minutes == 60
    assert today.this_week_minutes == 80
    assert today.tasks_completed == 2
    assert today.average_completion_minutes == 60  # only the completed task with recorded time
    assert today.completed_with_time == 1
    [row] = today.tasks
    assert (row.title, row.minutes, row.sessions) == ("Complete assignment", 60, 2)
    assert (row.planned_minutes, row.difference_minutes) == (45, 15)

    week = await builder.build(user_id, "Asia/Kolkata", "weekly", now=now)
    assert week.total_minutes == 80
    assert [t.title for t in week.tasks] == ["Complete assignment", "Follow-up calls"]
    calls_row = week.tasks[1]
    assert calls_row.planned_minutes is None and calls_row.difference_minutes is None
    assert calls_row.total_minutes == 60  # all recorded time, including last week
    assert week.days_counted == 3  # Mon, Tue, Wed so far
    assert week.daily_average_minutes == 27
    by_day = {d.date: d for d in week.days}
    assert by_day[date(2026, 11, 25)].minutes == 60
    assert by_day[date(2026, 11, 25)].average_minutes_per_task == 60
    assert by_day[date(2026, 11, 23)].minutes == 20
    assert week.weeks[0].minutes == 80

    custom = await builder.build(
        user_id,
        "Asia/Kolkata",
        "custom",
        from_date=date(2026, 11, 18),
        to_date=date(2026, 11, 18),
        now=now,
    )
    assert custom.total_minutes == 40


@pytest.mark.asyncio
async def test_time_report_endpoint_shape(auth_client: httpx.AsyncClient) -> None:
    response = await auth_client.get("/api/v1/analytics/time-report", params={"period": "monthly"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total_minutes"] == 0
    assert body["average_completion_minutes"] is None
    assert body["tasks"] == []
    assert len(body["days"]) >= 28


@pytest.mark.asyncio
async def test_parallel_tasks_keep_their_own_time_but_the_day_counts_clock_time(
    auth_client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    """Two tasks run together 10:00-11:00 and one alone 11:00-11:30 (ADR-033)."""
    user_id = auth_client.user_id  # type: ignore[attr-defined]
    workspace_id = auth_client.workspace_id  # type: ignore[attr-defined]
    now = datetime(2026, 11, 25, 18, 0, tzinfo=IST)
    laundry = Task(
        id=uuid.uuid4(),
        user_id=user_id,
        workspace_id=workspace_id,
        title="Laundry",
        status="pending",
        origin="manual",
    )
    podcast = Task(
        id=uuid.uuid4(),
        user_id=user_id,
        workspace_id=workspace_id,
        title="Podcast notes",
        status="pending",
        origin="manual",
    )
    db_session.add_all([laundry, podcast])
    await db_session.flush()
    for task, start, minutes in (
        (laundry, datetime(2026, 11, 25, 10, 0, tzinfo=IST), 60),
        (podcast, datetime(2026, 11, 25, 10, 0, tzinfo=IST), 90),
    ):
        db_session.add(
            TimeEntry(
                id=uuid.uuid4(),
                user_id=user_id,
                task_id=task.id,
                started_at=start,
                ended_at=start + timedelta(minutes=minutes),
                duration_min=minutes,
                source="timer",
            )
        )
    await db_session.commit()

    report = await TimeReportBuilder(db_session).build(user_id, "Asia/Kolkata", "daily", now=now)
    assert report.today_minutes == 90  # clock time 10:00-11:30, overlap counted once
    assert report.total_minutes == 90
    by_title = {t.title: t.minutes for t in report.tasks}
    assert by_title == {"Podcast notes": 90, "Laundry": 60}  # each task keeps its full time
    [day] = report.days
    assert day.tasks_worked == 2
    assert day.average_minutes_per_task == 75
