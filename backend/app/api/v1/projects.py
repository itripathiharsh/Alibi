"""Projects API router (doc 04 §4.3)."""

import uuid
from collections.abc import Sequence

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.errors import NotFoundError
from app.models.project import Project
from app.repositories.project_repo import ProjectRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.project import ProjectCreateRequest, ProjectResponse, ProjectUpdateRequest

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    workspace_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Sequence[Project]:
    """List all active projects."""
    repo = ProjectRepository(db, auth.user_id)
    return await repo.list_active(workspace_id=workspace_id)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreateRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Create a new project."""
    repo = ProjectRepository(db, auth.user_id)
    ws_id = data.workspace_id
    if not ws_id:
        ws_repo = WorkspaceRepository(db)
        default_ws = await ws_repo.get_default(auth.user_id)
        if not default_ws:
            raise NotFoundError("Default workspace not found.")
        ws_id = default_ws.id

    project = Project(
        id=uuid.uuid4(),
        user_id=auth.user_id,
        workspace_id=ws_id,
        category_id=data.category_id,
        name=data.name.strip(),
        description=data.description,
        color=data.color,
        status="active",
    )
    return await repo.create(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdateRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Update an existing project."""
    repo = ProjectRepository(db, auth.user_id)
    project = await repo.get_by_id(project_id)
    if not project:
        raise NotFoundError("Project not found.")

    if data.name is not None:
        project.name = data.name.strip()
    if data.description is not None:
        project.description = data.description
    if data.category_id is not None:
        project.category_id = data.category_id
    if data.color is not None:
        project.color = data.color
    if data.status is not None:
        project.status = data.status

    return await repo.update(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete a project."""
    repo = ProjectRepository(db, auth.user_id)
    deleted = await repo.soft_delete(project_id)
    if not deleted:
        raise NotFoundError("Project not found.")
