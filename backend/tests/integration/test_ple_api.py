"""Integration tests for PLE API endpoints (AC-PLE-2, AC-PLE-7)."""

import httpx
import pytest


@pytest.mark.asyncio
async def test_ple_profile_and_duration_prediction_api(auth_client: httpx.AsyncClient) -> None:
    """Test learning profile fetch and duration prediction endpoints."""
    # 1. Profile endpoint
    prof_resp = await auth_client.get("/api/v1/learning/profile")
    assert prof_resp.status_code == 200
    prof = prof_resp.json()
    assert "maturity" in prof
    assert "routines" in prof
    assert "preferences" in prof
    # Cold start initially
    assert prof["maturity"]["duration"]["level"] == 0

    # 2. Predict duration (cold start defaults to user estimate or fallback)
    pred_resp = await auth_client.post(
        "/api/v1/learning/predict-duration",
        json={"title": "Prepare quarterly report", "user_estimate_min": 60},
    )
    assert pred_resp.status_code == 200
    pred = pred_resp.json()
    assert pred["p50_min"] == 60
    assert pred["maturity_level"] == 0
    assert pred["confidence"] == 0.0

    # 3. Reset learning
    reset_resp = await auth_client.post("/api/v1/learning/reset")
    assert reset_resp.status_code == 200
    assert reset_resp.json()["status"] == "ok"
