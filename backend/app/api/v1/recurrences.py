"""User-approved recurring task rules."""

import re
import uuid
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.errors import ConflictError
from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.models.recurrence_rule import RecurrenceRule
from app.repositories.subtask_repo import SubtaskRepository
from app.repositories.tag_repo import TagRepository
from app.repositories.task_repo import TaskRepository
from app.schemas.recurrence import RecurrenceCreateRequest, RecurrenceResponse

router = APIRouter(prefix="/recurrences", tags=["Recurrences"])


def _to_response(rule: RecurrenceRule) -> RecurrenceResponse:
    template = rule.template or {}
    frequency = re.search(r"(?:^|;)FREQ=([A-Z]+)", rule.rrule)
    interval = re.search(r"(?:^|;)INTERVAL=(\d+)", rule.rrule)
    frequency_value = frequency.group(1).lower() if frequency else "daily"
    return RecurrenceResponse(
        id=rule.id,
        task_id=uuid.UUID(template["source_task_id"]) if template.get("source_task_id") else None,
        title=str(template.get("title", "")),
        frequency=frequency_value,
        interval=int(interval.group(1)) if interval else 1,
        starts_at=rule.dtstart,
        until_at=rule.until,
        active=rule.active,
        generated_until=rule.generated_until,
    )


@router.get("", response_model=list[RecurrenceResponse])
async def list_recurrences(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    task_id: uuid.UUID | None = Query(None),
) -> list[RecurrenceResponse]:
    stmt = (
        select(RecurrenceRule)
        .where(
            RecurrenceRule.user_id == auth.user_id,
            RecurrenceRule.active.is_(True),
            RecurrenceRule.deleted_at.is_(None),
        )
        .order_by(RecurrenceRule.created_at.asc())
    )
    result = await db.execute(stmt)
    rules = result.scalars().all()
    return [
        _to_response(rule)
        for rule in rules
        if task_id is None or str((rule.template or {}).get("source_task_id")) == str(task_id)
    ]


@router.post("", response_model=RecurrenceResponse, status_code=status.HTTP_201_CREATED)
async def create_recurrence(
    body: RecurrenceCreateRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecurrenceResponse:
    """Create a recurrence only after the user chooses a task and frequency."""
    task = await TaskRepository(db, auth.user_id).get_by_id(body.task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    if body.starts_at <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The first recurring instance must be in the future.",
        )

    existing_rules = await db.execute(
        select(RecurrenceRule).where(
            RecurrenceRule.user_id == auth.user_id,
            RecurrenceRule.active.is_(True),
            RecurrenceRule.deleted_at.is_(None),
        )
    )
    if any(
        str((rule.template or {}).get("source_task_id")) == str(task.id)
        for rule in existing_rules.scalars().all()
    ):
        raise ConflictError("This task already has an active repeat schedule.")

    tag_names = [
        tag.name for tag in await TagRepository(db, auth.user_id).get_tags_for_task(task.id)
    ]
    subtasks = await SubtaskRepository(db, auth.user_id).list_for_task(task.id)
    template: dict[str, Any] = {
        "source_task_id": str(task.id),
        "workspace_id": str(task.workspace_id),
        "category_id": str(task.category_id) if task.category_id else None,
        "project_id": str(task.project_id) if task.project_id else None,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "estimate_user_min": task.estimate_user_min,
        "tags": tag_names,
        "subtasks": [subtask.title for subtask in subtasks],
    }
    if task.deadline_at:
        template["deadline_time"] = task.deadline_at.astimezone(
            ZoneInfo(auth.user.timezone)
        ).strftime("%H:%M")

    rrule_frequency = body.frequency.upper()
    rule = RecurrenceRule(
        id=generate_uuid7(),
        user_id=auth.user_id,
        template=template,
        rrule=f"FREQ={rrule_frequency};INTERVAL={body.interval}",
        dtstart=body.starts_at,
        until=body.until_at,
        active=True,
        source="user",
    )
    db.add(rule)
    await db.flush()
    return _to_response(rule)


@router.delete("/{recurrence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurrence(
    recurrence_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    rule = await db.scalar(
        select(RecurrenceRule).where(
            RecurrenceRule.id == recurrence_id,
            RecurrenceRule.user_id == auth.user_id,
            RecurrenceRule.deleted_at.is_(None),
        )
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurrence not found.")
    rule.active = False
    rule.deleted_at = utc_now()
