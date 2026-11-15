"""Data Portability and Account Deletion endpoints (doc 12 §8, FR-DATA-001, FR-DATA-003)."""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.security import verify_password
from app.models.calendar import CalendarEvent
from app.models.category import Category
from app.models.project import Project
from app.models.report import Report
from app.models.tag import Tag
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.vault import Note
from app.models.workspace import Workspace

router = APIRouter(prefix="/data", tags=["data"])


class AccountDeleteRequest(BaseModel):
    """Payload to confirm permanent account deletion."""

    password: str = Field(..., description="Current owner password for re-authentication")
    confirm: bool = Field(..., description="Must be set to True to confirm permanent deletion")


@router.get(
    "/export",
    summary="Full data export in JSON (FR-DATA-001)",
    description="Exports all user tasks, projects, categories, notes, time entries, and reports in a portable JSON archive.",
)
async def export_user_data(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Compile and return complete user data archive."""
    user = auth.user
    user_id = user.id

    # 1. Workspaces
    ws_res = await db.execute(select(Workspace).where(Workspace.user_id == user_id))
    workspaces = [
        {"id": str(w.id), "name": w.name, "is_default": w.is_default}
        for w in ws_res.scalars().all()
    ]

    # 2. Categories
    cat_res = await db.execute(select(Category).where(Category.user_id == user_id))
    categories = [
        {
            "id": str(c.id),
            "name": c.name,
            "sharing_class": c.sharing_class,
            "color": c.color,
            "external_ai_allowed": c.external_ai_allowed,
        }
        for c in cat_res.scalars().all()
    ]

    # 3. Projects
    proj_res = await db.execute(select(Project).where(Project.user_id == user_id))
    projects = [
        {
            "id": str(p.id),
            "name": p.name,
            "color": p.color,
            "status": p.status,
            "description": p.description,
        }
        for p in proj_res.scalars().all()
    ]

    # 4. Tags
    tag_res = await db.execute(select(Tag).where(Tag.user_id == user_id))
    tags = [{"id": str(t.id), "name": t.name} for t in tag_res.scalars().all()]

    # 5. Tasks
    task_res = await db.execute(select(Task).where(Task.user_id == user_id))
    tasks = [
        {
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "estimate_min": t.estimate_final_min or t.estimate_user_min,
            "actual_min": t.actual_min,
            "deadline_at": t.deadline_at.isoformat() if t.deadline_at else None,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in task_res.scalars().all()
    ]

    # 6. Time entries
    te_res = await db.execute(select(TimeEntry).where(TimeEntry.user_id == user_id))
    time_entries = [
        {
            "id": str(te.id),
            "task_id": str(te.task_id) if te.task_id else None,
            "started_at": te.started_at.isoformat(),
            "duration_min": te.duration_min,
            "note": te.note,
        }
        for te in te_res.scalars().all()
    ]

    # 7. Calendar Events
    cal_res = await db.execute(select(CalendarEvent).where(CalendarEvent.user_id == user_id))
    calendar_events = [
        {
            "id": str(e.id),
            "title": e.title,
            "kind": e.kind,
            "start_at": e.start_at.isoformat(),
            "end_at": e.end_at.isoformat(),
        }
        for e in cal_res.scalars().all()
    ]

    # 8. Notes
    notes_res = await db.execute(select(Note).where(Note.user_id == user_id))
    notes = [
        {
            "id": str(n.id),
            "title": n.title,
            "body": n.body,
            "source_type": n.source_type,
            "created_at": n.created_at.isoformat(),
        }
        for n in notes_res.scalars().all()
    ]

    # 9. Reports
    rep_res = await db.execute(select(Report).where(Report.user_id == user_id))
    reports = [
        {
            "id": str(r.id),
            "report_type": r.report_type,
            "period_start": r.period_start.isoformat(),
            "period_end": r.period_end.isoformat(),
            "generated_at": r.generated_at.isoformat(),
        }
        for r in rep_res.scalars().all()
    ]

    export_archive = {
        "version": "1.0.0",
        "exported_at": datetime.now(UTC).isoformat(),
        "user": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "timezone": user.timezone,
            "created_at": user.created_at.isoformat(),
        },
        "workspaces": workspaces,
        "categories": categories,
        "projects": projects,
        "tags": tags,
        "tasks": tasks,
        "time_entries": time_entries,
        "calendar_events": calendar_events,
        "notes": notes,
        "reports": reports,
    }

    return export_archive


@router.delete(
    "/account",
    summary="Permanently delete user account and all data (FR-DATA-003)",
    description="Verifies user password and cascade-deletes user record and all associated data with zero data remnants.",
)
async def delete_user_account(
    payload: AccountDeleteRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Cascade-delete the authenticated user account and all data."""
    if not payload.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation is required to delete account permanently.",
        )

    user = auth.user
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Account deletion aborted.",
        )

    # Cascading delete across all user foreign keys
    await db.delete(user)
    await db.commit()

    return {
        "status": "deleted",
        "message": "Account and all associated personal records permanently deleted.",
    }
