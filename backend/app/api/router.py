"""Core API router and health endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.v1.ai import router as ai_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.assistant import router as assistant_router
from app.api.v1.auth import router as auth_router
from app.api.v1.categories import router as categories_router
from app.api.v1.data import router as data_router
from app.api.v1.evidence import router as evidence_router
from app.api.v1.learning import router as learning_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.projects import router as projects_router
from app.api.v1.reports import router as reports_router
from app.api.v1.scheduling import router as scheduling_router
from app.api.v1.sync import router as sync_router
from app.api.v1.tags import router as tags_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.time_entries import router as time_entries_router
from app.api.v1.vault import router as vault_router
from app.api.v1.voice import router as voice_router
from app.core.config import settings
from app.core.errors import ServiceUnavailableError
from app.core.time import format_iso
from app.database.session import ping_database
from app.reports.renderers import render_html_viewer
from app.reports.share_service import ReportShareService

router = APIRouter()
router.include_router(auth_router, prefix="/api/v1")
router.include_router(categories_router, prefix="/api/v1")
router.include_router(projects_router, prefix="/api/v1")
router.include_router(tags_router, prefix="/api/v1")
router.include_router(tasks_router, prefix="/api/v1")
router.include_router(time_entries_router, prefix="/api/v1")
router.include_router(evidence_router, prefix="/api/v1")
router.include_router(analytics_router, prefix="/api/v1")
router.include_router(ai_router, prefix="/api/v1")
router.include_router(voice_router, prefix="/api/v1")
router.include_router(learning_router, prefix="/api/v1")
router.include_router(scheduling_router, prefix="/api/v1")
router.include_router(vault_router, prefix="/api/v1")
router.include_router(assistant_router, prefix="/api/v1")
router.include_router(notifications_router, prefix="/api/v1")
router.include_router(organizations_router, prefix="/api/v1")
router.include_router(reports_router, prefix="/api/v1")
router.include_router(sync_router, prefix="/api/v1")
router.include_router(data_router, prefix="/api/v1")


@router.get("/s/{token}", response_class=HTMLResponse, tags=["Public Share"])
async def view_shared_report(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """Public server-rendered HTML viewer for shared reports (AC-M9-5, doc 10 §6)."""
    service = ReportShareService(db)
    client_ip = request.client.host if request.client else "127.0.0.1"
    ua = request.headers.get("user-agent", "Unknown")

    outcome, share = await service.access_shared_report(
        raw_token=token,
        client_ip=client_ip,
        user_agent=ua,
    )
    await db.commit()

    if outcome == "not_found" or share is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report share link not found"
        )

    if outcome in ("expired", "revoked"):
        error_html = f"""<!DOCTYPE html>
<html><body style="font-family:sans-serif; text-align:center; padding:48px; background:#f8fafc;">
    <h2>Link No Longer Available</h2>
    <p style="color:#64748b;">This verified report share link has {outcome}.</p>
</body></html>"""
        return HTMLResponse(content=error_html, status_code=status.HTTP_410_GONE)

    html_content = render_html_viewer(
        facts=share.shared_facts,
        recipient_label=share.recipient_label,
        expires_at_str=share.expires_at.strftime("%Y-%m-%d %H:%M UTC"),
        scope=share.scope,
    )
    return HTMLResponse(content=html_content, status_code=status.HTTP_200_OK)


class HealthLiveResponse(BaseModel):
    status: str = "ok"


class HealthReadyResponse(BaseModel):
    status: str = "ready"
    database: str = "connected"


class AppMetaResponse(BaseModel):
    name: str
    version: str
    environment: str
    mode: str
    timestamp: str
    timezone: str


@router.get("/health/live", response_model=HealthLiveResponse, tags=["Health"])
async def health_live() -> dict[str, str]:
    """Liveness probe indicating process is responsive."""
    return {"status": "ok"}


@router.get("/health/ready", response_model=HealthReadyResponse, tags=["Health"])
async def health_ready() -> dict[str, str]:
    """Readiness probe indicating application and database dependencies are ready."""
    is_db_ready = await ping_database()
    if not is_db_ready:
        raise ServiceUnavailableError("Database is not reachable")
    return {"status": "ready", "database": "connected"}


@router.get("/api/v1/meta", response_model=AppMetaResponse, tags=["Meta"])
async def api_meta() -> dict[str, str]:
    """Metadata endpoint for clients to verify connectivity and API runtime parameters."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.alibi_env,
        "mode": settings.alibi_mode,
        "timestamp": format_iso(),
        "timezone": settings.alibi_timezone,
    }
