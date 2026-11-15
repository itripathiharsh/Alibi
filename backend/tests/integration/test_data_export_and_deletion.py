"""Integration tests for Full Data Export and Account Deletion (doc 12 §8, FR-DATA-001, FR-DATA-003)."""

import httpx
import pytest


@pytest.mark.asyncio
async def test_full_data_export_lifecycle(
    auth_client: httpx.AsyncClient,
) -> None:
    """FR-DATA-001: Authenticated user can export their entire dataset in structured JSON."""
    # 1. Create a task to ensure user has data
    task_res = await auth_client.post(
        "/api/v1/tasks",
        json={"raw_text": "Export testing task #data", "title": "Export testing task"},
    )
    assert task_res.status_code == 201

    # 2. Call export endpoint
    export_res = await auth_client.get("/api/v1/data/export")
    assert export_res.status_code == 200
    data = export_res.json()

    # 3. Verify archive structure
    assert data["version"] == "1.0.0"
    assert "user" in data
    assert "tasks" in data
    assert "categories" in data
    assert "workspaces" in data
    assert any(t["title"] == "Export testing task" for t in data["tasks"])


@pytest.mark.asyncio
async def test_account_deletion_requires_password_and_confirmation(
    auth_client: httpx.AsyncClient,
) -> None:
    """FR-DATA-003: Account deletion rejects wrong password or missing confirmation."""
    # 1. Missing confirm
    res_no_confirm = await auth_client.request(
        "DELETE",
        "/api/v1/data/account",
        json={"password": "any", "confirm": False},
    )
    assert res_no_confirm.status_code == 400

    # 2. Wrong password
    res_wrong_pw = await auth_client.request(
        "DELETE",
        "/api/v1/data/account",
        json={"password": "WrongPassword123!", "confirm": True},
    )
    assert res_wrong_pw.status_code == 401
