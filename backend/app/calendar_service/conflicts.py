"""Calendar Conflict Detection Service (doc 01 §2.3, AC-M8-4).

Detects:
1. Overlapping fixed events and work blocks.
2. Over-capacity days exceeding target work hours (e.g. 480 min).
3. Deadline violations (work block scheduled past task deadline).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar import CalendarEvent
from app.models.task import Task


@dataclass
class CalendarConflict:
    conflict_type: str  # 'overlap', 'over_capacity', 'deadline_violated'
    severity: str  # 'error', 'warning'
    description: str
    event_ids: list[uuid.UUID]
    task_id: uuid.UUID | None = None
    conflict_date: date | None = None


class CalendarConflictService:
    """Service detecting schedule and calendar conflicts."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def detect_conflicts(
        self,
        user_id: uuid.UUID,
        start_at: datetime,
        end_at: datetime,
        max_daily_minutes: int = 480,
    ) -> list[CalendarConflict]:
        """Detect all overlapping events, capacity breaches, and deadline conflicts."""
        # 1. Fetch events in window
        stmt = (
            select(CalendarEvent)
            .where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.start_at < end_at,
                CalendarEvent.end_at > start_at,
            )
            .order_by(CalendarEvent.start_at.asc())
        )
        res = await self.session.execute(stmt)
        events = list(res.scalars().all())

        conflicts: list[CalendarConflict] = []

        # Check 1: Overlaps between distinct events
        for i in range(len(events)):
            for j in range(i + 1, len(events)):
                e1 = events[i]
                e2 = events[j]
                if e1.start_at < e2.end_at and e2.start_at < e1.end_at:
                    conflicts.append(
                        CalendarConflict(
                            conflict_type="overlap",
                            severity="error"
                            if e1.kind == "fixed_event" and e2.kind == "fixed_event"
                            else "warning",
                            description=f"Overlap between '{e1.title}' and '{e2.title}'",
                            event_ids=[e1.id, e2.id],
                        )
                    )

        # Check 2: Over-capacity days
        daily_minutes: dict[date, int] = {}
        events_by_date: dict[date, list[uuid.UUID]] = {}
        for ev in events:
            if ev.kind == "work_block":
                d = ev.start_at.date()
                dur = int((ev.end_at - ev.start_at).total_seconds() / 60)
                daily_minutes[d] = daily_minutes.get(d, 0) + dur
                events_by_date.setdefault(d, []).append(ev.id)

        for d, total_m in daily_minutes.items():
            if total_m > max_daily_minutes:
                conflicts.append(
                    CalendarConflict(
                        conflict_type="over_capacity",
                        severity="warning",
                        description=f"Day {d.isoformat()} exceeds capacity: {total_m}m scheduled (limit {max_daily_minutes}m)",
                        event_ids=events_by_date.get(d, []),
                        conflict_date=d,
                    )
                )

        # Check 3: Deadline violation for work blocks
        work_blocks_with_tasks = [
            e for e in events if e.kind == "work_block" and e.task_id is not None
        ]
        if work_blocks_with_tasks:
            task_ids = [e.task_id for e in work_blocks_with_tasks if e.task_id is not None]
            t_stmt = select(Task).where(Task.id.in_(task_ids))
            t_res = await self.session.execute(t_stmt)
            tasks_by_id = {t.id: t for t in t_res.scalars().all()}

            for wb in work_blocks_with_tasks:
                assert wb.task_id is not None
                task = tasks_by_id.get(wb.task_id)
                if task and task.deadline_at and wb.end_at > task.deadline_at:
                    conflicts.append(
                        CalendarConflict(
                            conflict_type="deadline_violated",
                            severity="error",
                            description=f"Work block for '{task.title}' finishes after deadline ({wb.end_at} > {task.deadline_at})",
                            event_ids=[wb.id],
                            task_id=task.id,
                        )
                    )

        return conflicts
