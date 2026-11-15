"""ALIBI Analytics API Router."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.schemas.analytics import (
    CategoryWorkloadItem,
    CompletionTrendPoint,
    ConsistencyHeatmapItem,
    EstVsActualItem,
    PeriodType,
    ProductivityScoreResponse,
    ScoreFormulaResponse,
    SummaryMetricsResponse,
    TimeDistributionItem,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=SummaryMetricsResponse)
async def get_summary(
    period: PeriodType = Query("weekly", description="daily, weekly, monthly, or custom"),
    from_date: date | None = Query(
        None, alias="from", description="Start date (YYYY-MM-DD) for custom"
    ),
    to_date: date | None = Query(None, alias="to", description="End date (YYYY-MM-DD) for custom"),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> SummaryMetricsResponse:
    """Retrieve summarized metrics (time spent, completions, pending, overdue, rates) for period."""
    service = AnalyticsService(session)
    return await service.get_summary(
        user_id=auth.user_id,
        period=period,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/productivity-score", response_model=ProductivityScoreResponse)
async def get_productivity_score(
    period: PeriodType = Query(
        "weekly", description="daily (rolling 7d), weekly, monthly, or custom"
    ),
    from_date: date | None = Query(None, alias="from", description="Start date for custom"),
    to_date: date | None = Query(None, alias="to", description="End date for custom"),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> ProductivityScoreResponse:
    """Retrieve transparent productivity score v1 (0-100 or null if insufficient data)."""
    service = AnalyticsService(session)
    return await service.get_productivity_score(
        user_id=auth.user_id,
        period=period,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/formula", response_model=ScoreFormulaResponse)
def get_formula() -> ScoreFormulaResponse:
    """Return the transparent definition and rules of Productivity Score Formula v1."""
    # Instantiated without session because formula is static/versioned
    service = AnalyticsService(None)  # type: ignore[arg-type]
    return service.get_formula()


@router.get("/charts/completion-trend", response_model=list[CompletionTrendPoint])
async def get_completion_trend(
    period: PeriodType = Query("weekly", description="daily, weekly, monthly, or custom"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> list[CompletionTrendPoint]:
    """Retrieve time-series of task completion counts for trend line/bar charts."""
    service = AnalyticsService(session)
    return await service.get_completion_trend(
        user_id=auth.user_id,
        period=period,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/charts/time-distribution", response_model=list[TimeDistributionItem])
async def get_time_distribution(
    period: PeriodType = Query("weekly", description="daily, weekly, monthly, or custom"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> list[TimeDistributionItem]:
    """Retrieve time logged grouped by category with percentages for donut/bar charts."""
    service = AnalyticsService(session)
    return await service.get_time_distribution(
        user_id=auth.user_id,
        period=period,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/charts/consistency-heatmap", response_model=list[ConsistencyHeatmapItem])
async def get_consistency_heatmap(
    days: int = Query(365, ge=7, le=366, description="Days of history (up to 366)"),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> list[ConsistencyHeatmapItem]:
    """Retrieve daily completed tasks and minutes logged for 1-year calendar heatmap."""
    service = AnalyticsService(session)
    return await service.get_consistency_heatmap(
        user_id=auth.user_id,
        days=days,
    )


@router.get("/charts/est-vs-actual", response_model=list[EstVsActualItem])
async def get_est_vs_actual(
    period: PeriodType = Query("weekly", description="daily, weekly, monthly, or custom"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> list[EstVsActualItem]:
    """Retrieve estimated vs actual minutes comparison for completed tasks."""
    service = AnalyticsService(session)
    return await service.get_est_vs_actual(
        user_id=auth.user_id,
        period=period,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/charts/category-workload", response_model=list[CategoryWorkloadItem])
async def get_category_workload(
    period: PeriodType = Query("weekly", description="daily, weekly, monthly, or custom"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> list[CategoryWorkloadItem]:
    """Retrieve category workload metrics (completed, open, and logged minutes)."""
    service = AnalyticsService(session)
    return await service.get_category_workload(
        user_id=auth.user_id,
        period=period,
        from_date=from_date,
        to_date=to_date,
    )
