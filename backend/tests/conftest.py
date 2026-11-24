"""Pytest fixtures and configuration.
Configures NullPool async database session and FastAPI test client.
"""

import tempfile
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.database.session import get_db
from app.main import app

settings.alibi_env = "test"
# Uploaded test files go to a throwaway folder, never into the project tree.
settings.alibi_storage_dir = tempfile.mkdtemp(prefix="alibi-test-storage-")

test_engine = create_async_engine(settings.database_url, poolclass=pool.NullPool)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provides an isolated database session without cross-test connection pool leaks."""
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP test client bound to FastAPI application with test DB override."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
async def auth_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provides an authenticated client with seeded user and default workspace."""
    import uuid

    from app.core.security import create_access_token
    from app.models.category import Category
    from app.models.user import User
    from app.models.workspace import Workspace

    user_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    device_id = uuid.uuid4()

    user = User(
        id=user_id,
        email=f"authtest_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="test-hash",
        display_name="Auth Test User",
        timezone="Asia/Kolkata",
    )
    db_session.add(user)

    workspace = Workspace(
        id=workspace_id,
        user_id=user_id,
        name="Personal Workspace",
        is_default=True,
    )
    db_session.add(workspace)

    category = Category(
        id=uuid.uuid4(),
        user_id=user_id,
        workspace_id=workspace_id,
        name="General",
        slug="general",
        sharing_class="personal",
        color="#3b82f6",
        is_system=True,
        external_ai_allowed=True,
    )
    db_session.add(category)
    await db_session.commit()

    token = create_access_token(user_id=user_id, device_id=device_id)

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as ac:
        ac.user_id = user_id  # type: ignore[attr-defined]
        ac.workspace_id = workspace_id  # type: ignore[attr-defined]
        ac.category_id = category.id  # type: ignore[attr-defined]
        yield ac
    app.dependency_overrides.pop(get_db, None)
