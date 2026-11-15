"""Tasks API router (doc 04 §4.4, FR-TASK)."""

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.errors import NotFoundError
from app.models.ai_extraction import AIExtraction
from app.models.subtask import Subtask
from app.models.task import Task
from app.models.task_event import TaskEvent
from app.repositories.ai_extraction_repo import AIExtractionRepository
from app.repositories.subtask_repo import SubtaskRepository
from app.repositories.tag_repo import TagRepository
from app.repositories.task_repo import TaskRepository
from app.schemas.task import (
    SubtaskCreateRequest,
    SubtaskReorderRequest,
    SubtaskResponse,
    SubtaskUpdateRequest,
    TaskCaptureRequest,
    TaskCaptureResponse,
    TaskCreateRequest,
    TaskExtractionDecisionRequest,
    TaskExtractionProposalResponse,
    TaskHistoryEventResponse,
    TaskRescheduleRequest,
    TaskResponse,
    TaskStatusUpdateRequest,
    TaskUpdateRequest,
)
from app.services.dependency_service import DependencyService
from app.services.task_service import TaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def _enrich_task_response(
    task: Task,
    db: AsyncSession,
    user_id: uuid.UUID,
) -> TaskResponse:
    """Populate tags and subtasks for a task response."""
    tag_repo = TagRepository(db, user_id)
    subtask_repo = SubtaskRepository(db, user_id)

    tags = await tag_repo.get_tags_for_task(task.id)
    subtasks = await subtask_repo.list_for_task(task.id)

    resp = TaskResponse.model_validate(task)
    resp.tags = [t.name for t in tags]
    resp.subtasks = [SubtaskResponse.model_validate(s) for s in subtasks]
    return resp


@router.post("/capture", response_model=TaskCaptureResponse, status_code=status.HTTP_201_CREATED)
async def capture_task(
    data: TaskCaptureRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TaskCaptureResponse:
    """Capture task from natural language text (FR-TASK-001, AC-M2-1)."""
    service = TaskService(db, auth.user_id)
    task, extraction = await service.capture_task(
        raw_input=data.raw_input,
        origin=data.origin,
        captured_at=data.captured_at,
        category_hint=data.category_hint,
        task_id=data.id,
    )
    enriched = await _enrich_task_response(task, db, auth.user_id)
    extraction_dto = (
        TaskExtractionProposalResponse.model_validate(extraction) if extraction else None
    )
    return TaskCaptureResponse(
        task=enriched,
        extraction=extraction_dto,
        extraction_status=task.parse_status,
    )


@router.get("/{task_id}/extraction", response_model=TaskExtractionProposalResponse | None)
async def get_task_extraction(
    task_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> AIExtraction | None:
    """Fetch latest extraction proposal for a task."""
    repo = AIExtractionRepository(db, auth.user_id)
    extraction = await repo.get_latest_for_task(task_id)
    if not extraction:
        raise NotFoundError("No extraction proposal found for task.")
    return extraction


@router.post("/{task_id}/extraction/decision", response_model=TaskResponse)
async def decide_task_extraction(
    task_id: uuid.UUID,
    data: TaskExtractionDecisionRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Confirm, correct, or reject proposed extraction fields."""
    task_repo = TaskRepository(db, auth.user_id)
    extraction_repo = AIExtractionRepository(db, auth.user_id)
    task_service = TaskService(db, auth.user_id)

    task = await task_repo.get_by_id(task_id)
    if not task:
        raise NotFoundError("Task not found.")

    extraction = await extraction_repo.get_latest_for_task(task_id)
    if extraction:
        await extraction_repo.record_decision(
            extraction_id=extraction.id,
            user_decision=data.model_dump(),
            status="accepted" if not data.rejected_fields else "corrected",
        )

    # Apply accepted and corrected fields to task
    updates: dict[str, Any] = {}
    updates.update(data.accepted_fields)
    updates.update(data.corrected_fields)
    for field_name in data.rejected_fields:
        updates.pop(field_name, None)

    task.parse_status = "accepted"
    if updates:
        task = await task_service.update_task(task_id, **updates)

    return await _enrich_task_response(task, db, auth.user_id)


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    data: TaskCreateRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Create a task with full fields."""
    service = TaskService(db, auth.user_id)
    task = await service.create_task(
        title=data.title,
        description=data.description,
        category_id=data.category_id,
        project_id=data.project_id,
        priority=data.priority,
        deadline_at=data.deadline_at,
        deadline_kind=data.deadline_kind,
        estimate_user_min=data.estimate_user_min,
        origin=data.origin,
        tags=data.tags,
        subtasks=data.subtasks,
        task_id=data.id,
    )
    return await _enrich_task_response(task, db, auth.user_id)


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    view: str = Query("today", pattern="^(today|upcoming|backlog|completed|all)$"),
    tz: str = Query("Asia/Kolkata"),
    category_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    tag: str | None = None,
    status: str | None = None,
    q: str | None = None,
    from_dt: datetime | None = Query(None, alias="from"),
    to_dt: datetime | None = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> list[TaskResponse]:
    """List tasks by view (Today, Upcoming, Backlog, Completed, All) with filters (AC-M2-6)."""
    repo = TaskRepository(db, auth.user_id)
    tasks = await repo.list_by_view(
        view=view,
        tz_name=tz,
        category_id=category_id,
        project_id=project_id,
        tag=tag,
        status=status,
        search=q,
        from_dt=from_dt,
        to_dt=to_dt,
        limit=limit,
        offset=offset,
    )
    result: list[TaskResponse] = []
    for t in tasks:
        enriched = await _enrich_task_response(t, db, auth.user_id)
        result.append(enriched)
    return result


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Get single task details."""
    repo = TaskRepository(db, auth.user_id)
    task = await repo.get_by_id(task_id)
    if not task:
        raise NotFoundError("Task not found.")
    return await _enrich_task_response(task, db, auth.user_id)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdateRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Update task fields."""
    service = TaskService(db, auth.user_id)
    task = await service.update_task(
        task_id=task_id,
        **data.model_dump(exclude_unset=True),
    )
    return await _enrich_task_response(task, db, auth.user_id)


@router.post("/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: uuid.UUID,
    data: TaskStatusUpdateRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Change task status (AC-M2-3 validated transition table)."""
    service = TaskService(db, auth.user_id)
    task = await service.update_status(
        task_id=task_id,
        new_status=data.status,
        at=data.at,
        completion_note=data.completion_note,
    )
    return await _enrich_task_response(task, db, auth.user_id)


@router.post("/{task_id}/reschedule", response_model=TaskResponse)
async def reschedule_task(
    task_id: uuid.UUID,
    data: TaskRescheduleRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Reschedule task deadline, incrementing reschedule_count (FR-TASK-011)."""
    service = TaskService(db, auth.user_id)
    task = await service.reschedule_task(
        task_id=task_id,
        new_deadline_at=data.new_deadline_at,
        reason=data.reason,
    )
    return await _enrich_task_response(task, db, auth.user_id)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    hard: bool = Query(False),
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete task: soft delete into trash, or hard purge if hard=true."""
    service = TaskService(db, auth.user_id)
    if hard:
        purged = await service.task_repo.hard_delete(task_id)
        if not purged:
            raise NotFoundError("Task not found in trash for permanent purge.")
    else:
        await service.soft_delete_task(task_id)


@router.post("/{task_id}/restore", response_model=TaskResponse)
async def restore_task(
    task_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Restore a task from trash."""
    service = TaskService(db, auth.user_id)
    task = await service.restore_task(task_id)
    return await _enrich_task_response(task, db, auth.user_id)


@router.get("/{task_id}/events", response_model=list[TaskHistoryEventResponse])
async def get_task_history(
    task_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Sequence[TaskEvent]:
    """Fetch chronological activity history for a task (AC-M2-4)."""
    service = TaskService(db, auth.user_id)
    return await service.get_history(task_id, limit=limit)


# --- Subtasks endpoints ---


@router.post(
    "/{task_id}/subtasks", response_model=SubtaskResponse, status_code=status.HTTP_201_CREATED
)
async def add_subtask(
    task_id: uuid.UUID,
    data: SubtaskCreateRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Subtask:
    """Add a subtask to a task."""
    subtask_repo = SubtaskRepository(db, auth.user_id)
    existing = await subtask_repo.list_for_task(task_id)
    subtask = Subtask(
        id=data.id or uuid.uuid4(),
        user_id=auth.user_id,
        task_id=task_id,
        title=data.title.strip(),
        position=len(existing),
    )
    return await subtask_repo.create(subtask)


@router.patch("/{task_id}/subtasks/{subtask_id}", response_model=SubtaskResponse)
async def update_subtask(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    data: SubtaskUpdateRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Subtask:
    """Toggle completion or update title of a subtask."""
    subtask_repo = SubtaskRepository(db, auth.user_id)
    subtask = await subtask_repo.get_by_id(subtask_id)
    if not subtask or subtask.task_id != task_id:
        raise NotFoundError("Subtask not found.")

    if data.completed is not None:
        subtask = await subtask_repo.toggle_complete(subtask_id, data.completed)
        assert subtask is not None
    if data.title is not None:
        subtask.title = data.title.strip()
        await subtask_repo.update(subtask)
    return subtask


@router.post("/{task_id}/subtasks/reorder", response_model=list[SubtaskResponse])
async def reorder_subtasks(
    task_id: uuid.UUID,
    data: SubtaskReorderRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Sequence[Subtask]:
    """Reorder subtasks by ID list."""
    subtask_repo = SubtaskRepository(db, auth.user_id)
    return await subtask_repo.reorder(task_id, data.subtask_ids)


@router.delete("/{task_id}/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a subtask."""
    subtask_repo = SubtaskRepository(db, auth.user_id)
    subtask = await subtask_repo.get_by_id(subtask_id)
    if not subtask or subtask.task_id != task_id:
        raise NotFoundError("Subtask not found.")
    await subtask_repo.soft_delete(subtask_id)


# --- Dependencies endpoints ---


@router.post("/{task_id}/dependencies", status_code=status.HTTP_201_CREATED)
async def add_task_dependency(
    task_id: uuid.UUID,
    depends_on_task_id: uuid.UUID = Query(...),
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Add a dependency (task_id depends on depends_on_task_id) with cycle check (AC-M2-7)."""
    service = DependencyService(db, auth.user_id)
    await service.add_dependency(task_id, depends_on_task_id)
    return {"status": "created"}


@router.delete(
    "/{task_id}/dependencies/{depends_on_task_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_task_dependency(
    task_id: uuid.UUID,
    depends_on_task_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a dependency edge."""
    service = DependencyService(db, auth.user_id)
    await service.remove_dependency(task_id, depends_on_task_id)
