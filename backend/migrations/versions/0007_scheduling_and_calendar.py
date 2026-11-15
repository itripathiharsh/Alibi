"""0007_scheduling_and_calendar

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-16 03:00:00.000000

Implements M6 Task 1: calendar_events and schedule_recommendations tables per doc 03 §3.4/§3.7.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. calendar_events
    op.create_table(
        "calendar_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("source", sa.String(20), server_default=sa.text("'user'"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("is_all_day", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("rrule", sa.String(255), nullable=True),
        sa.Column("exdates", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("recurrence_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('fixed_event','work_block','deadline_marker','actual_time')",
            name="chk_calendar_event_kind",
        ),
        sa.CheckConstraint(
            "source IN ('user','ai_proposed','ai_accepted','external_sync')",
            name="chk_calendar_event_source",
        ),
        sa.CheckConstraint("end_at >= start_at", name="chk_calendar_event_dates"),
    )

    # 2. schedule_recommendations
    op.create_table(
        "schedule_recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("horizon_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("horizon_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), server_default=sa.text("'proposed'"), nullable=False),
        sa.Column(
            "input_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column(
            "proposals",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "displacements",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "unscheduled",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("solver_status", sa.String(30), nullable=False),
        sa.Column(
            "objective",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("solve_ms", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("explanation_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
            index=True,
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.CheckConstraint(
            "scope IN ('task','day','horizon')",
            name="chk_schedule_recommendation_scope",
        ),
        sa.CheckConstraint(
            "status IN ('proposed','accepted','partially_accepted','rejected','expired','superseded','infeasible')",
            name="chk_schedule_recommendation_status",
        ),
    )


def downgrade() -> None:
    op.drop_table("schedule_recommendations")
    op.drop_table("calendar_events")
