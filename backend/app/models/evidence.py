"""Evidence domain model (doc 03 §3.3)."""

import uuid

from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.uuid import generate_uuid7
from app.database.base import Base, SyncableMixin


class Evidence(Base, SyncableMixin):
    """Artifact, URL link, or proof note confirming task deliverable completion."""

    __tablename__ = "evidence"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('file', 'link', 'text')",
            name="chk_evidence_kind",
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
    kind: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    storage_key: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    mime: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    size_bytes: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )
    sha256: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    is_deliverable: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

