"""Standalone background worker process for local mode."""

import asyncio
import signal
from contextlib import suppress
from functools import partial
from types import FrameType

from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.database.session import ping_database

_shutdown_event = asyncio.Event()


def _signal_handler(sig: int, _frame: FrameType | None) -> None:
    """Handle termination signals for clean shutdown."""
    signame = signal.Signals(sig).name
    logger.info("Worker received termination signal", signal=signame)
    _shutdown_event.set()


async def worker_job_cycle() -> None:
    """Single execution cycle of background worker."""
    is_ready = await ping_database()
    logger.info("Worker heartbeat", db_connected=is_ready, mode=settings.alibi_mode)


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
