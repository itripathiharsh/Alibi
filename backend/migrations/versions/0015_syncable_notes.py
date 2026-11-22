"""0015_syncable_notes

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-22

Add SyncableMixin columns (version, server_seq, field_versions, last_modified_device_id) and triggers to notes table.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add SyncableMixin columns to notes table
    op.add_column("notes", sa.Column("version", sa.Integer(), server_default="1", nullable=False))
    op.add_column(
        "notes",
        sa.Column(
            "server_seq",
            sa.BigInteger(),
            server_default=sa.text("nextval('sync_seq')"),
            nullable=False,
        ),
    )
    op.add_column(
        "notes",
        sa.Column(
            "field_versions",
            postgresql.JSONB(),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "notes",
        sa.Column(
            "last_modified_device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_notes_server_seq", "notes", ["server_seq"])
    op.create_index("ix_projects_server_seq", "projects", ["server_seq"])

    # 2. Add sync triggers for notes
    op.execute(
        "CREATE TRIGGER trg_notes_sync_init BEFORE INSERT ON notes FOR EACH ROW EXECUTE FUNCTION trg_sync_init();"
    )
    op.execute(
        "CREATE TRIGGER trg_notes_sync_bump BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_notes_sync_bump ON notes;")
    op.execute("DROP TRIGGER IF EXISTS trg_notes_sync_init ON notes;")
    op.drop_index("ix_projects_server_seq", table_name="projects")
    op.drop_index("ix_notes_server_seq", table_name="notes")
    op.drop_column("notes", "last_modified_device_id")
    op.drop_column("notes", "field_versions")
    op.drop_column("notes", "server_seq")
    op.drop_column("notes", "version")
