"""Schemas for notifications and calendar conflicts (doc 04, doc 01 §2.3/§2.12)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class NotificationCreateRequest(BaseModel):
    kind: str = Field(default="task_reminder")
    fire_at: datetime
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    task_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    suppress_in_quiet_hours: bool = Field(default=True)


class NotificationResponse(BaseModel):
    id: uuid.UUID
    kind: str
    task_id: uuid.UUID | None
    event_id: uuid.UUID | None
    fire_at: datetime
    title: str
    body: str
    status: str
    delivered_at: datetime | None
    created_at: datetime


class ConflictDetectRequest(BaseModel):
    start_at: datetime
    end_at: datetime
    max_daily_minutes: int = Field(default=480, ge=60, le=1440)


class ConflictResponse(BaseModel):
    conflict_type: str
    severity: str
    description: str
    event_ids: list[uuid.UUID]
    task_id: uuid.UUID | None = None
    conflict_date: date | None = None
