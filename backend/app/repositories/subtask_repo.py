"""Subtask repository for checklist item management."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.database.repository import BaseRepository
from app.models.subtask import Subtask


class SubtaskRepository(BaseRepository[Subtask]):
    """Repository managing Subtask items within tasks."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        super().__init__(Subtask, session, user_id)

    async def list_for_task(self, task_id: uuid.UUID) -> Sequence[Subtask]:
        """List subtasks for a task ordered by position."""
        stmt = (
            select(Subtask)
            .where(
                Subtask.task_id == task_id,
                Subtask.user_id == self.user_id,
                Subtask.deleted_at.is_(None),
            )
            .order_by(Subtask.position.asc(), Subtask.created_at.asc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def reorder(self, task_id: uuid.UUID, subtask_ids: list[uuid.UUID]) -> Sequence[Subtask]:
        """Update positions of subtasks according to ordered IDs."""
        items = await self.list_for_task(task_id)
        item_map = {item.id: item for item in items}
        for pos, s_id in enumerate(subtask_ids):
            if s_id in item_map:
                item_map[s_id].position = pos
        await self.session.flush()
        return await self.list_for_task(task_id)

    async def toggle_complete(self, subtask_id: uuid.UUID, completed: bool) -> Subtask | None:
        """Toggle completed state of a subtask."""
        subtask = await self.get_by_id(subtask_id)
        if not subtask:
            return None
        subtask.completed = completed
        subtask.completed_at = utc_now() if completed else None
        await self.session.flush()
        return subtask
