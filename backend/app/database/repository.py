"""Repository base enforcing mandatory user_id row ownership on all queries.
Implements AC-DB-5 and doc 12 §5 IDOR prevention rules.
"""

import uuid
from collections.abc import Sequence
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.database.base import Base


class BaseRepository[ModelT: Base]:
    """Generic repository enforcing user isolation on all read and write queries."""

    def __init__(
        self, model_class: type[ModelT], session: AsyncSession, user_id: uuid.UUID
    ) -> None:
        self.model_class = model_class
        self.session = session
        self.user_id = user_id

    async def get_by_id(self, entity_id: uuid.UUID, include_deleted: bool = False) -> ModelT | None:
        """Fetch entity by ID, strictly enforcing user_id ownership."""
        model_any = cast(Any, self.model_class)
        stmt = select(self.model_class).where(
            model_any.id == entity_id,
            model_any.user_id == self.user_id,
        )
        if not include_deleted and hasattr(self.model_class, "deleted_at"):
            stmt = stmt.where(model_any.deleted_at.is_(None))

        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(self, include_deleted: bool = False) -> Sequence[ModelT]:
        """List all active entities belonging strictly to the current user."""
        model_any = cast(Any, self.model_class)
        stmt = select(self.model_class).where(model_any.user_id == self.user_id)
        if not include_deleted and hasattr(self.model_class, "deleted_at"):
            stmt = stmt.where(model_any.deleted_at.is_(None))

        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create(self, entity: ModelT) -> ModelT:
        """Persist a new entity, guaranteeing ownership belongs to current user."""
        entity_any = cast(Any, entity)
        if hasattr(entity, "user_id"):
            entity_any.user_id = self.user_id
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def update(self, entity: ModelT) -> ModelT:
        """Update an existing entity after verifying ownership."""
        entity_any = cast(Any, entity)
        if hasattr(entity, "user_id") and entity_any.user_id != self.user_id:
            raise PermissionError("Cannot modify entity belonging to another user.")
        await self.session.flush()
        return entity

    async def soft_delete(self, entity_id: uuid.UUID) -> ModelT | None:
        """Soft-delete an entity by marking deleted_at."""
        entity = await self.get_by_id(entity_id)
        if entity and hasattr(entity, "deleted_at"):
            cast(Any, entity).deleted_at = utc_now()
            await self.session.flush()
        return entity
