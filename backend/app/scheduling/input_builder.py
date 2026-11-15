"""Input Snapshot Builder for Scheduling Engine (doc 09 §2, AC-SCH-4, AC-SCH-6).

Builds deterministic snapshot of open tasks, fixed events, working hours,
and computes sha256 input_hash.
"""

import hashlib
import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar import CalendarEvent
from app.models.task import Task


class SchedulingInputBuilder:
    """Builds deterministic solver inputs and hash."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def build_snapshot(
        self,
        user_id: uuid.UUID,
        horizon_start: datetime,
        horizon_end: datetime,
    ) -> tuple[dict[str, Any], str]:
        """Query open tasks, fixed events, and generate deterministic sha256 input_hash."""
        # 1. Open tasks
        task_stmt = (
            select(Task)
            .where(
                Task.user_id == user_id,
                Task.status.in_(["pending", "in_progress"]),
            )
            .order_by(Task.deadline_at.asc().nullslast(), Task.priority.asc(), Task.id.asc())
        )
        task_res = await self.db.execute(task_stmt)
        tasks = task_res.scalars().all()

        task_data = []
        for t in tasks:
            remaining = max(
                15, (t.estimate_final_min or t.estimate_user_min or 30) - (t.actual_min or 0)
            )
            task_data.append(
                {
                    "id": str(t.id),
                    "title": t.title,
                    "priority": t.priority or 4,
                    "deadline_at": t.deadline_at.isoformat() if t.deadline_at else None,
                    "deadline_kind": t.deadline_kind or "soft",
                    "remaining_min": remaining,
                }
            )

        # 2. Fixed events and accepted blocks in horizon
        event_stmt = (
            select(CalendarEvent)
            .where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.end_at >= horizon_start,
                CalendarEvent.start_at <= horizon_end,
            )
            .order_by(CalendarEvent.start_at.asc())
        )
        event_res = await self.db.execute(event_stmt)
        events = event_res.scalars().all()

        event_data = []
        for e in events:
            event_data.append(
                {
                    "id": str(e.id),
                    "title": e.title,
                    "kind": e.kind,
                    "start_at": e.start_at.isoformat(),
                    "end_at": e.end_at.isoformat(),
                }
            )

        snapshot = {
            "horizon_start": horizon_start.isoformat(),
            "horizon_end": horizon_end.isoformat(),
            "working_hours": {"start": "09:00", "end": "18:00"},
            "tasks": task_data,
            "blocked_intervals": event_data,
        }

        # Deterministic SHA-256 hash (sorted keys)
        serialized = json.dumps(snapshot, sort_keys=True)
        input_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()

        return snapshot, input_hash
