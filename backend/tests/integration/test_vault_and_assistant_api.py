"""Integration tests for Knowledge Vault and Grounded Assistant (doc 08, AC-RAG-1..6)."""

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
