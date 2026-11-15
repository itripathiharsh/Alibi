"""Vault Search Service: Keyword, Semantic, and Hybrid (RRF) Retrieval (doc 08 §2/§5).

Provides user-scoped search across Knowledge Vault notes and embeddings
with reciprocal rank fusion, filtering, and strict user isolation.
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Literal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vault import Note, NoteEmbedding
from app.vault.embeddings import generate_embedding


@dataclass
class VaultSearchResult:
    note_id: uuid.UUID
    title: str
    body: str
    snippet: str
    source_type: str
    occurred_on: date
    privacy_class: str
    category_id: uuid.UUID | None
    project_id: uuid.UUID | None
    score: float
    source_id: uuid.UUID | None = None


class VaultSearchService:
    """Service executing multi-modal search over user notes and embeddings."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def search(
        self,
        user_id: uuid.UUID,
        query: str,
        mode: Literal["hybrid", "keyword", "semantic"] = "hybrid",
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        source_type: str | None = None,
        privacy_class: str | None = None,
        limit: int = 12,
    ) -> list[VaultSearchResult]:
        """Search notes using keyword, semantic vector, or hybrid RRF fusion."""
        clean_query = query.strip()
        if not clean_query:
            return []

        if mode == "keyword":
            return await self._keyword_search(
                user_id=user_id,
                query=clean_query,
                start_date=start_date,
                end_date=end_date,
                category_id=category_id,
                project_id=project_id,
                source_type=source_type,
                privacy_class=privacy_class,
                limit=limit,
            )
        elif mode == "semantic":
            return await self._semantic_search(
                user_id=user_id,
                query=clean_query,
                start_date=start_date,
                end_date=end_date,
                category_id=category_id,
                project_id=project_id,
                source_type=source_type,
                privacy_class=privacy_class,
                limit=limit,
            )
        else:
            return await self._hybrid_search(
                user_id=user_id,
                query=clean_query,
                start_date=start_date,
                end_date=end_date,
                category_id=category_id,
                project_id=project_id,
                source_type=source_type,
                privacy_class=privacy_class,
                limit=limit,
            )

    async def _keyword_search(
        self,
        user_id: uuid.UUID,
        query: str,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        source_type: str | None = None,
        privacy_class: str | None = None,
        limit: int = 30,
    ) -> list[VaultSearchResult]:
        """Full-text and trigram search on Note title and body."""
        conditions = [
            Note.user_id == user_id,
            Note.deleted_at.is_(None),
        ]
        if start_date:
            conditions.append(Note.occurred_on >= start_date)
        if end_date:
            conditions.append(Note.occurred_on <= end_date)
        if category_id:
            conditions.append(Note.category_id == category_id)
        if project_id:
            conditions.append(Note.project_id == project_id)
        if source_type:
            conditions.append(Note.source_type == source_type)
        if privacy_class:
            conditions.append(Note.privacy_class == privacy_class)

        # Trigram similarity / ILIKE matching
        ilike_pattern = f"%{query}%"
        match_condition = Note.title.ilike(ilike_pattern) | Note.body.ilike(ilike_pattern)
        conditions.append(match_condition)

        stmt = (
            select(Note)
            .where(and_(*conditions))
            .order_by(Note.occurred_on.desc(), Note.created_at.desc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        notes = res.scalars().all()

        results: list[VaultSearchResult] = []
        for i, note in enumerate(notes):
            # Compute a pseudo score based on position and exact match in title
            score = 1.0 / (i + 1.0)
            if query.lower() in note.title.lower():
                score += 0.5
            snippet = note.body[:240] + ("..." if len(note.body) > 240 else "")
            results.append(
                VaultSearchResult(
                    note_id=note.id,
                    title=note.title,
                    body=note.body,
                    snippet=snippet,
                    source_type=note.source_type,
                    occurred_on=note.occurred_on,
                    privacy_class=note.privacy_class,
                    category_id=note.category_id,
                    project_id=note.project_id,
                    score=score,
                    source_id=note.source_id,
                )
            )
        return results

    async def _semantic_search(
        self,
        user_id: uuid.UUID,
        query: str,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        source_type: str | None = None,
        privacy_class: str | None = None,
        limit: int = 30,
    ) -> list[VaultSearchResult]:
        """Vector similarity search using pgvector cosine distance on NoteEmbedding."""
        query_vec = generate_embedding(query)

        conditions = [
            NoteEmbedding.user_id == user_id,
            Note.deleted_at.is_(None),
        ]
        if start_date:
            conditions.append(Note.occurred_on >= start_date)
        if end_date:
            conditions.append(Note.occurred_on <= end_date)
        if category_id:
            conditions.append(Note.category_id == category_id)
        if project_id:
            conditions.append(Note.project_id == project_id)
        if source_type:
            conditions.append(Note.source_type == source_type)
        if privacy_class:
            conditions.append(Note.privacy_class == privacy_class)

        # Distance expression: NoteEmbedding.embedding.cosine_distance(query_vec)
        # 1 - distance = cosine similarity
        distance_col = NoteEmbedding.embedding.cosine_distance(query_vec)
        stmt = (
            select(Note, NoteEmbedding.content, distance_col.label("distance"))
            .join(Note, NoteEmbedding.note_id == Note.id)
            .where(and_(*conditions))
            .order_by(distance_col.asc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        rows = res.all()

        results: list[VaultSearchResult] = []
        seen_notes: set[uuid.UUID] = set()
        for note, chunk_content, dist in rows:
            if note.id in seen_notes:
                continue
            seen_notes.add(note.id)
            similarity = max(0.0, 1.0 - float(dist if dist is not None else 1.0))
            snippet = chunk_content[:240] + ("..." if len(chunk_content) > 240 else "")
            results.append(
                VaultSearchResult(
                    note_id=note.id,
                    title=note.title,
                    body=note.body,
                    snippet=snippet,
                    source_type=note.source_type,
                    occurred_on=note.occurred_on,
                    privacy_class=note.privacy_class,
                    category_id=note.category_id,
                    project_id=note.project_id,
                    score=similarity,
                    source_id=note.source_id,
                )
            )
        return results

    async def _hybrid_search(
        self,
        user_id: uuid.UUID,
        query: str,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        source_type: str | None = None,
        privacy_class: str | None = None,
        limit: int = 12,
        k: int = 60,
    ) -> list[VaultSearchResult]:
        """Hybrid search with Reciprocal Rank Fusion (RRF)."""
        kw_results = await self._keyword_search(
            user_id=user_id,
            query=query,
            start_date=start_date,
            end_date=end_date,
            category_id=category_id,
            project_id=project_id,
            source_type=source_type,
            privacy_class=privacy_class,
            limit=30,
        )
        sem_results = await self._semantic_search(
            user_id=user_id,
            query=query,
            start_date=start_date,
            end_date=end_date,
            category_id=category_id,
            project_id=project_id,
            source_type=source_type,
            privacy_class=privacy_class,
            limit=30,
        )

        rrf_scores: dict[uuid.UUID, float] = defaultdict(float)
        results_by_id: dict[uuid.UUID, VaultSearchResult] = {}

        for rank, res in enumerate(kw_results):
            rrf_scores[res.note_id] += 1.0 / (k + rank + 1)
            results_by_id[res.note_id] = res

        for rank, res in enumerate(sem_results):
            rrf_scores[res.note_id] += 1.0 / (k + rank + 1)
            if res.note_id not in results_by_id:
                results_by_id[res.note_id] = res

        sorted_ids = sorted(rrf_scores.keys(), key=lambda nid: rrf_scores[nid], reverse=True)
        final_results: list[VaultSearchResult] = []
        for nid in sorted_ids[:limit]:
            item = results_by_id[nid]
            item.score = round(rrf_scores[nid], 6)
            final_results.append(item)

        return final_results
