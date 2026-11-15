"""Project repository implementing user-isolated project persistence."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.repository import BaseRepository
from app.models.project import Project


class ProjectRepository(BaseRepository[Project]):
    """Repository managing Project lifecycle and queries."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        super().__init__(Project, session, user_id)

    async def list_active(self, workspace_id: uuid.UUID | None = None) -> Sequence[Project]:
        """List all active non-deleted projects for the user."""
        stmt = (
            select(Project)
            .where(
                Project.user_id == self.user_id,
                Project.deleted_at.is_(None),
            )
            .order_by(Project.name.asc())
        )
        if workspace_id:
            stmt = stmt.where(Project.workspace_id == workspace_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_by_name(self, name: str) -> Project | None:
        """Find a project by exact case-insensitive name."""
        stmt = select(Project).where(
            Project.user_id == self.user_id,
            Project.name.ilike(name.strip()),
            Project.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()
