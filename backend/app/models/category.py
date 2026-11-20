"""Category domain model (doc 03 §3.2)."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.uuid import generate_uuid7
from app.database.base import Base, SyncableMixin

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class Category(Base, SyncableMixin):
    """Category classification entity with privacy class and external AI gating."""

    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint(
            "sharing_class IN ('professional', 'personal', 'academic', 'learning')",
            name="chk_category_sharing_class",
        ),
        Index(
            "uq_categories_user_slug",
            "user_id",
            "slug",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
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
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    is_system: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    sharing_class: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    external_ai_allowed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    color: Mapped[str] = mapped_column(
        String(20),
        default="#3B82F6",
        nullable=False,
    )
    position: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="categories")
