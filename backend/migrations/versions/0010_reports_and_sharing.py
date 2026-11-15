"""0010_reports_and_sharing

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-16 06:00:00.000000

Implements M9 Task 1: reports, report_shares, and report_share_access_log tables per doc 03 §3.9.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. reports
    op.create_table(
        "reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("report_type", sa.String(16), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "scope",
            postgresql.JSONB(),
            server_default='["personal","work","shared"]',
            nullable=False,
        ),
        sa.Column("facts", postgresql.JSONB(), nullable=False),
        sa.Column("facts_hash", sa.String(64), nullable=False),
        sa.Column("narrative", sa.Text(), nullable=True),
        sa.Column("narrative_status", sa.String(16), server_default="none", nullable=False),
        sa.Column("narrative_model", sa.String(64), nullable=True),
        sa.Column("status", sa.String(16), server_default="ready", nullable=False),
        sa.Column("files", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "report_type IN ('eod', 'weekly', 'monthly', 'custom')",
            name="ck_reports_type",
        ),
        sa.CheckConstraint(
            "narrative_status IN ('none', 'generating', 'ready', 'failed')",
            name="ck_reports_narrative_status",
        ),
        sa.CheckConstraint(
            "status IN ('generating', 'ready', 'failed')",
            name="ck_reports_status",
        ),
    )
    op.create_index("ix_reports_user_generated", "reports", ["user_id", "generated_at"])

    # 2. report_shares
    op.create_table(
        "report_shares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "report_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reports.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("token_hash", sa.LargeBinary(), unique=True, nullable=False),
        sa.Column("token_prefix", sa.String(6), nullable=False),
        sa.Column("recipient_label", sa.String(255), nullable=False),
        sa.Column("scope", postgresql.JSONB(), nullable=False),
        sa.Column("shared_facts", postgresql.JSONB(), nullable=False),
        sa.Column("allow_download", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("access_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("ix_report_shares_user_created", "report_shares", ["user_id", "created_at"])

    # 3. report_share_access_log
    op.create_table(
        "report_share_access_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "share_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("report_shares.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "accessed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ip_hash", sa.String(64), nullable=False),
        sa.Column("user_agent_hash", sa.String(64), nullable=False),
        sa.Column("outcome", sa.String(16), nullable=False),
        sa.CheckConstraint(
            "outcome IN ('ok', 'expired', 'revoked', 'not_found')",
            name="ck_report_share_access_outcome",
        ),
    )
    op.create_index(
        "ix_report_share_access_log_share_time",
        "report_share_access_log",
        ["share_id", "accessed_at"],
    )


def downgrade() -> None:
    op.drop_table("report_share_access_log")
    op.drop_table("report_shares")
    op.drop_table("reports")
