"""ALIBI AI Gateway (ADR-008, ADR-020, doc 06 §2, §4, §5, §6).

Central gateway orchestrating routing, privacy gating, circuit breaker,
repair loop, and usage telemetry.
"""

import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal

import httpx
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters.base import ProviderAdapter
from app.ai.adapters.gemini import GeminiProviderAdapter
from app.ai.adapters.groq import GroqProviderAdapter
from app.ai.adapters.nvidia import NvidiaProviderAdapter
from app.ai.adapters.ollama import OllamaProviderAdapter
from app.ai.adapters.openrouter import OpenRouterProviderAdapter
from app.ai.types import GatewayResult, LLMRequest, Message, Operation
from app.core.config import settings
from app.core.crypto import decrypt_api_key
from app.models.ai_provider import AIProviderSetting, AIUsageLog
from app.models.user import User

logger = logging.getLogger("alibi.ai.gateway")

EXTERNAL_PROVIDERS = ("groq", "gemini", "nvidia", "openrouter")

# Per-user consent flag stored in users.settings (ADR-028). Cloud AI stays off until the
# user turns it on, even when the server has provider keys configured.
CLOUD_AI_OPT_IN_KEY = "cloud_ai_opt_in"


def user_cloud_ai_opt_in(user_settings: dict[str, Any] | None) -> bool:
    """Return whether the user explicitly allowed sending text to cloud AI providers."""
    return bool((user_settings or {}).get(CLOUD_AI_OPT_IN_KEY) is True)


def server_provider_keys(provider_name: str) -> list[str]:
    """Server-held free-tier keys for a provider (ADR-028).

    Each env var may hold several keys separated by commas, spaces or new lines, for
    example `GEMINI_API_KEY=key1,key2,key3`. Order is kept and duplicates are dropped.
    """
    raw = {
        "groq": settings.groq_api_key,
        "gemini": settings.gemini_api_key,
        "openrouter": settings.openrouter_api_key,
    }.get(provider_name) or ""
    keys = [k.strip() for k in re.split(r"[\s,;]+", raw) if k.strip()]
    return list(dict.fromkeys(keys))


def server_provider_key(provider_name: str) -> str | None:
    """First server-held key for a provider, if any."""
    keys = server_provider_keys(provider_name)
    return keys[0] if keys else None


# Round-robin start position per provider, so load spreads across the key pool.
_key_rotation: dict[str, int] = {}


def _rotate(provider_name: str, count: int) -> list[int]:
    """Indexes of a provider's keys in the order to try them for this request."""
    start = _key_rotation.get(provider_name, 0) % count
    _key_rotation[provider_name] = start + 1
    return [(start + offset) % count for offset in range(count)]


@dataclass
class _Candidate:
    """One way to call a provider: an adapter bound to one key."""

    adapter: ProviderAdapter
    model: str
    slot: str  # circuit-breaker id: the provider name, or "<provider>#<n>" for pooled keys


AttemptOutcome = Literal["ok", "next_key", "next_provider"]
KEY_REJECTED_COOLDOWN = timedelta(minutes=10)


def _strip_fences(content: str) -> str:
    """Remove a markdown ```json fence around a model's JSON answer."""
    clean = content.strip()
    if clean.startswith("```"):
        clean = clean.split("```")[1]
        if clean.startswith("json"):
            clean = clean[4:]
        clean = clean.strip()
    return clean


class CircuitBreaker:
    """In-memory circuit breaker and rate-limit cooldown per provider."""

    def __init__(self) -> None:
        self.failure_counts: dict[str, int] = {}
        self.cooldown_until: dict[str, datetime] = {}
        self.breaker_open_until: dict[str, datetime] = {}

    def is_available(self, provider: str) -> bool:
        now = datetime.now(UTC)
        if provider in self.cooldown_until and now < self.cooldown_until[provider]:
            return False
        return not (provider in self.breaker_open_until and now < self.breaker_open_until[provider])

    def record_success(self, provider: str) -> None:
        self.failure_counts[provider] = 0
        self.cooldown_until.pop(provider, None)
        self.breaker_open_until.pop(provider, None)

    def cool_down(self, provider: str, duration: timedelta) -> None:
        """Skip a provider (or one pooled key) for a while, e.g. after a rejected key."""
        self.cooldown_until[provider] = datetime.now(UTC) + duration

    def record_failure(self, provider: str, is_rate_limit: bool = False) -> None:
        now = datetime.now(UTC)
        count = self.failure_counts.get(provider, 0) + 1
        self.failure_counts[provider] = count

        if is_rate_limit:
            # Cooldown for 60 seconds on 429
            from datetime import timedelta

            self.cooldown_until[provider] = now + timedelta(seconds=60)
            logger.warning(
                "Provider %s in quota cooldown until %s", provider, self.cooldown_until[provider]
            )

        if count >= 5:
            from datetime import timedelta

            self.breaker_open_until[provider] = now + timedelta(seconds=60)
            logger.error("Circuit breaker OPEN for provider %s for 60s", provider)


circuit_breaker = CircuitBreaker()


class AIGateway:
    """Unified AI Provider Gateway."""

    DEFAULT_CHAINS: dict[Operation, list[str]] = {
        Operation.TASK_EXTRACTION: ["groq", "gemini", "openrouter", "nvidia", "ollama"],
        # Gemini first: best Hinglish understanding on the free tier (ADR-028).
        Operation.BRAIN_DUMP: ["gemini", "groq", "openrouter", "nvidia", "ollama"],
        Operation.TASK_CLASSIFICATION: ["groq", "gemini", "ollama"],
        Operation.COMPLEX_UNDERSTANDING: ["gemini", "nvidia", "groq", "ollama"],
        Operation.DAILY_PLAN_NARRATIVE: ["gemini", "groq", "nvidia", "ollama"],
        Operation.RAG_ANSWER: ["gemini", "ollama"],
        Operation.RAG_INTENT: ["groq", "ollama"],
        Operation.WORK_SUMMARY: ["groq", "gemini", "ollama"],
        Operation.REPORT_NARRATIVE: ["gemini", "groq", "ollama"],
        Operation.LEARNING_INSIGHT_TEXT: ["gemini", "ollama"],
    }

    def __init__(self, db: AsyncSession | None = None) -> None:
        self.db = db
        self.custom_adapters: dict[str, ProviderAdapter] = {}

    def register_adapter(self, name: str, adapter: ProviderAdapter) -> None:
        """Register a custom adapter (e.g. FakeProviderAdapter for tests)."""
        self.custom_adapters[name] = adapter

    @staticmethod
    def _make_adapter(
        provider_name: str, api_key: str | None, base_url: str | None, default_model: str | None
    ) -> tuple[ProviderAdapter, str] | None:
        if provider_name == "ollama":
            if settings.alibi_mode == "hosted":
                return None  # Ollama is excluded in hosted mode
            return OllamaProviderAdapter(base_url=base_url), (
                default_model or OllamaProviderAdapter.DEFAULT_MODEL
            )
        if not api_key:
            return None
        if provider_name == "openrouter":
            return OpenRouterProviderAdapter(api_key=api_key, base_url=base_url), (
                default_model or OpenRouterProviderAdapter.DEFAULT_MODEL
            )
        if provider_name == "groq":
            return GroqProviderAdapter(api_key=api_key, base_url=base_url), (
                default_model or GroqProviderAdapter.DEFAULT_MODEL
            )
        if provider_name == "gemini":
            return GeminiProviderAdapter(api_key=api_key, base_url=base_url), (
                default_model or GeminiProviderAdapter.DEFAULT_MODEL
            )
        if provider_name == "nvidia":
            return NvidiaProviderAdapter(api_key=api_key, base_url=base_url), (
                default_model or NvidiaProviderAdapter.DEFAULT_MODEL
            )
        return None

    async def _resolve_candidates(
        self, provider_name: str, user_id: uuid.UUID | None
    ) -> list[_Candidate]:
        """All usable keys for a provider, in the order to try them.

        A user's own saved key wins and is used alone. Otherwise the owner's server-held
        key pool is used, rotated so consecutive requests start on different keys.
        """
        if provider_name in self.custom_adapters:
            return [_Candidate(self.custom_adapters[provider_name], "fake-model", provider_name)]

        user_key: str | None = None
        base_url: str | None = None
        default_model: str | None = None

        if self.db and user_id:
            from sqlalchemy import select

            stmt = select(AIProviderSetting).where(
                AIProviderSetting.user_id == user_id,
                AIProviderSetting.provider == provider_name,
            )
            res = await self.db.execute(stmt)
            p_set = res.scalar_one_or_none()
            if p_set:
                if not p_set.enabled:
                    # The user switched this provider off: respect that.
                    return []
                if p_set.api_key_encrypted:
                    try:
                        user_key = decrypt_api_key(p_set.api_key_encrypted)
                    except Exception as e:
                        logger.error("Failed to decrypt API key for %s: %s", provider_name, e)
                        return []
                base_url = p_set.base_url
                models_dict = p_set.models or {}
                default_model = models_dict.get("default")

        if user_key or provider_name == "ollama":
            made = self._make_adapter(provider_name, user_key, base_url, default_model)
            return [_Candidate(made[0], made[1], provider_name)] if made else []

        pool = server_provider_keys(provider_name)
        if not pool:
            return []
        if provider_name == "openrouter" and not default_model:
            default_model = settings.openrouter_model
        candidates: list[_Candidate] = []
        for index in _rotate(provider_name, len(pool)):
            made = self._make_adapter(provider_name, pool[index], base_url, default_model)
            if made:
                slot = provider_name if len(pool) == 1 else f"{provider_name}#{index + 1}"
                candidates.append(_Candidate(made[0], made[1], slot))
        return candidates

    async def _resolve_adapter(
        self, provider_name: str, user_id: uuid.UUID | None
    ) -> tuple[ProviderAdapter | None, str | None]:
        """First usable adapter for a provider (kept for callers that need one)."""
        candidates = await self._resolve_candidates(provider_name, user_id)
        if not candidates:
            return None, None
        return candidates[0].adapter, candidates[0].model

    async def _user_allows_cloud_ai(self, user_id: uuid.UUID | None) -> bool:
        """Read the user's explicit cloud-AI consent (default off)."""
        if self.db is None or user_id is None:
            return False
        user = await self.db.get(User, user_id)
        return user is not None and user_cloud_ai_opt_in(user.settings)

    async def _log_usage(
        self,
        user_id: uuid.UUID,
        provider: str,
        model: str,
        operation: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        status: str,
        error_code: str | None = None,
        fallback_from: str | None = None,
    ) -> None:
        """Record non-sensitive usage metrics in ai_usage_logs (doc 06 §9)."""
        if not self.db:
            return
        try:
            log_entry = AIUsageLog(
                user_id=user_id,
                provider=provider,
                model=model,
                operation=operation,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                status=status,
                error_code=error_code,
                estimated_cost_usd=Decimal("0.0"),  # Free tier default
                fallback_from=fallback_from,
            )
            self.db.add(log_entry)
            await self.db.commit()
        except Exception as e:
            logger.error("Failed to write AI usage log: %s", e)

    async def _attempt(
        self,
        req: LLMRequest,
        user_id: uuid.UUID,
        provider_name: str,
        candidate: _Candidate,
        attempts: list[dict[str, Any]],
        fallback_from: str | None,
    ) -> tuple[AttemptOutcome, GatewayResult | None]:
        """Call one provider key. Rate-limited or rejected keys move on to the next key;
        other failures move on to the next provider."""
        adapter, model_name, slot = candidate.adapter, candidate.model, candidate.slot
        t0 = datetime.now(UTC)
        try:
            raw = await adapter.chat(req, model_name)
            circuit_breaker.record_success(slot)

            # Validate structured response if schema specified
            parsed_data = None
            if req.response_schema is not None:
                try:
                    parsed_data = req.response_schema.model_validate(
                        json.loads(_strip_fences(raw.content))
                    )
                except (json.JSONDecodeError, ValidationError) as parse_err:
                    # Attempt one repair call on same provider (doc 06 §5)
                    logger.warning(
                        "Structured output validation failed on %s: %s. Attempting repair...",
                        provider_name,
                        parse_err,
                    )
                    repair_req = LLMRequest(
                        operation=req.operation,
                        messages=req.messages
                        + [
                            Message(role="assistant", content=raw.content),
                            Message(
                                role="user",
                                content=f"Your JSON response was invalid: {parse_err}. Please output valid JSON matching the schema strictly.",
                            ),
                        ],
                        response_schema=req.response_schema,
                        timeout_s=req.timeout_s,
                    )
                    try:
                        repair_raw = await adapter.chat(repair_req, model_name)
                        parsed_data = req.response_schema.model_validate(
                            json.loads(_strip_fences(repair_raw.content))
                        )
                        raw = repair_raw
                    except Exception:
                        # Repair failed: the model, not the key, is the problem.
                        await self._log_usage(
                            user_id=user_id,
                            provider=provider_name,
                            model=model_name,
                            operation=req.operation.value,
                            input_tokens=raw.prompt_tokens,
                            output_tokens=raw.completion_tokens,
                            latency_ms=raw.latency_ms,
                            status="invalid_output",
                            error_code="validation_failed",
                            fallback_from=fallback_from,
                        )
                        attempts.append({"provider": provider_name, "status": "invalid_output"})
                        return "next_provider", None

            await self._log_usage(
                user_id=user_id,
                provider=provider_name,
                model=model_name,
                operation=req.operation.value,
                input_tokens=raw.prompt_tokens,
                output_tokens=raw.completion_tokens,
                latency_ms=raw.latency_ms,
                status="ok",
                fallback_from=fallback_from,
            )
            return "ok", GatewayResult(
                ok=True,
                data=parsed_data if parsed_data is not None else raw.content,
                raw_content=raw.content,
                provider=provider_name,
                model=model_name,
                attempts=attempts,
                latency_ms=raw.latency_ms,
                degraded=False,
            )

        except httpx.HTTPStatusError as http_err:
            status_code = http_err.response.status_code
            is_rate_limit = status_code == 429
            key_rejected = status_code in (401, 403)
            circuit_breaker.record_failure(slot, is_rate_limit=is_rate_limit)
            if key_rejected:
                circuit_breaker.cool_down(slot, KEY_REJECTED_COOLDOWN)
            status_str = "rate_limited" if is_rate_limit else "error"
            await self._log_usage(
                user_id=user_id,
                provider=provider_name,
                model=model_name,
                operation=req.operation.value,
                input_tokens=0,
                output_tokens=0,
                latency_ms=int((datetime.now(UTC) - t0).total_seconds() * 1000),
                status=status_str,
                error_code=f"HTTP_{status_code}",
                fallback_from=fallback_from,
            )
            attempt: dict[str, Any] = {
                "provider": provider_name,
                "status": status_str,
                "code": status_code,
            }
            if slot != provider_name:
                attempt["key_slot"] = slot
            attempts.append(attempt)
            return ("next_key" if is_rate_limit or key_rejected else "next_provider"), None

        except Exception as ex:
            circuit_breaker.record_failure(slot)
            await self._log_usage(
                user_id=user_id,
                provider=provider_name,
                model=model_name,
                operation=req.operation.value,
                input_tokens=0,
                output_tokens=0,
                latency_ms=int((datetime.now(UTC) - t0).total_seconds() * 1000),
                status="error",
                error_code=str(ex)[:50],
                fallback_from=fallback_from,
            )
            attempts.append({"provider": provider_name, "status": "error", "error": str(ex)})
            return "next_provider", None

    async def complete(
        self,
        req: LLMRequest,
        user_id: uuid.UUID,
        external_ai_allowed: bool = True,
    ) -> GatewayResult:
        """Route request through fallback chain with validation and repair."""
        # 1. Privacy filter (AC-AI-1, doc 06 §6): server switch AND caller AND user consent
        allow_external = (
            settings.ai_external_enabled
            and external_ai_allowed
            and await self._user_allows_cloud_ai(user_id)
        )

        chain = self.DEFAULT_CHAINS.get(req.operation, ["groq", "gemini", "ollama"])
        attempts: list[dict[str, Any]] = []
        fallback_from: str | None = None

        for provider_name in chain:
            # Check external gating
            is_external = provider_name in EXTERNAL_PROVIDERS
            if is_external and not allow_external and provider_name not in self.custom_adapters:
                continue

            # Circuit breaker check
            if not circuit_breaker.is_available(provider_name):
                attempts.append({"provider": provider_name, "status": "circuit_open"})
                continue

            candidates = await self._resolve_candidates(provider_name, user_id)
            if not candidates:
                attempts.append({"provider": provider_name, "status": "not_configured"})
                continue

            for candidate in candidates:
                if candidate.slot != provider_name and not circuit_breaker.is_available(
                    candidate.slot
                ):
                    attempts.append(
                        {
                            "provider": provider_name,
                            "key_slot": candidate.slot,
                            "status": "cooling_down",
                        }
                    )
                    continue
                outcome, result = await self._attempt(
                    req, user_id, provider_name, candidate, attempts, fallback_from
                )
                if outcome == "ok" and result is not None:
                    return result
                fallback_from = provider_name
                if outcome == "next_provider":
                    break

        # All providers exhausted or AI unavailable (AC-AI-2, FR-AI-009)
        return GatewayResult(
            ok=False,
            data=None,
            raw_content=None,
            provider="none",
            model="none",
            attempts=attempts,
            latency_ms=0,
            degraded=True,
            error_code="ai_unavailable",
        )
