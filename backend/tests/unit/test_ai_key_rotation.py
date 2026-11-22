"""Server-held key pools: rotation and per-key failover (FR-AI-012, ADR-028).

Provider HTTP calls are replaced with in-process fakes; nothing leaves the machine.
"""

import uuid

import httpx
import pytest

from app.ai import gateway as gateway_module
from app.ai.adapters.gemini import GeminiProviderAdapter
from app.ai.adapters.groq import GroqProviderAdapter
from app.ai.gateway import AIGateway, CircuitBreaker, server_provider_keys
from app.ai.types import LLMRequest, Message, Operation, RawCompletion
from app.core.config import settings


def _http_error(code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://provider.test/chat/completions")
    return httpx.HTTPStatusError(
        f"HTTP {code}", request=request, response=httpx.Response(code, request=request)
    )


@pytest.fixture
def pool(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[str]]:
    """Gemini pool k1,k2,k3 and one Groq key; records which keys were called."""
    monkeypatch.setattr(settings, "ai_external_enabled", True)
    monkeypatch.setattr(settings, "alibi_mode", "hosted")
    monkeypatch.setattr(settings, "gemini_api_key", "k1, k2\nk3")
    monkeypatch.setattr(settings, "groq_api_key", "g1")
    monkeypatch.setattr(settings, "openrouter_api_key", None)
    monkeypatch.setattr(gateway_module, "circuit_breaker", CircuitBreaker())
    monkeypatch.setattr(gateway_module, "_key_rotation", {})

    async def allow(_self: AIGateway, _user_id: uuid.UUID | None) -> bool:
        return True

    monkeypatch.setattr(AIGateway, "_user_allows_cloud_ai", allow)
    calls: dict[str, list[str]] = {"keys": [], "fail": [], "fail_code": []}

    async def fake_chat(self: GroqProviderAdapter, _req: LLMRequest, model: str) -> RawCompletion:
        key = str(self.api_key)
        calls["keys"].append(key)
        if key in calls["fail"]:
            raise _http_error(int(calls["fail_code"][0]) if calls["fail_code"] else 429)
        return RawCompletion(content=f"answer from {key}", model=model)

    monkeypatch.setattr(GeminiProviderAdapter, "chat", fake_chat)
    monkeypatch.setattr(GroqProviderAdapter, "chat", fake_chat)
    return calls


def _req() -> LLMRequest:
    return LLMRequest(operation=Operation.BRAIN_DUMP, messages=[Message(role="user", content="x")])


def test_key_list_parsing() -> None:
    orig = settings.gemini_api_key
    try:
        settings.gemini_api_key = " a, b\nc,,a ; d "
        assert server_provider_keys("gemini") == ["a", "b", "c", "d"]
        settings.gemini_api_key = None
        assert server_provider_keys("gemini") == []
    finally:
        settings.gemini_api_key = orig


@pytest.mark.asyncio
@pytest.mark.usefixtures("pool")
async def test_requests_rotate_across_the_pool() -> None:
    gw = AIGateway(db=None)
    answers = [(await gw.complete(_req(), user_id=uuid.uuid4())).data for _ in range(4)]
    assert answers == ["answer from k1", "answer from k2", "answer from k3", "answer from k1"]


@pytest.mark.asyncio
async def test_rate_limited_key_fails_over_to_next_key_and_cools_down(
    pool: dict[str, list[str]],
) -> None:
    pool["fail"].append("k1")
    gw = AIGateway(db=None)

    first = await gw.complete(_req(), user_id=uuid.uuid4())
    assert first.ok and first.provider == "gemini"
    assert first.data == "answer from k2"
    assert {
        "provider": "gemini",
        "status": "rate_limited",
        "code": 429,
        "key_slot": "gemini#1",
    } in first.attempts

    # Rotation comes back round to k1 on the 4th request; it is still cooling down.
    for _ in range(2):
        await gw.complete(_req(), user_id=uuid.uuid4())
    pool["keys"].clear()
    fourth = await gw.complete(_req(), user_id=uuid.uuid4())
    assert "k1" not in pool["keys"]
    assert fourth.data == "answer from k2"


@pytest.mark.asyncio
async def test_whole_pool_rate_limited_falls_back_to_next_provider(
    pool: dict[str, list[str]],
) -> None:
    pool["fail"].extend(["k1", "k2", "k3"])
    result = await AIGateway(db=None).complete(_req(), user_id=uuid.uuid4())
    assert result.ok and result.provider == "groq"
    assert pool["keys"] == ["k1", "k2", "k3", "g1"]


@pytest.mark.asyncio
async def test_rejected_key_is_skipped(pool: dict[str, list[str]]) -> None:
    pool["fail"].append("k1")
    pool["fail_code"].append("401")
    result = await AIGateway(db=None).complete(_req(), user_id=uuid.uuid4())
    assert result.data == "answer from k2"


@pytest.mark.asyncio
async def test_server_error_moves_to_next_provider_not_next_key(
    pool: dict[str, list[str]],
) -> None:
    pool["fail"].append("k1")
    pool["fail_code"].append("503")
    result = await AIGateway(db=None).complete(_req(), user_id=uuid.uuid4())
    assert result.provider == "groq"
    assert "k2" not in pool["keys"]


@pytest.mark.asyncio
async def test_pool_unused_without_user_consent(
    pool: dict[str, list[str]], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def deny(_self: AIGateway, _user_id: uuid.UUID | None) -> bool:
        return False

    monkeypatch.setattr(AIGateway, "_user_allows_cloud_ai", deny)
    result = await AIGateway(db=None).complete(_req(), user_id=uuid.uuid4())
    assert result.ok is False
    assert pool["keys"] == []
