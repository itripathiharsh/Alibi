"""Audit log repository for immutable security event tracking."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


class AuditLogRepository:
    """Repository managing append-only audit log records."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record(
        self,
        action: str,
        user_id: uuid.UUID | None = None,
        ip_hash: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> AuditLog:
        """Append an immutable audit entry."""
        entry = AuditLog(
            action=action,
            user_id=user_id,
            ip_hash=ip_hash,
            detail=detail or {},
        )
        self.session.add(entry)
        await self.session.flush()
        return entry
