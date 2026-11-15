"""Standalone background worker process for local mode."""

import asyncio
import signal
from contextlib import suppress
from functools import partial
from types import FrameType

from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.database.session import AsyncSessionLocal, ping_database
from app.services.job_service import JobService

_shutdown_event = asyncio.Event()
_worker_id = f"worker-{settings.alibi_mode}-{asyncio.get_event_loop_policy().__class__.__name__}"


def _signal_handler(sig: int, _frame: FrameType | None) -> None:
    """Handle termination signals for clean shutdown."""
    signame = signal.Signals(sig).name
    logger.info("Worker received termination signal", signal=signame)
    _shutdown_event.set()


async def worker_job_cycle() -> None:
    """Single execution cycle of background worker, draining pending jobs."""
    is_ready = await ping_database()
    if not is_ready:
        logger.warning("Database not ready; skipping job cycle")
        return

    logger.debug("Worker checking for queued jobs", worker_id=_worker_id)
    try:
        async with AsyncSessionLocal() as session:
            job_service = JobService(session)
            while not _shutdown_event.is_set():
                processed = await job_service.process_one(_worker_id)
                if not processed:
                    break
                await session.commit()
    except Exception as exc:
        logger.error("Error during worker job cycle", error=str(exc))


async def run_worker() -> None:
    """Main worker entrypoint."""
    setup_logging(is_dev=(settings.alibi_env != "cloud"))
    logger.info(
        "Starting ALIBI Background Worker",
        mode=settings.alibi_mode,
        env=settings.alibi_env,
        version=settings.app_version,
    )

    # Register OS signal handlers if supported (Windows/POSIX)
    loop = asyncio.get_running_loop()
    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            handler = partial(_signal_handler, sig, None)
            loop.add_signal_handler(sig, handler)
    except (NotImplementedError, AttributeError):
        # On Windows, add_signal_handler is not fully implemented for all loops
        signal.signal(signal.SIGINT, _signal_handler)
        signal.signal(signal.SIGTERM, _signal_handler)

    try:
        while not _shutdown_event.is_set():
            await worker_job_cycle()
            with suppress(TimeoutError):
                # Poll interval: wait 30s or until shutdown event is triggered
                await asyncio.wait_for(_shutdown_event.wait(), timeout=30.0)
    finally:
        logger.info("ALIBI Background Worker stopped")


if __name__ == "__main__":
    asyncio.run(run_worker())
