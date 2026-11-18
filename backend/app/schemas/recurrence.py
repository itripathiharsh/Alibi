"""Schemas for user-approved recurring task rules."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class RecurrenceCreateRequest(BaseModel):
    task_id: uuid.UUID
    frequency: Literal["daily", "weekly", "monthly"]
    interval: int = Field(default=1, ge=1, le=52)
    starts_at: datetime
    until_at: datetime | None = None

    @field_validator("starts_at", "until_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Recurrence dates must include a timezone.")
        return value

    @model_validator(mode="after")
    def until_after_start(self) -> "RecurrenceCreateRequest":
        if self.until_at is not None and self.until_at <= self.starts_at:
            raise ValueError("The recurrence end must be after its start.")
        return self


class RecurrenceResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID | None
    title: str
    frequency: str
    interval: int
    starts_at: datetime
    until_at: datetime | None
    active: bool
    generated_until: date | None
