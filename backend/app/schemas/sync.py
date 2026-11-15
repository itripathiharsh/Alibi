"""Pydantic schemas for Offline and Sync (doc 04, doc 11)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SyncOpSchema(BaseModel):
    op_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    op_type: str
    base_version: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    client_ts: datetime = Field(default_factory=datetime.now)


class SyncPushRequest(BaseModel):
    operations: list[SyncOpSchema]
    device_id: uuid.UUID | None = None


class SyncPushResponse(BaseModel):
    results: list[dict[str, Any]]


class SyncPullResponse(BaseModel):
    server_epoch: str
    since_seq: int
    next_seq: int
    changes: list[dict[str, Any]]


class SyncBootstrapResponse(BaseModel):
    server_epoch: str
    tasks: list[dict[str, Any]]
    categories: list[dict[str, Any]]
    projects: list[dict[str, Any]]
    tags: list[dict[str, Any]]


class SyncConflictResponse(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    field: str
    local_value: Any
    server_value: Any
    op_id: uuid.UUID
    status: str
    created_at: datetime


class SyncConflictResolveRequest(BaseModel):
    resolution: str = Field(..., pattern="^(resolved_local|resolved_server)$")
