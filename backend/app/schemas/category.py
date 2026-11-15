"""Pydantic schemas for Categories."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SharingClass = Literal["professional", "personal", "academic", "learning"]


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    sharing_class: SharingClass
    external_ai_allowed: bool = False
    color: str = Field(default="#3B82F6", max_length=20)
    position: int = Field(default=0, ge=0)
    slug: str | None = Field(default=None, max_length=100)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sharing_class: SharingClass | None = None
    external_ai_allowed: bool | None = None
    color: str | None = Field(default=None, max_length=20)
    position: int | None = Field(default=None, ge=0)


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    is_system: bool
    sharing_class: str
    external_ai_allowed: bool
    color: str
    position: int
    version: int
    created_at: datetime
    updated_at: datetime
