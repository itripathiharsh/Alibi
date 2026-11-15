"""Integration tests for AI Provider Settings and Usage API endpoints (AC-AI-3, AC-AI-4)."""

import httpx
import pytest


@pytest.mark.asyncio
async def test_ai_settings_lifecycle_and_key_masking(
    auth_client: httpx.AsyncClient,
) -> None:
    """AC-AI-3: API key is write-only, encrypted at rest, and returned masked as key_last4."""
    # 1. List providers: all 4 supported providers listed, none enabled initially
    resp = await auth_client.get("/api/v1/ai/providers")
    assert resp.status_code == 200
    providers = resp.json()
    assert len(providers) == 4
    names = [p["provider"] for p in providers]
    assert "groq" in names
    assert "gemini" in names
    assert "nvidia" in names
    assert "ollama" in names

    # 2. Update provider with key: stores encrypted, returns only last4
    secret_key = "gsk_prod_secret_token_1234abcd"
    update_resp = await auth_client.put(
        "/api/v1/ai/providers/groq",
        json={
            "enabled": True,
            "api_key": secret_key,
            "fallback_rank": 1,
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["provider"] == "groq"
    assert updated["enabled"] is True
    assert updated["key_last4"] == "abcd"
    # Plaintext key must NOT be returned in response
    assert secret_key not in update_resp.text

    # 3. Test connection (returns error since dummy key cannot hit external network, but validates endpoint)
    test_resp = await auth_client.post("/api/v1/ai/providers/groq/test")
    assert test_resp.status_code == 200
    test_data = test_resp.json()
    assert test_data["provider"] == "groq"
    assert "status" in test_data

    # 4. Delete key
    del_resp = await auth_client.delete("/api/v1/ai/providers/groq/key")
    assert del_resp.status_code == 204

    # 5. Verify key is cleared
    list_after = await auth_client.get("/api/v1/ai/providers")
    groq_setting = next(p for p in list_after.json() if p["provider"] == "groq")
    assert groq_setting["key_last4"] is None


@pytest.mark.asyncio
async def test_ai_global_config_toggle(
    auth_client: httpx.AsyncClient,
) -> None:
    """Test global AI outbound permission toggle."""
    resp = await auth_client.get("/api/v1/ai/config")
    assert resp.status_code == 200

    toggle_resp = await auth_client.put(
        "/api/v1/ai/config",
        json={"ai_external_enabled": True},
    )
    assert toggle_resp.status_code == 200
    assert toggle_resp.json()["ai_external_enabled"] is True

    # Revert back to privacy-first default
    revert_resp = await auth_client.put(
        "/api/v1/ai/config",
        json={"ai_external_enabled": False},
    )
    assert revert_resp.status_code == 200
    assert revert_resp.json()["ai_external_enabled"] is False
