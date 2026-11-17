"""Task domain model (doc 03 §3.3)."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.uuid import generate_uuid7
from app.database.base import Base, SyncableMixin


class Task(Base, SyncableMixin):
    """Core Task entity with lifecycle, priority, estimates, and recurrence tracking."""

    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'cancelled')",
            name="chk_task_status",
        ),
        CheckConstraint(
            "priority IS NULL OR (priority >= 1 AND priority <= 4)",
            name="chk_task_priority",
        ),
        CheckConstraint(
            "deadline_kind IS NULL OR deadline_kind IN ('hard', 'soft')",
            name="chk_task_deadline_kind",
        ),
        CheckConstraint(
            "deadline_source IS NULL OR deadline_source IN ('user', 'extraction', 'recurrence')",
            name="chk_task_deadline_source",
        ),
        CheckConstraint(
            "origin IN ('manual', 'voice', 'ai_recommendation', 'meeting', 'external_assignment', 'recurring')",
            name="chk_task_origin",
        ),
        CheckConstraint(
            "parse_status IN ('none', 'pending', 'proposed', 'accepted', 'failed')",
            name="chk_task_parse_status",
        ),
        CheckConstraint(
            "estimate_user_min IS NULL OR (estimate_user_min > 0 AND estimate_user_min <= 10080)",
            name="chk_task_estimate_user",
        ),
        CheckConstraint(
            "estimate_ai_min IS NULL OR (estimate_ai_min > 0 AND estimate_ai_min <= 10080)",
            name="chk_task_estimate_ai",
        ),
        CheckConstraint(
            "estimate_final_min IS NULL OR (estimate_final_min > 0 AND estimate_final_min <= 10080)",
            name="chk_task_estimate_final",
        ),
        CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL) OR (status != 'completed')",
            name="chk_task_completed_at",
        ),
        Index("ix_tasks_user_status_deadline", "user_id", "status", "deadline_at"),
        Index("ix_tasks_user_completed_at", "user_id", "completed_at"),
        Index(
            "uq_tasks_recurrence_instance",
            "recurrence_rule_id",
            "recurrence_instance_date",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND recurrence_rule_id IS NOT NULL"),
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
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    raw_input: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )
    priority: Mapped[int | None] = mapped_column(
        SmallInteger,
        nullable=True,
    )
    deadline_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    deadline_kind: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )
    deadline_source: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    estimate_user_min: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    estimate_ai_min: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    estimate_final_min: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    actual_min: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    origin: Mapped[str] = mapped_column(
        String(30),
        default="manual",
        nullable=False,
    )
    origin_ref: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    recurrence_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recurrence_rules.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recurrence_instance_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )
    reschedule_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    parse_status: Mapped[str] = mapped_column(
        String(20),
        default="none",
        nullable=False,
    )
    completion_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    @property
    def estimate_min(self) -> int | None:
        """Alias property for estimate_final_min."""
        return self.estimate_final_min

    @estimate_min.setter
    def estimate_min(self, value: int | None) -> None:
        self.estimate_final_min = value
