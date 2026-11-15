"""Tags API router (doc 04 §4.3)."""

import uuid
from collections.abc import Sequence

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.errors import NotFoundError
from app.models.tag import Tag
from app.repositories.tag_repo import TagRepository
from app.schemas.tag import TagCreateRequest, TagResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
async def list_tags(
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Sequence[Tag]:
    """List all active tags."""
    repo = TagRepository(db, auth.user_id)
    return await repo.list_active()


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    data: TagCreateRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Tag:
    """Create or retrieve a tag."""
    repo = TagRepository(db, auth.user_id)
    return await repo.get_or_create(data.name)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete a tag."""
    repo = TagRepository(db, auth.user_id)
    deleted = await repo.soft_delete(tag_id)
    if not deleted:
        raise NotFoundError("Tag not found.")
