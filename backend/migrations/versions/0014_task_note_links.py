"""0014_task_note_links

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-19

Add account-scoped task/Vault note associations without changing the sync protocol.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "task_note_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "task_id", "note_id", name="uq_task_note_links_owner_pair"),
    )
    op.create_index("ix_task_note_links_owner_task", "task_note_links", ["user_id", "task_id"])
    op.create_index("ix_task_note_links_owner_note", "task_note_links", ["user_id", "note_id"])


def downgrade() -> None:
    op.drop_index("ix_task_note_links_owner_note", table_name="task_note_links")
    op.drop_index("ix_task_note_links_owner_task", table_name="task_note_links")
    op.drop_table("task_note_links")
