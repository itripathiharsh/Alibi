"""Schemas for Scheduling and Calendar API endpoints (doc 09)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ProposalGenerateRequest(BaseModel):
    scope: str = Field(default="day", pattern="^(task|day|horizon)$")
    horizon_days: int = Field(default=1, ge=1, le=14)


class ProposalDecisionRequest(BaseModel):
    action: str = Field(pattern="^(accept|partially_accept|reject)$")
    accepted_indices: list[int] | None = None


class CalendarEventCreate(BaseModel):
    title: str
    kind: str = Field(
        default="fixed_event", pattern="^(fixed_event|work_block|deadline_marker|actual_time)$"
    )
    start_at: datetime
    end_at: datetime
    is_all_day: bool = False
    task_id: uuid.UUID | None = None


class CalendarEventRead(BaseModel):
    id: uuid.UUID
    title: str
    kind: str
    source: str
    start_at: datetime
    end_at: datetime
    is_all_day: bool
    task_id: uuid.UUID | None = None


class ScheduleRecommendationRead(BaseModel):
    id: uuid.UUID
    scope: str
    horizon_start: datetime
    horizon_end: datetime
    status: str
    proposals: list[dict[str, Any]]
    displacements: list[dict[str, Any]]
    unscheduled: list[dict[str, Any]]
    solver_status: str
    solve_ms: int
    input_hash: str
    explanation_text: str | None = None
