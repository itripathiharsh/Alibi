"""Brain dump, learning signals, recommendations and per-user cloud-AI consent.

FR-TASK-022, FR-LEARN-012, FR-LEARN-013, ADR-028. No external AI is called.
"""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.time import utc_now
from app.models.learning import BehaviorObservation
from app.models.task import Task


@pytest.fixture
def no_ai(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_external_enabled", False)
    monkeypatch.setattr(settings, "alibi_mode", "hosted")


@pytest.mark.asyncio
@pytest.mark.usefixtures("no_ai")
async def test_brain_dump_endpoint_splits_without_saving(
    auth_client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    resp = await auth_client.post(
        "/api/v1/tasks/brain-dump",
        json={"text": "mandir jana hai shaam ko, assignment kal tak dena hai\nsabzi lena"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "rules"
    assert body["ai_status"] == "server_disabled"
    assert [i["title"] for i in body["items"]] == [
        "mandir jana hai",
        "assignment dena hai",
        "sabzi lena",
    ]
    assert body["items"][1]["deadline_kind"] == "hard"
    assert body["items"][2]["bucket"] == "anytime"

    user_id = auth_client.user_id  # type: ignore[attr-defined]
    saved = (await db_session.execute(select(Task).where(Task.user_id == user_id))).scalars().all()
    assert saved == []  # proposals only; the device saves accepted items


@pytest.mark.asyncio
async def test_brain_dump_rejects_empty_and_huge_text(auth_client: httpx.AsyncClient) -> None:
    assert (
        await auth_client.post("/api/v1/tasks/brain-dump", json={"text": ""})
    ).status_code == 422
    huge = "a" * 4001
    assert (
        await auth_client.post("/api/v1/tasks/brain-dump", json={"text": huge})
    ).status_code == 422


@pytest.mark.asyncio
async def test_ai_config_is_per_user_and_cannot_flip_server_switch(
    auth_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ai_external_enabled", False)
    on = await auth_client.put("/api/v1/ai/config", json={"ai_external_enabled": True})
    assert on.status_code == 200
    assert on.json()["ai_external_enabled"] is True
    assert on.json()["server_external_enabled"] is False
    assert settings.ai_external_enabled is False  # the server switch is untouched

    got = await auth_client.get("/api/v1/ai/config")
    assert got.json()["ai_external_enabled"] is True


@pytest.mark.asyncio
async def test_signals_store_counts_and_drop_foreign_task_ids(
    auth_client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user_id = auth_client.user_id  # type: ignore[attr-defined]
    own = await auth_client.post("/api/v1/tasks", json={"title": "Own task"})
    own_id = own.json()["id"]
    foreign_id = str(uuid.uuid4())
    now = utc_now().isoformat()

    resp = await auth_client.post(
        "/api/v1/learning/signals",
        json={
            "signals": [
                {"type": "checkin_done", "occurred_at": now, "task_id": own_id},
                {"type": "checkin_moved", "occurred_at": now, "task_id": foreign_id},
                {
                    "type": "brain_dump_review",
                    "occurred_at": now,
                    "data": {"proposed": 6, "accepted": 5, "edited": 2, "mode": "ai"},
                },
            ]
        },
    )
    assert resp.status_code == 200
    assert resp.json()["accepted"] == 3

    rows = (
        (
            await db_session.execute(
                select(BehaviorObservation).where(BehaviorObservation.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    by_type = {r.observation_type: r for r in rows}
    assert str(by_type["checkin_done"].task_id) == own_id
    assert by_type["checkin_moved"].task_id is None
    assert by_type["brain_dump_review"].features["accepted"] == 5

    bad = await auth_client.post(
        "/api/v1/learning/signals",
        json={"signals": [{"type": "made_up", "occurred_at": now}]},
    )
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_recommendations_wait_for_a_week_of_activity(auth_client: httpx.AsyncClient) -> None:
    await auth_client.post("/api/v1/tasks", json={"title": "Only today"})
    resp = await auth_client.get("/api/v1/learning/recommendations")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "learning"
    assert body["days_observed"] == 1
    assert body["days_needed"] == 7
    assert body["items"] == []


@pytest.mark.asyncio
async def test_recommendations_after_a_week_are_counted_and_dismissable(
    auth_client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user_id = auth_client.user_id  # type: ignore[attr-defined]
    workspace_id = auth_client.workspace_id  # type: ignore[attr-defined]
    now = utc_now()
    for day in range(8):
        db_session.add(
            Task(
                id=uuid.uuid4(),
                user_id=user_id,
                workspace_id=workspace_id,
                title=f"Daily thing {day}",
                status="pending",
                origin="manual",
                created_at=now - timedelta(days=day),
                deadline_at=now - timedelta(hours=2) if day < 3 else None,
                reschedule_count=4 if day == 5 else 0,
            )
        )
    await db_session.commit()

    resp = await auth_client.get("/api/v1/learning/recommendations")
    body = resp.json()
    assert body["status"] == "ready"
    assert body["days_observed"] >= 7
    kinds = {item["kind"]: item for item in body["items"]}
    assert kinds["overdue_pile"]["evidence"]["overdue_tasks"] == 3
    assert kinds["stuck_task"]["evidence"]["times_moved"] == 4

    dismiss = await auth_client.post(
        "/api/v1/learning/signals",
        json={
            "signals": [
                {
                    "type": "recommendation_dismissed",
                    "occurred_at": now.isoformat(),
                    "data": {"rec_id": "overdue_pile"},
                }
            ]
        },
    )
    assert dismiss.status_code == 200
    again = (await auth_client.get("/api/v1/learning/recommendations")).json()
    assert "overdue_pile" not in {item["kind"] for item in again["items"]}
