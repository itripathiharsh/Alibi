"""Task repository implementing query views, trigram search, and lifecycle persistence."""

import uuid
import zoneinfo
from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.database.repository import BaseRepository
from app.models.tag import Tag
from app.models.task import Task
from app.models.task_tag import TaskTag


class TaskRepository(BaseRepository[Task]):
    """Repository managing Task persistence, view resolutions, and full-text/trigram search."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        super().__init__(Task, session, user_id)

    async def list_by_view(
        self,
        view: str = "today",
        tz_name: str = "Asia/Kolkata",
        category_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        tag: str | None = None,
        status: str | None = None,
        search: str | None = None,
        from_dt: datetime | None = None,
        to_dt: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Task]:
        """Query tasks filtered by business view (Today, Upcoming, Backlog, Completed, All) in user tz."""
        try:
            user_tz = zoneinfo.ZoneInfo(tz_name)
        except Exception:
            user_tz = zoneinfo.ZoneInfo("Asia/Kolkata")

        now = utc_now()
        local_now = now.astimezone(user_tz)
        local_today = local_now.date()
        local_14d = local_today + timedelta(days=14)

        # Base statement
        stmt = select(Task).where(
            Task.user_id == self.user_id,
            Task.deleted_at.is_(None),
        )

        # Join tag if tag filter supplied
        if tag:
            clean_tag = tag.strip().lstrip("#").lower()
            stmt = (
                stmt.join(TaskTag, TaskTag.task_id == Task.id)
                .join(Tag, Tag.id == TaskTag.tag_id)
                .where(
                    func.lower(Tag.name) == clean_tag,
                    Tag.deleted_at.is_(None),
                )
            )

        if category_id:
            stmt = stmt.where(Task.category_id == category_id)

        if project_id:
            stmt = stmt.where(Task.project_id == project_id)

        if status:
            stmt = stmt.where(Task.status == status)

        if search and search.strip():
            term = search.strip()
            stmt = stmt.where(
                or_(
                    Task.title.ilike(f"%{term}%"),
                    func.similarity(Task.title, term) > 0.15,
                )
            )

        if from_dt:
            stmt = stmt.where(Task.deadline_at >= from_dt)
        if to_dt:
            stmt = stmt.where(Task.deadline_at <= to_dt)

        # View-specific filtering
        normalized_view = view.lower()

        if normalized_view == "today":
            # Status is open
            open_statuses = ("pending", "in_progress")
            # Today in user tz: deadline_at AT TIME ZONE tz has date == local_today
            # OR deadline_at < now (overdue)
            # OR status == 'in_progress'
            # OR unscheduled today tasks created today with no deadline (doc 05 §3)
            stmt = stmt.where(
                Task.status.in_(open_statuses),
                or_(
                    Task.status == "in_progress",
                    func.date(func.timezone(tz_name, Task.deadline_at)) == local_today,
                    Task.deadline_at.is_not(None) & (Task.deadline_at < now),
                    Task.deadline_at.is_(None)
                    & (func.date(func.timezone(tz_name, Task.created_at)) == local_today),
                ),
            ).order_by(
                # In progress first, then overdue/deadline ascending, then priority
                Task.status.desc(),
                Task.deadline_at.asc().nulls_last(),
                Task.priority.asc().nulls_last(),
                Task.created_at.asc(),
            )

        elif normalized_view == "upcoming":
            open_statuses = ("pending", "in_progress")
            # Open tasks with deadline in (today, today + 14d]
            stmt = stmt.where(
                Task.status.in_(open_statuses),
                Task.deadline_at.is_not(None),
                func.date(func.timezone(tz_name, Task.deadline_at)) > local_today,
                func.date(func.timezone(tz_name, Task.deadline_at)) <= local_14d,
            ).order_by(
                Task.deadline_at.asc(),
                Task.priority.asc().nulls_last(),
            )

        elif normalized_view == "backlog":
            # Pending tasks with no deadline (in-progress tasks are active today)
            stmt = stmt.where(
                Task.status == "pending",
                Task.deadline_at.is_(None),
            ).order_by(
                Task.priority.asc().nulls_last(),
                Task.created_at.desc(),
            )

        elif normalized_view == "completed":
            stmt = stmt.where(Task.status == "completed").order_by(
                Task.completed_at.desc().nulls_last(),
                Task.updated_at.desc(),
            )

        else:
            # "all" view
            stmt = stmt.order_by(
                Task.created_at.desc(),
            )

        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def restore(self, task_id: uuid.UUID) -> Task | None:
        """Restore a soft-deleted task from trash."""
        task = await self.get_by_id(task_id, include_deleted=True)
        if task and task.deleted_at is not None:
            task.deleted_at = None
            await self.session.flush()
        return task

    async def hard_delete(self, task_id: uuid.UUID) -> bool:
        """Permanently purge a task (only if already soft-deleted in trash)."""
        task = await self.get_by_id(task_id, include_deleted=True)
        if not task or task.deleted_at is None:
            return False
        await self.session.execute(
            delete(Task).where(Task.id == task_id, Task.user_id == self.user_id)
        )
        return True
