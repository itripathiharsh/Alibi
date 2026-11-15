"""Personal Learning Engine API endpoints (doc 07)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.learning.duration import PLEDurationPredictor
from app.learning.profile import PLEProfileCompiler
from app.models.learning import LearnedPattern
from app.schemas.learning import (
    DurationPredictionRequest,
    DurationPredictionResponse,
    LearnedPatternResponse,
    MemoryProfileResponse,
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
