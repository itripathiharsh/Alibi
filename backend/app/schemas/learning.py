"""Schemas for Personal Learning Engine endpoints (doc 07)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


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
