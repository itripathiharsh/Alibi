"""ALIBI FastAPI Application Entrypoint."""

import asyncio
import json
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, suppress

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router as api_router
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.core.logging import logger, setup_logging


async def in_process_worker_loop() -> None:
    """In-process background loop for hosted mode (Render free 512 MB)."""
    logger.info("Hosted mode active: in-process worker loop started")
    try:
        while True:
            # Placeholder for scheduled periodic jobs / jobs table polling
            await asyncio.sleep(60)
    except asyncio.CancelledError:
        logger.info("Hosted mode worker loop cancelled during shutdown")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan manager handling dual-mode startup and graceful shutdown."""
    setup_logging(is_dev=(settings.alibi_env != "cloud"))
    logger.info(
        "Starting ALIBI Backend",
        mode=settings.alibi_mode,
        env=settings.alibi_env,
        version=settings.app_version,
    )

    worker_task: asyncio.Task[None] | None = None
    if settings.alibi_mode == "hosted":
        worker_task = asyncio.create_task(in_process_worker_loop())
    else:
        logger.info("Local mode active: background worker runs as standalone process")

    yield

    if worker_task:
        worker_task.cancel()
        with suppress(asyncio.CancelledError):
            await worker_task

    logger.info("ALIBI Backend shutdown complete")


def create_app() -> FastAPI:
    """Application factory for FastAPI backend."""
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="ALIBI - Personal productivity and adaptive planning backend",
        lifespan=lifespan,
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.alibi_web_origin, "http://localhost:3000", "*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Error handling and routes
    register_error_handlers(app)
    app.include_router(api_router)

    return app


app = create_app()


def export_openapi(output_path: str = "openapi.json") -> None:
    """Export the OpenAPI schema to JSON."""
    schema = app.openapi()
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2)
    print(f"Exported OpenAPI schema to {output_path}")


if __name__ == "__main__":
    if "--export-openapi" in sys.argv:
        target = "openapi.json"
        idx = sys.argv.index("--export-openapi")
        if len(sys.argv) > idx + 1 and not sys.argv[idx + 1].startswith("--"):
            target = sys.argv[idx + 1]
        export_openapi(target)
    else:
        uvicorn.run(
            "app.main:app",
            host=settings.host,
            port=settings.port,
            reload=(settings.alibi_env == "local"),
        )
