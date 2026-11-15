"""Task dependency repository managing directed blocked-by relationships."""

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task_dependency import TaskDependency


class TaskDependencyRepository:
    """Repository managing TaskDependency directed edges."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id

    async def list_dependencies(self, task_id: uuid.UUID) -> Sequence[uuid.UUID]:
        """Return IDs of tasks that task_id depends on (blockers of task_id)."""
        stmt = select(TaskDependency.depends_on_task_id).where(
            TaskDependency.task_id == task_id,
            TaskDependency.user_id == self.user_id,
            TaskDependency.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_dependents(self, task_id: uuid.UUID) -> Sequence[uuid.UUID]:
        """Return IDs of tasks that depend on task_id (tasks blocked by task_id)."""
        stmt = select(TaskDependency.task_id).where(
            TaskDependency.depends_on_task_id == task_id,
            TaskDependency.user_id == self.user_id,
            TaskDependency.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_all_edges(self) -> Sequence[tuple[uuid.UUID, uuid.UUID]]:
        """Return all active directed edges (task_id, depends_on_task_id) for cycle checking."""
        stmt = select(TaskDependency.task_id, TaskDependency.depends_on_task_id).where(
            TaskDependency.user_id == self.user_id,
            TaskDependency.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    async def add_dependency(
        self, task_id: uuid.UUID, depends_on_task_id: uuid.UUID
    ) -> TaskDependency:
        """Add a dependency edge where task_id depends on depends_on_task_id."""
        edge = TaskDependency(
            task_id=task_id,
            depends_on_task_id=depends_on_task_id,
            user_id=self.user_id,
        )
        self.session.add(edge)
        await self.session.flush()
        return edge

    async def remove_dependency(self, task_id: uuid.UUID, depends_on_task_id: uuid.UUID) -> bool:
        """Remove a dependency edge."""
        stmt = delete(TaskDependency).where(
            TaskDependency.task_id == task_id,
            TaskDependency.depends_on_task_id == depends_on_task_id,
            TaskDependency.user_id == self.user_id,
        )
        result = await self.session.execute(stmt)
        rc = int(getattr(result, "rowcount", 0))
        return rc > 0
