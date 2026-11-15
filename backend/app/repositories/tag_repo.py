"""Tag and TaskTag repository implementing user-isolated tag persistence."""

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.repository import BaseRepository
from app.models.tag import Tag
from app.models.task_tag import TaskTag


class TagRepository(BaseRepository[Tag]):
    """Repository managing Tag and task_tag link persistence."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        super().__init__(Tag, session, user_id)

    async def list_active(self) -> Sequence[Tag]:
        """List all active non-deleted tags."""
        stmt = (
            select(Tag)
            .where(
                Tag.user_id == self.user_id,
                Tag.deleted_at.is_(None),
            )
            .order_by(Tag.name.asc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_by_name(self, name: str) -> Tag | None:
        """Find tag by case-insensitive name."""
        clean_name = name.strip().lstrip("#").lower()
        stmt = select(Tag).where(
            Tag.user_id == self.user_id,
            func.lower(Tag.name) == clean_name,
            Tag.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_or_create(self, name: str) -> Tag:
        """Retrieve existing tag or create a new one."""
        clean_name = name.strip().lstrip("#")
        tag = await self.get_by_name(clean_name)
        if tag:
            return tag
        new_tag = Tag(user_id=self.user_id, name=clean_name)
        self.session.add(new_tag)
        await self.session.flush()
        return new_tag

    async def get_tags_for_task(self, task_id: uuid.UUID) -> Sequence[Tag]:
        """Fetch all tags associated with a specific task."""
        stmt = (
            select(Tag)
            .join(TaskTag, TaskTag.tag_id == Tag.id)
            .where(
                TaskTag.task_id == task_id,
                Tag.user_id == self.user_id,
                Tag.deleted_at.is_(None),
            )
            .order_by(Tag.name.asc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def sync_task_tags(self, task_id: uuid.UUID, tag_names: list[str]) -> list[Tag]:
        """Synchronize task tags: associate existing/new tags and remove unreferenced links."""
        # 1. Delete existing task_tags for this task
        await self.session.execute(delete(TaskTag).where(TaskTag.task_id == task_id))
        tags: list[Tag] = []
        seen = set()
        for name in tag_names:
            normalized = name.strip().lstrip("#").lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            tag = await self.get_or_create(normalized)
            task_tag = TaskTag(task_id=task_id, tag_id=tag.id, user_id=self.user_id)
            self.session.add(task_tag)
            tags.append(tag)
        await self.session.flush()
        return tags
