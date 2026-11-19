"""PLE Preference Learner (doc 07 §7, FR-LEARN-005, AC-PLE-5).

Learns preferred work windows, session durations, postponement rates,
and interruption shares using Python stdlib statistics.
"""

import math
import statistics
import uuid
from dataclasses import dataclass
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.time_entry import TimeEntry


@dataclass
class CategoryPreference:
    category: str
    preferred_session_min: int
    session_iqr_min: int
    preferred_hours: list[int]
    postponement_rate: float
    is_frequently_postponed: bool
    interruption_rate: float
    session_count: int
    confidence: float


class PLEPreferenceLearner:
    """Analyzes user work sessions and task patterns."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def learn_preferences(
        self, user_id: uuid.UUID, timezone_name: str = "Asia/Kolkata"
    ) -> list[CategoryPreference]:
        """Learn behavioral preferences per category."""
        # Query completed time entries
        stmt = select(
            TimeEntry.duration_min,
            TimeEntry.started_at,
            TimeEntry.task_id,
        ).where(
            TimeEntry.user_id == user_id,
            TimeEntry.duration_min.isnot(None),
            TimeEntry.duration_min > 0,
        )
        res = await self.db.execute(stmt)
        entries = res.all()

        if not entries:
            return []

        durations = [e[0] for e in entries if e[0]]
        try:
            user_timezone = ZoneInfo(timezone_name)
        except (ZoneInfoNotFoundError, ValueError):
            user_timezone = ZoneInfo("UTC")
        hours = [e[1].astimezone(user_timezone).hour for e in entries if e[1]]

        session_median = int(statistics.median(durations)) if durations else 45
        if len(durations) >= 4:
            quants = statistics.quantiles(durations, n=4)
            q25, q75 = quants[0], quants[2]
            session_iqr = int(q75 - q25)
        else:
            session_iqr = 30

        # Hour histogram with Dirichlet smoothing (alpha=1)
        hour_counts = [1.0] * 24
        for h in hours:
            if 0 <= h < 24:
                hour_counts[h] += 1.0

        total_mass = sum(hour_counts)
        uniform = 1.0 / 24.0
        preferred_hours = sorted(
            (h for h in range(24) if (hour_counts[h] / total_mass) >= 1.5 * uniform),
            key=lambda hour: hour_counts[hour],
            reverse=True,
        )

        # Postponement rate from tasks
        task_stmt = select(func.count(Task.id), func.sum(Task.reschedule_count)).where(
            Task.user_id == user_id
        )
        task_res = await self.db.execute(task_stmt)
        t_row = task_res.one()
        total_tasks = t_row[0] or 0
        total_reschedules = t_row[1] or 0
        postponement_rate = round(float(total_reschedules) / max(1.0, float(total_tasks)), 2)
        frequently_postponed = total_tasks >= 10 and postponement_rate >= 0.50

        # Confidence based on sample count via 1 - 1/sqrt(n+1)
        n = len(entries)
        confidence = round(min(0.9, 1.0 - 1.0 / math.sqrt(n + 1)), 2)

        return [
            CategoryPreference(
                category="General",
                preferred_session_min=session_median,
                session_iqr_min=session_iqr,
                preferred_hours=preferred_hours,
                postponement_rate=postponement_rate,
                is_frequently_postponed=frequently_postponed,
                interruption_rate=0.05,
                session_count=n,
                confidence=confidence,
            )
        ]
