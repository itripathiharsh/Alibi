"""Private many-to-many links between tasks and Vault notes (FR-PROD-006)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.database.base import Base


class TaskNoteLink(Base):
    """Associate an owned task with an owned knowledge note without changing sync envelopes."""

    __tablename__ = "task_note_links"
    __table_args__ = (
        UniqueConstraint("user_id", "task_id", "note_id", name="uq_task_note_links_owner_pair"),
        Index("ix_task_note_links_owner_task", "user_id", "task_id"),
        Index("ix_task_note_links_owner_note", "user_id", "note_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=generate_uuid7
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notes.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
