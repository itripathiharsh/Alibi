"""Integration tests for health probes and meta endpoint."""

import pytest
from httpx import AsyncClient

import app.api.router as api_router_module


@pytest.mark.asyncio
async def test_health_live_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_ready_with_live_database(client: AsyncClient) -> None:
    response = await client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["database"] == "connected"


@pytest.mark.asyncio
async def test_health_ready_failure_returns_rfc7807(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def mock_ping_fail() -> bool:
        return False

    monkeypatch.setattr(api_router_module, "ping_database", mock_ping_fail)

    response = await client.get("/health/ready")
    assert response.status_code == 503
    assert response.headers.get("content-type") == "application/problem+json"
    problem = response.json()
    assert problem["status"] == 503
    assert problem["title"] == "Service Unavailable"
    assert "Database is not reachable" in problem["detail"]


@pytest.mark.asyncio
async def test_api_v1_meta_returns_valid_metadata(client: AsyncClient) -> None:
    response = await client.get("/api/v1/meta")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "ALIBI"
    assert data["version"] == "0.1.0"
    assert data["environment"] in ("local", "cloud", "test")
    assert data["mode"] in ("local", "hosted")
    assert "T" in data["timestamp"]
    assert data["timezone"] == "Asia/Kolkata"
