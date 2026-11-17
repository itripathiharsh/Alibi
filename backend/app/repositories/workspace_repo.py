"""Workspace repository."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import Workspace


class WorkspaceRepository:
    """Repository managing Workspaces."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_default(self, user_id: uuid.UUID) -> Workspace | None:
        """Fetch the user's default workspace."""
        stmt = select(Workspace).where(
            Workspace.user_id == user_id,
            Workspace.is_default.is_(True),
            Workspace.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: uuid.UUID, workspace_id: uuid.UUID) -> Workspace | None:
        """Fetch an active workspace owned by the user."""
        stmt = select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.user_id == user_id,
            Workspace.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, workspace: Workspace) -> Workspace:
        """Create a new workspace."""
        self.session.add(workspace)
        await self.session.flush()
        return workspace
