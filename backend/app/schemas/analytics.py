"""ALIBI Analytics Pydantic v2 Schemas."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PeriodType = Literal["daily", "weekly", "monthly", "custom"]


class SummaryMetricsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    period: PeriodType
    start_at: datetime
    end_at: datetime
    timezone: str
    total_time_min: int = Field(description="Total minutes spent in period overlapping entries")
    tasks_completed: int = Field(description="Count of tasks completed in period")
    tasks_pending: int = Field(description="Count of open tasks as of period end")
    tasks_overdue: int = Field(description="Count of open tasks past deadline")
    completion_rate: float | None = Field(
        default=None, description="Completion rate or None if insufficient data"
    )
    on_time_rate: float | None = Field(
        default=None, description="On-time completion rate or None if insufficient data"
    )
    efficiency: float | None = Field(
        default=None, description="Estimate-to-actual ratio or None if insufficient data"
    )
    estimate_accuracy: float | None = Field(
        default=None, description="Share within +-25% or None if insufficient data"
    )


class ProductivityScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    score: int | None = Field(description="Productivity score 0-100 or None if insufficient data")
    formula_version: int = 1
    period: PeriodType
    completion_component: float | None = None
    on_time_component: float | None = None
    accuracy_component: float | None = None
    insufficient_data: bool = False
    message: str | None = None


class ScoreFormulaResponse(BaseModel):
    formula_version: int = 1
    description: str
    weights: dict[str, float]
    rules: list[str]
    components: dict[str, str]


class CompletionTrendPoint(BaseModel):
    date: date
    completed_count: int


class TimeDistributionItem(BaseModel):
    category_id: uuid.UUID | None = None
    category_name: str
    category_color: str
    total_min: int
    percentage: float


class ConsistencyHeatmapItem(BaseModel):
    date: date
    completed_count: int
    minutes_logged: int


class EstVsActualItem(BaseModel):
    task_id: uuid.UUID
    title: str
    category_name: str
    estimate_min: int
    actual_min: int
    ratio: float


class CategoryWorkloadItem(BaseModel):
    category_id: uuid.UUID | None = None
    category_name: str
    category_color: str
    completed_count: int
    open_count: int
    total_min: int
