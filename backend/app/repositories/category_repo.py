"""Category repository managing category classifications and scoping."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.category import Category


class CategoryRepository:
    """Repository managing Category entities with strict user isolation."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_active(self, user_id: uuid.UUID) -> Sequence[Category]:
        """List active categories for user, ordered by position."""
        stmt = (
            select(Category)
            .where(Category.user_id == user_id, Category.deleted_at.is_(None))
            .order_by(Category.position.asc(), Category.name.asc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_by_id(self, user_id: uuid.UUID, category_id: uuid.UUID) -> Category | None:
        """Fetch active category strictly owned by user."""
        stmt = select(Category).where(
            Category.id == category_id,
            Category.user_id == user_id,
            Category.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_slug(self, user_id: uuid.UUID, slug: str) -> Category | None:
        """Fetch active category by slug."""
        stmt = select(Category).where(
            Category.slug == slug,
            Category.user_id == user_id,
            Category.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, category: Category) -> Category:
        """Persist a new category."""
        self.session.add(category)
        await self.session.flush()
        return category

    async def update(self, category: Category) -> Category:
        """Update an existing category."""
        await self.session.flush()
        return category

    async def soft_delete(self, user_id: uuid.UUID, category_id: uuid.UUID) -> Category | None:
        """Soft delete a category by setting deleted_at tombstone."""
        category = await self.get_by_id(user_id, category_id)
        if category:
            category.deleted_at = utc_now()
            await self.session.flush()
        return category
