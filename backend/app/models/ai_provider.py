"""AI Provider Settings and Usage Log models (doc 03 §3.8)."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class AIProviderSetting(Base):
    """Configuration and credentials for an AI provider (write-only keys in DB)."""

    __tablename__ = "ai_provider_settings"
    __table_args__ = (
        CheckConstraint(
            "provider IN ('ollama', 'nvidia', 'gemini', 'groq')",
            name="chk_ai_provider_name",
        ),
        UniqueConstraint("user_id", "provider", name="uq_ai_provider_user"),
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
    provider: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    api_key_encrypted: Mapped[bytes | None] = mapped_column(
        LargeBinary,
        nullable=True,
    )
    key_last4: Mapped[str | None] = mapped_column(
        String(4),
        nullable=True,
    )
    base_url: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    models: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    fallback_rank: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    last_test_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_test_status: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    routing_overrides: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
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

    user: Mapped["User"] = relationship("User")


class AIUsageLog(Base):
    """Execution telemetry and cost tracking for AI operations (no prompt/body content)."""

    __tablename__ = "ai_usage_logs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('ok', 'timeout', 'rate_limited', 'invalid_output', 'error')",
            name="chk_ai_usage_status",
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
    provider: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    model: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    operation: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    input_tokens: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    output_tokens: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    latency_ms: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    error_code: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    estimated_cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(10, 6),
        default=Decimal("0.0"),
        nullable=False,
    )
    fallback_from: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True,
    )
