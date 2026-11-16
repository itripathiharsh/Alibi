"""Device domain model (doc 03 §3.1)."""

from datetime import datetime
import uuid

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.db.base import Base


class Device(Base):
    """Device tracking entity for sessions and sync cursors."""

    __tablename__ = "devices"
    __table_args__ = (
        CheckConstraint("platform IN ('android', 'web')", name="chk_device_platform"),
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
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    platform: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    app_version: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    last_pull_seq: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="devices")  # type: ignore[name-defined]

