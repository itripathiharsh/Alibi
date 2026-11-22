"""Organization reporting privacy and pagination regressions (FR-ORG-004..006)."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError
from app.core.security import create_access_token
from app.core.time import utc_now
from app.models.category import Category
from app.models.organization import OrganizationMembership
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace
from app.services.organization_service import CONSENT_VERSION, OrganizationService


@pytest.mark.asyncio
async def test_member_activity_counts_all_tasks_and_shares_only_consented_professional_data(
    auth_client,
    db_session: AsyncSession,
) -> None:
    owner_id = auth_client.user_id
    owner_service = OrganizationService(db_session)
    organization = await owner_service.create_organization(owner_id, "Audit Test Org")
    invite, invite_url = await owner_service.create_invite(
        owner_id, organization.id, role="member", expires_in_days=7
    )

    member_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    member = User(
        id=member_id,
        email=f"org_audit_{uuid.uuid4().hex[:8]}@example.com",
        password_hash="test-hash",
        display_name="Org Audit Member",
        timezone="UTC",
    )
    workspace = Workspace(
        id=workspace_id,
        user_id=member_id,
        name="Member workspace",
        is_default=True,
    )
    professional = Category(
        id=uuid.uuid4(),
        user_id=member_id,
        workspace_id=workspace_id,
        name="Professional",
        slug="professional-audit",
        sharing_class="professional",
        external_ai_allowed=False,
    )
    personal = Category(
        id=uuid.uuid4(),
        user_id=member_id,
        workspace_id=workspace_id,
        name="Personal",
        slug="personal-audit",
        sharing_class="personal",
        external_ai_allowed=False,
    )
    db_session.add_all([member, workspace, professional, personal])
    await db_session.flush()

    pre_consent_task = Task(
        user_id=member_id,
        workspace_id=workspace_id,
        category_id=professional.id,
        title="Before consent",
        raw_input="Before consent",
        status="pending",
        created_at=utc_now() - timedelta(hours=1),
    )
    db_session.add(pre_consent_task)
    await db_session.flush()

    token = invite_url.rsplit("/", maxsplit=1)[-1]
    member_service = OrganizationService(db_session)
    membership = await member_service.accept_invite(member_id, token, CONSENT_VERSION)
    assert membership.professional_sharing_consent is True
    consented_at = membership.consented_at
    assert consented_at is not None

    db_session.add_all(
        [
            Task(
                user_id=member_id,
                workspace_id=workspace_id,
                category_id=professional.id,
                title=f"Professional task {index}",
                raw_input=f"Professional task {index}",
                status="pending",
                created_at=consented_at + timedelta(seconds=index),
            )
            for index in range(201)
        ]
        + [
            Task(
                user_id=member_id,
                workspace_id=workspace_id,
                category_id=personal.id,
                title="Private personal task",
                raw_input="Private personal task",
                status="pending",
                created_at=consented_at + timedelta(minutes=10),
            )
        ]
    )
    await db_session.flush()

    today = utc_now().date()
    activity = await owner_service.get_member_activity(
        owner_id,
        organization.id,
        membership.id,
        today,
        today,
    )
    assert activity["open_tasks"] == 201
    assert len(activity["tasks"]) == 200
    assert all(task["category_name"] == "Professional" for task in activity["tasks"])
    assert all(task["title"] != "Before consent" for task in activity["tasks"])

    await member_service.revoke_professional_consent(member_id, organization.id)
    with pytest.raises(NotFoundError):
        await owner_service.get_member_activity(
            owner_id,
            organization.id,
            membership.id,
            today,
            today,
        )


@pytest.mark.asyncio
async def test_owner_can_transfer_organization_and_then_leave(
    auth_client,
    db_session: AsyncSession,
) -> None:
    owner_id = auth_client.user_id
    service = OrganizationService(db_session)
    organization = await service.create_organization(owner_id, "Transfer Test Org")
    member_id = uuid.uuid4()
    db_session.add(
        User(
            id=member_id,
            email=f"transfer_{uuid.uuid4().hex[:8]}@example.com",
            password_hash="test-hash",
            display_name="New Owner",
        )
    )
    await db_session.flush()
    new_owner_membership = OrganizationMembership(
        organization_id=organization.id,
        user_id=member_id,
        role="member",
        status="active",
        professional_sharing_consent=True,
        consent_version=CONSENT_VERSION,
        consented_at=utc_now(),
    )
    db_session.add(new_owner_membership)
    await db_session.flush()

    outsider_id = uuid.uuid4()
    outsider_device_id = uuid.uuid4()
    db_session.add(
        User(
            id=outsider_id,
            email=f"outsider_{uuid.uuid4().hex[:8]}@example.com",
            password_hash="test-hash",
            display_name="Outsider",
        )
    )
    await db_session.flush()
    outsider_response = await auth_client.get(
        f"/api/v1/organizations/{organization.id}",
        headers={
            "Authorization": f"Bearer {create_access_token(user_id=outsider_id, device_id=outsider_device_id)}"
        },
    )
    assert outsider_response.status_code == 404

    response = await auth_client.post(
        f"/api/v1/organizations/{organization.id}/transfer-ownership",
        json={"membership_id": str(new_owner_membership.id)},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "team_lead"
    assert organization.owner_user_id == member_id
    assert new_owner_membership.role == "owner"

    with pytest.raises(ForbiddenError):
        await service.transfer_ownership(owner_id, organization.id, new_owner_membership.id)

    await service.leave_organization(owner_id, organization.id)
    with pytest.raises(NotFoundError):
        await service.require_membership(owner_id, organization.id)


@pytest.mark.asyncio
async def test_invite_lifecycle_expiry_and_revocation(
    auth_client,
    db_session: AsyncSession,
) -> None:
    """Security: Expired or revoked invites cannot be accepted."""
    owner_id = auth_client.user_id
    service = OrganizationService(db_session)
    org = await service.create_organization(owner_id, "Invite Security Org")

    # 1. Create and revoke an invite
    invite, invite_url = await service.create_invite(
        owner_id, org.id, role="member", expires_in_days=3
    )
    token = invite_url.rsplit("/", 1)[-1]

    # Preview before revocation
    preview = await service.preview_invite(token)
    assert preview[2] is True  # active

    # Revoke via API
    revoke_res = await auth_client.post(
        f"/api/v1/organizations/{org.id}/invites/{invite.id}/revoke"
    )
    assert revoke_res.status_code == 204

    # Preview after revocation
    preview_revoked = await service.preview_invite(token)
    assert preview_revoked[2] is False  # inactive

    # Attempt accept should fail with 409
    invitee_id = uuid.uuid4()
    invitee_device_id = uuid.uuid4()
    db_session.add(
        User(
            id=invitee_id,
            email=f"invitee_{uuid.uuid4().hex[:8]}@example.com",
            password_hash="test-hash",
            display_name="Invitee",
        )
    )
    await db_session.flush()

    accept_res = await auth_client.post(
        f"/api/v1/organization-invites/{token}/accept",
        headers={
            "Authorization": f"Bearer {create_access_token(user_id=invitee_id, device_id=invitee_device_id)}"
        },
        json={"professional_sharing_consent": True, "consent_version": CONSENT_VERSION},
    )
    assert accept_res.status_code == 409

    # 2. Expired invite
    invite_exp, exp_url = await service.create_invite(
        owner_id, org.id, role="member", expires_in_days=1
    )
    invite_exp.expires_at = utc_now() - timedelta(minutes=10)
    await db_session.flush()

    exp_token = exp_url.rsplit("/", 1)[-1]
    exp_accept_res = await auth_client.post(
        f"/api/v1/organization-invites/{exp_token}/accept",
        headers={
            "Authorization": f"Bearer {create_access_token(user_id=invitee_id, device_id=invitee_device_id)}"
        },
        json={"professional_sharing_consent": True, "consent_version": CONSENT_VERSION},
    )
    assert exp_accept_res.status_code == 409


@pytest.mark.asyncio
async def test_role_enforcement_and_permission_matrix(
    auth_client,
    db_session: AsyncSession,
) -> None:
    """Security: Standard members cannot manage invites or view org overviews."""
    owner_id = auth_client.user_id
    service = OrganizationService(db_session)
    org = await service.create_organization(owner_id, "Role Test Org")

    # Create a regular member
    member_id = uuid.uuid4()
    member_device_id = uuid.uuid4()
    db_session.add(
        User(
            id=member_id,
            email=f"reg_member_{uuid.uuid4().hex[:8]}@example.com",
            password_hash="test-hash",
            display_name="Regular Member",
        )
    )
    await db_session.flush()
    db_session.add(
        OrganizationMembership(
            organization_id=org.id,
            user_id=member_id,
            role="member",
            status="active",
            professional_sharing_consent=True,
            consent_version=CONSENT_VERSION,
            consented_at=utc_now(),
        )
    )
    await db_session.flush()

    member_auth = {
        "Authorization": f"Bearer {create_access_token(user_id=member_id, device_id=member_device_id)}"
    }

    # Member cannot create invites -> 403
    m_invite_res = await auth_client.post(
        f"/api/v1/organizations/{org.id}/invites",
        headers=member_auth,
        json={"role": "member", "expires_in_days": 7},
    )
    assert m_invite_res.status_code == 403

    # Member cannot view overview -> 403
    m_overview_res = await auth_client.get(
        f"/api/v1/organizations/{org.id}/overview",
        headers=member_auth,
    )
    assert m_overview_res.status_code == 403

    # Member cannot list invites -> 403
    m_list_invites = await auth_client.get(
        f"/api/v1/organizations/{org.id}/invites",
        headers=member_auth,
    )
    assert m_list_invites.status_code == 403

    # Create a team lead
    lead_id = uuid.uuid4()
    lead_device_id = uuid.uuid4()
    db_session.add(
        User(
            id=lead_id,
            email=f"lead_{uuid.uuid4().hex[:8]}@example.com",
            password_hash="test-hash",
            display_name="Team Lead",
        )
    )
    await db_session.flush()
    db_session.add(
        OrganizationMembership(
            organization_id=org.id,
            user_id=lead_id,
            role="team_lead",
            status="active",
            professional_sharing_consent=True,
            consent_version=CONSENT_VERSION,
            consented_at=utc_now(),
        )
    )
    await db_session.flush()

    lead_auth = {
        "Authorization": f"Bearer {create_access_token(user_id=lead_id, device_id=lead_device_id)}"
    }

    # Team lead CAN create a member invite -> 201
    lead_inv_res = await auth_client.post(
        f"/api/v1/organizations/{org.id}/invites",
        headers=lead_auth,
        json={"role": "member", "expires_in_days": 7},
    )
    assert lead_inv_res.status_code == 201

    # Team lead CANNOT create a team_lead invite (only owner can) -> 403
    lead_inv_lead_res = await auth_client.post(
        f"/api/v1/organizations/{org.id}/invites",
        headers=lead_auth,
        json={"role": "team_lead", "expires_in_days": 7},
    )
    assert lead_inv_lead_res.status_code == 403

    # Team lead CANNOT transfer ownership -> 403
    lead_transfer = await auth_client.post(
        f"/api/v1/organizations/{org.id}/transfer-ownership",
        headers=lead_auth,
        json={"membership_id": str(uuid.uuid4())},
    )
    assert lead_transfer.status_code == 403


@pytest.mark.asyncio
async def test_idor_cross_account_isolation_denies_unauthorized_access(
    auth_client,
    db_session: AsyncSession,
) -> None:
    """Security: Cross-account / outsider access to foreign organization data returns 404."""
    owner_id = auth_client.user_id
    service = OrganizationService(db_session)
    org1 = await service.create_organization(owner_id, "Confidential Org 1")

    # Outsider user (not member of org1)
    outsider_id = uuid.uuid4()
    outsider_device = uuid.uuid4()
    db_session.add(
        User(
            id=outsider_id,
            email=f"attacker_{uuid.uuid4().hex[:8]}@example.com",
            password_hash="test-hash",
            display_name="Attacker",
        )
    )
    await db_session.flush()

    outsider_auth = {
        "Authorization": f"Bearer {create_access_token(user_id=outsider_id, device_id=outsider_device)}"
    }

    # Outsider cannot get org -> 404
    r1 = await auth_client.get(f"/api/v1/organizations/{org1.id}", headers=outsider_auth)
    assert r1.status_code == 404

    # Outsider cannot get members -> 404
    r2 = await auth_client.get(f"/api/v1/organizations/{org1.id}/members", headers=outsider_auth)
    assert r2.status_code == 404

    # Outsider cannot get overview -> 404
    r3 = await auth_client.get(f"/api/v1/organizations/{org1.id}/overview", headers=outsider_auth)
    assert r3.status_code == 404

    # Outsider cannot invite -> 404
    r4 = await auth_client.post(
        f"/api/v1/organizations/{org1.id}/invites",
        headers=outsider_auth,
        json={"role": "member", "expires_in_days": 7},
    )
    assert r4.status_code == 404

    # Outsider cannot view member activity -> 404
    dummy_membership_id = uuid.uuid4()
    r5 = await auth_client.get(
        f"/api/v1/organizations/{org1.id}/members/{dummy_membership_id}/activity",
        headers=outsider_auth,
    )
    assert r5.status_code == 404


@pytest.mark.asyncio
async def test_consent_grant_and_revocation_endpoints(
    auth_client,
    db_session: AsyncSession,
) -> None:
    """Security: Consent grant and revocation endpoints properly update state."""
    owner_id = auth_client.user_id
    service = OrganizationService(db_session)
    org = await service.create_organization(owner_id, "Consent Lifecycle Org")

    # Revoke consent
    revoke_res = await auth_client.post(f"/api/v1/organizations/{org.id}/consent/revoke")
    assert revoke_res.status_code == 204

    org_res = await auth_client.get(f"/api/v1/organizations/{org.id}")
    assert org_res.status_code == 200
    assert org_res.json()["professional_sharing_consent"] is False

    # Re-grant consent
    grant_res = await auth_client.post(f"/api/v1/organizations/{org.id}/consent")
    assert grant_res.status_code == 200
    assert grant_res.json()["professional_sharing_consent"] is True
