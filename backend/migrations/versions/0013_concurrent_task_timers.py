"""0013_concurrent_task_timers

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-18

Allow a user to time different tasks concurrently while preventing duplicate
active timers for the same task (FR-TASK-021).
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("uq_time_entries_running_timer", table_name="time_entries")
    op.create_index(
        "uq_time_entries_running_task",
        "time_entries",
        ["user_id", "task_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT user_id
                FROM time_entries
                WHERE ended_at IS NULL AND deleted_at IS NULL
                GROUP BY user_id
                HAVING COUNT(*) > 1
            ) THEN
                RAISE EXCEPTION
                    'Cannot downgrade 0013 while a user has multiple active timers; stop all but one timer per user first';
            END IF;
        END $$;
        """
    )
    op.drop_index("uq_time_entries_running_task", table_name="time_entries")
    op.create_index(
        "uq_time_entries_running_timer",
        "time_entries",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL AND deleted_at IS NULL"),
    )
