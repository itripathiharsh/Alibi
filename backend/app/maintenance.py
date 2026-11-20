"""Run local-first nightly recurrence and learning maintenance."""

import asyncio
from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import-untyped]
from sqlalchemy import select

from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.database.session import get_engine, get_session_maker
from app.learning.profile import PLEProfileCompiler
from app.models.user import User
from app.services.recurrence_service import RecurrenceService


def create_local_maintenance_scheduler() -> AsyncIOScheduler:
    """Build the worker's single-runner daily maintenance schedule."""
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_nightly_maintenance,
        trigger="interval",
        hours=24,
        id="nightly-user-maintenance",
        next_run_time=datetime.now(UTC),
        max_instances=1,
        coalesce=True,
        misfire_grace_time=None,
    )
    return scheduler


async def run_nightly_maintenance() -> None:
    """Advance approved recurrence rules and refresh profiles from recorded work."""
    session_maker = get_session_maker()
    async with session_maker() as session:
        user_rows = await session.execute(select(User.id, User.timezone))
        users = user_rows.all()

    generated_count = 0
    refreshed_count = 0
    failed_count = 0
    for user_id, timezone in users:
        async with session_maker() as session:
            try:
                generated = await RecurrenceService(session, user_id).generate_instances_ahead(
                    horizon_days=14,
                    tz_name=timezone,
                )
                await session.flush()
                await PLEProfileCompiler(session).compile_profile(user_id)
                await session.commit()
                generated_count += len(generated)
                refreshed_count += 1
            except Exception as exc:
                await session.rollback()
                failed_count += 1
                logger.warning(
                    "Nightly user maintenance failed",
                    user_id=str(user_id),
                    error_type=type(exc).__name__,
                )

    logger.info(
        "Nightly maintenance complete",
        users_refreshed=refreshed_count,
        recurrence_instances_created=generated_count,
        users_failed=failed_count,
    )
    if failed_count:
        raise RuntimeError(f"Nightly maintenance failed for {failed_count} user(s).")


async def _run() -> None:
    setup_logging(is_dev=settings.alibi_env != "cloud")
    try:
        await run_nightly_maintenance()
    finally:
        await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(_run())
