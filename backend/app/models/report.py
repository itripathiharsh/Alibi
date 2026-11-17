"""Report and Sharing domain models (doc 03 §3.9, doc 10 §5–6)."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.database.base import Base


class Report(Base):
    """Generated factual reports with frozen facts snapshot (doc 03 §3.9, doc 10 §5)."""

    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(
            "report_type IN ('eod', 'weekly', 'monthly', 'custom')",
            name="ck_reports_type",
        ),
        CheckConstraint(
            "narrative_status IN ('none', 'generating', 'ready', 'failed')",
            name="ck_reports_narrative_status",
        ),
        CheckConstraint(
            "status IN ('generating', 'ready', 'failed')",
            name="ck_reports_status",
        ),
        Index("ix_reports_user_generated", "user_id", "generated_at"),
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
    report_type: Mapped[str] = mapped_column(String(16), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    scope: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: ["personal", "work", "shared"],
    )
    facts: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    facts_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    narrative_status: Mapped[str] = mapped_column(String(16), nullable=False, default="none")
    narrative_model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ready")
    files: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    shares: Mapped[list["ReportShare"]] = relationship(
        "ReportShare",
        back_populates="report",
        cascade="all, delete-orphan",
    )


class ReportShare(Base):
    """Secure public link share for a report (doc 03 §3.9, doc 10 §6, doc 12)."""

    __tablename__ = "report_shares"
    __table_args__ = (Index("ix_report_shares_user_created", "user_id", "created_at"),)

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
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[bytes] = mapped_column(LargeBinary, unique=True, nullable=False)
    token_prefix: Mapped[str] = mapped_column(String(6), nullable=False)
    recipient_label: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    shared_facts: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    allow_download: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    last_accessed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    access_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    report: Mapped["Report"] = relationship("Report", back_populates="shares")
    access_logs: Mapped[list["ReportShareAccessLog"]] = relationship(
        "ReportShareAccessLog",
        back_populates="share",
        cascade="all, delete-orphan",
    )


class ReportShareAccessLog(Base):
    """Audit log of accesses to shared report links (doc 03 §3.9, doc 12 §3)."""

    __tablename__ = "report_share_access_log"
    __table_args__ = (
        CheckConstraint(
            "outcome IN ('ok', 'expired', 'revoked', 'not_found')",
            name="ck_report_share_access_outcome",
        ),
        Index("ix_report_share_access_log_share_time", "share_id", "accessed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid7,
    )
    share_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("report_shares.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    accessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    ip_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_agent_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)

    share: Mapped["ReportShare"] = relationship("ReportShare", back_populates="access_logs")
