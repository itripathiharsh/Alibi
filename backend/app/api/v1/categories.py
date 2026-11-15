"""Category classification endpoints.
Implements FR-CAT-001..003 and AC-M1-9 (system category delete rejection).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import get_category_service, get_current_user
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate
from app.services.category_service import CategoryService

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get(
    "",
    response_model=list[CategoryResponse],
    summary="List active categories",
)
async def list_categories(
    user: Annotated[User, Depends(get_current_user)],
    service: Annotated[CategoryService, Depends(get_category_service)],
) -> list[CategoryResponse]:
    """List all categories for the authenticated owner, ordered by position."""
    cats = await service.list_categories(user.id)
    return [CategoryResponse.model_validate(c) for c in cats]


@router.post(
    "",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create custom category",
)
async def create_category(
    payload: CategoryCreate,
    user: Annotated[User, Depends(get_current_user)],
    service: Annotated[CategoryService, Depends(get_category_service)],
) -> CategoryResponse:
    """Create a new custom user category."""
    cat = await service.create_category(
        user_id=user.id,
        name=payload.name,
        sharing_class=payload.sharing_class,
        external_ai_allowed=payload.external_ai_allowed,
        color=payload.color,
        position=payload.position,
        slug=payload.slug,
    )
    return CategoryResponse.model_validate(cat)


@router.patch(
    "/{category_id}",
    response_model=CategoryResponse,
    summary="Update category",
)
async def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    user: Annotated[User, Depends(get_current_user)],
    service: Annotated[CategoryService, Depends(get_category_service)],
) -> CategoryResponse:
    """Update custom or system category settings."""
    cat = await service.update_category(
        user_id=user.id,
        category_id=category_id,
        name=payload.name,
        sharing_class=payload.sharing_class,
        external_ai_allowed=payload.external_ai_allowed,
        color=payload.color,
        position=payload.position,
    )
    return CategoryResponse.model_validate(cat)


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete category",
)
async def delete_category(
    category_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    service: Annotated[CategoryService, Depends(get_category_service)],
) -> None:
    """Delete category. Fails with 409 Conflict if category is a system category (AC-M1-9)."""
    await service.delete_category(user.id, category_id)
