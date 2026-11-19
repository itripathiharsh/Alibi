"""Scheduling and Calendar API endpoints (doc 09)."""

import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.calendar_service.conflicts import CalendarConflictService
from app.core.errors import NotFoundError
from app.learning.preferences import PLEPreferenceLearner
from app.models.calendar import CalendarEvent, ScheduleRecommendation
from app.models.user import User
from app.repositories.task_repo import TaskRepository
from app.scheduling.proposal_service import SchedulingProposalService
from app.schemas.notification import ConflictDetectRequest, ConflictResponse
from app.schemas.scheduling import (
    CalendarEventCreate,
    CalendarEventRead,
    FocusProtectionRequest,
    FocusProtectionResponse,
    ProposalDecisionRequest,
    ProposalGenerateRequest,
    ScheduleRecommendationRead,
)

router = APIRouter(prefix="/scheduling", tags=["Scheduling"])


@router.post("/focus-protection", response_model=FocusProtectionResponse)
async def set_focus_protection(
    body: FocusProtectionRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FocusProtectionResponse:
    """Opt in to fixed focus blocks derived from actual timer history and work hours."""
    user: User = auth.user
    settings_data = dict(user.settings or {})
    generated_title = "ALIBI protected focus time"

    if not body.enabled:
        await db.execute(
            delete(CalendarEvent).where(
                CalendarEvent.user_id == user.id,
                CalendarEvent.kind == "fixed_event",
                CalendarEvent.source == "ai_accepted",
                CalendarEvent.title == generated_title,
            )
        )
        settings_data.pop("focus_protection_enabled", None)
        user.settings = settings_data
        await db.flush()
        return FocusProtectionResponse(enabled=False, message="Learned focus blocks were removed.")

    preferences = await PLEPreferenceLearner(db).learn_preferences(user.id, user.timezone)
    preference = next((item for item in preferences if item.preferred_hours), None)
    if preference is None or preference.confidence < 0.5:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ALIBI needs more recorded focus sessions before it can protect a learned hour.",
        )

    try:
        tz = ZoneInfo(user.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        tz = ZoneInfo("UTC")
    focus_hour = preference.preferred_hours[0]
    focus_start = time(hour=focus_hour)
    working_hours = settings_data.get("working_hours", {})
    today = datetime.now(tz).date()
    end_day = today + timedelta(days=365)
    candidates: list[tuple[datetime, datetime]] = []
    conflicts_skipped = 0

    existing_events = list(
        (
            await db.scalars(
                select(CalendarEvent).where(
                    CalendarEvent.user_id == user.id,
                    CalendarEvent.start_at
                    < datetime.combine(end_day, time.max, tzinfo=tz).astimezone(UTC),
                    CalendarEvent.end_at
                    > datetime.combine(today, time.min, tzinfo=tz).astimezone(UTC),
                    CalendarEvent.title != generated_title,
                )
            )
        ).all()
    )
    for offset in range(366):
        work_date = today + timedelta(days=offset)
        day_name = work_date.strftime("%A").lower()
        day_settings = working_hours.get(day_name)
        if not isinstance(day_settings, dict) or not day_settings.get("enabled"):
            continue
        try:
            work_start = time.fromisoformat(str(day_settings["start"]))
            work_end = time.fromisoformat(str(day_settings["end"]))
        except (KeyError, ValueError, TypeError):
            continue
        if not (work_start <= focus_start < work_end):
            continue
        available_min = int(
            (
                datetime.combine(work_date, work_end) - datetime.combine(work_date, focus_start)
            ).total_seconds()
            / 60
        )
        duration_min = min(preference.preferred_session_min, available_min)
        if duration_min <= 0:
            continue
        start_at = datetime.combine(work_date, focus_start, tzinfo=tz).astimezone(UTC)
        end_at = start_at + timedelta(minutes=duration_min)
        if start_at <= datetime.now(UTC):
            continue
        if any(event.start_at < end_at and start_at < event.end_at for event in existing_events):
            conflicts_skipped += 1
            continue
        candidates.append((start_at, end_at))

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No open learned focus slots fit inside your working hours. Review your calendar and work schedule.",
        )

    # Re-enabling replaces the previous generated blocks after the new set is ready.
    await db.execute(
        delete(CalendarEvent).where(
            CalendarEvent.user_id == user.id,
            CalendarEvent.kind == "fixed_event",
            CalendarEvent.source == "ai_accepted",
            CalendarEvent.title == generated_title,
        )
    )
    for start_at, end_at in candidates:
        db.add(
            CalendarEvent(
                user_id=user.id,
                kind="fixed_event",
                source="ai_accepted",
                title=generated_title,
                start_at=start_at,
                end_at=end_at,
                is_all_day=False,
            )
        )
    settings_data["focus_protection_enabled"] = True
    user.settings = settings_data
    await db.flush()
    focus_end_min = focus_hour * 60 + preference.preferred_session_min
    focus_end = f"{(focus_end_min // 60) % 24:02d}:{focus_end_min % 60:02d}"
    return FocusProtectionResponse(
        enabled=True,
        focus_start=f"{focus_hour:02d}:00–{focus_end}",
        session_min=preference.preferred_session_min,
        session_count=preference.session_count,
        blocks_created=len(candidates),
        conflicts_skipped=conflicts_skipped,
        message="Learned focus blocks were added where your calendar and work hours are open.",
    )


@router.post("/proposals/generate", response_model=ScheduleRecommendationRead)
async def generate_schedule_proposal(
    body: ProposalGenerateRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduleRecommendationRead:
    """Generate intelligent schedule proposal respecting hard constraints."""
    service = SchedulingProposalService(db)
    rec = await service.generate_proposal(
        user_id=auth.user.id,
        scope=body.scope,
        horizon_days=body.horizon_days,
    )
    return ScheduleRecommendationRead(
        id=rec.id,
        scope=rec.scope,
        horizon_start=rec.horizon_start,
        horizon_end=rec.horizon_end,
        status=rec.status,
        proposals=rec.proposals,
        displacements=rec.displacements,
        unscheduled=rec.unscheduled,
        solver_status=rec.solver_status,
        solve_ms=rec.solve_ms,
        input_hash=rec.input_hash,
        explanation_text=rec.explanation_text,
    )


@router.get("/proposals/{recommendation_id}", response_model=ScheduleRecommendationRead)
async def get_schedule_proposal(
    recommendation_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduleRecommendationRead:
    """Get schedule recommendation by ID."""
    stmt = select(ScheduleRecommendation).where(
        ScheduleRecommendation.id == recommendation_id,
        ScheduleRecommendation.user_id == auth.user.id,
    )
    res = await db.execute(stmt)
    rec = res.scalar_one_or_none()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Recommendation not found"
        )
    return ScheduleRecommendationRead(
        id=rec.id,
        scope=rec.scope,
        horizon_start=rec.horizon_start,
        horizon_end=rec.horizon_end,
        status=rec.status,
        proposals=rec.proposals,
        displacements=rec.displacements,
        unscheduled=rec.unscheduled,
        solver_status=rec.solver_status,
        solve_ms=rec.solve_ms,
        input_hash=rec.input_hash,
        explanation_text=rec.explanation_text,
    )


@router.post("/proposals/{recommendation_id}/decide", response_model=ScheduleRecommendationRead)
async def decide_schedule_proposal(
    recommendation_id: uuid.UUID,
    body: ProposalDecisionRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduleRecommendationRead:
    """Apply, partially apply, or reject schedule proposal (AC-SCH-4 stale check)."""
    service = SchedulingProposalService(db)
    rec = await service.decide_proposal(
        recommendation_id=recommendation_id,
        user_id=auth.user.id,
        action=body.action,
        accepted_indices=body.accepted_indices,
    )
    return ScheduleRecommendationRead(
        id=rec.id,
        scope=rec.scope,
        horizon_start=rec.horizon_start,
        horizon_end=rec.horizon_end,
        status=rec.status,
        proposals=rec.proposals,
        displacements=rec.displacements,
        unscheduled=rec.unscheduled,
        solver_status=rec.solver_status,
        solve_ms=rec.solve_ms,
        input_hash=rec.input_hash,
        explanation_text=rec.explanation_text,
    )


@router.get("/events", response_model=list[CalendarEventRead])
async def list_calendar_events(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_at: datetime | None = None,
    end_at: datetime | None = None,
) -> list[CalendarEventRead]:
    """List calendar events and scheduled work blocks."""
    stmt = select(CalendarEvent).where(CalendarEvent.user_id == auth.user.id)
    if start_at:
        stmt = stmt.where(CalendarEvent.end_at >= start_at)
    if end_at:
        stmt = stmt.where(CalendarEvent.start_at <= end_at)
    stmt = stmt.order_by(CalendarEvent.start_at.asc())

    res = await db.execute(stmt)
    records = res.scalars().all()
    return [
        CalendarEventRead(
            id=r.id,
            title=r.title,
            kind=r.kind,
            source=r.source,
            start_at=r.start_at,
            end_at=r.end_at,
            is_all_day=r.is_all_day,
            task_id=r.task_id,
        )
        for r in records
    ]


@router.post("/events", response_model=CalendarEventRead, status_code=status.HTTP_201_CREATED)
async def create_calendar_event(
    body: CalendarEventCreate,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CalendarEventRead:
    """Create a fixed calendar event (e.g. meeting, class, appointment)."""
    if body.end_at < body.start_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="end_at must be >= start_at"
        )

    if body.task_id and not await TaskRepository(db, auth.user.id).get_by_id(body.task_id):
        raise NotFoundError("Task not found.")

    ev = CalendarEvent(
        user_id=auth.user.id,
        task_id=body.task_id,
        kind=body.kind,
        source="user",
        title=body.title,
        start_at=body.start_at,
        end_at=body.end_at,
        is_all_day=body.is_all_day,
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return CalendarEventRead(
        id=ev.id,
        title=ev.title,
        kind=ev.kind,
        source=ev.source,
        start_at=ev.start_at,
        end_at=ev.end_at,
        is_all_day=ev.is_all_day,
        task_id=ev.task_id,
    )


@router.post("/conflicts", response_model=list[ConflictResponse])
async def detect_calendar_conflicts(
    body: ConflictDetectRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ConflictResponse]:
    """Detect calendar overlaps, over-capacity days, and deadline violations (AC-M8-4)."""
    service = CalendarConflictService(db)
    conflicts = await service.detect_conflicts(
        user_id=auth.user.id,
        start_at=body.start_at,
        end_at=body.end_at,
        max_daily_minutes=body.max_daily_minutes,
    )
    return [
        ConflictResponse(
            conflict_type=c.conflict_type,
            severity=c.severity,
            description=c.description,
            event_ids=c.event_ids,
            task_id=c.task_id,
            conflict_date=c.conflict_date,
        )
        for c in conflicts
    ]
