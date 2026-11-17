"""Organization reporting privacy and pagination regressions (FR-ORG-004..006)."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.time import utc_now
from app.models.category import Category
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
