"""Pydantic schemas for Reports and Sharing (doc 04, doc 10 §5–6)."""

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class ReportCreateRequest(BaseModel):
    report_type: str = Field(default="eod")
    period_start: date = Field(default_factory=date.today)
    period_end: date = Field(default_factory=date.today)
    scope: list[str] = Field(default_factory=lambda: ["personal", "work", "shared"])


class ReportResponse(BaseModel):
    id: uuid.UUID
    report_type: str
    period_start: date
    period_end: date
    scope: list[str]
    facts: dict[str, Any]
    facts_hash: str
    status: str
    generated_at: datetime


class ReportShareCreateRequest(BaseModel):
    recipient_label: str = Field(..., min_length=1, max_length=255)
    scope: list[str] = Field(default_factory=lambda: ["work", "shared"])
    expires_in_days: int = Field(default=7, ge=1, le=90)
    allow_download: bool = Field(default=True)


class ReportShareCreateResponse(BaseModel):
    id: uuid.UUID
    report_id: uuid.UUID
    recipient_label: str
    scope: list[str]
    token_prefix: str
    share_token: str  # Shown only once at creation
    expires_at: datetime
    created_at: datetime


class ReportShareResponse(BaseModel):
    id: uuid.UUID
    report_id: uuid.UUID
    recipient_label: str
    scope: list[str]
    token_prefix: str
    allow_download: bool
    expires_at: datetime
    revoked_at: datetime | None
    created_at: datetime
    last_accessed_at: datetime | None
    access_count: int
