"""Pydantic schemas for Evidence and deliverables."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EvidenceTextOrLinkRequest(BaseModel):
    kind: str = Field(..., pattern="^(link|text)$")
    title: str = Field(..., min_length=1, max_length=255)
    url: str | None = None
    text: str | None = None
    is_deliverable: bool = False


class EvidenceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    task_id: uuid.UUID
    kind: str
    title: str
    url: str | None = None
    text: str | None = None
    storage_key: str | None = None
    mime: str | None = None
    size_bytes: int | None = None
    sha256: str | None = None
    is_deliverable: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
