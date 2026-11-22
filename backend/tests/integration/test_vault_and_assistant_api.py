"""Integration tests for Knowledge Vault and Grounded Assistant (doc 08, AC-RAG-1..6)."""

import uuid
from datetime import date

import httpx
import pytest


@pytest.mark.asyncio
async def test_vault_notes_crud_and_search_api(auth_client: httpx.AsyncClient) -> None:
    """Verify manual note creation, chunking, and multi-modal search (AC-RAG-6)."""
    # 1. Create a note
    note_payload = {
        "title": "Quantum Algorithm Feasibility Study",
        "body": "Explored Shor algorithm implementation and circuit depth optimizations on NISQ hardware.",
        "occurred_on": date.today().isoformat(),
        "source_type": "manual",
        "privacy_class": "work",
    }
    create_res = await auth_client.post("/api/v1/vault/notes", json=note_payload)
    assert create_res.status_code == 201
    note_data = create_res.json()
    assert note_data["title"] == note_payload["title"]
    assert note_data["embed_status"] == "done"
    note_id = note_data["id"]

    # 2. List notes
    list_res = await auth_client.get("/api/v1/vault/notes")
    assert list_res.status_code == 200
    notes = list_res.json()
    assert any(n["id"] == note_id for n in notes)

    # 3. Search notes - keyword match
    search_res = await auth_client.post(
        "/api/v1/vault/search",
        json={"query": "Quantum Algorithm", "mode": "keyword"},
    )
    assert search_res.status_code == 200
    kw_results = search_res.json()
    assert len(kw_results) > 0
    assert kw_results[0]["note_id"] == note_id
    assert "NISQ" in kw_results[0]["snippet"]

    # 4. Search notes - hybrid match (AC-RAG-6)
    hybrid_res = await auth_client.post(
        "/api/v1/vault/search",
        json={"query": "hardware optimizations", "mode": "hybrid"},
    )
    assert hybrid_res.status_code == 200
    hybrid_results = hybrid_res.json()
    assert len(hybrid_results) > 0
    assert hybrid_results[0]["note_id"] == note_id


@pytest.mark.req("FR-PROD-006")
@pytest.mark.asyncio
async def test_vault_note_task_bridge_and_completion_log(
    auth_client: httpx.AsyncClient,
) -> None:
    """A vault checklist item becomes a linked task and completion is logged back to the note."""
    note_response = await auth_client.post(
        "/api/v1/vault/notes",
        json={
            "title": "Release checklist",
            "body": "- [ ] Prepare the rollback plan\n- [x] Review the deployment window",
            "occurred_on": date.today().isoformat(),
        },
    )
    assert note_response.status_code == 201, note_response.text
    note_id = note_response.json()["id"]
    task_id = str(uuid.uuid4())

    conversion = await auth_client.post(
        f"/api/v1/vault/notes/{note_id}/convert-task",
        json={"task_id": task_id, "task_text": "Prepare the rollback plan"},
    )
    assert conversion.status_code == 201, conversion.text
    assert conversion.json()["task_id"] == task_id

    task_response = await auth_client.get(f"/api/v1/tasks/{task_id}")
    assert task_response.status_code == 200, task_response.text
    assert task_response.json()["linked_notes"][0]["id"] == note_id

    completed = await auth_client.post(
        f"/api/v1/tasks/{task_id}/status", json={"status": "completed"}
    )
    assert completed.status_code == 200, completed.text

    note_detail = await auth_client.get(f"/api/v1/vault/notes/{note_id}")
    assert note_detail.status_code == 200, note_detail.text
    note_body = note_detail.json()["body"]
    assert "Prepare the rollback plan" in note_body
    assert "Completed" in note_body


@pytest.mark.asyncio
async def test_assistant_chat_lifecycle_and_grounded_answer(
    auth_client: httpx.AsyncClient,
) -> None:
    """Verify Grounded Assistant conversation, tool execution, and citations (AC-RAG-1)."""
    # 1. Capture and complete a task
    t_res = await auth_client.post(
        "/api/v1/tasks/capture",
        json={
            "raw_input": "Design database indexing strategy for vector search",
            "origin": "manual",
        },
    )
    assert t_res.status_code == 201
    task_id = t_res.json()["task"]["id"]

    # Complete the task
    c_res = await auth_client.post(
        f"/api/v1/tasks/{task_id}/status",
        json={"status": "completed", "completion_note": "HNSW index verified with 384 dimensions"},
    )
    assert c_res.status_code == 200

    # 2. Ask assistant: "What did I accomplish today?"
    chat_res = await auth_client.post(
        "/api/v1/assistant/chat",
        json={"message": "What did I accomplish today?"},
    )
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert chat_data["role"] == "assistant"
    assert "indexing strategy" in chat_data["content"] or "Completed" in chat_data["content"]
    assert len(chat_data["sources"]) > 0
    assert len(chat_data["tool_calls"]) > 0
    thread_id = chat_data["thread_id"]

    # 3. List threads
    threads_res = await auth_client.get("/api/v1/assistant/threads")
    assert threads_res.status_code == 200
    threads = threads_res.json()
    assert any(t["id"] == thread_id for t in threads)

    # 4. Get thread messages
    messages_res = await auth_client.get(f"/api/v1/assistant/threads/{thread_id}/messages")
    assert messages_res.status_code == 200
    messages = messages_res.json()
    assert len(messages) >= 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_regression_KI_029_assistant_today_uses_user_timezone_not_server_date(
    auth_client: httpx.AsyncClient,
) -> None:
    """Regression: "today" was resolved with the server's date (UTC when hosted) while tasks
    were filtered by the user's local date, so between 00:00 and 05:30 IST "What did I
    accomplish today?" found nothing. The user's timezone here is chosen so its date always
    differs from the UTC date at the moment the test runs."""
    from datetime import UTC, datetime

    tz = "Pacific/Kiritimati" if datetime.now(UTC).hour >= 10 else "Etc/GMT+12"
    me = await auth_client.patch("/api/v1/auth/me", json={"timezone": tz})
    assert me.status_code == 200

    t_res = await auth_client.post(
        "/api/v1/tasks/capture",
        json={"raw_input": "Reconcile timezone ledger", "origin": "manual"},
    )
    task_id = t_res.json()["task"]["id"]
    done = await auth_client.post(f"/api/v1/tasks/{task_id}/status", json={"status": "completed"})
    assert done.status_code == 200

    chat = await auth_client.post(
        "/api/v1/assistant/chat", json={"message": "What did I accomplish today?"}
    )
    assert chat.status_code == 200
    assert "Reconcile timezone ledger" in chat.json()["content"]
