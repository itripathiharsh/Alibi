"""Tests for local periodic maintenance registration."""

import pytest

from app.maintenance import create_local_maintenance_scheduler


@pytest.mark.asyncio
async def test_local_maintenance_scheduler_starts_one_immediate_daily_job() -> None:
    scheduler = create_local_maintenance_scheduler()
    scheduler.start(paused=True)
    try:
        job = scheduler.get_job("nightly-user-maintenance")
        assert job is not None
        assert job.max_instances == 1
        assert job.coalesce is True
        assert job.misfire_grace_time is None
        assert job.next_run_time is not None
    finally:
        scheduler.shutdown(wait=False)
