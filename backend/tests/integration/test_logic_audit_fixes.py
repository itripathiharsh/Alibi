"""Backend fixes from the logic audit of 2026-11-24 (docs/audits/2026-11-24-logic-audit.md).

B1 server keys never follow a user's saved address; hosted mode refuses private addresses.
B2 sync keeps task estimates; B3 sync keeps the reschedule count; B5 capture keeps the
estimate; B6 a repeated client id returns the saved task; S1 one bad sync op no longer
fails the whole push; B10 evidence files go to ALIBI_STORAGE_DIR under a safe name.
Provider calls and DNS are stubbed: nothing leaves the machine.
"""

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import endpoint_policy
from app.ai import gateway as gateway_module
from app.ai.adapters.groq import GroqProviderAdapter
from app.ai.gateway import AIGateway
from app.core.config import settings
from app.core.errors import ConflictError
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace
from app.services.task_service import TaskService


def _op(
    entity_id: uuid.UUID,
    op_type: str,
    payload: dict[str, Any],
    *,
    entity_type: str = "task",
    base_version: int | None = None,
) -> dict[str, Any]:
    return {
        "op_id": str(uuid.uuid4()),
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "op_type": op_type,
        "base_version": base_version,
        "payload": payload,
        "client_ts": datetime.now(UTC).isoformat(),
    }


async def _push(client: httpx.AsyncClient, ops: list[dict[str, Any]]) -> list[str]:
    res = await client.post("/api/v1/sync/push", json={"operations": ops})
    assert res.status_code == 200, res.text
    return [r["result"] for r in res.json()["results"]]


@pytest.mark.req("FR-AI-001")
@pytest.mark.asyncio
async def test_regression_KI_056_server_keys_ignore_a_users_saved_address_and_model(
    auth_client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "alibi_mode", "local")
    monkeypatch.setattr(settings, "groq_api_key", "server-key-1")
    monkeypatch.setattr(gateway_module, "_key_rotation", {})
    saved = await auth_client.put(
        "/api/v1/ai/providers/groq",
        json={
            "enabled": True,
            "base_url": "https://proxy.example.com/v1",
            "models": {"default": "my-model"},
        },
    )
    assert saved.status_code == 200
    user_id: uuid.UUID = auth_client.user_id  # type: ignore[attr-defined]
    gateway = AIGateway(db_session)

    [server] = await gateway._resolve_candidates("groq", user_id)
    assert isinstance(server.adapter, GroqProviderAdapter)
    assert server.adapter.api_key == "server-key-1"
    assert server.adapter.base_url == GroqProviderAdapter.DEFAULT_BASE_URL
    assert server.model == GroqProviderAdapter.DEFAULT_MODEL

    # The user's own key does go to the user's own address, with the user's model.
    await auth_client.put("/api/v1/ai/providers/groq", json={"api_key": "user-key-abcd"})
    [own] = await gateway._resolve_candidates("groq", user_id)
    assert isinstance(own.adapter, GroqProviderAdapter)
    assert own.adapter.api_key == "user-key-abcd"
    assert own.adapter.base_url == "https://proxy.example.com/v1"
    assert own.model == "my-model"


@pytest.mark.req("FR-AI-001")
@pytest.mark.asyncio
async def test_b1_hosted_server_refuses_private_provider_addresses(
    auth_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "alibi_mode", "hosted")
    answers = {"api.example.com": ["93.184.216.34"], "rebind.example.com": ["127.0.0.1"]}

    async def fake_resolve(host: str, _port: int) -> list[str]:
        if host not in answers:
            raise OSError("no such host")
        return answers[host]

    monkeypatch.setattr(endpoint_policy, "_resolve", fake_resolve)

    for url in (
        "http://169.254.169.254/latest",
        "https://10.0.0.5/v1",
        "https://localhost/v1",
        "https://rebind.example.com/v1",
    ):
        res = await auth_client.put("/api/v1/ai/providers/openrouter", json={"base_url": url})
        assert res.status_code == 400, url

    ok = await auth_client.put(
        "/api/v1/ai/providers/openrouter", json={"base_url": "https://api.example.com/v1/"}
    )
    assert ok.status_code == 200
    assert ok.json()["base_url"] == "https://api.example.com/v1"
    cleared = await auth_client.put("/api/v1/ai/providers/openrouter", json={"base_url": ""})
    assert cleared.json()["base_url"] is None

    ollama = await auth_client.put("/api/v1/ai/providers/ollama", json={"enabled": True})
    assert ollama.status_code == 400
    probe = await auth_client.post("/api/v1/ai/providers/ollama/test")
    assert probe.status_code == 200
    assert probe.json()["status"] == "error"


@pytest.mark.req("FR-SYNC-001")
@pytest.mark.asyncio
async def test_b2_sync_create_keeps_estimates_and_drops_invalid_ones(
    auth_client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    ids = [uuid.uuid4() for _ in range(3)]
    results = await _push(
        auth_client,
        [
            _op(
                ids[0],
                "create",
                {"title": "Phone", "estimate_user_min": 45, "estimate_final_min": 50},
            ),
            _op(ids[1], "create", {"title": "Old client", "estimate_min": 30}),
            _op(
                ids[2],
                "create",
                {"title": "Bad", "estimate_user_min": 0, "estimate_final_min": 99999},
            ),
        ],
    )
    assert results == ["applied", "applied", "applied"]
    rows = (await db_session.execute(select(Task).where(Task.id.in_(ids)))).scalars().all()
    by_id = {t.id: (t.estimate_user_min, t.estimate_final_min) for t in rows}
    assert by_id[ids[0]] == (45, 50)
    assert by_id[ids[1]] == (30, 30)
    assert by_id[ids[2]] == (None, None)


@pytest.mark.req("FR-SYNC-001")
@pytest.mark.asyncio
async def test_b3_sync_keeps_the_highest_reschedule_count(
    auth_client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    task_id = uuid.uuid4()
    later = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    assert await _push(auth_client, [_op(task_id, "create", {"title": "Move me"})]) == ["applied"]
    moved = _op(task_id, "update", {"deadline_at": later, "reschedule_count": 2}, base_version=1)
    assert await _push(auth_client, [moved]) == ["applied"]
    older = _op(task_id, "update", {"reschedule_count": 1}, base_version=2)
    assert await _push(auth_client, [older]) == ["applied"]
    task = await db_session.get(Task, task_id)
    assert task is not None
    await db_session.refresh(task)
    assert task.reschedule_count == 2


@pytest.mark.req("FR-SYNC-001")
@pytest.mark.asyncio
async def test_regression_KI_057_one_bad_sync_op_no_longer_blocks_the_rest(
    auth_client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    # A task id that already belongs to another account: the insert fails in the database.
    other = User(
        id=uuid.uuid4(),
        email=f"other_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="test-hash",
        display_name="Other",
        timezone="Asia/Kolkata",
    )
    db_session.add(other)
    await db_session.flush()  # no relationship() links these models, so insert in order
    other_ws = Workspace(id=uuid.uuid4(), user_id=other.id, name="Other", is_default=True)
    db_session.add(other_ws)
    await db_session.flush()
    taken_id = uuid.uuid4()
    theirs_row = Task(id=taken_id, user_id=other.id, workspace_id=other_ws.id, title="Theirs")
    db_session.add(theirs_row)
    await db_session.commit()
    db_session.expunge(theirs_row)  # as in production: the clash surfaces in the database

    good_id = uuid.uuid4()
    results = await _push(
        auth_client,
        [
            _op(uuid.uuid4(), "create", {"title": "Bad category", "category_id": "not-a-uuid"}),
            _op(taken_id, "create", {"title": "Collides"}),
            _op(uuid.uuid4(), "create", {"started_at": "garbage"}, entity_type="time_entry"),
            _op(good_id, "create", {"title": "Still syncs"}),
        ],
    )
    assert results == ["rejected", "rejected", "rejected", "applied"]
    assert await db_session.get(Task, good_id) is not None
    theirs = await db_session.get(Task, taken_id)
    assert theirs is not None
    await db_session.refresh(theirs)
    assert theirs.user_id == other.id and theirs.title == "Theirs"


@pytest.mark.req("FR-TASK-001")
@pytest.mark.asyncio
async def test_b5_b6_capture_keeps_the_estimate_and_a_retry_returns_the_same_task(
    auth_client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    task_id = uuid.uuid4()
    body = {"raw_input": "Call the bank tomorrow", "id": str(task_id), "estimate_user_min": 25}
    first = await auth_client.post("/api/v1/tasks/capture", json=body)
    assert first.status_code == 201, first.text
    assert first.json()["task"]["estimate_user_min"] == 25
    assert first.json()["task"]["estimate_final_min"] == 25

    again = await auth_client.post("/api/v1/tasks/capture", json=body)
    assert again.status_code == 201, again.text
    assert again.json()["task"]["id"] == str(task_id)

    create_again = await auth_client.post(
        "/api/v1/tasks", json={"title": "Call the bank", "id": str(task_id)}
    )
    assert create_again.status_code == 201, create_again.text
    assert create_again.json()["id"] == str(task_id)

    with pytest.raises(ConflictError):
        await TaskService(db_session, uuid.uuid4())._existing_by_client_id(task_id)


@pytest.mark.req("FR-TASK-013")
@pytest.mark.asyncio
async def test_b10_evidence_is_saved_in_the_storage_folder_under_a_safe_name(
    auth_client: httpx.AsyncClient,
) -> None:
    """Uploads went to a hard-coded "D:/alibi/..." path (a stray relative folder on Linux)
    and a file name with folders in it failed with 500."""
    created = await auth_client.post("/api/v1/tasks", json={"title": "Evidence folder"})
    task_id = created.json()["id"]
    res = await auth_client.post(
        f"/api/v1/tasks/{task_id}/evidence",
        files={"file": ("../../reports/q4 plan.txt", b"plan", "text/plain")},
    )
    assert res.status_code == 201, res.text

    storage = Path(settings.alibi_storage_dir).resolve()
    saved = list(storage.glob("evidence/*/*_q4 plan.txt"))
    assert len(saved) == 1
    assert storage in saved[0].resolve().parents

    download = await auth_client.get(f"/api/v1/evidence/{res.json()['id']}/download")
    assert download.status_code == 200
    assert download.content == b"plan"
