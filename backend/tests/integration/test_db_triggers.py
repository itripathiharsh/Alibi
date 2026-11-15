"""Integration tests for database triggers and repository row isolation.
Implements AC-DB-3, AC-DB-4, and AC-DB-5.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.repository import BaseRepository
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.workspace import Workspace


@pytest.mark.asyncio
async def test_ac_db_3_trg_sync_bump_increments_version_and_seq(db_session: AsyncSession) -> None:
    """Verify AC-DB-3: trg_sync_bump increments version, updates server_seq, and sets updated_at."""
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"trg-test-{uuid.uuid4().hex[:8]}@example.com",
        password_hash="testhash123456",
    )
    db_session.add(user)
    await db_session.flush()

    workspace = Workspace(
        user_id=user_id,
        name="Original Workspace",
        is_default=True,
    )
    db_session.add(workspace)
    await db_session.flush()
    await db_session.refresh(workspace)

    initial_version = workspace.version
    initial_seq = workspace.server_seq
    initial_updated_at = workspace.updated_at

    # Mutate workspace to trigger trg_sync_bump
    workspace.name = "Updated Workspace Name"
    await db_session.flush()
    await db_session.refresh(workspace)

    assert workspace.version == initial_version + 1, "version must increment by 1"
    assert workspace.server_seq > initial_seq, "server_seq must advance via sync_seq"
    assert workspace.updated_at >= initial_updated_at, "updated_at must update to current timestamp"


@pytest.mark.asyncio
async def test_ac_db_4_audit_log_append_only_trigger(db_session: AsyncSession) -> None:
    """Verify AC-DB-4: audit_log rejects UPDATE and DELETE with exception unless purge flag is enabled."""
    entry = AuditLog(
        action="test_action",
        detail={"note": "immutable entry"},
    )
    db_session.add(entry)
    await db_session.flush()

    # 1. Attempting UPDATE must be rejected by trg_append_only
    with pytest.raises(DBAPIError) as exc_info:
        await db_session.execute(
            text("UPDATE audit_log SET action = 'tampered' WHERE id = :id"),
            {"id": entry.id},
        )
    assert "is append-only" in str(exc_info.value)
    await db_session.rollback()

    # 2. Attempting DELETE must be rejected by trg_append_only
    entry2 = AuditLog(
        action="test_action_2",
        detail={"note": "cannot delete"},
    )
    db_session.add(entry2)
    await db_session.flush()

    with pytest.raises(DBAPIError) as exc_info2:
        await db_session.execute(
            text("DELETE FROM audit_log WHERE id = :id"),
            {"id": entry2.id},
        )
    assert "is append-only" in str(exc_info2.value)


@pytest.mark.asyncio
async def test_ac_db_5_base_repository_enforces_user_isolation(db_session: AsyncSession) -> None:
    """Verify AC-DB-5: BaseRepository strictly confines queries to owning user_id."""
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()

    db_session.add(
        User(id=user_a, email=f"a-{uuid.uuid4().hex[:6]}@example.com", password_hash="h1")
    )
    db_session.add(
        User(id=user_b, email=f"b-{uuid.uuid4().hex[:6]}@example.com", password_hash="h2")
    )
    await db_session.flush()

    # Create workspace for user_a
    ws_a = Workspace(id=uuid.uuid4(), user_id=user_a, name="User A Workspace")
    db_session.add(ws_a)
    await db_session.flush()

    # Repository scoped to user_b attempting to access user_a's workspace
    repo_b = BaseRepository(Workspace, db_session, user_id=user_b)

    # 1. Fetch by ID must return None (IDOR protection)
    found = await repo_b.get_by_id(ws_a.id)
    assert found is None, "Repository scoped to user_b must not read user_a's records"

    # 2. List all must return empty for user_b
    all_b = await repo_b.list_all()
    assert not any(w.id == ws_a.id for w in all_b)

    # 3. Modifying user_a's entity via repo_b must fail
    with pytest.raises(PermissionError):
        await repo_b.update(ws_a)
