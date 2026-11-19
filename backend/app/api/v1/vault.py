"""Knowledge Vault API endpoints (doc 04, doc 08)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.errors import NotFoundError
from app.core.uuid import generate_uuid7
from app.models.task import Task
from app.models.vault import Note
from app.repositories.category_repo import CategoryRepository
from app.repositories.project_repo import ProjectRepository
from app.schemas.vault import (
    NoteCreateRequest,
    NoteResponse,
    NoteTaskConversionRequest,
    NoteTaskConversionResponse,
    VaultSearchRequest,
    VaultSearchResultResponse,
)
from app.services.task_service import TaskService
from app.vault.ingest import VaultIngestionService
from app.vault.links import attach_task_to_note
from app.vault.search import VaultSearchService

router = APIRouter(prefix="/vault", tags=["Knowledge Vault"])


@router.post("/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    body: NoteCreateRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NoteResponse:
    """Manually create and chunk a note in the personal knowledge vault."""
    if body.category_id and not await CategoryRepository(db).get_by_id(
        auth.user.id, body.category_id
    ):
        raise NotFoundError("Category not found.")
    if body.project_id and not await ProjectRepository(db, auth.user.id).get_by_id(body.project_id):
        raise NotFoundError("Project not found.")
    service = VaultIngestionService(db)
    note = await service.ingest_note(
        user_id=auth.user.id,
        source_type=body.source_type,
        title=body.title,
        body=body.body,
        occurred_on=body.occurred_on,
        category_id=body.category_id,
        project_id=body.project_id,
        privacy_class=body.privacy_class,
    )
    return NoteResponse(
        id=note.id,
        user_id=note.user_id,
        source_type=note.source_type,
        source_id=note.source_id,
        title=note.title,
        body=note.body,
        occurred_on=note.occurred_on,
        category_id=note.category_id,
        project_id=note.project_id,
        task_id=note.task_id,
        privacy_class=note.privacy_class,
        embed_status=note.embed_status,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.get("/notes", response_model=list[NoteResponse])
async def list_notes(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
) -> list[NoteResponse]:
    """List recent knowledge vault notes for current user."""
    stmt = (
        select(Note)
        .where(
            Note.user_id == auth.user.id,
            Note.deleted_at.is_(None),
        )
        .order_by(desc(Note.occurred_on), desc(Note.created_at))
        .limit(limit)
    )
    res = await db.execute(stmt)
    notes = res.scalars().all()
    return [
        NoteResponse(
            id=n.id,
            user_id=n.user_id,
            source_type=n.source_type,
            source_id=n.source_id,
            title=n.title,
            body=n.body,
            occurred_on=n.occurred_on,
            category_id=n.category_id,
            project_id=n.project_id,
            task_id=n.task_id,
            privacy_class=n.privacy_class,
            embed_status=n.embed_status,
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in notes
    ]


@router.get("/notes/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NoteResponse:
    """Fetch one private Vault note for task-to-note navigation."""
    note = await db.scalar(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == auth.user.id,
            Note.deleted_at.is_(None),
        )
    )
    if note is None:
        raise NotFoundError("Note not found.")
    return NoteResponse(
        id=note.id,
        user_id=note.user_id,
        source_type=note.source_type,
        source_id=note.source_id,
        title=note.title,
        body=note.body,
        occurred_on=note.occurred_on,
        category_id=note.category_id,
        project_id=note.project_id,
        task_id=note.task_id,
        privacy_class=note.privacy_class,
        embed_status=note.embed_status,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.post(
    "/notes/{note_id}/convert-task",
    response_model=NoteTaskConversionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def convert_note_to_task(
    note_id: uuid.UUID,
    body: NoteTaskConversionRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NoteTaskConversionResponse:
    """Create a task from a user-selected note line and link it to the source note."""
    note = await db.scalar(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == auth.user.id,
            Note.deleted_at.is_(None),
        )
    )
    if note is None:
        raise NotFoundError("Note not found.")

    task = await db.scalar(
        select(Task).where(Task.id == body.task_id, Task.user_id == auth.user.id)
    )
    if task is None:
        task_id = body.task_id or generate_uuid7()
        task_id_owner = await db.scalar(select(Task.id).where(Task.id == task_id))
        if task_id_owner is not None:
            raise NotFoundError("Task not found.")
        task, _ = await TaskService(db, auth.user.id).capture_task(
            raw_input=body.task_text.strip(),
            task_id=task_id,
            origin="manual",
        )
    await attach_task_to_note(db, auth.user.id, note_id, task.id)
    await db.flush()
    return NoteTaskConversionResponse(
        note_id=note.id,
        task_id=task.id,
        task_title=task.title,
    )


@router.post("/search", response_model=list[VaultSearchResultResponse])
async def search_vault(
    body: VaultSearchRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[VaultSearchResultResponse]:
    """Execute keyword, semantic vector, or hybrid RRF search over user knowledge items."""
    service = VaultSearchService(db)
    results = await service.search(
        user_id=auth.user.id,
        query=body.query,
        mode=body.mode,
        start_date=body.start_date,
        end_date=body.end_date,
        category_id=body.category_id,
        project_id=body.project_id,
        source_type=body.source_type,
        privacy_class=body.privacy_class,
        limit=body.limit,
    )
    return [
        VaultSearchResultResponse(
            note_id=r.note_id,
            title=r.title,
            snippet=r.snippet,
            source_type=r.source_type,
            occurred_on=r.occurred_on,
            privacy_class=r.privacy_class,
            score=r.score,
        )
        for r in results
    ]
