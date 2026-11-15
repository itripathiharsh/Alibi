"""PLE Duration Predictor (doc 07 §5, FR-LEARN-004).

Implements hierarchical shrinkage means, personal correction factors,
and quantile prediction on log(actual_min) using Python stdlib statistics.
"""

import math
import statistics
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.learning.maturity import MaturityLevel, PLEMaturityEvaluator
from app.models.task import Task


@dataclass
class DurationPrediction:
    p50_min: int
    p10_min: int | None
    p90_min: int | None
    confidence: float
    maturity_level: MaturityLevel
    correction_factor: float | None = None
    explanation: str | None = None


class PLEDurationPredictor:
    """Predicts task duration based on user historical task actuals."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.maturity_evaluator = PLEMaturityEvaluator(db)

    async def predict(
        self,
        user_id: uuid.UUID,
        category_id: uuid.UUID | None = None,
        user_estimate_min: int | None = None,
        title: str = "",
    ) -> DurationPrediction:
        """Predict task duration with confidence interval."""
        _ = title  # Reserved for TF-IDF / embedding similarity ranking in L2/L3
        maturity = await self.maturity_evaluator.get_duration_maturity(user_id, category_id)

        # L0: Cold start -> rely solely on user estimate if provided
        if maturity.level == MaturityLevel.L0_COLD:
            p50 = user_estimate_min or 30
            return DurationPrediction(
                p50_min=p50,
                p10_min=None,
                p90_min=None,
                confidence=0.0,
                maturity_level=MaturityLevel.L0_COLD,
                explanation="Cold start: insufficient completion history (< 5 completed tasks).",
            )

        # Fetch completed tasks for user
        stmt = select(Task.actual_min, Task.estimate_user_min, Task.category_id).where(
            Task.user_id == user_id,
            Task.status == "completed",
            Task.actual_min.isnot(None),
            Task.actual_min > 0,
        )
        res = await self.db.execute(stmt)
        rows = res.all()

        if not rows:
            return DurationPrediction(
                p50_min=user_estimate_min or 30,
                p10_min=None,
                p90_min=None,
                confidence=0.0,
                maturity_level=MaturityLevel.L0_COLD,
            )

        all_actuals = [r[0] for r in rows if r[0] is not None]
        cat_actuals = [
            r[0] for r in rows if category_id and r[2] == category_id and r[0] is not None
        ]

        # Log-transformed durations
        log_all = [math.log(max(1, a)) for a in all_actuals]
        global_mean_log = float(statistics.mean(log_all))

        k = 5.0
        if cat_actuals:
            log_cat = [math.log(max(1, a)) for a in cat_actuals]
            cat_mean_log = float(statistics.mean(log_cat))
            n_c = float(len(cat_actuals))
            # Hierarchical shrinkage formula: μ = (n_c * mean_c + k * mean_global) / (n_c + k)
            shrunk_mean_log = (n_c * cat_mean_log + k * global_mean_log) / (n_c + k)
            std_log = float(statistics.stdev(log_cat)) if len(log_cat) > 1 else 0.5
        else:
            shrunk_mean_log = global_mean_log
            std_log = float(statistics.stdev(log_all)) if len(log_all) > 1 else 0.5

        # Personal correction factor: median(actual / estimate_user)
        ratios = [r[0] / r[1] for r in rows if r[0] and r[1] and r[1] > 0]
        correction_factor = float(statistics.median(ratios)) if len(ratios) >= 3 else 1.0

        # L1 / L2 calculation
        p50 = int(round(math.exp(shrunk_mean_log)))
        # Adjust p50 if user gave estimate
        if user_estimate_min and user_estimate_min > 0:
            adjusted_by_user = int(round(user_estimate_min * correction_factor))
            # Blend user estimate with shrinkage mean
            p50 = int(round(0.6 * adjusted_by_user + 0.4 * p50))

        p50 = max(5, p50)
        p10 = max(5, int(round(math.exp(shrunk_mean_log - 1.28 * std_log))))
        p90 = max(p50 + 5, int(round(math.exp(shrunk_mean_log + 1.28 * std_log))))

        # Calculate calibrated confidence based on sample count and interval width
        interval_width = (p90 - p10) / max(1.0, float(p50))
        raw_confidence = max(0.1, min(0.9, 1.0 - 0.3 * interval_width))
        final_confidence = min(raw_confidence, maturity.confidence_cap)

        explanation = None
        if correction_factor > 1.2:
            explanation = f"You typically take {correction_factor:.1f}× your estimated time for tasks in this category."

        return DurationPrediction(
            p50_min=p50,
            p10_min=p10,
            p90_min=p90,
            confidence=round(final_confidence, 2),
            maturity_level=maturity.level,
            correction_factor=round(correction_factor, 2) if len(ratios) >= 3 else None,
            explanation=explanation,
        )
