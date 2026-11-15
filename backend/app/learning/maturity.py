"""PLE Maturity Evaluator (doc 07 §3, FR-LEARN-008, AC-PLE-2).

Computes data maturity level (L0, L1, L2, L3) per prediction type and per category.
"""

import uuid
from dataclasses import dataclass
from enum import IntEnum

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task


class MaturityLevel(IntEnum):
    L0_COLD = 0
    L1_STATISTICAL = 1
    L2_ML = 2
    L3_PERSONALISED = 3


@dataclass
class MaturityStatus:
    level: MaturityLevel
    name: str
    sample_count: int
    threshold_next: int | None
    confidence_cap: float


class PLEMaturityEvaluator:
    """Evaluates user data maturity thresholds."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_duration_maturity(
        self, user_id: uuid.UUID, category_id: uuid.UUID | None = None
    ) -> MaturityStatus:
        """Evaluate duration prediction maturity based on completed tasks with actual_min."""
        stmt = select(func.count(Task.id)).where(
            Task.user_id == user_id,
            Task.status == "completed",
            Task.actual_min.isnot(None),
            Task.actual_min > 0,
        )
        if category_id:
            stmt = stmt.where(Task.category_id == category_id)

        res = await self.db.execute(stmt)
        count = res.scalar() or 0

        if count < 5:
            return MaturityStatus(
                level=MaturityLevel.L0_COLD,
                name="Cold",
                sample_count=count,
                threshold_next=5,
                confidence_cap=0.0,
            )
        elif count < 40:
            return MaturityStatus(
                level=MaturityLevel.L1_STATISTICAL,
                name="Statistical",
                sample_count=count,
                threshold_next=40,
                confidence_cap=0.6,
            )
        elif count < 150:
            return MaturityStatus(
                level=MaturityLevel.L2_ML,
                name="ML",
                sample_count=count,
                threshold_next=150,
                confidence_cap=0.85,
            )
        else:
            return MaturityStatus(
                level=MaturityLevel.L3_PERSONALISED,
                name="Personalised ML",
                sample_count=count,
                threshold_next=None,
                confidence_cap=0.95,
            )

    async def get_classification_maturity(self, user_id: uuid.UUID) -> MaturityStatus:
        """Evaluate category/project understanding maturity."""
        stmt = select(func.count(Task.id)).where(
            Task.user_id == user_id, Task.category_id.isnot(None)
        )
        res = await self.db.execute(stmt)
        count = res.scalar() or 0

        if count < 20:
            return MaturityStatus(
                level=MaturityLevel.L0_COLD,
                name="Cold",
                sample_count=count,
                threshold_next=20,
                confidence_cap=0.0,
            )
        elif count < 60:
            return MaturityStatus(
                level=MaturityLevel.L1_STATISTICAL,
                name="Statistical",
                sample_count=count,
                threshold_next=60,
                confidence_cap=0.6,
            )
        else:
            return MaturityStatus(
                level=MaturityLevel.L2_ML,
                name="ML",
                sample_count=count,
                threshold_next=200,
                confidence_cap=0.85,
            )
