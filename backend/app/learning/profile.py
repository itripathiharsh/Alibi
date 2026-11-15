"""PLE Profile Compiler (doc 07 §9, FR-LEARN-009, AC-PLE-7).

Compiles active patterns, maturity levels, and correction factors into versioned memory profiles.
"""

import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.learning.duration import PLEDurationPredictor
from app.learning.maturity import PLEMaturityEvaluator
from app.learning.preferences import PLEPreferenceLearner
from app.learning.routines import PLERoutineDetector
from app.models.learning import (
    LearnedPattern,
    MemoryProfile,
    MLModel,
    TaskPrediction,
)


class PLEProfileCompiler:
    """Compiles unified user learning profile snapshot."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.maturity_evaluator = PLEMaturityEvaluator(db)
        self.duration_predictor = PLEDurationPredictor(db)
        self.routine_detector = PLERoutineDetector(db)
        self.preference_learner = PLEPreferenceLearner(db)

    async def compile_profile(self, user_id: uuid.UUID) -> MemoryProfile:
        """Compile and persist current memory profile."""
        dur_mat = await self.maturity_evaluator.get_duration_maturity(user_id)
        class_mat = await self.maturity_evaluator.get_classification_maturity(user_id)
        routines = await self.routine_detector.detect_user_routines(user_id)
        preferences = await self.preference_learner.learn_preferences(user_id)

        # Get latest version
        ver_stmt = select(func.max(MemoryProfile.version)).where(MemoryProfile.user_id == user_id)
        ver_res = await self.db.execute(ver_stmt)
        last_ver = ver_res.scalar() or 0
        new_version = last_ver + 1

        profile_data = {
            "version": new_version,
            "compiled_at": utc_now().isoformat(),
            "maturity": {
                "duration": {
                    "level": dur_mat.level.value,
                    "name": dur_mat.name,
                    "sample_count": dur_mat.sample_count,
                    "threshold_next": dur_mat.threshold_next,
                },
                "classification": {
                    "level": class_mat.level.value,
                    "name": class_mat.name,
                    "sample_count": class_mat.sample_count,
                    "threshold_next": class_mat.threshold_next,
                },
            },
            "routines": [
                {
                    "label": r.cluster_label,
                    "periodicity": r.periodicity,
                    "period_days": r.period_days,
                    "confidence": r.confidence,
                    "sample_count": r.sample_count,
                }
                for r in routines
            ],
            "preferences": [
                {
                    "category": p.category,
                    "preferred_session_min": p.preferred_session_min,
                    "preferred_hours": p.preferred_hours,
                    "postponement_rate": p.postponement_rate,
                    "confidence": p.confidence,
                }
                for p in preferences
            ],
        }

        profile = MemoryProfile(
            user_id=user_id,
            version=new_version,
            profile=profile_data,
            computed_at=utc_now(),
        )
        self.db.add(profile)
        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def get_latest_profile(self, user_id: uuid.UUID) -> dict[str, Any] | None:
        """Fetch latest compiled profile data."""
        stmt = (
            select(MemoryProfile)
            .where(MemoryProfile.user_id == user_id)
            .order_by(MemoryProfile.version.desc())
            .limit(1)
        )
        res = await self.db.execute(stmt)
        record = res.scalar_one_or_none()
        if record:
            return record.profile
        # Compile first profile on demand
        new_prof = await self.compile_profile(user_id)
        return new_prof.profile

    async def reset_learning(self, user_id: uuid.UUID) -> None:
        """Reset learned models, patterns, predictions, and profiles (AC-PLE-7)."""
        await self.db.execute(delete(LearnedPattern).where(LearnedPattern.user_id == user_id))
        await self.db.execute(delete(TaskPrediction).where(TaskPrediction.user_id == user_id))
        await self.db.execute(delete(MemoryProfile).where(MemoryProfile.user_id == user_id))
        await self.db.execute(delete(MLModel).where(MLModel.user_id == user_id))
        await self.db.commit()
