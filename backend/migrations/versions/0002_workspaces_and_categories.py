"""0002_workspaces_and_categories

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-15 23:35:00.000000

Implements M1 Task 1: workspaces and categories syncable tables with triggers.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Workspaces table
    op.create_table(
        "workspaces",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        # SyncableMixin columns
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
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "server_seq",
            sa.BigInteger(),
            server_default=sa.text("nextval('sync_seq')"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "last_modified_device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "field_versions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.create_index("ix_workspaces_user_id", "workspaces", ["user_id"])

    # Workspaces sync triggers
    op.execute("""
    CREATE TRIGGER trg_workspaces_sync_init
    BEFORE INSERT ON workspaces
    FOR EACH ROW EXECUTE FUNCTION trg_sync_init();
    """)
    op.execute("""
    CREATE TRIGGER trg_workspaces_sync_bump
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();
    """)

    # 2. Categories table
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("sharing_class", sa.String(length=20), nullable=False),
        sa.Column(
            "external_ai_allowed", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("color", sa.String(length=20), server_default="#3B82F6", nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        # SyncableMixin columns
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
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "server_seq",
            sa.BigInteger(),
            server_default=sa.text("nextval('sync_seq')"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "last_modified_device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "field_versions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.CheckConstraint(
            "sharing_class IN ('professional', 'personal', 'academic', 'learning')",
            name="chk_category_sharing_class",
        ),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])
    op.create_index("ix_categories_workspace_id", "categories", ["workspace_id"])
    op.execute("""
    CREATE UNIQUE INDEX uq_categories_user_slug
    ON categories (user_id, slug)
    WHERE deleted_at IS NULL;
    """)

    # Categories sync triggers
    op.execute("""
    CREATE TRIGGER trg_categories_sync_init
    BEFORE INSERT ON categories
    FOR EACH ROW EXECUTE FUNCTION trg_sync_init();
    """)
    op.execute("""
    CREATE TRIGGER trg_categories_sync_bump
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_categories_sync_bump ON categories;")
    op.execute("DROP TRIGGER IF EXISTS trg_categories_sync_init ON categories;")
    op.drop_table("categories")

    op.execute("DROP TRIGGER IF EXISTS trg_workspaces_sync_bump ON workspaces;")
    op.execute("DROP TRIGGER IF EXISTS trg_workspaces_sync_init ON workspaces;")
    op.drop_table("workspaces")
