"""Time tracking service for independent task timers and actual_min consistency."""

import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.time import utc_now
from app.models.time_entry import TimeEntry
from app.repositories.task_repo import TaskRepository
from app.repositories.time_entry_repo import TimeEntryRepository


class TimeService:
    """Service managing timers, manual time logs, and actual_min synchronization."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id
        self.time_repo = TimeEntryRepository(session, user_id)
        self.task_repo = TaskRepository(session, user_id)

    async def get_running_timer(self) -> TimeEntry | None:
        """Retrieve the most recently started timer for legacy clients."""
        return await self.time_repo.get_running_timer()

    async def get_running_timers(self) -> list[TimeEntry]:
        """Retrieve every active timer owned by the user."""
        return list(await self.time_repo.list_running_timers())

    async def start_timer(
        self,
        task_id: uuid.UUID,
        started_at: datetime | None = None,
        entry_id: uuid.UUID | None = None,
    ) -> TimeEntry:
        """Start a task timer; separate tasks may be timed at the same time."""
        running = await self.time_repo.get_running_timer_for_task(task_id)
        if running:
            raise ConflictError(
                f"A timer is already running for this task since {running.started_at}."
            )

        task = await self.task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")

        # If task was pending, advance to in_progress
        if task.status == "pending":
            task.status = "in_progress"
            if not task.started_at:
                task.started_at = started_at or utc_now()

        entry = await self.time_repo.start_timer(
            task_id=task_id,
            started_at=started_at,
            entry_id=entry_id,
        )
        return entry

    async def stop_timer(
        self,
        entry_id: uuid.UUID,
        ended_at: datetime | None = None,
    ) -> TimeEntry:
        """Stop a running timer and update task's actual_min."""
        entry = await self.time_repo.get_by_id(entry_id)
        if not entry:
            raise NotFoundError("Timer entry not found.")
        if entry.ended_at is not None:
            raise ConflictError("Timer is already stopped.")

        stopped = await self.time_repo.stop_timer(entry_id, ended_at=ended_at)
        assert stopped is not None

        # Synchronize task actual_min = sum of all completed durations
        await self._sync_task_actual_min(stopped.task_id)
        return stopped

    async def create_manual_entry(
        self,
        task_id: uuid.UUID,
        started_at: datetime,
        duration_min: int,
        ended_at: datetime | None = None,
        note: str | None = None,
        source: str = "manual",
        entry_id: uuid.UUID | None = None,
    ) -> TimeEntry:
        """Log manual completed time against a task."""
        task = await self.task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")

        entry = await self.time_repo.create_manual_entry(
            task_id=task_id,
            started_at=started_at,
            duration_min=duration_min,
            ended_at=ended_at,
            note=note,
            source=source,
            entry_id=entry_id,
        )
        await self._sync_task_actual_min(task_id)
        return entry

    async def delete_entry(self, entry_id: uuid.UUID) -> None:
        """Soft delete a time entry and re-sum task actual_min."""
        entry = await self.time_repo.get_by_id(entry_id)
        if not entry:
            raise NotFoundError("Time entry not found.")

        task_id = entry.task_id
        await self.time_repo.soft_delete(entry_id)
        await self._sync_task_actual_min(task_id)

    async def _sync_task_actual_min(self, task_id: uuid.UUID) -> None:
        """Recompute actual_min on task as the sum of all active duration_min."""
        task = await self.task_repo.get_by_id(task_id)
        if task:
            total_min = await self.time_repo.get_task_actual_min_sum(task_id)
            task.actual_min = total_min
            await self.session.flush()
