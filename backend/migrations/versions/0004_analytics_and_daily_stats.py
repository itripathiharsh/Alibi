"""0004_analytics_and_daily_stats

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-16 00:30:00.000000

Implements M3 Task 3: composite analytics indexes, mv_daily_task_stats materialized view,
and refresh function.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Performance indexes for analytics queries
    op.create_index(
        "ix_tasks_user_status_completed",
        "tasks",
        ["user_id", "status", "completed_at"],
        unique=False,
    )
    op.create_index(
        "ix_tasks_user_deadline",
        "tasks",
        ["user_id", "deadline_at"],
        unique=False,
    )
    op.create_index(
        "ix_time_entries_user_started_ended",
        "time_entries",
        ["user_id", "started_at", "ended_at"],
        unique=False,
    )
    op.create_index(
        "ix_time_entries_user_started",
        "time_entries",
        ["user_id", "started_at"],
        unique=False,
    )

    # 2. Materialized view for fast daily task completion rollups
    op.execute(
        """
        CREATE MATERIALIZED VIEW mv_daily_task_stats AS
        SELECT
            t.user_id,
            DATE(t.completed_at AT TIME ZONE 'Asia/Kolkata') AS stat_date,
            COUNT(*)::integer AS completed_count,
            COUNT(CASE WHEN t.deadline_at IS NOT NULL AND t.completed_at <= t.deadline_at THEN 1 END)::integer AS on_time_count
        FROM tasks t
        WHERE t.status = 'completed' AND t.deleted_at IS NULL AND t.completed_at IS NOT NULL
        GROUP BY t.user_id, DATE(t.completed_at AT TIME ZONE 'Asia/Kolkata');
        """
    )

    # Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
    op.execute(
        """
        CREATE UNIQUE INDEX uq_mv_daily_task_stats ON mv_daily_task_stats(user_id, stat_date);
        """
    )

    # Refresh function
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_daily_task_stats()
        RETURNS void AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_task_stats;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS refresh_daily_task_stats();")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_daily_task_stats;")
    op.drop_index("ix_time_entries_user_started", table_name="time_entries")
    op.drop_index("ix_time_entries_user_started_ended", table_name="time_entries")
    op.drop_index("ix_tasks_user_deadline", table_name="tasks")
    op.drop_index("ix_tasks_user_status_completed", table_name="tasks")
