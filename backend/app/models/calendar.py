"""Calendar Events and Scheduling Recommendation models (doc 03 §3.4/§3.7, doc 09)."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.database.base import Base

if TYPE_CHECKING:
    from app.models.task import Task


class CalendarEvent(Base):
    """Calendar event or scheduled work block (doc 03 §3.4)."""

    __tablename__ = "calendar_events"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('fixed_event','work_block','deadline_marker','actual_time')",
            name="chk_calendar_event_kind",
        ),
        CheckConstraint(
            "source IN ('user','ai_proposed','ai_accepted','external_sync')",
            name="chk_calendar_event_source",
        ),
        CheckConstraint("end_at >= start_at", name="chk_calendar_event_dates"),
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
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    kind: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    source: Mapped[str] = mapped_column(
        String(20),
        default="user",
        nullable=False,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    start_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    end_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    is_all_day: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    rrule: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    exdates: Mapped[list[Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    recurrence_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    task: Mapped["Task | None"] = relationship("Task")


class ScheduleRecommendation(Base):
    """Generated plan proposal with solver status and audit trail (doc 09 §6)."""

    __tablename__ = "schedule_recommendations"
    __table_args__ = (
        CheckConstraint(
            "scope IN ('task','day','horizon')",
            name="chk_schedule_recommendation_scope",
        ),
        CheckConstraint(
            "status IN ('proposed','accepted','partially_accepted','rejected','expired','superseded','infeasible')",
            name="chk_schedule_recommendation_status",
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
    scope: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    horizon_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    horizon_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="proposed",
        nullable=False,
    )
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    input_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    proposals: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )
    displacements: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )
    unscheduled: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )
    solver_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    objective: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    solve_ms: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    explanation_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True,
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    decision: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
