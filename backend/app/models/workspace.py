"""Workspace domain model (doc 03 §3.2)."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.uuid import generate_uuid7
from app.database.base import Base, SyncableMixin

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.user import User


class Workspace(Base, SyncableMixin):
    """Workspace boundary container for projects, categories, and tasks."""

    __tablename__ = "workspaces"

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
    is_default: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="workspaces")
    categories: Mapped[list["Category"]] = relationship(
        "Category", back_populates="workspace", cascade="all, delete-orphan"
    )
