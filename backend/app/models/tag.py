"""Tag domain model (doc 03 §3.2)."""

import uuid

from sqlalchemy import ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.uuid import generate_uuid7
from app.database.base import Base, SyncableMixin


class Tag(Base, SyncableMixin):
    """Categorical label tag for cross-project task filtering."""

    __tablename__ = "tags"
    __table_args__ = (
        Index(
            "uq_tags_user_lower_name",
            "user_id",
            func.lower(mapped_column("name")),
            unique=True,
            postgresql_where=mapped_column("deleted_at").is_(None),
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
    name: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
