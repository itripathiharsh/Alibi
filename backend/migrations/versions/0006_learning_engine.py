"""0006_learning_engine

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-16 02:00:00.000000

Implements M5 Task 1: behavior_observations, learned_patterns, memory_profiles,
task_predictions, and ml_models per doc 03 §3.6.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. behavior_observations (append-only)
    op.create_table(
        "behavior_observations",
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
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("observation_type", sa.String(50), nullable=False),
        sa.Column(
            "features",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "observed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_behavior_obs_user_type_observed",
        "behavior_observations",
        ["user_id", "observation_type", "observed_at"],
    )
    op.execute("""
    CREATE TRIGGER trg_behavior_observations_append_only
    BEFORE UPDATE OR DELETE ON behavior_observations
    FOR EACH ROW EXECUTE FUNCTION trg_append_only();
    """)

    # 2. learned_patterns
    op.create_table(
        "learned_patterns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("pattern_type", sa.String(50), nullable=False),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column(
            "value",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("sample_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "support",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("confidence", sa.Numeric(4, 3), server_default=sa.text("0.0"), nullable=False),
        sa.Column("status", sa.String(20), server_default=sa.text("'candidate'"), nullable=False),
        sa.Column(
            "first_observed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "last_observed_at",
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
        sa.Column(
            "algorithm_version", sa.String(20), server_default=sa.text("'v1'"), nullable=False
        ),
        sa.CheckConstraint(
            "pattern_type IN ('routine','duration','work_period','postponement','session_length','interruption','category_distribution')",
            name="chk_learned_pattern_type",
        ),
        sa.CheckConstraint(
            "status IN ('candidate','active','confirmed','dismissed','stale')",
            name="chk_learned_pattern_status",
        ),
        sa.UniqueConstraint(
            "user_id", "pattern_type", "key", name="uq_learned_patterns_user_type_key"
        ),
    )

    # 3. memory_profiles
    op.create_table(
        "memory_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column(
            "profile",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
            index=True,
        ),
    )

    # 4. task_predictions
    op.create_table(
        "task_predictions",
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
            nullable=False,
            index=True,
        ),
        sa.Column("prediction_type", sa.String(30), nullable=False),
        sa.Column(
            "predicted",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("interval", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("confidence", sa.Numeric(4, 3), server_default=sa.text("0.0"), nullable=False),
        sa.Column("maturity_level", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("model_name", sa.String(50), server_default=sa.text("'rules'"), nullable=False),
        sa.Column("model_version", sa.String(20), server_default=sa.text("'v1'"), nullable=False),
        sa.Column(
            "features",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("outcome", sa.String(20), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("actual", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Numeric(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
            index=True,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "prediction_type IN ('category','project','duration','priority','dependency')",
            name="chk_task_prediction_type",
        ),
        sa.CheckConstraint(
            "outcome IN ('pending','accepted','corrected','rejected','ignored')",
            name="chk_task_prediction_outcome",
        ),
    )

    # 5. ml_models
    op.create_table(
        "ml_models",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("model_type", sa.String(50), nullable=False),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column(
            "trained_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("train_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "metrics",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("artifact", sa.LargeBinary(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ml_models")
    op.drop_table("task_predictions")
    op.drop_table("memory_profiles")
    op.drop_table("learned_patterns")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_behavior_observations_append_only ON behavior_observations;"
    )
    op.drop_table("behavior_observations")
