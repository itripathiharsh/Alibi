"""Workday guidance and review API payloads (FR-PROD-001, FR-PROD-002)."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class KickoffSuggestion(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    priority: int | None
    deadline_at: datetime | None
    reasons: list[str]


class DailyKickoffResponse(BaseModel):
    local_date: date
    suggestions: list[KickoffSuggestion]


class EndOfDayTask(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    deadline_at: datetime | None
    reschedule_count: int


class EndOfDayReviewResponse(BaseModel):
    local_date: date
    completed_count: int
    unfinished: list[EndOfDayTask]


class EndOfDayActionRequest(BaseModel):
    action: Literal["tomorrow", "backlog", "cancel"]


class EndOfDayActionResponse(BaseModel):
    task_id: uuid.UUID
    action: Literal["tomorrow", "backlog", "cancel"]
    status: str
    deadline_at: datetime | None
    reschedule_count: int
