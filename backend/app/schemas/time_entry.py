"""Pydantic schemas for Time Tracking."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TimerStartRequest(BaseModel):
    task_id: uuid.UUID
    started_at: datetime | None = None
    id: uuid.UUID | None = None


class TimerStopRequest(BaseModel):
    ended_at: datetime | None = None


class TimeEntryManualCreateRequest(BaseModel):
    task_id: uuid.UUID
    started_at: datetime
    duration_min: int = Field(..., ge=1, le=1440)
    ended_at: datetime | None = None
    note: str | None = None
    source: str = Field("manual", pattern="^(manual|pomodoro|timer)$")
    id: uuid.UUID | None = None


class TimeEntryResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    task_id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None = None
    duration_min: int | None = None
    source: str
    note: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
