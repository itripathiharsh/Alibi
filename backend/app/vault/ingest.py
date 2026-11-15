"""Knowledge Vault ingestion service (doc 08 §1, FR-KNOW-001/002).

Provides idempotent ingestion across tasks, completion notes, work logs,
project notes, and manual entries with chunking and pgvector embeddings.
"""

import hashlib
import uuid
from datetime import date
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.vault import Note, NoteEmbedding
from app.vault.chunking import chunk_text
from app.vault.embeddings import DEFAULT_MODEL, generate_embeddings


def compute_content_hash(title: str, body: str) -> str:
    """Compute deterministic SHA-256 hash of note content."""
    combined = f"{title}\n{body}".encode()
    return hashlib.sha256(combined).hexdigest()


class VaultIngestionService:
    """Service managing Knowledge Vault notes and vector embeddings."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def ingest_note(
        self,
        user_id: uuid.UUID,
        source_type: str,
        title: str,
        body: str,
        occurred_on: date,
        source_id: uuid.UUID | None = None,
        category_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        task_id: uuid.UUID | None = None,
        privacy_class: str = "personal",
        category_name: str | None = None,
        project_name: str | None = None,
    ) -> Note:
        """Idempotently ingest or update a note and its vector chunks."""
        content_hash = compute_content_hash(title, body)

        # Check existing note for source_type + source_id
        existing_note: Note | None = None
        if source_id is not None:
            stmt = select(Note).where(
                Note.user_id == user_id,
                Note.source_type == source_type,
                Note.source_id == source_id,
                Note.deleted_at.is_(None),
            )
            res = await self.session.execute(stmt)
            existing_note = res.scalar_one_or_none()

        if existing_note is not None:
            # If content hash hasn't changed, idempotent return
            if existing_note.content_hash == content_hash:
                return existing_note

            # Content updated -> update fields and replace embeddings
            existing_note.title = title
            existing_note.body = body
            existing_note.occurred_on = occurred_on
            existing_note.category_id = category_id
            existing_note.project_id = project_id
            existing_note.task_id = task_id
            existing_note.privacy_class = privacy_class
            existing_note.content_hash = content_hash
            existing_note.embed_status = "pending"
            existing_note.updated_at = utc_now()
            note = existing_note

            # Remove old embeddings
            del_stmt = delete(NoteEmbedding).where(NoteEmbedding.note_id == note.id)
            await self.session.execute(del_stmt)
        else:
            note = Note(
                user_id=user_id,
                source_type=source_type,
                source_id=source_id,
                title=title,
                body=body,
                occurred_on=occurred_on,
                category_id=category_id,
                project_id=project_id,
                task_id=task_id,
                privacy_class=privacy_class,
                content_hash=content_hash,
                embed_status="pending",
            )
            self.session.add(note)
            await self.session.flush()

        # Chunk content
        chunks = chunk_text(
            text=body,
            title=title,
            source_type=source_type,
            occurred_on_str=occurred_on.isoformat(),
            category_name=category_name,
            project_name=project_name,
        )

        # Generate embeddings
        chunk_texts = [c.content for c in chunks]
        vectors = generate_embeddings(chunk_texts)

        # Insert embeddings
        for chunk, vec in zip(chunks, vectors, strict=True):
            chunk_hash = hashlib.sha256(chunk.content.encode("utf-8")).hexdigest()
            meta: dict[str, Any] = {
                "occurred_on": occurred_on.isoformat(),
                "source_type": source_type,
                "category_id": str(category_id) if category_id else None,
                "project_id": str(project_id) if project_id else None,
                "privacy_class": privacy_class,
            }
            emb = NoteEmbedding(
                user_id=user_id,
                note_id=note.id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                embedding=vec,
                model=DEFAULT_MODEL,
                content_hash=chunk_hash,
                meta=meta,
            )
            self.session.add(emb)

        note.embed_status = "done"
        await self.session.flush()
        return note

    async def delete_note_by_source(
        self,
        user_id: uuid.UUID,
        source_type: str,
        source_id: uuid.UUID,
    ) -> bool:
        """Tombstone note and delete embeddings when source is deleted."""
        stmt = select(Note).where(
            Note.user_id == user_id,
            Note.source_type == source_type,
            Note.source_id == source_id,
            Note.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        note = res.scalar_one_or_none()
        if not note:
            return False

        note.deleted_at = utc_now()
        # Delete embeddings
        del_stmt = delete(NoteEmbedding).where(NoteEmbedding.note_id == note.id)
        await self.session.execute(del_stmt)
        await self.session.flush()
        return True
