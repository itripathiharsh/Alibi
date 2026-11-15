"""Integration tests for Voice STT and capture endpoints (doc 06 §8)."""

import io

import httpx
import pytest

from app.core.config import settings


@pytest.mark.asyncio
async def test_voice_transcribe_blocked_when_external_ai_disabled(
    auth_client: httpx.AsyncClient,
) -> None:
    """AC-AI-1: Voice transcribe returns 503 when AI_EXTERNAL_ENABLED=false."""
    orig = settings.ai_external_enabled
    settings.ai_external_enabled = False
    try:
        audio_content = b"RIFF....WAVEfmt ...."
        files = {"file": ("test.wav", io.BytesIO(audio_content), "audio/wav")}
        resp = await auth_client.post("/api/v1/voice/transcribe", files=files)
        assert resp.status_code == 503
        assert "External AI is disabled" in resp.json()["detail"]
    finally:
        settings.ai_external_enabled = orig
