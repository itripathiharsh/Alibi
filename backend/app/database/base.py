"""SQLAlchemy Declarative Base and SyncableMixin.
Implements ADR-002, ADR-011, and doc 03 §1 sync columns.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, FetchedValue, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.time import utc_now


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy declarative models."""

    pass


class SyncableMixin:
    """Mixin defining standard synchronization columns for all syncable entities.

    Every syncable table carries:
    - created_at: Client creation timestamp
    - updated_at: Server update timestamp
    - version: Monotonically increasing revision number per row
    - server_seq: Global sequence number for pull cursors (nextval('sync_seq'))
    - deleted_at: Soft-deletion tombstone timestamp
    - last_modified_device_id: FK to devices table
    - field_versions: JSON map tracking individual field version numbers for merges
    """

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
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    server_seq: Mapped[int] = mapped_column(
        BigInteger,
        server_default=FetchedValue(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_modified_device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
    )
    field_versions: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
