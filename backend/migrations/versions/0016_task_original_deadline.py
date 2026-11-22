"""0016_task_original_deadline

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-23

Keep the first due date that passed before a task was moved (ADR-032, FR-TASK-023), so an
overdue task's original due date survives rescheduling. Additive and nullable; existing
rows keep NULL (no backfill: the original date of already-moved tasks is not recorded).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("original_deadline_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tasks", "original_deadline_at")
