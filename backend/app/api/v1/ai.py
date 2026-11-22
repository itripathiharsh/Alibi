"""AI Provider Settings and Usage API endpoints (doc 06 §3, §9)."""

from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.adapters.gemini import GeminiProviderAdapter
from app.ai.adapters.groq import GroqProviderAdapter
from app.ai.adapters.nvidia import NvidiaProviderAdapter
from app.ai.adapters.ollama import OllamaProviderAdapter
from app.ai.adapters.openrouter import OpenRouterProviderAdapter
from app.ai.gateway import CLOUD_AI_OPT_IN_KEY, server_provider_key, user_cloud_ai_opt_in
from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.config import settings
from app.core.crypto import decrypt_api_key, encrypt_api_key
from app.core.time import utc_now
from app.models.ai_provider import AIProviderSetting, AIUsageLog
from app.schemas.ai import (
    AIGlobalConfigRead,
    AIGlobalConfigUpdate,
    AIProviderSettingRead,
    AIProviderSettingUpdate,
    AITestConnectionResponse,
    AIUsageSummaryItem,
    AIUsageSummaryResponse,
)

router = APIRouter(prefix="/ai", tags=["AI"])

SUPPORTED_PROVIDERS = ["groq", "gemini", "nvidia", "openrouter", "ollama"]


def _config_read(user_settings: dict[str, Any] | None) -> AIGlobalConfigRead:
    keys_available = settings.ai_external_enabled and any(
        server_provider_key(p) for p in ("gemini", "groq", "openrouter")
    )
    return AIGlobalConfigRead(
        ai_external_enabled=user_cloud_ai_opt_in(user_settings),
        server_external_enabled=settings.ai_external_enabled,
        server_keys_available=bool(keys_available),
    )


@router.get("/config", response_model=AIGlobalConfigRead)
async def get_ai_config(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
) -> AIGlobalConfigRead:
    """Get this user's cloud-AI consent and whether the server allows cloud AI (ADR-028)."""
    return _config_read(auth.user.settings)


@router.put("/config", response_model=AIGlobalConfigRead)
async def update_ai_config(
    body: AIGlobalConfigUpdate,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AIGlobalConfigRead:
    """Turn cloud AI on or off for the signed-in user only (ADR-028).

    The server-wide AI_EXTERNAL_ENABLED switch is deployment configuration. It used to be
    writable here, which let any signed-in user change it for every account.
    """
    merged = dict(auth.user.settings or {})
    merged[CLOUD_AI_OPT_IN_KEY] = body.ai_external_enabled
    auth.user.settings = merged
    auth.user.updated_at = utc_now()
    await db.commit()
    return _config_read(merged)


@router.get("/providers", response_model=list[AIProviderSettingRead])
async def list_providers(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AIProviderSettingRead]:
    """List configured AI providers for the user with masked keys (key_last4)."""
    stmt = select(AIProviderSetting).where(AIProviderSetting.user_id == auth.user.id)
    res = await db.execute(stmt)
    records = res.scalars().all()
    records_by_provider = {r.provider: r for r in records}

    results: list[AIProviderSettingRead] = []
    for p in SUPPORTED_PROVIDERS:
        if p in records_by_provider:
            r = records_by_provider[p]
            results.append(
                AIProviderSettingRead(
                    provider=r.provider,
                    enabled=r.enabled,
                    key_last4=r.key_last4,
                    base_url=r.base_url,
                    models=r.models,
                    fallback_rank=r.fallback_rank,
                    last_test_at=r.last_test_at,
                    last_test_status=r.last_test_status,
                )
            )
        else:
            results.append(
                AIProviderSettingRead(
                    provider=p,
                    enabled=False,
                    key_last4=None,
                    base_url=None,
                    models={},
                    fallback_rank=0,
                    last_test_at=None,
                    last_test_status=None,
                )
            )
    return results


@router.put("/providers/{provider}", response_model=AIProviderSettingRead)
async def update_provider(
    provider: str,
    body: AIProviderSettingUpdate,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AIProviderSettingRead:
    """Update AI provider settings. API keys are strictly write-only and encrypted at rest."""
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider '{provider}'. Must be one of {SUPPORTED_PROVIDERS}",
        )

    stmt = select(AIProviderSetting).where(
        AIProviderSetting.user_id == auth.user.id,
        AIProviderSetting.provider == provider,
    )
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()

    if setting is None:
        setting = AIProviderSetting(
            user_id=auth.user.id,
            provider=provider,
            enabled=False,
            models={},
            fallback_rank=0,
        )
        db.add(setting)

    if body.enabled is not None:
        setting.enabled = body.enabled
    if body.base_url is not None:
        setting.base_url = body.base_url
    if body.models is not None:
        setting.models = body.models
    if body.fallback_rank is not None:
        setting.fallback_rank = body.fallback_rank

    if body.api_key is not None:
        if body.api_key.strip():
            encrypted_blob, last4 = encrypt_api_key(body.api_key)
            setting.api_key_encrypted = encrypted_blob
            setting.key_last4 = last4
        else:
            setting.api_key_encrypted = None
            setting.key_last4 = None

    setting.updated_at = utc_now()
    await db.commit()
    await db.refresh(setting)

    return AIProviderSettingRead(
        provider=setting.provider,
        enabled=setting.enabled,
        key_last4=setting.key_last4,
        base_url=setting.base_url,
        models=setting.models,
        fallback_rank=setting.fallback_rank,
        last_test_at=setting.last_test_at,
        last_test_status=setting.last_test_status,
    )


@router.delete("/providers/{provider}/key", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider_key(
    provider: str,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete the encrypted API key for a provider."""
    stmt = select(AIProviderSetting).where(
        AIProviderSetting.user_id == auth.user.id,
        AIProviderSetting.provider == provider,
    )
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()
    if setting:
        setting.api_key_encrypted = None
        setting.key_last4 = None
        setting.updated_at = utc_now()
        await db.commit()


@router.post("/providers/{provider}/test", response_model=AITestConnectionResponse)
async def test_provider_connection(
    provider: str,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AITestConnectionResponse:
    """Test connectivity and credential validity for a provider."""
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider '{provider}'",
        )

    stmt = select(AIProviderSetting).where(
        AIProviderSetting.user_id == auth.user.id,
        AIProviderSetting.provider == provider,
    )
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()

    api_key: str | None = None
    base_url: str | None = None
    if setting and setting.api_key_encrypted:
        try:
            api_key = decrypt_api_key(setting.api_key_encrypted)
        except Exception as e:
            return AITestConnectionResponse(
                provider=provider, status="error", error=f"Key decryption failed: {e}"
            )
    if setting:
        base_url = setting.base_url

    # Instantiate adapter
    adapter: Any
    if provider == "groq":
        adapter = GroqProviderAdapter(api_key=api_key, base_url=base_url)
    elif provider == "gemini":
        adapter = GeminiProviderAdapter(api_key=api_key, base_url=base_url)
    elif provider == "nvidia":
        adapter = NvidiaProviderAdapter(api_key=api_key, base_url=base_url)
    elif provider == "openrouter":
        adapter = OpenRouterProviderAdapter(api_key=api_key, base_url=base_url)
    elif provider == "ollama":
        adapter = OllamaProviderAdapter(base_url=base_url)
    else:
        return AITestConnectionResponse(provider=provider, status="error", error="Unknown adapter")

    health_res = await adapter.health()
    status_str = health_res.get("status", "error")
    error_msg = health_res.get("error")

    # Update last test status in DB if record exists
    if setting:
        setting.last_test_at = utc_now()
        setting.last_test_status = status_str
        setting.updated_at = utc_now()
        await db.commit()

    return AITestConnectionResponse(
        provider=provider,
        status=status_str,
        error=error_msg,
    )


@router.get("/usage", response_model=AIUsageSummaryResponse)
async def get_ai_usage_summary(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AIUsageSummaryResponse:
    """Get aggregated usage metrics and estimated cost per provider/model."""
    stmt = (
        select(
            AIUsageLog.provider,
            AIUsageLog.model,
            AIUsageLog.operation,
            func.count(AIUsageLog.id).label("total_calls"),
            func.sum(AIUsageLog.input_tokens).label("input_tokens"),
            func.sum(AIUsageLog.output_tokens).label("output_tokens"),
            func.avg(AIUsageLog.latency_ms).label("avg_latency_ms"),
            func.count(AIUsageLog.id).filter(AIUsageLog.status != "ok").label("error_count"),
            func.sum(AIUsageLog.estimated_cost_usd).label("estimated_cost_usd"),
        )
        .where(AIUsageLog.user_id == auth.user.id)
        .group_by(AIUsageLog.provider, AIUsageLog.model, AIUsageLog.operation)
    )
    res = await db.execute(stmt)
    rows = res.all()

    items: list[AIUsageSummaryItem] = []
    total_calls = 0
    total_cost = Decimal("0.0")

    for r in rows:
        calls = int(r.total_calls or 0)
        cost = Decimal(str(r.estimated_cost_usd or 0))
        total_calls += calls
        total_cost += cost
        items.append(
            AIUsageSummaryItem(
                provider=r.provider,
                model=r.model,
                operation=r.operation,
                total_calls=calls,
                input_tokens=int(r.input_tokens or 0),
                output_tokens=int(r.output_tokens or 0),
                avg_latency_ms=int(r.avg_latency_ms or 0),
                error_count=int(r.error_count or 0),
                estimated_cost_usd=cost,
            )
        )

    return AIUsageSummaryResponse(
        items=items,
        total_calls=total_calls,
        total_cost_usd=total_cost,
    )
