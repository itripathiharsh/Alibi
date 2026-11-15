"""Integration tests for Categories API and system immutability.
Implements AC-M1-9 and FR-CAT-001..003.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_categories_crud_and_system_protection(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Verify category creation, renaming, and that system categories cannot be deleted (AC-M1-9)."""
    # Clear slate
    await db_session.execute(text("TRUNCATE TABLE users CASCADE"))
    await db_session.commit()

    # 1. Setup owner
    await client.post(
        "/api/v1/auth/setup",
        json={
            "email": "owner@alibi.local",
            "password": "SecurePassword2026!",
            "display_name": "Alibi Owner",
        },
    )

    # 2. Login
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "owner@alibi.local",
            "password": "SecurePassword2026!",
            "device": {"name": "Test Device", "platform": "web"},
        },
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. List categories (must have 4 system categories)
    list_resp = await client.get("/api/v1/categories", headers=headers)
    assert list_resp.status_code == 200
    categories = list_resp.json()
    assert len(categories) == 4

    # 4. AC-M1-9: Attempting to DELETE any system category MUST return 409 Conflict
    system_cat = categories[0]
    assert system_cat["is_system"] is True

    delete_sys_resp = await client.delete(
        f"/api/v1/categories/{system_cat['id']}",
        headers=headers,
    )
    assert delete_sys_resp.status_code == 409
    problem = delete_sys_resp.json()
    assert problem["code"] == "system_category_immutable"

    # 5. Renaming a system category is allowed
    patch_sys_resp = await client.patch(
        f"/api/v1/categories/{system_cat['id']}",
        headers=headers,
        json={"name": "Work & Career"},
    )
    assert patch_sys_resp.status_code == 200
    assert patch_sys_resp.json()["name"] == "Work & Career"

    # 6. Create custom category
    create_custom_resp = await client.post(
        "/api/v1/categories",
        headers=headers,
        json={
            "name": "Side Projects",
            "sharing_class": "learning",
            "external_ai_allowed": True,
            "color": "#EC4899",
            "position": 5,
        },
    )
    assert create_custom_resp.status_code == 201
    custom_cat = create_custom_resp.json()
    assert custom_cat["is_system"] is False
    assert custom_cat["slug"] == "side-projects"

    # 7. Delete custom category succeeds (204)
    del_custom_resp = await client.delete(
        f"/api/v1/categories/{custom_cat['id']}",
        headers=headers,
    )
    assert del_custom_resp.status_code == 204

    # Listing again shows 4 categories
    list_resp_2 = await client.get("/api/v1/categories", headers=headers)
    assert len(list_resp_2.json()) == 4

