"""Personal Learning Engine domain models (doc 03 §3.6, doc 07)."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.database.base import Base


class BehaviorObservation(Base):
    """Immutable behavioral signal emitted synchronously with domain events (doc 07 §2)."""

    __tablename__ = "behavior_observations"
    __table_args__ = (
        Index(
            "ix_behavior_obs_user_type_observed",
            "user_id",
            "observation_type",
            "observed_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    observation_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    features: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class LearnedPattern(Base):
    """Statistical pattern or routine identified across behavioral observations."""

    __tablename__ = "learned_patterns"
    __table_args__ = (
        CheckConstraint(
            "pattern_type IN ('routine','duration','work_period','postponement','session_length','interruption','category_distribution')",
            name="chk_learned_pattern_type",
        ),
        CheckConstraint(
            "status IN ('candidate','active','confirmed','dismissed','stale')",
            name="chk_learned_pattern_status",
        ),
        UniqueConstraint(
            "user_id", "pattern_type", "key", name="uq_learned_patterns_user_type_key"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pattern_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    key: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    value: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    sample_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    support: Mapped[list[Any]] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )
    confidence: Mapped[Decimal] = mapped_column(
        Numeric(4, 3),
        default=Decimal("0.0"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="candidate",
        nullable=False,
    )
    first_observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    last_observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
    algorithm_version: Mapped[str] = mapped_column(
        String(20),
        default="v1",
        nullable=False,
    )


class MemoryProfile(Base):
    """Compiled versioned snapshot of user productivity profile (doc 07 §9)."""

    __tablename__ = "memory_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    profile: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True,
    )


class TaskPrediction(Base):
    """AI and ML predictions for a task draft or scheduled block (doc 07 §5)."""

    __tablename__ = "task_predictions"
    __table_args__ = (
        CheckConstraint(
            "prediction_type IN ('category','project','duration','priority','dependency')",
            name="chk_task_prediction_type",
        ),
        CheckConstraint(
            "outcome IN ('pending','accepted','corrected','rejected','ignored')",
            name="chk_task_prediction_outcome",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    prediction_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    predicted: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    interval: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    confidence: Mapped[Decimal] = mapped_column(
        Numeric(4, 3),
        default=Decimal("0.0"),
        nullable=False,
    )
    maturity_level: Mapped[int] = mapped_column(
        SmallInteger,
        default=0,
        nullable=False,
    )
    model_name: Mapped[str] = mapped_column(
        String(50),
        default="rules",
        nullable=False,
    )
    model_version: Mapped[str] = mapped_column(
        String(20),
        default="v1",
        nullable=False,
    )
    features: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    outcome: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )
    actual: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    error: Mapped[Decimal | None] = mapped_column(
        Numeric,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class MLModel(Base):
    """Serialized scikit-learn models and training metadata (doc 07 §3)."""

    __tablename__ = "ml_models"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    model_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    train_rows: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    metrics: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    artifact: Mapped[bytes | None] = mapped_column(
        LargeBinary,
        nullable=True,
    )
    active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
