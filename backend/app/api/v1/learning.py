"""Personal Learning Engine API endpoints (doc 07)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.time import utc_now
from app.learning.collector import PLECollector
from app.learning.duration import PLEDurationPredictor
from app.learning.profile import PLEProfileCompiler
from app.learning.recommendations import RecommendationEngine
from app.models.learning import LearnedPattern
from app.models.task import Task
from app.schemas.learning import (
    DurationPredictionRequest,
    DurationPredictionResponse,
    LearnedPatternResponse,
    LearningSignalBatch,
    LearningSignalBatchResponse,
    MemoryProfileResponse,
    RecommendationsResponse,
    ResetLearningResponse,
)

router = APIRouter(prefix="/learning", tags=["Learning"])


@router.get("/profile", response_model=MemoryProfileResponse)
async def get_learning_profile(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemoryProfileResponse:
    """Get the user's compiled learning profile, maturity metrics, and routines."""
    compiler = PLEProfileCompiler(db)
    profile_dict = await compiler.get_latest_profile(auth.user.id)
    if not profile_dict:
        raise HTTPException(status_code=404, detail="Profile not found")
    return MemoryProfileResponse.model_validate(profile_dict)


@router.post("/predict-duration", response_model=DurationPredictionResponse)
async def predict_task_duration(
    body: DurationPredictionRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DurationPredictionResponse:
    """Predict task duration with calibrated confidence intervals (doc 07 §5)."""
    predictor = PLEDurationPredictor(db)
    cat_id = uuid.UUID(body.category_id) if body.category_id else None
    pred = await predictor.predict(
        user_id=auth.user.id,
        category_id=cat_id,
        user_estimate_min=body.user_estimate_min,
        title=body.title,
    )
    return DurationPredictionResponse(
        p50_min=pred.p50_min,
        p10_min=pred.p10_min,
        p90_min=pred.p90_min,
        confidence=pred.confidence,
        maturity_level=pred.maturity_level.value,
        correction_factor=pred.correction_factor,
        explanation=pred.explanation,
    )


@router.get("/patterns", response_model=list[LearnedPatternResponse])
async def list_learned_patterns(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[LearnedPatternResponse]:
    """List active and candidate behavioral patterns (routines, work periods)."""
    stmt = (
        select(LearnedPattern)
        .where(LearnedPattern.user_id == auth.user.id)
        .order_by(LearnedPattern.confidence.desc())
    )
    res = await db.execute(stmt)
    records = res.scalars().all()
    return [
        LearnedPatternResponse(
            id=str(r.id),
            pattern_type=r.pattern_type,
            key=r.key,
            value=r.value,
            sample_count=r.sample_count,
            confidence=float(r.confidence),
            status=r.status,
            first_observed_at=r.first_observed_at,
            last_observed_at=r.last_observed_at,
        )
        for r in records
    ]


@router.post("/signals", response_model=LearningSignalBatchResponse)
async def record_learning_signals(
    body: LearningSignalBatch,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LearningSignalBatchResponse:
    """Store check-in answers, brain-dump review counts and recommendation feedback.

    FR-LEARN-012. Signals carry ids and counts only (never task text). Task ids that do
    not belong to the user are dropped. Nothing is stored while learning is paused.
    """
    if (auth.user.settings or {}).get("learning_paused") is True:
        return LearningSignalBatchResponse(accepted=0)

    task_ids = {s.task_id for s in body.signals if s.task_id is not None}
    owned: set[uuid.UUID] = set()
    if task_ids:
        res = await db.execute(
            select(Task.id).where(Task.user_id == auth.user.id, Task.id.in_(task_ids))
        )
        owned = set(res.scalars().all())

    collector = PLECollector(db)
    now = utc_now()
    for signal in body.signals:
        occurred = signal.occurred_at if signal.occurred_at <= now else now
        await collector.record(
            auth.user.id,
            signal.type,
            dict(signal.data),
            task_id=signal.task_id if signal.task_id in owned else None,
            observed_at=occurred,
        )
    await db.commit()
    return LearningSignalBatchResponse(accepted=len(body.signals))


@router.get("/recommendations", response_model=RecommendationsResponse)
async def get_recommendations(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecommendationsResponse:
    """Up to three recommendations counted from the user's own history (FR-LEARN-013)."""
    return await RecommendationEngine(db).build(auth.user.id, auth.user.timezone)


@router.post("/reset", response_model=ResetLearningResponse)
async def reset_user_learning(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResetLearningResponse:
    """Reset all learned models, patterns, predictions, and profile snapshots (AC-PLE-7)."""
    compiler = PLEProfileCompiler(db)
    await compiler.reset_learning(auth.user.id)
    return ResetLearningResponse(
        status="ok",
        message="Learning profile and learned patterns have been reset to L0 cold start.",
    )
