"""0008_rag_and_knowledge_vault

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-16 04:00:00.000000

Implements M7 Task 1: notes, embeddings, chat_threads, and chat_messages tables per doc 03 §3.5/§3.8.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. notes
    op.create_table(
        "notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("privacy_class", sa.String(16), nullable=False, server_default="personal"),
        sa.Column("storage_key", sa.String(255), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("embed_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "source_type IN ('task_description','completion_note','work_log','project_note','meeting_note','document','decision','deliverable','manual')",
            name="ck_notes_source_type",
        ),
        sa.CheckConstraint(
            "privacy_class IN ('personal','work','shared','confidential')",
            name="ck_notes_privacy_class",
        ),
        sa.CheckConstraint(
            "embed_status IN ('pending','done','failed','skipped')",
            name="ck_notes_embed_status",
        ),
    )

    op.create_index(
        "ix_notes_user_occurred_on",
        "notes",
        ["user_id", "occurred_on"],
    )
    op.create_index(
        "ix_notes_user_privacy_class",
        "notes",
        ["user_id", "privacy_class"],
    )
    op.create_index(
        "uq_notes_source",
        "notes",
        ["user_id", "source_type", "source_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND source_id IS NOT NULL"),
    )
    op.execute("CREATE INDEX ix_notes_title_trgm ON notes USING gin (title gin_trgm_ops);")
    op.execute("CREATE INDEX ix_notes_body_trgm ON notes USING gin (body gin_trgm_ops);")

    # 2. embeddings
    bind = op.get_bind()
    has_vector = False
    try:
        res = bind.execute(sa.text("SELECT 1 FROM pg_extension WHERE extname = 'vector'"))
        has_vector = res.scalar() is not None
    except Exception:
        has_vector = False

    embedding_type = Vector(384) if has_vector else postgresql.ARRAY(sa.Float())

    op.create_table(
        "embeddings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "note_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", embedding_type, nullable=True),
        sa.Column("model", sa.String(64), nullable=False, server_default="BAAI/bge-small-en-v1.5"),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("meta", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_embeddings_user_note", "embeddings", ["user_id", "note_id"])
    if has_vector:
        op.execute(
            "CREATE INDEX ix_embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);"
        )

    # 3. chat_threads
    op.create_table(
        "chat_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("title", sa.String(255), nullable=False, server_default="New Conversation"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_chat_threads_user_created", "chat_threads", ["user_id", "created_at"])

    # 4. chat_messages
    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "thread_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_threads.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("tool_calls", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("provider", sa.String(32), nullable=True),
        sa.Column("model", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('user','assistant','system','tool')",
            name="ck_chat_messages_role",
        ),
    )
    op.create_index("ix_chat_messages_thread_created", "chat_messages", ["thread_id", "created_at"])


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("chat_threads")
    op.drop_table("embeddings")
    op.drop_table("notes")
