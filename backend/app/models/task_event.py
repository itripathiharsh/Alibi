"""TaskEvent domain model (doc 03 §3.3).
Immutable, append-only audit event log for every task mutation.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.database.base import Base


class TaskEvent(Base):
    """Immutable audit entry recording a specific state change or field mutation on a Task."""

    __tablename__ = "task_events"
    __table_args__ = (
        CheckConstraint(
            "actor IN ('user', 'ai', 'system', 'sync')",
            name="chk_task_event_actor",
        ),
        Index("ix_task_events_task_occurred", "task_id", "occurred_at"),
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
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    changes: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    actor: Mapped[str] = mapped_column(
        String(20),
        default="user",
        nullable=False,
    )
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
