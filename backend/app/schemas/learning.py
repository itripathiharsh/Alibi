"""Schemas for Personal Learning Engine endpoints (doc 07)."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, StringConstraints


class MemoryProfileResponse(BaseModel):
    version: int
    compiled_at: str
    maturity: dict[str, Any]
    routines: list[dict[str, Any]]
    preferences: list[dict[str, Any]]


class DurationPredictionRequest(BaseModel):
    category_id: str | None = None
    user_estimate_min: int | None = None
    title: str = ""


class DurationPredictionResponse(BaseModel):
    p50_min: int
    p10_min: int | None = None
    p90_min: int | None = None
    confidence: float
    maturity_level: int
    correction_factor: float | None = None
    explanation: str | None = None


class LearnedPatternResponse(BaseModel):
    id: str
    pattern_type: str
    key: str
    value: dict[str, Any]
    sample_count: int
    confidence: float
    status: str
    first_observed_at: datetime
    last_observed_at: datetime


class ResetLearningResponse(BaseModel):
    status: str
    message: str


# --- Accountability signals and recommendations (FR-LEARN-012/011, ADR-028) ---

SIGNAL_TYPES = (
    "checkin_done",
    "checkin_snoozed",
    "checkin_moved",
    "checkin_opened",
    "brain_dump_review",
    "recommendation_dismissed",
    "recommendation_accepted",
)
SignalType = Literal[
    "checkin_done",
    "checkin_snoozed",
    "checkin_moved",
    "checkin_opened",
    "brain_dump_review",
    "recommendation_dismissed",
    "recommendation_accepted",
]
SignalValue = int | float | bool | None | Annotated[str, StringConstraints(max_length=60)]


class LearningSignalIn(BaseModel):
    """One behaviour signal from the device. Carries counts and ids, never task text."""

    type: SignalType
    occurred_at: datetime
    task_id: uuid.UUID | None = None
    data: dict[Annotated[str, StringConstraints(max_length=40)], SignalValue] = Field(
        default_factory=dict, max_length=12
    )


class LearningSignalBatch(BaseModel):
    signals: list[LearningSignalIn] = Field(..., min_length=1, max_length=100)


class LearningSignalBatchResponse(BaseModel):
    accepted: int


class RecommendationItem(BaseModel):
    id: str
    kind: Literal[
        "best_time", "stuck_task", "underestimate", "overdue_pile", "too_many_moved", "routine"
    ]
    title: str
    body: str
    evidence: dict[str, int | float | str]
    task_id: str | None = None
    action: Literal["open_task", "review_today", "make_routine", "none"] = "none"


class RecommendationsResponse(BaseModel):
    status: Literal["learning", "ready"]
    days_observed: int
    days_needed: int
    items: list[RecommendationItem]
