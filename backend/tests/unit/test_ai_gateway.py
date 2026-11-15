"""Tests for AI Gateway routing, privacy gating, and fallback (AC-AI-1, AC-AI-2, AC-AI-7)."""

import uuid

import pytest

from app.ai.adapters.fake import FakeProviderAdapter
from app.ai.gateway import AIGateway
from app.ai.types import LLMRequest, Message, Operation
from app.core.config import settings


@pytest.mark.asyncio
async def test_ai_gateway_blocks_external_when_disabled() -> None:
    """AC-AI-1: With AI_EXTERNAL_ENABLED=false, external providers are not called."""
    # Ensure disabled
    orig_setting = settings.ai_external_enabled
    settings.ai_external_enabled = False
    try:
        gateway = AIGateway(db=None)
        # Without custom mock or local provider, gateway returns degraded
        req = LLMRequest(
            operation=Operation.TASK_EXTRACTION,
            messages=[Message(role="user", content="Review PR")],
        )
        res = await gateway.complete(req, user_id=uuid.uuid4())
        assert res.ok is False
        assert res.degraded is True
        assert res.error_code == "ai_unavailable"
    finally:
        settings.ai_external_enabled = orig_setting


@pytest.mark.asyncio
async def test_ai_gateway_fallback_on_provider_failure() -> None:
    """AC-AI-2: Provider failure triggers automatic fallback to next available provider."""
    gateway = AIGateway(db=None)

    # First provider fails
    failing_groq = FakeProviderAdapter(name="groq", should_fail=True, fail_status_code=500)
    # Second provider succeeds
    succeeding_gemini = FakeProviderAdapter(name="gemini", should_fail=False)

    gateway.register_adapter("groq", failing_groq)
    gateway.register_adapter("gemini", succeeding_gemini)

    req = LLMRequest(
        operation=Operation.TASK_EXTRACTION,
        messages=[Message(role="user", content="Review PR")],
    )

    res = await gateway.complete(req, user_id=uuid.uuid4())
    assert res.ok is True
    assert res.provider == "gemini"
    assert len(failing_groq.call_history) == 1
    assert len(succeeding_gemini.call_history) == 1
