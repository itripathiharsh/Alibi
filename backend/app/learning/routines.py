"""PLE Routine Detector (doc 07 §6, FR-LEARN-002, AC-PLE-4).

Detects periodic repeating tasks vs temporary burst clusters.
Enforces span >= 21 days, >= 3 distinct periods, and no 14-day window with > 60% occurrences.
"""

import math
import re
import statistics
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.task import Task


@dataclass
class DetectedRoutine:
    cluster_label: str
    periodicity: str  # "weekly", "every_n_days", "monthly"
    period_days: int
    confidence: float
    status: str  # "candidate" | "active"
    sample_count: int
    first_date: datetime
    last_date: datetime
    is_burst: bool = False


def _wilson_lower_bound(positives: int, total: int, z: float = 1.96) -> float:
    """Calculate 95% Wilson score lower bound for a binomial proportion."""
    if total <= 0:
        return 0.0
    p = min(1.0, max(0.0, positives / total))
    denominator = 1.0 + z**2 / total
    centre = p + z**2 / (2.0 * total)
    variance_term = max(0.0, (p * (1.0 - p) + z**2 / (4.0 * total)) / total)
    spread = z * math.sqrt(variance_term)
    return max(0.0, (centre - spread) / denominator)


class PLERoutineDetector:
    """Detects recurring behavioral routines while rejecting short-term bursts."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def detect_user_routines(self, user_id: uuid.UUID) -> list[DetectedRoutine]:
        """Analyze completed/created tasks to discover valid routines."""
        stmt = (
            select(Task.title, Task.created_at, Task.completed_at)
            .where(Task.user_id == user_id)
            .order_by(Task.created_at.asc())
        )
        res = await self.db.execute(stmt)
        rows = res.all()

        # Group by normalized title tokens
        clusters: dict[str, list[datetime]] = {}
        for r in rows:
            title = r[0]
            # Normalize title to base cluster key
            clean = re.sub(r"[^a-zA-Z\s]", "", title).strip().lower()
            tokens = [t for t in clean.split() if len(t) > 2]
            key = " ".join(sorted(tokens[:4])) if tokens else clean
            if not key:
                continue
            dt = r[1] or r[2] or utc_now()
            clusters.setdefault(key, []).append(dt)

        routines: list[DetectedRoutine] = []

        for key, timestamps in clusters.items():
            if len(timestamps) < 4:
                # Requires at least 4 occurrences (doc 07 §6)
                continue

            timestamps.sort()
            first_dt = timestamps[0]
            last_dt = timestamps[-1]
            span_days = (last_dt - first_dt).total_seconds() / 86400.0

            # 1. Routine vs Burst Rule (doc 07 §6, AC-PLE-4)
            # Must have span >= 21 days
            if span_days < 21.0:
                continue

            # Check distinct weeks covered
            weeks_covered = len({dt.strftime("%Y-%W") for dt in timestamps})
            if weeks_covered < 3:
                continue

            # Check for burst concentration: no single 14-day window containing > 60% of occurrences
            is_burst = False
            total_count = len(timestamps)
            for start_t in timestamps:
                window_end = start_t + timedelta(days=14)
                count_in_window = sum(1 for t in timestamps if start_t <= t <= window_end)
                if count_in_window / total_count > 0.60:
                    is_burst = True
                    break

            if is_burst:
                # Discard burst cluster per AC-PLE-4
                continue

            # 2. Test periodicities: weekly-by-weekday or every-N-days
            gaps_days = [
                (timestamps[i] - timestamps[i - 1]).total_seconds() / 86400.0
                for i in range(1, len(timestamps))
            ]
            mean_gap = float(statistics.mean(gaps_days))
            std_gap = float(statistics.stdev(gaps_days)) if len(gaps_days) > 1 else 0.0
            cv_gap = std_gap / max(0.1, mean_gap)

            if cv_gap < 0.40 and 6.0 <= mean_gap <= 8.5:
                periodicity = "weekly"
                period_days = 7
            elif cv_gap < 0.35:
                periodicity = "every_n_days"
                period_days = max(1, int(round(mean_gap)))
            else:
                periodicity = "weekly"
                period_days = 7

            # Calculate adherence and Wilson score
            total_periods = max(
                weeks_covered, int(math.ceil(span_days / max(1.0, float(period_days))))
            )
            adherence = _wilson_lower_bound(weeks_covered, total_periods)

            # Recency decay
            days_since_last = max(0.0, (utc_now() - last_dt).total_seconds() / 86400.0)
            recency = math.exp(-days_since_last / (3.0 * period_days))
            confidence = min(0.95, adherence * recency)

            status = "active" if confidence >= 0.70 else "candidate"

            routines.append(
                DetectedRoutine(
                    cluster_label=key.title(),
                    periodicity=periodicity,
                    period_days=period_days,
                    confidence=round(confidence, 2),
                    status=status,
                    sample_count=len(timestamps),
                    first_date=first_dt,
                    last_date=last_dt,
                    is_burst=False,
                )
            )

        return routines
