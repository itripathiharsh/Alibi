"""Integration test verifying AC-M1-7 and AC-SEC-6:
Backup -> drop/wipe DB -> restore -> users and categories are identical.
"""

import subprocess
import uuid
from pathlib import Path

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import AsyncSessionLocal
from app.models.category import Category
from app.models.user import User
from app.models.workspace import Workspace


@pytest.mark.asyncio
async def test_ac_m1_7_backup_and_restore_drill(db_session: AsyncSession) -> None:
    """Verify AC-M1-7: Full backup and restore drill reproduces identical users and categories."""
    repo_root = Path(__file__).resolve().parents[3]
    backup_script = repo_root / "infrastructure" / "scripts" / "backup.ps1"
    restore_script = repo_root / "infrastructure" / "scripts" / "restore.ps1"
    dump_file = repo_root / "backups" / f"drill_{uuid.uuid4().hex[:8]}.dump"

    # 1. Seed distinctive user, workspace, and categories
    test_user_id = uuid.uuid4()
    test_user = User(
        id=test_user_id,
        email=f"backup-drill-{uuid.uuid4().hex[:6]}@alibi.local",
        password_hash="argon2_sample_hash",
        display_name="Drill User",
    )
    db_session.add(test_user)
    await db_session.flush()

    ws = Workspace(
        user_id=test_user_id,
        name="Drill Workspace",
        is_default=True,
    )
    db_session.add(ws)
    await db_session.flush()

    cats = [
        Category(
            user_id=test_user_id,
            workspace_id=ws.id,
            name="Drill Professional",
            slug=f"drill-pro-{uuid.uuid4().hex[:4]}",
            sharing_class="professional",
            external_ai_allowed=True,
        ),
        Category(
            user_id=test_user_id,
            workspace_id=ws.id,
            name="Drill Personal",
            slug=f"drill-personal-{uuid.uuid4().hex[:4]}",
            sharing_class="personal",
            external_ai_allowed=False,
        ),
    ]
    for c in cats:
        db_session.add(c)
    await db_session.commit()

    # Query initial counts
    async with AsyncSessionLocal() as session:
        user_count_before = (await session.execute(select(func.count(User.id)))).scalar_one()
        cat_count_before = (await session.execute(select(func.count(Category.id)))).scalar_one()

    # 2. Execute backup.ps1
    try:
        backup_cmd = [
            "pwsh",
            "-File",
            str(backup_script),
            "-OutputFile",
            str(dump_file),
        ]
        subprocess.run(backup_cmd, capture_output=True, text=True, check=True)
        assert dump_file.exists() and dump_file.stat().st_size > 0

        # 3. Wipe database tables
        async with AsyncSessionLocal() as session:
            await session.execute(text("TRUNCATE TABLE users CASCADE"))
            await session.commit()

        # Verify database is now empty
        async with AsyncSessionLocal() as session:
            wiped_users = (await session.execute(select(func.count(User.id)))).scalar_one()
            assert wiped_users == 0

        # 4. Execute restore.ps1
        restore_cmd = [
            "pwsh",
            "-File",
            str(restore_script),
            "-InputFile",
            str(dump_file),
        ]
        subprocess.run(restore_cmd, capture_output=True, text=True, check=True)

        # 5. Verify restored counts and data
        async with AsyncSessionLocal() as session:
            user_count_after = (await session.execute(select(func.count(User.id)))).scalar_one()
            cat_count_after = (await session.execute(select(func.count(Category.id)))).scalar_one()

            assert user_count_after == user_count_before
            assert cat_count_after == cat_count_before

            # Verify specific record
            restored_user = (
                await session.execute(select(User).where(User.id == test_user_id))
            ).scalar_one_or_none()
            assert restored_user is not None
            assert restored_user.email == test_user.email
            assert restored_user.display_name == "Drill User"
    finally:
        if dump_file.exists():
            dump_file.unlink(missing_ok=True)
