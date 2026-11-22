"""Pydantic schemas for Tasks, capture, status machine, and subtasks."""

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SubtaskCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    id: uuid.UUID | None = None


class SubtaskUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    completed: bool | None = None


class SubtaskReorderRequest(BaseModel):
    subtask_ids: list[uuid.UUID]


class SubtaskResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    title: str
    completed: bool
    position: int
    completed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskCaptureRequest(BaseModel):
    raw_input: str = Field(..., min_length=1)
    origin: str = Field(
        "manual", pattern="^(manual|voice|ai_recommendation|meeting|external_assignment|recurring)$"
    )
    captured_at: datetime | None = None
    category_hint: uuid.UUID | None = None
    id: uuid.UUID | None = None
    status: str | None = Field(None, pattern="^(pending|in_progress|completed|cancelled)$")
    deadline_at: datetime | None = None

    @field_validator("id", mode="before")
    @classmethod
    def validate_id(cls, v: Any) -> uuid.UUID | None:
        if v is None or v == "" or str(v).strip().lower() in ("null", "undefined", "none", "----"):
            return None
        if isinstance(v, uuid.UUID):
            return v
        try:
            return uuid.UUID(str(v).strip())
        except (ValueError, AttributeError, TypeError):
            return None

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: Any) -> str | None:
        if not v or str(v).strip().lower() in ("null", "undefined", "none", ""):
            return "pending"
        v_str = str(v).strip().lower()
        if v_str in ("pending", "in_progress", "completed", "cancelled"):
            return v_str
        return "pending"

    @field_validator("origin", mode="before")
    @classmethod
    def validate_origin(cls, v: Any) -> str:
        valid_origins = (
            "manual",
            "voice",
            "ai_recommendation",
            "meeting",
            "external_assignment",
            "recurring",
        )
        if not v or str(v).strip().lower() not in valid_origins:
            return "manual"
        return str(v).strip().lower()

    @field_validator("deadline_at", mode="before")
    @classmethod
    def validate_deadline_at(cls, v: Any) -> datetime | None:
        if v is None or v == "" or str(v).strip().lower() in ("null", "undefined", "none"):
            return None
        if isinstance(v, datetime):
            return v
        try:
            clean_str = str(v).strip().replace("Z", "+00:00")
            return datetime.fromisoformat(clean_str)
        except (ValueError, TypeError, AttributeError):
            return None

    @field_validator("raw_input", mode="before")
    @classmethod
    def validate_raw_input(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        return s or "Untitled Task"


class TaskExtractionProposalResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    input_text: str
    rules_result: dict[str, Any]
    final_proposal: dict[str, Any]
    status: str
    created_at: datetime
    decided_at: datetime | None = None
    user_decision: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class TaskCaptureResponse(BaseModel):
    task: "TaskResponse"
    extraction: TaskExtractionProposalResponse | None = None
    extraction_status: str


class TaskCreateRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str | None = None
    category_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    priority: int | None = Field(None, ge=1, le=4)
    deadline_at: datetime | None = None
    deadline_kind: str | None = Field(None, pattern="^(hard|soft)$")
    estimate_user_min: int | None = Field(None, ge=1, le=10080)
    origin: str = Field(
        "manual", pattern="^(manual|voice|ai_recommendation|meeting|external_assignment|recurring)$"
    )
    origin_ref: str | None = None
    tags: list[str] = Field(default_factory=list)
    subtasks: list[str] = Field(default_factory=list)
    id: uuid.UUID | None = None

    @field_validator("id", mode="before")
    @classmethod
    def validate_id(cls, v: Any) -> uuid.UUID | None:
        if v is None or v == "" or str(v).strip().lower() in ("null", "undefined", "none", "----"):
            return None
        if isinstance(v, uuid.UUID):
            return v
        try:
            return uuid.UUID(str(v).strip())
        except (ValueError, AttributeError, TypeError):
            return None

    @field_validator("deadline_at", mode="before")
    @classmethod
    def validate_deadline_at(cls, v: Any) -> datetime | None:
        if v is None or v == "" or str(v).strip().lower() in ("null", "undefined", "none"):
            return None
        if isinstance(v, datetime):
            return v
        try:
            clean_str = str(v).strip().replace("Z", "+00:00")
            return datetime.fromisoformat(clean_str)
        except (ValueError, TypeError, AttributeError):
            return None


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1)
    description: str | None = None
    category_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    priority: int | None = Field(None, ge=1, le=4)
    deadline_at: datetime | None = None
    deadline_kind: str | None = Field(None, pattern="^(hard|soft)$")
    estimate_user_min: int | None = Field(None, ge=1, le=10080)
    tags: list[str] | None = None


class TaskStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(pending|in_progress|completed|cancelled)$")
    at: datetime | None = None
    completion_note: str | None = None
    evidence_ids: list[uuid.UUID] = Field(default_factory=list)


class TaskRescheduleRequest(BaseModel):
    new_deadline_at: datetime | None = None
    reason: str | None = None


class TaskHistoryEventResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    event_type: str
    changes: dict[str, Any]
    reason: str | None = None
    actor: str
    occurred_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskExtractionDecisionRequest(BaseModel):
    accepted_fields: dict[str, Any] = Field(default_factory=dict)
    corrected_fields: dict[str, Any] = Field(default_factory=dict)
    rejected_fields: list[str] = Field(default_factory=list)


class TaskNoteSummary(BaseModel):
    id: uuid.UUID
    title: str
    source_type: str
    occurred_on: date


class TaskResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    workspace_id: uuid.UUID
    category_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    raw_input: str | None = None
    status: str
    priority: int | None = None
    deadline_at: datetime | None = None
    original_deadline_at: datetime | None = None
    deadline_kind: str | None = None
    deadline_source: str | None = None
    estimate_user_min: int | None = None
    estimate_ai_min: int | None = None
    estimate_final_min: int | None = None
    actual_min: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    origin: str
    origin_ref: str | None = None
    recurrence_rule_id: uuid.UUID | None = None
    recurrence_instance_date: date | None = None
    reschedule_count: int
    parse_status: str
    completion_note: str | None = None
    tags: list[str] = Field(default_factory=list)
    subtasks: list[SubtaskResponse] = Field(default_factory=list)
    linked_notes: list[TaskNoteSummary] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
