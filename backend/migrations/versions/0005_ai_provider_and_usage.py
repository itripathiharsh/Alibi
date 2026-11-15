"""0005_ai_provider_and_usage

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-16 01:00:00.000000

Implements M4 Task 2: ai_provider_settings and ai_usage_logs tables per doc 03 §3.8.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. ai_provider_settings table
    op.create_table(
        "ai_provider_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("api_key_encrypted", sa.LargeBinary(), nullable=True),
        sa.Column("key_last4", sa.String(4), nullable=True),
        sa.Column("base_url", sa.String(255), nullable=True),
        sa.Column(
            "models",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("fallback_rank", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_test_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_status", sa.String(20), nullable=True),
        sa.Column("routing_overrides", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
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
            "provider IN ('ollama', 'nvidia', 'gemini', 'groq')",
            name="chk_ai_provider_name",
        ),
        sa.UniqueConstraint("user_id", "provider", name="uq_ai_provider_user"),
    )

    # 2. ai_usage_logs table
    op.create_table(
        "ai_usage_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("model", sa.String(50), nullable=False),
        sa.Column("operation", sa.String(50), nullable=False),
        sa.Column("input_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("latency_ms", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("error_code", sa.String(50), nullable=True),
        sa.Column(
            "estimated_cost_usd",
            sa.Numeric(10, 6),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("fallback_from", sa.String(20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
            index=True,
        ),
        sa.CheckConstraint(
            "status IN ('ok', 'timeout', 'rate_limited', 'invalid_output', 'error')",
            name="chk_ai_usage_status",
        ),
    )


def downgrade() -> None:
    op.drop_table("ai_usage_logs")
    op.drop_table("ai_provider_settings")
