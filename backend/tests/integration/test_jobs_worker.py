"""Integration tests for background jobs table and concurrent worker claiming.
Implements AC-M1-6.
"""

import asyncio
import uuid
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import AsyncSessionLocal
from app.models.job import Job
from app.services.job_service import JobService, register_handler


@pytest.mark.asyncio
async def test_ac_m1_6_concurrent_worker_claiming_skip_locked(db_session: AsyncSession) -> None:
    """Verify AC-M1-6: Jobs are processed exactly once with 3 concurrent workers (no duplicate execution)."""
    processed_job_ids: list[int] = []
    lock = asyncio.Lock()

    kind_name = f"test_concurrent_{uuid.uuid4().hex[:8]}"

    @register_handler(kind_name)
    async def handle_job(payload: dict[str, Any]) -> None:
        async with lock:
            processed_job_ids.append(payload["item_id"])

    # 1. Enqueue 9 distinct jobs
    service = JobService(db_session)
    for i in range(1, 10):
        await service.enqueue_job(
            kind=kind_name,
            payload={"item_id": i},
            dedupe_key=f"{kind_name}-item-{i}",
        )
    await db_session.commit()

    # 2. Simulate 3 concurrent workers pulling from the queue
    async def worker_loop(worker_name: str) -> None:
        for _ in range(10):
            async with AsyncSessionLocal() as session:
                job_svc = JobService(session)
                claimed = await job_svc.process_one(worker_id=worker_name)
                await session.commit()
                if not claimed:
                    break

    await asyncio.gather(
        worker_loop("worker-1"),
        worker_loop("worker-2"),
        worker_loop("worker-3"),
    )

    # All 9 items must be processed exactly once without duplication or omission
    assert sorted(processed_job_ids) == list(range(1, 10)), (
        "Each job must be claimed exactly once across all 3 workers"
    )

    # All jobs in database should have status 'done'
    async with AsyncSessionLocal() as session:
        stmt = select(Job).where(Job.kind == kind_name)
        jobs = (await session.execute(stmt)).scalars().all()
        assert len(jobs) == 9
        assert all(j.status == "done" for j in jobs)


@pytest.mark.asyncio
async def test_ac_m1_6_job_retries_and_dead_lettering(db_session: AsyncSession) -> None:
    """Verify AC-M1-6: Failing job retried with backoff and marked dead after max attempts."""

    @register_handler("test_failing_job")
    async def handle_failing(_payload: dict[str, Any]) -> None:
        raise ValueError("Simulated permanent processing failure")

    # Enqueue a job with max_attempts = 2
    service = JobService(db_session)
    job = await service.enqueue_job(
        kind="test_failing_job",
        payload={"task": "fail_me"},
        max_attempts=2,
    )
    await db_session.commit()
    job_id = job.id

    # Attempt 1: Process and fail
    async with AsyncSessionLocal() as session:
        job_svc = JobService(session)
        assert await job_svc.process_one("worker-retry") is True
        await session.commit()

    # Check status: should be 'queued' with attempts=1 and last_error recorded
    async with AsyncSessionLocal() as session:
        j1 = (await session.execute(select(Job).where(Job.id == job_id))).scalar_one()
        assert j1.status == "queued"
        assert j1.attempts == 1
        assert "Simulated permanent processing failure" in (j1.last_error or "")
        # Force run_after to past to simulate backoff passing
        j1.run_after = j1.created_at
        await session.commit()

    # Attempt 2: Process and fail again (hits max_attempts=2) -> transitions to 'dead'
    async with AsyncSessionLocal() as session:
        job_svc = JobService(session)
        assert await job_svc.process_one("worker-retry") is True
        await session.commit()

    # Check status: must be 'dead'
    async with AsyncSessionLocal() as session:
        j2 = (await session.execute(select(Job).where(Job.id == job_id))).scalar_one()
        assert j2.status == "dead"
        assert j2.attempts == 2
        assert j2.finished_at is not None
