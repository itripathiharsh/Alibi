"""Integration tests for user-approved recurring task rules."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.recurrence_service import RecurrenceService


# req: FR-TASK-018
@pytest.mark.asyncio
async def test_recurrence_rule_requires_user_action_and_can_be_stopped(
    auth_client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    task_response = await auth_client.post(
        "/api/v1/tasks",
        json={
            "title": "Review weekly workload",
            "estimate_user_min": 45,
            "tags": ["planning"],
            "subtasks": ["Review open work"],
        },
    )
    assert task_response.status_code == 201, task_response.text
    task_id = task_response.json()["id"]

    starts_at = datetime.now(UTC) + timedelta(days=2)
    create_response = await auth_client.post(
        "/api/v1/recurrences",
        json={
            "task_id": task_id,
            "frequency": "weekly",
            "interval": 2,
            "starts_at": starts_at.isoformat(),
        },
    )
    assert create_response.status_code == 201, create_response.text
    recurrence = create_response.json()
    assert recurrence["task_id"] == task_id
    assert recurrence["title"] == "Review weekly workload"
    assert recurrence["frequency"] == "weekly"
    assert recurrence["interval"] == 2
    assert recurrence["active"] is True

    duplicate_response = await auth_client.post(
        "/api/v1/recurrences",
        json={
            "task_id": task_id,
            "frequency": "weekly",
            "starts_at": starts_at.isoformat(),
        },
    )
    assert duplicate_response.status_code == 409

    listed = await auth_client.get(f"/api/v1/recurrences?task_id={task_id}")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [recurrence["id"]]

    user_response = await auth_client.get("/api/v1/auth/me")
    user_id = uuid.UUID(user_response.json()["id"])
    generated = await RecurrenceService(db_session, user_id).generate_instances_ahead(
        horizon_days=21,
        tz_name="UTC",
    )
    await db_session.flush()
    assert len(generated) == 2
    generated_id = generated[0].id
    generated_again = await RecurrenceService(db_session, user_id).generate_instances_ahead(
        horizon_days=21,
        tz_name="UTC",
    )
    assert generated_again == []

    generated_response = await auth_client.get(f"/api/v1/tasks/{generated_id}")
    assert generated_response.status_code == 200
    assert generated_response.json()["tags"] == ["planning"]
    assert [item["title"] for item in generated_response.json()["subtasks"]] == ["Review open work"]

    stopped = await auth_client.delete(f"/api/v1/recurrences/{recurrence['id']}")
    assert stopped.status_code == 204
    listed_after_stop = await auth_client.get(f"/api/v1/recurrences?task_id={task_id}")
    assert listed_after_stop.status_code == 200
    assert listed_after_stop.json() == []


@pytest.mark.asyncio
async def test_recurrence_rejects_an_unknown_task_id(
    auth_client: httpx.AsyncClient,
) -> None:
    response = await auth_client.post(
        "/api/v1/recurrences",
        json={
            "task_id": "00000000-0000-4000-8000-000000000001",
            "frequency": "daily",
            "starts_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
        },
    )
    assert response.status_code == 404
