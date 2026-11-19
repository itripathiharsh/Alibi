"""Pydantic schemas for Knowledge Vault and Grounded Assistant (doc 04, doc 08)."""

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class NoteCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    occurred_on: date = Field(default_factory=date.today)
    source_type: str = Field(default="manual")
    category_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    privacy_class: str = Field(default="personal")


class NoteTaskConversionRequest(BaseModel):
    task_id: uuid.UUID | None = None
    task_text: str = Field(..., min_length=1, max_length=300)


class NoteTaskConversionResponse(BaseModel):
    note_id: uuid.UUID
    task_id: uuid.UUID
    task_title: str


class NoteResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source_type: str
    source_id: uuid.UUID | None
    title: str
    body: str
    occurred_on: date
    category_id: uuid.UUID | None
    project_id: uuid.UUID | None
    task_id: uuid.UUID | None
    privacy_class: str
    embed_status: str
    created_at: datetime
    updated_at: datetime


class VaultSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    mode: Literal["hybrid", "keyword", "semantic"] = "hybrid"
    start_date: date | None = None
    end_date: date | None = None
    category_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    source_type: str | None = None
    privacy_class: str | None = None
    limit: int = Field(default=12, ge=1, le=50)


class VaultSearchResultResponse(BaseModel):
    note_id: uuid.UUID
    title: str
    snippet: str
    source_type: str
    occurred_on: date
    privacy_class: str
    score: float


class ChatAskRequest(BaseModel):
    message: str = Field(..., min_length=1)
    thread_id: uuid.UUID | None = None


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    role: str
    content: str
    sources: list[dict[str, Any]] = Field(default_factory=list)
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    provider: str | None = None
    model: str | None = None
    created_at: datetime


class ChatThreadResponse(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime
