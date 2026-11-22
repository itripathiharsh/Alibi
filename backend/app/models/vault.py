"""Knowledge Vault and RAG Chat models (doc 03 §3.5/§3.8, doc 08)."""

import uuid
from datetime import date, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.database.base import Base, SyncableMixin


class Note(Base, SyncableMixin):
    """Knowledge Vault note / ingested item (doc 03 §3.5, doc 08 §1)."""

    __tablename__ = "notes"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('task_description','completion_note','work_log','project_note','meeting_note','document','decision','deliverable','manual')",
            name="ck_notes_source_type",
        ),
        CheckConstraint(
            "privacy_class IN ('personal','work','shared','confidential')",
            name="ck_notes_privacy_class",
        ),
        CheckConstraint(
            "embed_status IN ('pending','done','failed','skipped')",
            name="ck_notes_embed_status",
        ),
        Index("ix_notes_user_occurred_on", "user_id", "occurred_on"),
        Index("ix_notes_user_privacy_class", "user_id", "privacy_class"),
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
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
    )

    privacy_class: Mapped[str] = mapped_column(String(16), nullable=False, default="personal")
    storage_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embed_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")

    embeddings: Mapped[list["NoteEmbedding"]] = relationship(
        "NoteEmbedding",
        back_populates="note",
        cascade="all, delete-orphan",
    )


class NoteEmbedding(Base):
    """384-dimensional vector embedding for note chunks (doc 03 §3.5)."""

    __tablename__ = "embeddings"
    __table_args__ = (Index("ix_embeddings_user_note", "user_id", "note_id"),)

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
    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Any] = mapped_column(Vector(384), nullable=True)
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="BAAI/bge-small-en-v1.5")
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    note: Mapped["Note"] = relationship("Note", back_populates="embeddings")


class ChatThread(Base):
    """Conversation thread with the grounded assistant (doc 03 §3.8, doc 08 §4)."""

    __tablename__ = "chat_threads"
    __table_args__ = (Index("ix_chat_threads_user_created", "user_id", "created_at"),)

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
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New Conversation")
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
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage",
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    """Individual message in a grounded chat thread (doc 03 §3.8)."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user','assistant','system','tool')",
            name="ck_chat_messages_role",
        ),
        Index("ix_chat_messages_thread_created", "thread_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
    )
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chat_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    tool_calls: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    thread: Mapped["ChatThread"] = relationship("ChatThread", back_populates="messages")
