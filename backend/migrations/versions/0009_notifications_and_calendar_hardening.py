"""0009_notifications_and_calendar_hardening

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-16 05:00:00.000000

Implements M8 Task 1: notifications table per doc 03 §3.10 and quiet hours support.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. notifications table
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("calendar_events.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("fire_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="scheduled"),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('task_reminder', 'deadline_soon', 'block_start', 'daily_plan', 'sync_conflict', 'proposal_ready')",
            name="ck_notifications_kind",
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'delivered', 'dismissed', 'cancelled')",
            name="ck_notifications_status",
        ),
    )

    op.create_index(
        "ix_notifications_user_fire_at",
        "notifications",
        ["user_id", "fire_at"],
        postgresql_where=sa.text("status = 'scheduled'"),
    )
    op.create_index(
        "ix_notifications_user_status",
        "notifications",
        ["user_id", "status"],
    )


def downgrade() -> None:
    op.drop_table("notifications")
