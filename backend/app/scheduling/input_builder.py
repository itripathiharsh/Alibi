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
from app.models.learning import MemoryProfile
from app.models.task import Task
from app.models.user import User
from app.scheduling.config import DEFAULT_SESSION_BLOCK_MIN, normalized_working_hours


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
        user = await self.db.get(User, user_id)
        user_settings = user.settings if user else {}
        timezone = user.timezone if user else "UTC"

        profile_stmt = (
            select(MemoryProfile)
            .where(MemoryProfile.user_id == user_id)
            .order_by(MemoryProfile.version.desc())
            .limit(1)
        )
        profile = (await self.db.execute(profile_stmt)).scalar_one_or_none()
        preferences = profile.profile.get("preferences", []) if profile else []
        supported_preferences = [
            preference
            for preference in preferences
            if isinstance(preference, dict) and float(preference.get("confidence", 0)) >= 0.6
        ]
        personal_preference = max(
            supported_preferences,
            key=lambda preference: float(preference.get("confidence", 0)),
            default={},
        )
        preferred_session_min = personal_preference.get("preferred_session_min")
        if not isinstance(preferred_session_min, int) or preferred_session_min <= 0:
            preferred_session_min = DEFAULT_SESSION_BLOCK_MIN
        preferred_hours = personal_preference.get("preferred_hours", [])
        if not isinstance(preferred_hours, list):
            preferred_hours = []

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
            estimate = t.estimate_final_min or t.estimate_user_min
            remaining = max(15, estimate - (t.actual_min or 0)) if estimate else None
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
            "timezone": timezone,
            "working_hours": normalized_working_hours(user_settings.get("working_hours")),
            "min_block_min": user_settings.get("min_block_min", 30),
            "max_daily_focus_min": user_settings.get("max_daily_focus_min", 480),
            "preferred_session_min": min(preferred_session_min, 120),
            "preferred_hours": [
                hour for hour in preferred_hours if isinstance(hour, int) and 0 <= hour <= 23
            ],
            "tasks": task_data,
            "blocked_intervals": event_data,
        }

        # Deterministic SHA-256 hash (sorted keys)
        serialized = json.dumps(snapshot, sort_keys=True)
        input_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()

        return snapshot, input_hash
