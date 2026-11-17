"""TimeEntry domain model (doc 03 §3.3)."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.uuid import generate_uuid7
from app.database.base import Base, SyncableMixin


class TimeEntry(Base, SyncableMixin):
    """Timer record or manual time log tied to a Task."""

    __tablename__ = "time_entries"
    __table_args__ = (
        CheckConstraint(
            "source IN ('timer', 'manual', 'pomodoro')",
            name="chk_time_entry_source",
        ),
        CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="chk_time_entry_bounds",
        ),
        CheckConstraint(
            "duration_min IS NULL OR (duration_min >= 1 AND duration_min <= 1440)",
            name="chk_time_entry_duration",
        ),
        # Multiple tasks may run concurrently, but one task cannot acquire duplicate timers.
        Index(
            "uq_time_entries_running_task",
            "user_id",
            "task_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL AND deleted_at IS NULL"),
        ),
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
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    duration_min: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    source: Mapped[str] = mapped_column(
        String(20),
        default="timer",
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
