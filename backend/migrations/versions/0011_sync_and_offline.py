"""0011_sync_and_offline

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-16 07:00:00.000000

Implements M10 Task 1: sync_operations, sync_conflicts, and devices.last_pull_seq per doc 03 §3.10 and doc 11.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. sync_operations
    op.create_table(
        "sync_operations",
        sa.Column("op_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("entity_type", sa.String(32), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("op_type", sa.String(16), nullable=False),
        sa.Column("base_version", sa.Integer(), nullable=True),
        sa.Column("payload", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("client_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("result", sa.String(16), nullable=False),
        sa.Column("result_detail", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("new_version", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "op_type IN ('create','update','delete','command')",
            name="ck_sync_operations_type",
        ),
        sa.CheckConstraint(
            "result IN ('applied','merged','conflict','rejected','duplicate')",
            name="ck_sync_operations_result",
        ),
    )
    op.create_index(
        "ix_sync_operations_user_entity",
        "sync_operations",
        ["user_id", "entity_type", "entity_id"],
    )
    op.create_index(
        "ix_sync_operations_received",
        "sync_operations",
        ["user_id", "received_at"],
    )

    # 2. sync_conflicts
    op.create_table(
        "sync_conflicts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("entity_type", sa.String(32), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field", sa.String(64), nullable=False),
        sa.Column("local_value", postgresql.JSONB(), nullable=False),
        sa.Column("server_value", postgresql.JSONB(), nullable=False),
        sa.Column("op_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(32), server_default="open", nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('open','resolved_local','resolved_server','resolved_custom')",
            name="ck_sync_conflicts_status",
        ),
    )
    op.create_index("ix_sync_conflicts_user_status", "sync_conflicts", ["user_id", "status"])


def downgrade() -> None:
    op.drop_table("sync_conflicts")
    op.drop_table("sync_operations")
