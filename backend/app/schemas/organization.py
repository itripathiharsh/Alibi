"""Organization portal API schemas (FR-ORG-001..006)."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class OrganizationCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    role: Literal["owner", "team_lead", "member"]
    status: str
    professional_sharing_consent: bool
    consented_at: datetime | None


class InviteCreateRequest(BaseModel):
    role: Literal["member", "team_lead"] = "member"
    expires_in_days: int = Field(default=7, ge=1, le=30)


class InviteCreatedResponse(BaseModel):
    id: uuid.UUID
    role: Literal["member", "team_lead"]
    invite_url: str
    expires_at: datetime


class OrganizationInviteResponse(BaseModel):
    id: uuid.UUID
    role: Literal["member", "team_lead"]
    expires_at: datetime
    created_at: datetime


class InvitePreviewResponse(BaseModel):
    organization_name: str
    role: Literal["member", "team_lead"]
    expires_at: datetime
    active: bool


class InviteAcceptRequest(BaseModel):
    professional_sharing_consent: Literal[True]
    consent_version: Literal["professional-v1"] = "professional-v1"


class OrganizationMemberResponse(BaseModel):
    membership_id: uuid.UUID
    display_name: str | None
    role: Literal["owner", "team_lead", "member"]
    status: str
    professional_sharing_consent: bool
    consented_at: datetime | None


class MemberMetric(BaseModel):
    membership_id: uuid.UUID
    display_name: str | None
    role: Literal["owner", "team_lead", "member"]
    productivity_score: int | None
    completed_tasks: int
    open_tasks: int
    focus_time_min: int


class TimeByCategoryItem(BaseModel):
    category_name: str
    minutes: int


class ActivityPoint(BaseModel):
    date: date
    completed_tasks: int
    focus_time_min: int


class OrganizationOverviewResponse(BaseModel):
    organization_id: uuid.UUID
    organization_name: str
    period_start: date
    period_end: date
    consenting_members: int
    completed_tasks: int
    open_tasks: int
    focus_time_min: int
    average_productivity_score: int | None
    members: list[MemberMetric]
    time_by_category: list[TimeByCategoryItem]
    activity: list[ActivityPoint]


class ProfessionalTaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    category_name: str
    created_at: datetime
    deadline_at: datetime | None
    completed_at: datetime | None
    actual_min: int


class MemberActivityResponse(BaseModel):
    membership_id: uuid.UUID
    display_name: str | None
    period_start: date
    period_end: date
    productivity_score: int | None
    completed_tasks: int
    open_tasks: int
    focus_time_min: int
    tasks: list[ProfessionalTaskResponse]
