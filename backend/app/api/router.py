"""Core API router and health endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.v1.auth import router as auth_router
from app.api.v1.categories import router as categories_router
from app.core.config import settings
from app.core.errors import ServiceUnavailableError
from app.core.time import format_iso
from app.database.session import ping_database

router = APIRouter()
router.include_router(auth_router, prefix="/api/v1")
router.include_router(categories_router, prefix="/api/v1")


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
