"""Job service managing background job enqueueing, SKIP LOCKED claiming, retries, and dead-lettering.
Implements AC-M1-6, doc 03 §3.6, and doc 02 §4.
"""

from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.core.time import utc_now
from app.models.job import Job

# Registry of async handlers: kind -> async fn(payload: dict) -> None
JobHandler = Callable[[dict[str, Any]], Awaitable[None]]
_JOB_HANDLERS: dict[str, JobHandler] = {}


def register_handler(kind: str) -> Callable[[JobHandler], JobHandler]:
    """Decorator to register a job handler for a specific job kind."""

    def decorator(func: JobHandler) -> JobHandler:
        _JOB_HANDLERS[kind] = func
        return func

    return decorator


# Exponential backoff schedule in seconds: attempt 1 -> 1m, 2 -> 5m, 3 -> 15m, 4 -> 30m, 5 -> 60m
BACKOFF_SCHEDULE = [60, 300, 900, 1800, 3600]


class JobService:
    """Service managing database-backed job queues."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def enqueue_job(
        self,
        kind: str,
        payload: dict[str, Any] | None = None,
        dedupe_key: str | None = None,
        run_after: datetime | None = None,
        max_attempts: int = 5,
    ) -> Job:
        """Enqueue a new background job with optional active deduplication."""
        now = utc_now()
        effective_run_after = run_after or now

        if dedupe_key:
            stmt = select(Job).where(
                Job.dedupe_key == dedupe_key,
                Job.status.in_(["queued", "running"]),
            )
            existing = (await self.session.execute(stmt)).scalar_one_or_none()
            if existing:
                return existing

        job = Job(
            kind=kind,
            payload=payload or {},
            dedupe_key=dedupe_key,
            run_after=effective_run_after,
            max_attempts=max_attempts,
            status="queued",
            attempts=0,
            created_at=now,
        )
        self.session.add(job)
        try:
            await self.session.flush()
        except IntegrityError:
            # Active dedupe unique index violation; fetch existing
            await self.session.rollback()
            if dedupe_key:
                stmt = select(Job).where(
                    Job.dedupe_key == dedupe_key,
                    Job.status.in_(["queued", "running"]),
                )
                existing = (await self.session.execute(stmt)).scalar_one_or_none()
                if existing:
                    return existing
            raise

        return job

    async def claim_next_job(self, worker_id: str) -> Job | None:
        """Claim the next ready job atomically using SELECT FOR UPDATE SKIP LOCKED (AC-M1-6)."""
        now = utc_now()
        stmt = (
            select(Job)
            .where(
                Job.status == "queued",
                Job.run_after <= now,
            )
            .order_by(Job.run_after.asc(), Job.id.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        result = await self.session.execute(stmt)
        job = result.scalar_one_or_none()

        if job:
            job.status = "running"
            job.locked_by = worker_id
            job.locked_at = now
            job.attempts += 1
            await self.session.flush()

        return job

    async def complete_job(self, job_id: int) -> None:
        """Mark a job successfully completed."""
        stmt = select(Job).where(Job.id == job_id)
        job = (await self.session.execute(stmt)).scalar_one_or_none()
        if job:
            job.status = "done"
            job.finished_at = utc_now()
            job.locked_by = None
            job.locked_at = None
            await self.session.flush()

    async def fail_job(self, job_id: int, error_message: str) -> None:
        """Record job failure. Retries with backoff or transitions to dead if max attempts reached."""
        stmt = select(Job).where(Job.id == job_id)
        job = (await self.session.execute(stmt)).scalar_one_or_none()
        if not job:
            return

        now = utc_now()
        job.last_error = error_message
        job.locked_by = None
        job.locked_at = None

        if job.attempts >= job.max_attempts:
            # Exceeded maximum allowed attempts -> dead-letter
            job.status = "dead"
            job.finished_at = now
            logger.warning(
                "Job dead-lettered after max attempts",
                job_id=job.id,
                kind=job.kind,
                attempts=job.attempts,
            )
        else:
            # Schedule retry with backoff
            idx = min(job.attempts - 1, len(BACKOFF_SCHEDULE) - 1)
            delay = BACKOFF_SCHEDULE[idx]
            job.status = "queued"
            job.run_after = now + timedelta(seconds=delay)
            logger.info(
                "Job failed, scheduled for retry",
                job_id=job.id,
                kind=job.kind,
                retry_in_sec=delay,
                attempt=job.attempts,
            )

        await self.session.flush()

    async def process_one(self, worker_id: str) -> bool:
        """Claim and execute one pending job. Returns True if a job was processed."""
        job = await self.claim_next_job(worker_id)
        if not job:
            return False

        handler = _JOB_HANDLERS.get(job.kind)
        if not handler:
            await self.fail_job(job.id, f"No handler registered for kind '{job.kind}'")
            return True

        try:
            await handler(job.payload)
            await self.complete_job(job.id)
            return True
        except Exception as exc:
            await self.fail_job(job.id, str(exc))
            return True
