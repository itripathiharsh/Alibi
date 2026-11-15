"""Schemas for AI Provider Settings and Telemetry."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class AIProviderSettingRead(BaseModel):
    provider: str
    enabled: bool
    key_last4: str | None = None
    base_url: str | None = None
    models: dict[str, Any] = Field(default_factory=dict)
    fallback_rank: int = 0
    last_test_at: datetime | None = None
    last_test_status: str | None = None


class AIProviderSettingUpdate(BaseModel):
    enabled: bool | None = None
    api_key: str | None = Field(
        default=None, description="Write-only plaintext API key, encrypted before storage"
    )
    base_url: str | None = None
    models: dict[str, Any] | None = None
    fallback_rank: int | None = None


class AITestConnectionResponse(BaseModel):
    provider: str
    status: str  # "ok" | "error"
    error: str | None = None


class AIUsageSummaryItem(BaseModel):
    provider: str
    model: str
    operation: str
    total_calls: int
    input_tokens: int
    output_tokens: int
    avg_latency_ms: int
    error_count: int
    estimated_cost_usd: Decimal


class AIUsageSummaryResponse(BaseModel):
    items: list[AIUsageSummaryItem]
    total_calls: int
    total_cost_usd: Decimal


class AIGlobalConfigRead(BaseModel):
    ai_external_enabled: bool


class AIGlobalConfigUpdate(BaseModel):
    ai_external_enabled: bool
