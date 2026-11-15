"""Integration tests for Server Sync Protocol (doc 11, AC-SYNC-1..4).

Tests offline push batching, duplicate idempotency, field-level merge,
conflict surfacing, and incremental pull.
"""

import uuid
from datetime import UTC, datetime

import httpx
import pytest


@pytest.mark.asyncio
async def test_sync_push_idempotency_and_duplicate_handling(
    auth_client: httpx.AsyncClient,
) -> None:
    """AC-SYNC-1 (S1 & S2): Create tasks offline, push, and push same batch twice for idempotency."""
    task_id = uuid.uuid4()
    op_id = uuid.uuid4()
    now_iso = datetime.now(UTC).isoformat()

    batch = {
        "operations": [
            {
                "op_id": str(op_id),
                "entity_type": "task",
                "entity_id": str(task_id),
                "op_type": "create",
                "payload": {"title": "Offline Created Task", "status": "draft", "priority": "P2"},
                "client_ts": now_iso,
            }
        ]
    }

    # 1. First Push -> Applied (S1)
    res1 = await auth_client.post("/api/v1/sync/push", json=batch)
    assert res1.status_code == 200
    results1 = res1.json()["results"]
    assert len(results1) == 1
    assert results1[0]["result"] == "applied"
    assert results1[0]["entity_id"] == str(task_id)

    # 2. Push same batch twice (S2: network drop after server commit) -> duplicate (idempotent)
    res2 = await auth_client.post("/api/v1/sync/push", json=batch)
    assert res2.status_code == 200
    results2 = res2.json()["results"]
    assert len(results2) == 1
    assert results2[0]["result"] == "duplicate"


@pytest.mark.asyncio
async def test_sync_conflict_surfacing_and_resolution(
    auth_client: httpx.AsyncClient,
) -> None:
    """AC-SYNC-2 & AC-SYNC-3 (S4): Concurrent title edit surfaces conflict and resolution applies chosen value."""
    task_id = uuid.uuid4()
    now_iso = datetime.now(UTC).isoformat()

    # 1. Create task
    await auth_client.post(
        "/api/v1/sync/push",
        json={
            "operations": [
                {
                    "op_id": str(uuid.uuid4()),
                    "entity_type": "task",
                    "entity_id": str(task_id),
                    "op_type": "create",
                    "payload": {"title": "Original Title", "status": "draft"},
                    "client_ts": now_iso,
                }
            ]
        },
    )

    # 2. Server updates title (simulating Device A)
    await auth_client.post(
        "/api/v1/sync/push",
        json={
            "operations": [
                {
                    "op_id": str(uuid.uuid4()),
                    "entity_type": "task",
                    "entity_id": str(task_id),
                    "op_type": "update",
                    "base_version": 1,
                    "payload": {"title": "Server Updated Title"},
                    "client_ts": now_iso,
                }
            ]
        },
    )

    # 3. Device B pushes conflicting title update with old base_version=1 (S4)
    conflict_op_id = uuid.uuid4()
    conf_res = await auth_client.post(
        "/api/v1/sync/push",
        json={
            "operations": [
                {
                    "op_id": str(conflict_op_id),
                    "entity_type": "task",
                    "entity_id": str(task_id),
                    "op_type": "update",
                    "base_version": 1,  # server is now version 2!
                    "payload": {"title": "Device B Conflicting Title"},
                    "client_ts": now_iso,
                }
            ]
        },
    )
    assert conf_res.status_code == 200
    conf_results = conf_res.json()["results"]
    assert conf_results[0]["result"] == "conflict"

    # 4. Conflict is visible in open conflicts API
    open_res = await auth_client.get("/api/v1/sync/conflicts")
    assert open_res.status_code == 200
    conflicts = open_res.json()
    assert len(conflicts) > 0
    c_item = next((c for c in conflicts if c["entity_id"] == str(task_id)), None)
    assert c_item is not None
    assert c_item["field"] == "title"
    assert c_item["local_value"]["title"] == "Device B Conflicting Title"
    conflict_id = c_item["id"]

    # 5. Resolve conflict choosing 'resolved_local'
    resolve_res = await auth_client.post(
        f"/api/v1/sync/conflicts/{conflict_id}/resolve",
        json={"resolution": "resolved_local"},
    )
    assert resolve_res.status_code == 200

    # 6. Verify task on server now has local title
    task_check = await auth_client.get(f"/api/v1/tasks/{task_id}")
    assert task_check.status_code == 200
    assert task_check.json()["title"] == "Device B Conflicting Title"


@pytest.mark.asyncio
async def test_sync_pull_and_bootstrap_endpoints(
    auth_client: httpx.AsyncClient,
) -> None:
    """AC-SYNC-4: Test full bootstrap and incremental pull with server epoch."""
    # 1. Bootstrap
    boot_res = await auth_client.get("/api/v1/sync/bootstrap")
    assert boot_res.status_code == 200
    boot_data = boot_res.json()
    assert "server_epoch" in boot_data
    assert "tasks" in boot_data
    assert "categories" in boot_data

    # 2. Pull
    pull_res = await auth_client.get("/api/v1/sync/pull?since_seq=0")
    assert pull_res.status_code == 200
    pull_data = pull_res.json()
    assert "next_seq" in pull_data
    assert "changes" in pull_data
    assert pull_data["server_epoch"] == boot_data["server_epoch"]
