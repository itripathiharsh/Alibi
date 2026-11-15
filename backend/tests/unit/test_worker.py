"""Unit tests for standalone background worker."""

import pytest

from app.worker import _shutdown_event, worker_job_cycle


@pytest.mark.asyncio
async def test_worker_job_cycle_executes(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    async def mock_ping() -> bool:
        nonlocal called
        called = True
        return True

    monkeypatch.setattr("app.worker.ping_database", mock_ping)

    await worker_job_cycle()
    assert called is True


@pytest.mark.asyncio
async def test_shutdown_event_sets_and_clears() -> None:
    _shutdown_event.clear()
    assert not _shutdown_event.is_set()
    _shutdown_event.set()
    assert _shutdown_event.is_set()
    _shutdown_event.clear()
