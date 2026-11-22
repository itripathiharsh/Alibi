"""Brain dump API schemas (FR-TASK-022, ADR-028)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class BrainDumpRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


class BrainDumpItemResponse(BaseModel):
    title: str
    source_text: str
    deadline_at: datetime | None = None
    deadline_phrase: str | None = None
    deadline_kind: Literal["hard", "soft"] | None = None
    bucket: Literal["today", "this_week", "later", "anytime"]
    priority: int | None = None
    estimate_minutes: int | None = None
    category: Literal["personal", "professional", "academic", "learning"] | None = None
    # A planner-suggested slot for tasks said without a time; the user can drop it.
    suggested_at: datetime | None = None
    time_source: Literal["said", "suggested"] | None = None


class BrainDumpResponse(BaseModel):
    items: list[BrainDumpItemResponse]
    mode: Literal["ai", "rules"]
    ai_status: Literal["used", "not_opted_in", "server_disabled", "unavailable"]
    provider: str | None = None
