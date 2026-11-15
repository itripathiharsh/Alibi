"""Evidence repository for task deliverable attachments and notes."""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.repository import BaseRepository
from app.models.evidence import Evidence


class EvidenceRepository(BaseRepository[Evidence]):
    """Repository managing Evidence records."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        super().__init__(Evidence, session, user_id)

    async def list_for_task(self, task_id: uuid.UUID) -> Sequence[Evidence]:
        """List all active evidence entries for a task."""
        stmt = (
            select(Evidence)
            .where(
                Evidence.task_id == task_id,
                Evidence.user_id == self.user_id,
                Evidence.deleted_at.is_(None),
            )
            .order_by(Evidence.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_total_storage_bytes(self) -> int:
        """Sum total storage size of all non-deleted files for this user."""
        stmt = select(func.coalesce(func.sum(Evidence.size_bytes), 0)).where(
            Evidence.user_id == self.user_id,
            Evidence.deleted_at.is_(None),
            Evidence.kind == "file",
        )
        result = await self.session.execute(stmt)
        val = result.scalar_one()
        return int(val) if val is not None else 0
