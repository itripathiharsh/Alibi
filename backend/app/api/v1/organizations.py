"""Organization owner and team-lead portal APIs (FR-ORG-001..006)."""

import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.time import utc_now
from app.models.organization import OrganizationMembership
from app.schemas.organization import (
    InviteAcceptRequest,
    InviteCreatedResponse,
    InviteCreateRequest,
    InvitePreviewResponse,
    MemberActivityResponse,
    OrganizationCreateRequest,
    OrganizationInviteResponse,
    OrganizationMemberResponse,
    OrganizationOverviewResponse,
    OrganizationResponse,
)
from app.services.organization_service import OrganizationService

router = APIRouter(tags=["organizations"])


def _organization_response(
    organization_id: uuid.UUID,
    name: str,
    slug: str,
    membership: OrganizationMembership,
) -> OrganizationResponse:
    return OrganizationResponse(
        id=organization_id,
        name=name,
        slug=slug,
        role=membership.role,
        status=membership.status,
        professional_sharing_consent=membership.professional_sharing_consent,
        consented_at=membership.consented_at,
    )


@router.post(
    "/organizations",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_organization(
    body: OrganizationCreateRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrganizationResponse:
    service = OrganizationService(db)
    organization = await service.create_organization(auth.user.id, body.name)
    membership = await service.require_membership(auth.user.id, organization.id)
    return _organization_response(
        organization.id, organization.name, organization.slug, membership[1]
    )


@router.get("/organizations/mine", response_model=list[OrganizationResponse])
async def list_my_organizations(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OrganizationResponse]:
    pairs = await OrganizationService(db).list_my_memberships(auth.user.id)
    return [
        _organization_response(organization.id, organization.name, organization.slug, membership)
        for organization, membership in pairs
    ]


@router.get(
    "/organization-invites/{token}",
    response_model=InvitePreviewResponse,
)
async def preview_organization_invite(
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InvitePreviewResponse:
    invite, organization, active = await OrganizationService(db).preview_invite(token)
    return InvitePreviewResponse(
        organization_name=organization.name,
        role=invite.role,
        expires_at=invite.expires_at,
        active=active,
    )


@router.post(
    "/organization-invites/{token}/accept",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def accept_organization_invite(
    token: str,
    body: InviteAcceptRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrganizationResponse:
    service = OrganizationService(db)
    membership = await service.accept_invite(auth.user.id, token, body.consent_version)
    organization, _ = await service.require_membership(auth.user.id, membership.organization_id)
    return _organization_response(organization.id, organization.name, organization.slug, membership)


@router.get("/organizations/{organization_id}", response_model=OrganizationResponse)
async def get_organization(
    organization_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrganizationResponse:
    organization, membership = await OrganizationService(db).require_membership(
        auth.user.id, organization_id
    )
    return _organization_response(organization.id, organization.name, organization.slug, membership)


@router.post(
    "/organizations/{organization_id}/invites",
    response_model=InviteCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_organization_invite(
    organization_id: uuid.UUID,
    body: InviteCreateRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InviteCreatedResponse:
    invite, invite_url = await OrganizationService(db).create_invite(
        auth.user.id,
        organization_id,
        body.role,
        body.expires_in_days,
    )
    return InviteCreatedResponse(
        id=invite.id,
        role=invite.role,
        invite_url=invite_url,
        expires_at=invite.expires_at,
    )


@router.post("/organizations/{organization_id}/consent", response_model=OrganizationResponse)
async def grant_professional_consent(
    organization_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrganizationResponse:
    service = OrganizationService(db)
    membership = await service.grant_professional_consent(auth.user.id, organization_id)
    organization, _ = await service.require_membership(auth.user.id, organization_id)
    return _organization_response(organization.id, organization.name, organization.slug, membership)


@router.post(
    "/organizations/{organization_id}/consent/revoke", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_professional_consent(
    organization_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await OrganizationService(db).revoke_professional_consent(auth.user.id, organization_id)


@router.post("/organizations/{organization_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_organization(
    organization_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await OrganizationService(db).leave_organization(auth.user.id, organization_id)


@router.post(
    "/organizations/{organization_id}/invites/{invite_id}/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_organization_invite(
    organization_id: uuid.UUID,
    invite_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await OrganizationService(db).revoke_invite(auth.user.id, organization_id, invite_id)


@router.get(
    "/organizations/{organization_id}/invites",
    response_model=list[OrganizationInviteResponse],
)
async def list_organization_invites(
    organization_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OrganizationInviteResponse]:
    rows = await OrganizationService(db).list_pending_invites(auth.user.id, organization_id)
    return [
        OrganizationInviteResponse(
            id=invite.id,
            role=invite.role,
            expires_at=invite.expires_at,
            created_at=invite.created_at,
        )
        for invite in rows
    ]


@router.get(
    "/organizations/{organization_id}/members",
    response_model=list[OrganizationMemberResponse],
)
async def list_organization_members(
    organization_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OrganizationMemberResponse]:
    rows = await OrganizationService(db).list_members(auth.user.id, organization_id)
    return [
        OrganizationMemberResponse(
            membership_id=membership.id,
            display_name=user.display_name,
            role=membership.role,
            status=membership.status,
            professional_sharing_consent=membership.professional_sharing_consent,
            consented_at=membership.consented_at,
        )
        for membership, user in rows
    ]


@router.get(
    "/organizations/{organization_id}/overview",
    response_model=OrganizationOverviewResponse,
)
async def organization_overview(
    organization_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
) -> OrganizationOverviewResponse:
    today = utc_now().date()
    resolved_end = end_date or today
    resolved_start = start_date or (resolved_end - timedelta(days=29))
    result = await OrganizationService(db).get_overview(
        auth.user.id, organization_id, resolved_start, resolved_end
    )
    return OrganizationOverviewResponse.model_validate(result)


@router.get(
    "/organizations/{organization_id}/members/{membership_id}/activity",
    response_model=MemberActivityResponse,
)
async def organization_member_activity(
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
) -> MemberActivityResponse:
    today = utc_now().date()
    resolved_end = end_date or today
    resolved_start = start_date or (resolved_end - timedelta(days=29))
    result = await OrganizationService(db).get_member_activity(
        auth.user.id,
        organization_id,
        membership_id,
        resolved_start,
        resolved_end,
    )
    return MemberActivityResponse.model_validate(result)
