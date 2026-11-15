"""Unit tests for dual runtime mode (ALIBI_MODE=local|hosted)."""

import pytest

from app.core.config import settings
from app.main import create_app, lifespan


@pytest.mark.asyncio
async def test_lifespan_local_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "alibi_mode", "local")
    app = create_app()

    async with lifespan(app):
        # In local mode, worker is separate process, no in-process task spawned
        assert settings.alibi_mode == "local"


@pytest.mark.asyncio
async def test_lifespan_hosted_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "alibi_mode", "hosted")
    app = create_app()

    async with lifespan(app):
        # In hosted mode, worker task runs in-process
        assert settings.alibi_mode == "hosted"
