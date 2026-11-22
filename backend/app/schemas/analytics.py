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


class TaskActivityItem(BaseModel):
    task_id: uuid.UUID
    title: str
    status: str
    period_actual_min: int
    actual_min: int
    estimate_min: int | None
    deadline_at: datetime | None
    completed_at: datetime | None
    task_score: int | None
    score_basis: list[str]


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


# --- Time report: where the user's recorded work time goes (FR-DASH-010, ADR-032) ---


class TimeReportTask(BaseModel):
    task_id: str
    title: str
    status: str
    category: str | None = None
    minutes: int  # recorded active minutes inside the selected period
    sessions: int  # work sessions inside the selected period
    total_minutes: int  # all recorded minutes on this task, any date
    planned_minutes: int | None = None  # the task's estimate, when one exists
    difference_minutes: int | None = None  # total_minutes - planned_minutes


class TimeReportDay(BaseModel):
    date: date
    minutes: int
    tasks_completed: int
    tasks_worked: int
    average_minutes_per_task: int | None = None


class TimeReportWeek(BaseModel):
    week_start: date
    minutes: int
    tasks_completed: int


class TimeReportCategory(BaseModel):
    category: str
    completed_tasks: int
    average_minutes: int


class TimeReportResponse(BaseModel):
    period: PeriodType
    start_date: date
    end_date: date  # inclusive
    timezone: str
    total_minutes: int
    today_minutes: int
    this_week_minutes: int
    days_counted: int  # days of the period up to today, used for the daily average
    daily_average_minutes: int
    tasks_completed: int
    average_completion_minutes: int | None = None  # over completed tasks with recorded time
    completed_with_time: int
    tasks: list[TimeReportTask]
    days: list[TimeReportDay]
    weeks: list[TimeReportWeek]
    categories: list[TimeReportCategory]
