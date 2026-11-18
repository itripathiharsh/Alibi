"""Integration tests for Authentication & Identity API.
Implements AC-M1-2, AC-M1-3, AC-M1-4, AC-M1-9, and AC-SEC-2.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.task import Task
from app.models.workspace import Workspace


@pytest.mark.asyncio
async def test_auth_full_lifecycle(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify setup, login, token rotation, reuse mitigation, devices, and password change."""
    # Ensure fresh slate by clearing any user data
    await db_session.execute(text("TRUNCATE TABLE users CASCADE"))
    await db_session.commit()

    # 1. Setup Status initially needs setup
    resp = await client.get("/api/v1/auth/setup-status")
    assert resp.status_code == 200
    assert resp.json()["needs_setup"] is True

    # 2. AC-M1-2: Initial Setup
    setup_payload = {
        "email": "owner@alibi.local",
        "password": "SecurePassword2026!",
        "display_name": "Alibi Owner",
    }
    setup_resp = await client.post("/api/v1/auth/setup", json=setup_payload)
    assert setup_resp.status_code == 201
    user_data = setup_resp.json()
    assert user_data["email"] == "owner@alibi.local"
    assert user_data["display_name"] == "Alibi Owner"

    # Setup status is now false
    resp_after = await client.get("/api/v1/auth/setup-status")
    assert resp_after.json()["needs_setup"] is False

    # 3. AC-M1-2: Second attempt at setup MUST return 403 Forbidden
    second_setup = await client.post(
        "/api/v1/auth/setup",
        json={
            "email": "intruder@alibi.local",
            "password": "IntruderPassword2026!",
        },
    )
    assert second_setup.status_code == 403
    problem = second_setup.json()
    assert problem["code"] == "setup_already_completed"

    # 4. AC-M1-9: Verify 4 system categories exist for owner
    # First login to obtain access token
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "owner@alibi.local",
            "password": "SecurePassword2026!",
            "device": {"name": "Test Laptop", "platform": "web"},
        },
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    access_token = tokens["access_token"]
    refresh_token_1 = tokens["refresh_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # Query /categories
    cat_resp = await client.get("/api/v1/categories", headers=headers)
    assert cat_resp.status_code == 200
    categories = cat_resp.json()
    assert len(categories) == 4

    slugs = {c["slug"] for c in categories}
    assert slugs == {"professional", "academic", "personal", "learning"}

    personal_cat = next(c for c in categories if c["slug"] == "personal")
    assert personal_cat["sharing_class"] == "personal"
    assert personal_cat["external_ai_allowed"] is False
    assert personal_cat["is_system"] is True

    pro_cat = next(c for c in categories if c["slug"] == "professional")
    assert pro_cat["sharing_class"] == "professional"
    assert pro_cat["external_ai_allowed"] is True
    assert pro_cat["is_system"] is True

    # 5. Invalid credentials return 401
    bad_login = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "owner@alibi.local",
            "password": "WrongPassword1234!",
            "device": {"name": "Test Laptop", "platform": "web"},
        },
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["code"] == "invalid_credentials"

    # 6. AC-M1-3: Refresh token rotation
    refresh_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token_1},
    )
    assert refresh_resp.status_code == 200
    rotated_tokens = refresh_resp.json()
    refresh_token_2 = rotated_tokens["refresh_token"]
    assert refresh_token_2 != refresh_token_1

    # 7. AC-M1-3 / AC-SEC-2: Reuse of old refresh token (refresh_token_1) MUST trigger 401 token_reused
    reused_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token_1},
    )
    assert reused_resp.status_code == 401
    reused_problem = reused_resp.json()
    assert reused_problem["code"] == "token_reused"

    # All tokens in the family are now revoked! Attempting refresh with refresh_token_2 must also fail
    revoked_family_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token_2},
    )
    assert revoked_family_resp.status_code == 401
    assert revoked_family_resp.json()["code"] == "token_reused"

    # 8. Re-authenticate to test /auth/me, /auth/devices, and password change
    login_resp_2 = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "owner@alibi.local",
            "password": "SecurePassword2026!",
            "device": {"name": "Phone App", "platform": "android", "app_version": "1.0.0"},
        },
    )
    assert login_resp_2.status_code == 200
    new_access_token = login_resp_2.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {new_access_token}"}

    # /auth/me
    me_resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "owner@alibi.local"

    # /auth/devices
    dev_resp = await client.get("/api/v1/auth/devices", headers=auth_headers)
    assert dev_resp.status_code == 200
    devs = dev_resp.json()
    assert len(devs) >= 1

    # /auth/change-password
    pw_resp = await client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers,
        json={
            "current_password": "SecurePassword2026!",
            "new_password": "NewSecurePassword2026#",
        },
    )
    assert pw_resp.status_code == 204

    # Verify login with new password works
    new_login = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "owner@alibi.local",
            "password": "NewSecurePassword2026#",
            "device": {"name": "Phone App", "platform": "android"},
        },
    )
    assert new_login.status_code == 200


@pytest.mark.asyncio
async def test_public_signup_isolates_accounts_and_rejects_duplicate_email(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    email_a = f"signup_a_{uuid.uuid4().hex[:8]}@example.com"
    email_b = f"signup_b_{uuid.uuid4().hex[:8]}@example.com"
    signup_a = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": email_a,
            "password": "Alibi7",
            "display_name": "Account A",
        },
    )
    signup_b = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": email_b,
            "password": "UniqueStrongPassword!2026",
            "display_name": "Account B",
        },
    )

    assert signup_a.status_code == 201
    assert signup_b.status_code == 201
    assert signup_a.json()["id"] != signup_b.json()["id"]
    user_b_id = uuid.UUID(signup_b.json()["id"])
    workspace_b = await db_session.scalar(
        select(Workspace).where(Workspace.user_id == user_b_id, Workspace.is_default.is_(True))
    )
    professional_b = await db_session.scalar(
        select(Category).where(Category.user_id == user_b_id, Category.slug == "professional")
    )
    assert workspace_b is not None
    assert professional_b is not None
    private_task = Task(
        user_id=user_b_id,
        workspace_id=workspace_b.id,
        category_id=professional_b.id,
        title="Account B private task",
        raw_input="Account B private task",
        status="pending",
    )
    db_session.add(private_task)
    await db_session.flush()

    login_a = await client.post(
        "/api/v1/auth/login",
        json={"email": email_a, "password": "Alibi7"},
    )
    assert login_a.status_code == 200
    access_a = login_a.json()["access_token"]
    foreign_task = await client.get(
        f"/api/v1/tasks/{private_task.id}",
        headers={"Authorization": f"Bearer {access_a}"},
    )
    assert foreign_task.status_code == 404

    duplicate = await client.post(
        "/api/v1/auth/signup",
        json={"email": email_a.upper(), "password": "UniqueStrongPassword!2026"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "email_already_registered"
