"""Pydantic schemas for Project management."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: str | None = None
    category_id: uuid.UUID | None = None
    workspace_id: uuid.UUID | None = None
    color: str = Field("#3B82F6", max_length=20)


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=150)
    description: str | None = None
    category_id: uuid.UUID | None = None
    color: str | None = Field(None, max_length=20)
    status: str | None = Field(None, pattern="^(active|paused|done|archived)$")


class ProjectResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    workspace_id: uuid.UUID
    category_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    status: str
    color: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
