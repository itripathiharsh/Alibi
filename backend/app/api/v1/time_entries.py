"""Time tracking API router (doc 04 §4.5)."""

import uuid
from collections.abc import Sequence

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.models.time_entry import TimeEntry
from app.repositories.time_entry_repo import TimeEntryRepository
from app.schemas.time_entry import (
    TimeEntryManualCreateRequest,
    TimeEntryResponse,
    TimerStartRequest,
    TimerStopRequest,
)
from app.services.time_service import TimeService

router = APIRouter(prefix="/time-entries", tags=["time-tracking"])


@router.post("/start", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def start_timer(
    data: TimerStartRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TimeEntry:
    """Start running timer on a task."""
    service = TimeService(db, auth.user_id)
    return await service.start_timer(
        task_id=data.task_id,
        started_at=data.started_at,
        entry_id=data.id,
    )


@router.post("/{entry_id}/stop", response_model=TimeEntryResponse)
async def stop_timer(
    entry_id: uuid.UUID,
    data: TimerStopRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TimeEntry:
    """Stop an active running timer."""
    service = TimeService(db, auth.user_id)
    return await service.stop_timer(entry_id=entry_id, ended_at=data.ended_at)


@router.post("", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_manual_entry(
    data: TimeEntryManualCreateRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TimeEntry:
    """Log manual time entry against a task."""
    service = TimeService(db, auth.user_id)
    return await service.create_manual_entry(
        task_id=data.task_id,
        started_at=data.started_at,
        duration_min=data.duration_min,
        ended_at=data.ended_at,
        note=data.note,
        source=data.source,
        entry_id=data.id,
    )


@router.get("/running", response_model=TimeEntryResponse | None)
async def get_running_timer(
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TimeEntry | None:
    """Get the currently running timer, or null if no timer is active."""
    service = TimeService(db, auth.user_id)
    return await service.get_running_timer()


@router.get("", response_model=list[TimeEntryResponse])
async def list_time_entries(
    task_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Sequence[TimeEntry]:
    """List time entries for a given task."""
    repo = TimeEntryRepository(db, auth.user_id)
    return await repo.list_for_task(task_id)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_time_entry(
    entry_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete a time entry."""
    service = TimeService(db, auth.user_id)
    await service.delete_entry(entry_id)
