"""ALIBI AI Gateway (ADR-008, ADR-020, doc 06 §2, §4, §5, §6).

Central gateway orchestrating routing, privacy gating, circuit breaker,
repair loop, and usage telemetry.
"""

import json
import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import httpx
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters.base import ProviderAdapter
from app.ai.adapters.gemini import GeminiProviderAdapter
from app.ai.adapters.groq import GroqProviderAdapter
from app.ai.adapters.nvidia import NvidiaProviderAdapter
from app.ai.adapters.ollama import OllamaProviderAdapter
from app.ai.types import GatewayResult, LLMRequest, Message, Operation
from app.core.config import settings
from app.core.crypto import decrypt_api_key
from app.models.ai_provider import AIProviderSetting, AIUsageLog

logger = logging.getLogger("alibi.ai.gateway")


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
        Operation.TASK_EXTRACTION: ["groq", "gemini", "nvidia", "ollama"],
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

    async def _resolve_adapter(
        self, provider_name: str, user_id: uuid.UUID | None
    ) -> tuple[ProviderAdapter | None, str | None]:
        """Resolve adapter instance and configured default model for user."""
        if provider_name in self.custom_adapters:
            return self.custom_adapters[provider_name], "fake-model"

        # Check DB settings for provider
        api_key: str | None = None
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
                    return None, None
                if p_set.api_key_encrypted:
                    try:
                        api_key = decrypt_api_key(p_set.api_key_encrypted)
                    except Exception as e:
                        logger.error("Failed to decrypt API key for %s: %s", provider_name, e)
                        return None, None
                base_url = p_set.base_url
                models_dict = p_set.models or {}
                default_model = models_dict.get("default")

        if provider_name == "groq":
            if not api_key:
                return None, None
            return GroqProviderAdapter(
                api_key=api_key, base_url=base_url
            ), default_model or GroqProviderAdapter.DEFAULT_MODEL
        elif provider_name == "gemini":
            if not api_key:
                return None, None
            return GeminiProviderAdapter(
                api_key=api_key, base_url=base_url
            ), default_model or GeminiProviderAdapter.DEFAULT_MODEL
        elif provider_name == "nvidia":
            if not api_key:
                return None, None
            return NvidiaProviderAdapter(
                api_key=api_key, base_url=base_url
            ), default_model or NvidiaProviderAdapter.DEFAULT_MODEL
        elif provider_name == "ollama":
            if settings.alibi_mode == "hosted":
                # Ollama is excluded in hosted mode
                return None, None
            return OllamaProviderAdapter(
                base_url=base_url
            ), default_model or OllamaProviderAdapter.DEFAULT_MODEL

        return None, None

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

    async def complete(
        self,
        req: LLMRequest,
        user_id: uuid.UUID,
        external_ai_allowed: bool = True,
    ) -> GatewayResult:
        """Route request through fallback chain with validation and repair."""
        # 1. Privacy filter (AC-AI-1, doc 06 §6)
        allow_external = settings.ai_external_enabled and external_ai_allowed

        chain = self.DEFAULT_CHAINS.get(req.operation, ["groq", "gemini", "ollama"])
        attempts: list[dict[str, Any]] = []
        fallback_from: str | None = None

        for provider_name in chain:
            # Check external gating
            is_external = provider_name in ("groq", "gemini", "nvidia")
            if is_external and not allow_external and provider_name not in self.custom_adapters:
                continue

            # Circuit breaker check
            if not circuit_breaker.is_available(provider_name):
                attempts.append({"provider": provider_name, "status": "circuit_open"})
                continue

            adapter, model_name = await self._resolve_adapter(provider_name, user_id)
            if not adapter or not model_name:
                attempts.append({"provider": provider_name, "status": "not_configured"})
                continue

            # Execute provider call
            t0 = datetime.now(UTC)
            try:
                raw = await adapter.chat(req, model_name)
                circuit_breaker.record_success(provider_name)

                # Validate structured response if schema specified
                parsed_data = None
                if req.response_schema is not None:
                    try:
                        clean_content = raw.content.strip()
                        # Extract JSON if enclosed in markdown code fences
                        if clean_content.startswith("```"):
                            clean_content = clean_content.split("```")[1]
                            if clean_content.startswith("json"):
                                clean_content = clean_content[4:]
                            clean_content = clean_content.strip()

                        parsed_dict = json.loads(clean_content)
                        parsed_data = req.response_schema.model_validate(parsed_dict)
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
                            repair_content = repair_raw.content.strip()
                            if repair_content.startswith("```"):
                                repair_content = repair_content.split("```")[1]
                                if repair_content.startswith("json"):
                                    repair_content = repair_content[4:]
                                repair_content = repair_content.strip()
                            parsed_dict = json.loads(repair_content)
                            parsed_data = req.response_schema.model_validate(parsed_dict)
                            raw = repair_raw
                        except Exception:
                            # Repair failed, fail over to next provider
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
                            fallback_from = provider_name
                            continue

                # Log successful usage
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

                return GatewayResult(
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
                circuit_breaker.record_failure(provider_name, is_rate_limit=is_rate_limit)
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
                attempts.append(
                    {"provider": provider_name, "status": status_str, "code": status_code}
                )
                fallback_from = provider_name
                continue

            except Exception as ex:
                circuit_breaker.record_failure(provider_name)
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
                fallback_from = provider_name
                continue

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
