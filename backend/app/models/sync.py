"""Sync Operations and Conflicts domain models (doc 03 §3.10, doc 11)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.database.base import Base


class SyncOperation(Base):
    """Client-generated offline operations applied or queued on server (doc 03 §3.10, doc 11 §4.1)."""

    __tablename__ = "sync_operations"
    __table_args__ = (
        CheckConstraint(
            "op_type IN ('create','update','delete','command')",
            name="ck_sync_operations_type",
        ),
        CheckConstraint(
            "result IN ('applied','merged','conflict','rejected','duplicate')",
            name="ck_sync_operations_result",
        ),
        Index("ix_sync_operations_user_entity", "user_id", "entity_type", "entity_id"),
        Index("ix_sync_operations_received", "user_id", "received_at"),
    )

    op_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
    )
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    op_type: Mapped[str] = mapped_column(String(16), nullable=False)
    base_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    client_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    result: Mapped[str] = mapped_column(String(16), nullable=False)
    result_detail: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    new_version: Mapped[int | None] = mapped_column(Integer, nullable=True)


class SyncConflict(Base):
    """Explicit unresolved or resolved sync conflicts (doc 03 §3.10, doc 11 §6)."""

    __tablename__ = "sync_conflicts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open','resolved_local','resolved_server','resolved_custom')",
            name="ck_sync_conflicts_status",
        ),
        Index("ix_sync_conflicts_user_status", "user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    field: Mapped[str] = mapped_column(String(64), nullable=False)
    local_value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    server_value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    op_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
