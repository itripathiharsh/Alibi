"""RecurrenceRule domain model (doc 03 §3.3)."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.uuid import generate_uuid7
from app.database.base import Base, SyncableMixin


class RecurrenceRule(Base, SyncableMixin):
    """Recurring task schedule pattern using RFC 5545 rrules."""

    __tablename__ = "recurrence_rules"

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
    template: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    rrule: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    dtstart: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    generated_until: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )
    source: Mapped[str] = mapped_column(
        String(30),
        default="user",
        nullable=False,
    )
