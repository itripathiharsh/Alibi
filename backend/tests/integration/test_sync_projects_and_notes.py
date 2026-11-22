"""Integration tests for Project and Vault Note Synchronization.

Verifies:
- Create, update, and delete operations for projects and vault notes.
- Correct user ownership and data isolation.
- Idempotency and duplicate push handling.
- Version increments.
- Second device retrieval via incremental pull and bootstrap.
"""

import uuid
from datetime import UTC, datetime

import httpx
import pytest


@pytest.mark.asyncio
async def test_sync_project_lifecycle_offline_to_second_device(
    auth_client: httpx.AsyncClient,
) -> None:
    """Verify offline project creation -> sync push -> second device pull retrieval -> update -> delete."""
    project_id = uuid.uuid4()
    op_create_id = uuid.uuid4()
    now_iso = datetime.now(UTC).isoformat()

    # 1. Device A: Push offline project creation
    create_batch = {
        "operations": [
            {
                "op_id": str(op_create_id),
                "entity_type": "project",
                "entity_id": str(project_id),
                "op_type": "create",
                "payload": {
                    "name": "Commercial Launch Alpha",
                    "description": "Public launch milestones and tasks",
                    "color": "#FF741F",
                    "status": "active",
                },
                "client_ts": now_iso,
            }
        ]
    }

    res1 = await auth_client.post("/api/v1/sync/push", json=create_batch)
    assert res1.status_code == 200
    results1 = res1.json()["results"]
    assert len(results1) == 1
    assert results1[0]["result"] == "applied"
    assert results1[0]["entity_id"] == str(project_id)
    assert results1[0]["new_version"] == 1

    # 2. Idempotent Retry: Push identical op again (e.g. dropped network response)
    res_retry = await auth_client.post("/api/v1/sync/push", json=create_batch)
    assert res_retry.status_code == 200
    results_retry = res_retry.json()["results"]
    assert len(results_retry) == 1
    assert results_retry[0]["result"] == "duplicate"

    # 3. Device B: Pull changes from server
    pull_res1 = await auth_client.get("/api/v1/sync/pull?since_seq=0&limit=100")
    assert pull_res1.status_code == 200
    pull_data1 = pull_res1.json()
    project_changes = [c for c in pull_data1["changes"] if c["entity_type"] == "project"]
    assert len(project_changes) >= 1
    retrieved_project = next(c for c in project_changes if c["id"] == str(project_id))
    assert retrieved_project["name"] == "Commercial Launch Alpha"
    assert retrieved_project["color"] == "#FF741F"
    assert retrieved_project["deleted"] is False
    current_seq = pull_data1["next_seq"]

    # 4. Device A: Update project
    op_update_id = uuid.uuid4()
    update_batch = {
        "operations": [
            {
                "op_id": str(op_update_id),
                "entity_type": "project",
                "entity_id": str(project_id),
                "op_type": "update",
                "base_version": 1,
                "payload": {
                    "name": "Commercial Launch Phase 2",
                    "status": "done",
                },
                "client_ts": datetime.now(UTC).isoformat(),
            }
        ]
    }
    res_update = await auth_client.post("/api/v1/sync/push", json=update_batch)
    assert res_update.status_code == 200
    assert res_update.json()["results"][0]["result"] == "applied"
    assert res_update.json()["results"][0]["new_version"] == 2

    # 5. Device B: Pull incremental changes since previous sequence
    pull_res2 = await auth_client.get(f"/api/v1/sync/pull?since_seq={current_seq}&limit=100")
    assert pull_res2.status_code == 200
    pull_data2 = pull_res2.json()
    updated_project_changes = [
        c
        for c in pull_data2["changes"]
        if c["entity_type"] == "project" and c["id"] == str(project_id)
    ]
    assert len(updated_project_changes) == 1
    assert updated_project_changes[0]["name"] == "Commercial Launch Phase 2"
    assert updated_project_changes[0]["status"] == "done"
    assert updated_project_changes[0]["version"] == 2

    # 6. Device A: Delete project
    op_del_id = uuid.uuid4()
    del_batch = {
        "operations": [
            {
                "op_id": str(op_del_id),
                "entity_type": "project",
                "entity_id": str(project_id),
                "op_type": "delete",
                "base_version": 2,
                "payload": {},
                "client_ts": datetime.now(UTC).isoformat(),
            }
        ]
    }
    res_del = await auth_client.post("/api/v1/sync/push", json=del_batch)
    assert res_del.status_code == 200
    assert res_del.json()["results"][0]["result"] == "applied"

    # 7. Device B: Pull deletion tombstone
    pull_res3 = await auth_client.get(
        f"/api/v1/sync/pull?since_seq={pull_data2['next_seq']}&limit=100"
    )
    assert pull_res3.status_code == 200
    pull_data3 = pull_res3.json()
    del_project_changes = [
        c
        for c in pull_data3["changes"]
        if c["entity_type"] == "project" and c["id"] == str(project_id)
    ]
    assert len(del_project_changes) == 1
    assert del_project_changes[0]["deleted"] is True


@pytest.mark.asyncio
async def test_sync_vault_note_lifecycle_offline_to_second_device(
    auth_client: httpx.AsyncClient,
) -> None:
    """Verify offline vault note creation -> sync push -> second device pull retrieval -> update -> delete."""
    note_id = uuid.uuid4()
    op_create_id = uuid.uuid4()
    now_iso = datetime.now(UTC).isoformat()

    # 1. Device A: Push offline note creation
    create_batch = {
        "operations": [
            {
                "op_id": str(op_create_id),
                "entity_type": "vault_note",
                "entity_id": str(note_id),
                "op_type": "create",
                "payload": {
                    "title": "Architecture Specification",
                    "body": "Detailed offline-first synchronization invariants and formulas.",
                    "source_type": "manual",
                    "privacy_class": "personal",
                },
                "client_ts": now_iso,
            }
        ]
    }

    res1 = await auth_client.post("/api/v1/sync/push", json=create_batch)
    assert res1.status_code == 200
    results1 = res1.json()["results"]
    assert len(results1) == 1
    assert results1[0]["result"] == "applied"
    assert results1[0]["entity_id"] == str(note_id)

    # 2. Idempotent Retry: Push identical op again
    res_retry = await auth_client.post("/api/v1/sync/push", json=create_batch)
    assert res_retry.status_code == 200
    results_retry = res_retry.json()["results"]
    assert len(results_retry) == 1
    assert results_retry[0]["result"] == "duplicate"

    # 3. Device B: Pull changes from server
    pull_res1 = await auth_client.get("/api/v1/sync/pull?since_seq=0&limit=100")
    assert pull_res1.status_code == 200
    pull_data1 = pull_res1.json()
    note_changes = [c for c in pull_data1["changes"] if c["entity_type"] == "vault_note"]
    assert len(note_changes) >= 1
    retrieved_note = next(c for c in note_changes if c["id"] == str(note_id))
    assert retrieved_note["title"] == "Architecture Specification"
    assert "offline-first" in retrieved_note["body"]
    assert retrieved_note["deleted"] is False
    current_seq = pull_data1["next_seq"]

    # 4. Device A: Update note body
    op_update_id = uuid.uuid4()
    update_batch = {
        "operations": [
            {
                "op_id": str(op_update_id),
                "entity_type": "vault_note",
                "entity_id": str(note_id),
                "op_type": "update",
                "base_version": 1,
                "payload": {
                    "title": "Architecture Specification (Final)",
                    "body": "Updated content with 3-way field merge.",
                },
                "client_ts": datetime.now(UTC).isoformat(),
            }
        ]
    }
    res_update = await auth_client.post("/api/v1/sync/push", json=update_batch)
    assert res_update.status_code == 200
    assert res_update.json()["results"][0]["result"] == "applied"

    # 5. Device B: Pull updated note
    pull_res2 = await auth_client.get(f"/api/v1/sync/pull?since_seq={current_seq}&limit=100")
    assert pull_res2.status_code == 200
    pull_data2 = pull_res2.json()
    updated_note_changes = [
        c
        for c in pull_data2["changes"]
        if c["entity_type"] == "vault_note" and c["id"] == str(note_id)
    ]
    assert len(updated_note_changes) == 1
    assert updated_note_changes[0]["title"] == "Architecture Specification (Final)"
    assert "Updated content" in updated_note_changes[0]["body"]

    # 6. Verify Direct REST retrieval
    rest_res = await auth_client.get(f"/api/v1/vault/notes/{note_id}")
    assert rest_res.status_code == 200
    rest_data = rest_res.json()
    assert rest_data["title"] == "Architecture Specification (Final)"

    # 7. Device A: Delete note
    op_del_id = uuid.uuid4()
    del_batch = {
        "operations": [
            {
                "op_id": str(op_del_id),
                "entity_type": "vault_note",
                "entity_id": str(note_id),
                "op_type": "delete",
                "base_version": 2,
                "payload": {},
                "client_ts": datetime.now(UTC).isoformat(),
            }
        ]
    }
    res_del = await auth_client.post("/api/v1/sync/push", json=del_batch)
    assert res_del.status_code == 200
    assert res_del.json()["results"][0]["result"] == "applied"

    # 8. Device B: Pull deletion tombstone
    pull_res3 = await auth_client.get(
        f"/api/v1/sync/pull?since_seq={pull_data2['next_seq']}&limit=100"
    )
    assert pull_res3.status_code == 200
    pull_data3 = pull_res3.json()
    del_note_changes = [
        c
        for c in pull_data3["changes"]
        if c["entity_type"] == "vault_note" and c["id"] == str(note_id)
    ]
    assert len(del_note_changes) == 1
    assert del_note_changes[0]["deleted"] is True


def _op(
    entity_type: str,
    entity_id: uuid.UUID,
    op_type: str,
    payload: dict,
    base_version: int | None = None,
) -> dict:
    return {
        "op_id": str(uuid.uuid4()),
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "op_type": op_type,
        "base_version": base_version,
        "payload": payload,
        "client_ts": datetime.now(UTC).isoformat(),
    }


async def _push(client: httpx.AsyncClient, *ops: dict) -> list[dict]:
    res = await client.post("/api/v1/sync/push", json={"operations": list(ops)})
    assert res.status_code == 200, res.text
    return list(res.json()["results"])


@pytest.mark.asyncio
async def test_regression_KI_023_pull_pages_never_skip_rows_across_tables(
    auth_client: httpx.AsyncClient,
) -> None:
    """Regression: a page that mixes tables must not move the cursor past undelivered rows.

    Before the fix, 5 tasks + 3 later notes pulled with limit=3 returned tasks 1-3 but set
    next_seq to the last note, so tasks 4-5 were never delivered.
    """
    task_ids = [uuid.uuid4() for _ in range(5)]
    note_ids = [uuid.uuid4() for _ in range(3)]
    await _push(
        auth_client,
        *[
            _op("task", tid, "create", {"title": f"Paged task {i}"})
            for i, tid in enumerate(task_ids)
        ],
    )
    await _push(
        auth_client,
        *[
            _op("vault_note", nid, "create", {"title": f"Paged note {i}", "body": "b"})
            for i, nid in enumerate(note_ids)
        ],
    )

    seen: list[str] = []
    cursor = 0
    for _ in range(50):
        res = await auth_client.get(f"/api/v1/sync/pull?since_seq={cursor}&limit=3")
        assert res.status_code == 200
        data = res.json()
        assert len(data["changes"]) <= 3
        seen.extend(str(c["id"]) for c in data["changes"])
        assert data["next_seq"] >= cursor
        cursor = data["next_seq"]
        if not data["has_more"]:
            break

    expected = {str(i) for i in task_ids + note_ids}
    assert expected <= set(seen), f"missing rows: {expected - set(seen)}"
    assert len(seen) == len(set(seen)), "a row was delivered twice"


@pytest.mark.asyncio
async def test_bootstrap_includes_notes(auth_client: httpx.AsyncClient) -> None:
    note_id = uuid.uuid4()
    await _push(
        auth_client, _op("vault_note", note_id, "create", {"title": "Boot note", "body": "x"})
    )
    res = await auth_client.get("/api/v1/sync/bootstrap")
    assert res.status_code == 200
    assert str(note_id) in {n["id"] for n in res.json()["notes"]}


@pytest.mark.asyncio
async def test_concurrent_project_rename_opens_conflict_and_keeps_server_value(
    auth_client: httpx.AsyncClient,
) -> None:
    """Doc 11 §6 / scenario S4 for projects: both devices rename from version 1."""
    pid = uuid.uuid4()
    await _push(auth_client, _op("project", pid, "create", {"name": "Original"}))
    first = await _push(
        auth_client, _op("project", pid, "update", {"name": "Device A name"}, base_version=1)
    )
    assert first[0]["result"] == "applied"

    second = await _push(
        auth_client,
        _op(
            "project", pid, "update", {"name": "Device B name", "color": "#000000"}, base_version=1
        ),
    )
    assert second[0]["result"] == "conflict"
    assert second[0]["detail"]["conflict_fields"] == ["name"]

    bootstrap = (await auth_client.get("/api/v1/sync/bootstrap")).json()
    project = next(p for p in bootstrap["projects"] if p["id"] == str(pid))
    assert project["name"] == "Device A name"  # server value kept
    assert project["color"] == "#000000"  # non-conflicting field still applied

    conflicts = (await auth_client.get("/api/v1/sync/conflicts")).json()
    conflict = next(c for c in conflicts if c["entity_id"] == str(pid))
    assert conflict["field"] == "name"
    assert conflict["local_value"] == {"name": "Device B name"}

    resolved = await auth_client.post(
        f"/api/v1/sync/conflicts/{conflict['id']}/resolve", json={"resolution": "resolved_local"}
    )
    assert resolved.status_code == 200
    bootstrap = (await auth_client.get("/api/v1/sync/bootstrap")).json()
    project = next(p for p in bootstrap["projects"] if p["id"] == str(pid))
    assert project["name"] == "Device B name"


@pytest.mark.asyncio
async def test_concurrent_note_body_edit_opens_conflict(auth_client: httpx.AsyncClient) -> None:
    nid = uuid.uuid4()
    await _push(auth_client, _op("vault_note", nid, "create", {"title": "Doc", "body": "v1"}))
    await _push(
        auth_client, _op("vault_note", nid, "update", {"body": "edited on A"}, base_version=1)
    )
    result = await _push(
        auth_client, _op("vault_note", nid, "update", {"body": "edited on B"}, base_version=1)
    )
    assert result[0]["result"] == "conflict"

    bootstrap = (await auth_client.get("/api/v1/sync/bootstrap")).json()
    note = next(n for n in bootstrap["notes"] if n["id"] == str(nid))
    assert note["body"] == "edited on A"
    conflicts = (await auth_client.get("/api/v1/sync/conflicts")).json()
    assert any(
        c["entity_id"] == str(nid) and c["local_value"] == {"body": "edited on B"}
        for c in conflicts
    )


@pytest.mark.asyncio
async def test_delete_of_modified_project_conflicts_instead_of_deleting(
    auth_client: httpx.AsyncClient,
) -> None:
    """Doc 11 §6: delete applies only if base version is current."""
    pid = uuid.uuid4()
    await _push(auth_client, _op("project", pid, "create", {"name": "Keep me"}))
    await _push(
        auth_client, _op("project", pid, "update", {"description": "new detail"}, base_version=1)
    )
    result = await _push(auth_client, _op("project", pid, "delete", {}, base_version=1))
    assert result[0]["result"] == "conflict"

    bootstrap = (await auth_client.get("/api/v1/sync/bootstrap")).json()
    assert str(pid) in {p["id"] for p in bootstrap["projects"]}


@pytest.mark.asyncio
async def test_edit_of_deleted_note_conflicts_and_restore_applies_edit(
    auth_client: httpx.AsyncClient,
) -> None:
    """Scenario S6: A deletes, B edits -> conflict; 'restore with my changes' works."""
    nid = uuid.uuid4()
    await _push(auth_client, _op("vault_note", nid, "create", {"title": "Old", "body": "text"}))
    deleted = await _push(auth_client, _op("vault_note", nid, "delete", {}, base_version=1))
    assert deleted[0]["result"] == "applied"

    edit = await _push(
        auth_client, _op("vault_note", nid, "update", {"title": "Edited offline"}, base_version=1)
    )
    assert edit[0]["result"] == "conflict"
    conflict_id = edit[0]["detail"]["conflict_id"]

    resolved = await auth_client.post(
        f"/api/v1/sync/conflicts/{conflict_id}/resolve", json={"resolution": "resolved_local"}
    )
    assert resolved.status_code == 200
    bootstrap = (await auth_client.get("/api/v1/sync/bootstrap")).json()
    note = next(n for n in bootstrap["notes"] if n["id"] == str(nid))
    assert note["title"] == "Edited offline"
