"""TimeEntry repository implementing independent task timers and time logging."""

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.database.repository import BaseRepository
from app.models.time_entry import TimeEntry


class TimeEntryRepository(BaseRepository[TimeEntry]):
    """Repository managing TimeEntry records."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        super().__init__(TimeEntry, session, user_id)

    async def get_running_timer(self) -> TimeEntry | None:
        """Fetch the most recently started active timer for legacy clients."""
        stmt = (
            select(TimeEntry)
            .where(
                TimeEntry.user_id == self.user_id,
                TimeEntry.ended_at.is_(None),
                TimeEntry.deleted_at.is_(None),
            )
            .order_by(TimeEntry.started_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def list_running_timers(self) -> Sequence[TimeEntry]:
        """Fetch every active timer owned by this user, oldest first."""
        stmt = (
            select(TimeEntry)
            .where(
                TimeEntry.user_id == self.user_id,
                TimeEntry.ended_at.is_(None),
                TimeEntry.deleted_at.is_(None),
            )
            .order_by(TimeEntry.started_at.asc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_running_timer_for_task(self, task_id: uuid.UUID) -> TimeEntry | None:
        """Fetch the active timer for one task, if present."""
        stmt = select(TimeEntry).where(
            TimeEntry.user_id == self.user_id,
            TimeEntry.task_id == task_id,
            TimeEntry.ended_at.is_(None),
            TimeEntry.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def start_timer(
        self,
        task_id: uuid.UUID,
        started_at: datetime | None = None,
        entry_id: uuid.UUID | None = None,
    ) -> TimeEntry:
        """Start a new running timer for a task."""
        now = started_at or utc_now()
        entry = TimeEntry(
            id=entry_id or generate_uuid7(),
            user_id=self.user_id,
            task_id=task_id,
            started_at=now,
            ended_at=None,
            duration_min=None,
            source="timer",
        )
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def stop_timer(
        self,
        timer_id: uuid.UUID,
        ended_at: datetime | None = None,
    ) -> TimeEntry | None:
        """Stop a running timer and compute duration in minutes."""
        entry = await self.get_by_id(timer_id)
        if not entry or entry.ended_at is not None:
            return None

        end_time = ended_at or utc_now()
        entry.ended_at = end_time
        # Duration in integer minutes, minimum 1 min if elapsed > 0
        diff_seconds = max(0, int((end_time - entry.started_at).total_seconds()))
        duration_minutes = max(1, round(diff_seconds / 60)) if diff_seconds > 0 else 0
        entry.duration_min = duration_minutes

        await self.session.flush()
        return entry

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
        """Create a completed manual time entry."""
        entry = TimeEntry(
            id=entry_id or generate_uuid7(),
            user_id=self.user_id,
            task_id=task_id,
            started_at=started_at,
            ended_at=ended_at or started_at,
            duration_min=duration_min,
            source=source,
            note=note,
        )
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def list_for_task(self, task_id: uuid.UUID) -> Sequence[TimeEntry]:
        """List all time entries for a given task, newest first."""
        stmt = (
            select(TimeEntry)
            .where(
                TimeEntry.task_id == task_id,
                TimeEntry.user_id == self.user_id,
                TimeEntry.deleted_at.is_(None),
            )
            .order_by(TimeEntry.started_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_task_actual_min_sum(self, task_id: uuid.UUID) -> int:
        """Calculate the sum of all completed duration_min for a task."""
        stmt = select(func.coalesce(func.sum(TimeEntry.duration_min), 0)).where(
            TimeEntry.task_id == task_id,
            TimeEntry.user_id == self.user_id,
            TimeEntry.deleted_at.is_(None),
            TimeEntry.ended_at.is_not(None),
        )
        result = await self.session.execute(stmt)
        val = result.scalar_one()
        return int(val) if val is not None else 0
