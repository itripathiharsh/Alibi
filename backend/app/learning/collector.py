"""PLE Event Collector (doc 07 §2, FR-LEARN-001, AC-PLE-1).

Appends immutable observations to behavior_observations in the same transaction.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.learning import BehaviorObservation


class PLECollector:
    """Synchronous behavioral observation recorder."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def record(
        self,
        user_id: uuid.UUID,
        observation_type: str,
        features: dict[str, Any],
        task_id: uuid.UUID | None = None,
        observed_at: datetime | None = None,
    ) -> BehaviorObservation:
        """Append an observation row."""
        obs = BehaviorObservation(
            user_id=user_id,
            task_id=task_id,
            observation_type=observation_type,
            features=features,
            observed_at=observed_at or utc_now(),
            recorded_at=utc_now(),
        )
        self.db.add(obs)
        await self.db.flush()
        return obs

    async def on_task_created(
        self,
        user_id: uuid.UUID,
        task_id: uuid.UUID,
        category: str | None,
        origin: str,
        has_deadline: bool,
        estimate_user_min: int | None = None,
        lead_time_h: float | None = None,
    ) -> BehaviorObservation:
        now = utc_now()
        features = {
            "category": category,
            "origin": origin,
            "has_deadline": has_deadline,
            "estimate_user_min": estimate_user_min,
            "lead_time_h": lead_time_h,
            "hour_local": now.hour,
            "weekday": now.weekday(),
        }
        return await self.record(
            user_id, "task_created", features, task_id=task_id, observed_at=now
        )

    async def on_task_completed(
        self,
        user_id: uuid.UUID,
        task_id: uuid.UUID,
        actual_min: int,
        estimate_final_min: int | None,
        on_time: bool,
        reschedule_count: int = 0,
        sessions_count: int = 1,
    ) -> BehaviorObservation:
        now = utc_now()
        features = {
            "actual_min": actual_min,
            "estimate_final_min": estimate_final_min,
            "on_time": on_time,
            "reschedule_count": reschedule_count,
            "sessions_count": sessions_count,
            "hour_local": now.hour,
            "weekday": now.weekday(),
        }
        return await self.record(
            user_id, "task_completed", features, task_id=task_id, observed_at=now
        )

    async def on_task_rescheduled(
        self,
        user_id: uuid.UUID,
        task_id: uuid.UUID,
        delta_h: float,
        notice_h: float,
        reason: str | None = None,
        actor: str = "user",
    ) -> BehaviorObservation:
        now = utc_now()
        features = {
            "delta_h": delta_h,
            "notice_h": notice_h,
            "reason": reason,
            "actor": actor,
        }
        return await self.record(user_id, "rescheduled", features, task_id=task_id, observed_at=now)

    async def on_time_session(
        self,
        user_id: uuid.UUID,
        task_id: uuid.UUID | None,
        duration_min: int,
        category: str | None = None,
        interrupted: bool = False,
    ) -> BehaviorObservation:
        now = utc_now()
        features = {
            "duration_min": duration_min,
            "category": category,
            "interrupted": interrupted,
            "hour_local": now.hour,
            "weekday": now.weekday(),
        }
        return await self.record(
            user_id, "time_session", features, task_id=task_id, observed_at=now
        )

    async def on_prediction_feedback(
        self,
        user_id: uuid.UUID,
        task_id: uuid.UUID,
        prediction_type: str,
        predicted: Any,
        actual: Any,
        confidence: float,
        accepted: bool,
    ) -> BehaviorObservation:
        now = utc_now()
        features = {
            "prediction_type": prediction_type,
            "predicted": predicted,
            "actual": actual,
            "confidence": confidence,
            "accepted": accepted,
        }
        return await self.record(
            user_id, "prediction_feedback", features, task_id=task_id, observed_at=now
        )
