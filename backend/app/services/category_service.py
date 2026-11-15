"""Category service managing classifications, privacy levels, and AI gating.
Implements FR-CAT-001..003 and AC-M1-9.
"""

import re
import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.category import Category
from app.repositories.category_repo import CategoryRepository
from app.repositories.workspace_repo import WorkspaceRepository


def slugify(text: str) -> str:
    """Normalize human name to lowercase URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


class CategoryService:
    """Service managing categories with system immutability and user isolation."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.category_repo = CategoryRepository(session)
        self.workspace_repo = WorkspaceRepository(session)

    async def list_categories(self, user_id: uuid.UUID) -> Sequence[Category]:
        """List active categories for user ordered by position."""
        return await self.category_repo.list_active(user_id)

    async def get_category(self, user_id: uuid.UUID, category_id: uuid.UUID) -> Category:
        """Fetch category by ID or raise NotFoundError."""
        cat = await self.category_repo.get_by_id(user_id, category_id)
        if not cat:
            raise NotFoundError(detail="Category not found.", code="category_not_found")
        return cat

    async def create_category(
        self,
        user_id: uuid.UUID,
        name: str,
        sharing_class: str,
        external_ai_allowed: bool = False,
        color: str = "#3B82F6",
        position: int = 0,
        slug: str | None = None,
    ) -> Category:
        """Create a new custom category."""
        computed_slug = slug.strip().lower() if slug else slugify(name)
        if not computed_slug:
            computed_slug = f"cat-{uuid.uuid4().hex[:6]}"

        existing = await self.category_repo.get_by_slug(user_id, computed_slug)
        if existing:
            raise ConflictError(
                detail=f"A category with slug '{computed_slug}' already exists.",
                code="category_slug_exists",
            )

        workspace = await self.workspace_repo.get_default(user_id)
        if not workspace:
            raise NotFoundError(detail="Default workspace not found.")

        category = Category(
            user_id=user_id,
            workspace_id=workspace.id,
            name=name.strip(),
            slug=computed_slug,
            is_system=False,
            sharing_class=sharing_class,
            external_ai_allowed=external_ai_allowed,
            color=color,
            position=position,
        )
        await self.category_repo.create(category)
        return category

    async def update_category(
        self,
        user_id: uuid.UUID,
        category_id: uuid.UUID,
        name: str | None = None,
        sharing_class: str | None = None,
        external_ai_allowed: bool | None = None,
        color: str | None = None,
        position: int | None = None,
    ) -> Category:
        """Update category fields while respecting system category constraints."""
        cat = await self.get_category(user_id, category_id)

        if name is not None:
            cat.name = name.strip()
        if color is not None:
            cat.color = color.strip()
        if external_ai_allowed is not None:
            cat.external_ai_allowed = external_ai_allowed
        if position is not None:
            cat.position = position

        # Custom categories can change sharing_class; system categories maintain their core classification
        if sharing_class is not None and not cat.is_system:
            cat.sharing_class = sharing_class

        await self.category_repo.update(cat)
        return cat

    async def delete_category(self, user_id: uuid.UUID, category_id: uuid.UUID) -> None:
        """Soft delete category. Raises ConflictError if category is a system category (AC-M1-9)."""
        cat = await self.get_category(user_id, category_id)

        # AC-M1-9: System categories cannot be deleted -> 409
        if cat.is_system:
            raise ConflictError(
                detail="System categories are permanent and cannot be deleted.",
                code="system_category_immutable",
            )

        await self.category_repo.soft_delete(user_id, category_id)
