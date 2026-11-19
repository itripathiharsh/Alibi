"""Vault/task association and completion-log services (FR-PROD-006)."""

import uuid
import hashlib
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.time import utc_now
from app.models.task import Task
from app.models.task_note_link import TaskNoteLink
from app.models.vault import Note, NoteEmbedding
from app.vault.chunking import chunk_text
from app.vault.embeddings import DEFAULT_MODEL, generate_embeddings
from app.vault.ingest import compute_content_hash


async def attach_task_to_note(
    session: AsyncSession,
    user_id: uuid.UUID,
    note_id: uuid.UUID,
    task_id: uuid.UUID,
) -> None:
    """Create an idempotent link after verifying both records belong to this account."""
    note = await session.scalar(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == user_id,
            Note.deleted_at.is_(None),
        )
    )
    task = await session.scalar(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == user_id,
            Task.deleted_at.is_(None),
        )
    )
    if note is None or task is None:
        raise NotFoundError("Task or note not found.")

    exists = await session.scalar(
        select(TaskNoteLink.id).where(
            TaskNoteLink.user_id == user_id,
            TaskNoteLink.note_id == note_id,
            TaskNoteLink.task_id == task_id,
        )
    )
    if exists is None:
        session.add(TaskNoteLink(user_id=user_id, note_id=note_id, task_id=task_id))
        await session.flush()


async def linked_notes_for_tasks(
    session: AsyncSession,
    user_id: uuid.UUID,
    task_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[dict[str, Any]]]:
    """Return note summaries for a task page without exposing another account's rows."""
    if not task_ids:
        return {}
    result = await session.execute(
        select(
            TaskNoteLink.task_id,
            Note.id,
            Note.title,
            Note.source_type,
            Note.occurred_on,
        )
        .join(Note, Note.id == TaskNoteLink.note_id)
        .where(
            TaskNoteLink.user_id == user_id,
            Note.user_id == user_id,
            Note.deleted_at.is_(None),
            TaskNoteLink.task_id.in_(task_ids),
        )
        .order_by(Note.occurred_on.desc(), Note.created_at.desc())
    )
    linked: dict[uuid.UUID, list[dict[str, Any]]] = {}
    for task_id, note_id, title, source_type, occurred_on in result.all():
        linked.setdefault(task_id, []).append(
            {
                "id": note_id,
                "title": title,
                "source_type": source_type,
                "occurred_on": occurred_on,
            }
        )
    return linked


async def append_task_completion(
    session: AsyncSession,
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    task_title: str,
    completed_at: datetime,
) -> None:
    """Append factual task completion entries to linked notes and refresh their search chunks."""
    notes_result = await session.execute(
        select(Note)
        .join(TaskNoteLink, TaskNoteLink.note_id == Note.id)
        .where(
            TaskNoteLink.user_id == user_id,
            TaskNoteLink.task_id == task_id,
            Note.user_id == user_id,
            Note.deleted_at.is_(None),
        )
    )
    notes = notes_result.scalars().all()
    if not notes:
        return

    timestamp = completed_at.isoformat()
    for note in notes:
        entry = f"- {task_title} — {timestamp}"
        section = "## Completed tasks"
        if section in note.body:
            note.body = f"{note.body.rstrip()}\n{entry}"
        else:
            note.body = f"{note.body.rstrip()}\n\n{section}\n{entry}"
        note.content_hash = compute_content_hash(note.title, note.body)
        note.updated_at = utc_now()
        note.embed_status = "pending"

        chunks = chunk_text(
            text=note.body,
            title=note.title,
            source_type=note.source_type,
            occurred_on_str=note.occurred_on.isoformat(),
        )
        vectors = generate_embeddings([chunk.content for chunk in chunks])
        await session.execute(delete(NoteEmbedding).where(NoteEmbedding.note_id == note.id))
        for chunk, vector in zip(chunks, vectors, strict=True):
            chunk_hash = hashlib.sha256(chunk.content.encode("utf-8")).hexdigest()
            session.add(
                NoteEmbedding(
                    user_id=user_id,
                    note_id=note.id,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    embedding=vector,
                    model=DEFAULT_MODEL,
                    content_hash=chunk_hash,
                    meta={
                        "occurred_on": note.occurred_on.isoformat(),
                        "source_type": note.source_type,
                        "category_id": str(note.category_id) if note.category_id else None,
                        "project_id": str(note.project_id) if note.project_id else None,
                        "privacy_class": note.privacy_class,
                    },
                )
            )
        note.embed_status = "done"
    await session.flush()
