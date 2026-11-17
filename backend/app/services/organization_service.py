"""Organization membership and consent services (FR-ORG-001..006)."""

import hashlib
import re
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.time import utc_now
from app.models.category import Category
from app.models.organization import Organization, OrganizationInvite, OrganizationMembership
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.repositories.audit_log_repo import AuditLogRepository
from app.services.analytics_service import AnalyticsService

CONSENT_VERSION = "professional-v1"
MANAGER_ROLES = ("owner", "team_lead")


class OrganizationService:
    """Enforce organization roles and professional-only consent in data services."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit_repo = AuditLogRepository(session)
        self.analytics = AnalyticsService(session)

    async def create_organization(self, user_id: uuid.UUID, name: str) -> Organization:
        cleaned_name = " ".join(name.split())
        if len(cleaned_name) < 2:
            raise ConflictError(detail="Organization name must contain at least two characters.")
        slug_base = (
            re.sub(r"[^a-z0-9]+", "-", cleaned_name.lower()).strip("-")[:72] or "organization"
        )
        organization = Organization(
            name=cleaned_name,
            slug=f"{slug_base}-{uuid.uuid4().hex[:8]}",
            owner_user_id=user_id,
            status="active",
        )
        self.session.add(organization)
        await self.session.flush()
        membership = OrganizationMembership(
            organization_id=organization.id,
            user_id=user_id,
            role="owner",
            status="active",
            professional_sharing_consent=False,
        )
        self.session.add(membership)
        await self.audit_repo.record(
            action="organization_created",
            user_id=user_id,
            detail={"organization_id": str(organization.id)},
        )
        await self.session.flush()
        return organization

    async def list_my_memberships(
        self, user_id: uuid.UUID
    ) -> list[tuple[Organization, OrganizationMembership]]:
        result = await self.session.execute(
            select(Organization, OrganizationMembership)
            .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
            .where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.status == "active",
                Organization.status == "active",
            )
            .order_by(Organization.name.asc())
        )
        return list(result.all())

    async def require_membership(
        self,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
        *,
        manager_only: bool = False,
    ) -> tuple[Organization, OrganizationMembership]:
        result = await self.session.execute(
            select(Organization, OrganizationMembership)
            .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
            .where(
                Organization.id == organization_id,
                Organization.status == "active",
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.status == "active",
            )
        )
        pair = result.first()
        if not pair:
            raise NotFoundError("Organization not found.")
        organization, membership = pair
        if manager_only and membership.role not in MANAGER_ROLES:
            raise ForbiddenError(detail="Organization owner or team-lead access is required.")
        return organization, membership

    async def grant_professional_consent(
        self,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> OrganizationMembership:
        _, membership = await self.require_membership(user_id, organization_id)
        if membership.professional_sharing_consent and membership.consented_at is not None:
            return membership
        now = utc_now()
        membership.professional_sharing_consent = True
        membership.consent_version = CONSENT_VERSION
        membership.consented_at = now
        membership.revoked_at = None
        await self.audit_repo.record(
            action="org_consent_granted",
            user_id=user_id,
            detail={"organization_id": str(organization_id), "consent_version": CONSENT_VERSION},
        )
        await self.session.flush()
        return membership

    async def revoke_professional_consent(
        self,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> None:
        _, membership = await self.require_membership(user_id, organization_id)
        if not membership.professional_sharing_consent:
            return
        membership.professional_sharing_consent = False
        membership.consent_version = None
        membership.consented_at = None
        membership.revoked_at = utc_now()
        await self.audit_repo.record(
            action="org_consent_revoked",
            user_id=user_id,
            detail={"organization_id": str(organization_id)},
        )
        await self.session.flush()

    async def create_invite(
        self,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
        role: str,
        expires_in_days: int,
    ) -> tuple[OrganizationInvite, str]:
        organization, membership = await self.require_membership(
            user_id, organization_id, manager_only=True
        )
        if role == "team_lead" and membership.role != "owner":
            raise ForbiddenError(detail="Only the organization owner can invite team leads.")
        token = secrets.token_urlsafe(32)
        now = utc_now()
        invite = OrganizationInvite(
            organization_id=organization.id,
            created_by_user_id=user_id,
            role=role,
            token_hash=hashlib.sha256(token.encode("utf-8")).digest(),
            expires_at=now + timedelta(days=expires_in_days),
        )
        self.session.add(invite)
        await self.audit_repo.record(
            action="org_invite_created",
            user_id=user_id,
            detail={"organization_id": str(organization_id), "role": role},
        )
        await self.session.flush()
        invite_url = f"{settings.alibi_web_origin.rstrip('/')}/organization-invite/{token}"
        return invite, invite_url

    async def preview_invite(self, token: str) -> tuple[OrganizationInvite, Organization, bool]:
        invite_hash = hashlib.sha256(token.encode("utf-8")).digest()
        result = await self.session.execute(
            select(OrganizationInvite, Organization)
            .join(Organization, Organization.id == OrganizationInvite.organization_id)
            .where(OrganizationInvite.token_hash == invite_hash)
        )
        pair = result.first()
        if not pair:
            raise NotFoundError("Invitation not found.")
        invite, organization = pair
        active = (
            organization.status == "active"
            and invite.revoked_at is None
            and invite.accepted_at is None
            and invite.expires_at > utc_now()
        )
        return invite, organization, active

    async def accept_invite(
        self,
        user_id: uuid.UUID,
        token: str,
        consent_version: str,
    ) -> OrganizationMembership:
        invite, organization, active = await self.preview_invite(token)
        if not active:
            raise ConflictError(detail="This invitation is expired, revoked, or already used.")
        existing = await self.session.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization.id,
                OrganizationMembership.user_id == user_id,
            )
        )
        if existing and existing.status == "active":
            raise ConflictError(detail="You already belong to this organization.")
        if consent_version != CONSENT_VERSION:
            raise ConflictError(
                detail="The consent text has changed. Review the current invitation again."
            )

        now = utc_now()
        if existing:
            existing.role = invite.role
            existing.status = "active"
            existing.professional_sharing_consent = True
            existing.consent_version = CONSENT_VERSION
            existing.consented_at = now
            existing.revoked_at = None
            membership = existing
        else:
            membership = OrganizationMembership(
                organization_id=organization.id,
                user_id=user_id,
                role=invite.role,
                status="active",
                professional_sharing_consent=True,
                consent_version=CONSENT_VERSION,
                consented_at=now,
            )
            self.session.add(membership)

        invite.accepted_by_user_id = user_id
        invite.accepted_at = now
        await self.audit_repo.record(
            action="org_invite_accepted",
            user_id=user_id,
            detail={
                "organization_id": str(organization.id),
                "role": invite.role,
                "consent_version": CONSENT_VERSION,
            },
        )
        await self.session.flush()
        return membership

    async def leave_organization(self, user_id: uuid.UUID, organization_id: uuid.UUID) -> None:
        _, membership = await self.require_membership(user_id, organization_id)
        if membership.role == "owner":
            raise ConflictError(detail="Transfer organization ownership before leaving.")
        membership.status = "left"
        membership.professional_sharing_consent = False
        membership.consent_version = None
        membership.consented_at = None
        membership.revoked_at = utc_now()
        await self.audit_repo.record(
            action="org_membership_left",
            user_id=user_id,
            detail={"organization_id": str(organization_id)},
        )
        await self.session.flush()

    async def revoke_invite(
        self,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
        invite_id: uuid.UUID,
    ) -> None:
        await self.require_membership(user_id, organization_id, manager_only=True)
        invite = await self.session.scalar(
            select(OrganizationInvite).where(
                OrganizationInvite.id == invite_id,
                OrganizationInvite.organization_id == organization_id,
            )
        )
        if not invite or invite.accepted_at:
            raise NotFoundError("Invitation not found.")
        invite.revoked_at = utc_now()
        await self.audit_repo.record(
            action="org_invite_revoked",
            user_id=user_id,
            detail={"organization_id": str(organization_id), "invite_id": str(invite_id)},
        )
        await self.session.flush()

    async def list_pending_invites(
        self, user_id: uuid.UUID, organization_id: uuid.UUID
    ) -> list[OrganizationInvite]:
        await self.require_membership(user_id, organization_id, manager_only=True)
        rows = await self.session.scalars(
            select(OrganizationInvite)
            .where(
                OrganizationInvite.organization_id == organization_id,
                OrganizationInvite.accepted_at.is_(None),
                OrganizationInvite.revoked_at.is_(None),
                OrganizationInvite.expires_at > utc_now(),
            )
            .order_by(OrganizationInvite.created_at.desc())
            .limit(100)
        )
        await self.audit_repo.record(
            action="org_invites_list_viewed",
            user_id=user_id,
            detail={"organization_id": str(organization_id)},
        )
        return list(rows.all())

    async def list_members(
        self,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> list[tuple[OrganizationMembership, User]]:
        await self.require_membership(user_id, organization_id, manager_only=True)
        result = await self.session.execute(
            select(OrganizationMembership, User)
            .join(User, User.id == OrganizationMembership.user_id)
            .where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.status == "active",
                OrganizationMembership.professional_sharing_consent.is_(True),
            )
            .order_by(OrganizationMembership.created_at.asc())
            .limit(500)
        )
        await self.audit_repo.record(
            action="org_member_list_viewed",
            user_id=user_id,
            detail={"organization_id": str(organization_id)},
        )
        return list(result.all())

    async def get_overview(
        self,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
        start_date: date,
        end_date: date,
    ) -> dict[str, object]:
        organization, _ = await self.require_membership(user_id, organization_id, manager_only=True)
        if end_date < start_date or (end_date - start_date).days > 366:
            raise ConflictError(detail="Choose a date range of 1 to 366 days.")
        start_utc = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
        end_utc = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        memberships = await self.session.scalars(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.status == "active",
                OrganizationMembership.professional_sharing_consent.is_(True),
                OrganizationMembership.consented_at.is_not(None),
            )
        )

        from collections import defaultdict

        points: dict[date, dict[str, int]] = defaultdict(lambda: {"completed": 0, "minutes": 0})
        category_minutes: dict[str, int] = defaultdict(int)
        member_rows: list[dict[str, object]] = []
        total_completed = 0
        total_open = 0
        total_minutes = 0
        scores: list[int] = []

        for membership in memberships:
            consented_at = membership.consented_at
            if consented_at is None:
                continue
            base_filters = (
                Task.user_id == membership.user_id,
                Task.deleted_at.is_(None),
                Task.created_at >= consented_at,
                Category.sharing_class == "professional",
            )
            completed_stmt = (
                select(func.count(Task.id))
                .join(Category, Category.id == Task.category_id)
                .where(
                    *base_filters,
                    Task.status == "completed",
                    Task.completed_at >= start_utc,
                    Task.completed_at < end_utc,
                )
            )
            completed = int((await self.session.execute(completed_stmt)).scalar_one())

            open_stmt = (
                select(func.count(Task.id))
                .join(Category, Category.id == Task.category_id)
                .where(
                    *base_filters,
                    Task.status.in_(["pending", "in_progress"]),
                )
            )
            open_count = int((await self.session.execute(open_stmt)).scalar_one())

            time_stmt = (
                select(
                    func.coalesce(
                        func.sum(
                            func.extract(
                                "epoch",
                                func.least(func.coalesce(TimeEntry.ended_at, utc_now()), end_utc)
                                - func.greatest(TimeEntry.started_at, start_utc),
                            )
                            / 60
                        ),
                        0,
                    )
                )
                .join(Task, Task.id == TimeEntry.task_id)
                .join(Category, Category.id == Task.category_id)
                .where(
                    TimeEntry.user_id == membership.user_id,
                    TimeEntry.deleted_at.is_(None),
                    TimeEntry.started_at >= max(start_utc, consented_at),
                    TimeEntry.started_at < end_utc,
                    func.coalesce(TimeEntry.ended_at, utc_now()) > start_utc,
                    Task.created_at >= consented_at,
                    Task.deleted_at.is_(None),
                    Category.sharing_class == "professional",
                )
            )
            member_minutes = int((await self.session.execute(time_stmt)).scalar_one())

            score_result = await self.analytics.get_productivity_score(
                user_id=membership.user_id,
                period="custom",
                from_date=start_date,
                to_date=end_date,
                tz_str="UTC",
                sharing_class="professional",
                created_after=consented_at,
            )
            score = score_result.score
            if score is not None:
                scores.append(score)

            member_user = await self.session.get(User, membership.user_id)
            member_rows.append(
                {
                    "membership_id": membership.id,
                    "display_name": member_user.display_name if member_user else None,
                    "role": membership.role,
                    "productivity_score": score,
                    "completed_tasks": completed,
                    "open_tasks": open_count,
                    "focus_time_min": member_minutes,
                }
            )
            total_completed += completed
            total_open += open_count
            total_minutes += member_minutes

            category_stmt = (
                select(
                    Category.name,
                    func.coalesce(
                        func.sum(
                            func.extract(
                                "epoch",
                                func.least(func.coalesce(TimeEntry.ended_at, utc_now()), end_utc)
                                - func.greatest(TimeEntry.started_at, start_utc),
                            )
                            / 60
                        ),
                        0,
                    ),
                )
                .join(Task, Task.id == TimeEntry.task_id)
                .join(Category, Category.id == Task.category_id)
                .where(
                    TimeEntry.user_id == membership.user_id,
                    TimeEntry.deleted_at.is_(None),
                    TimeEntry.started_at >= max(start_utc, consented_at),
                    TimeEntry.started_at < end_utc,
                    func.coalesce(TimeEntry.ended_at, utc_now()) > start_utc,
                    Task.created_at >= consented_at,
                    Task.deleted_at.is_(None),
                    Category.sharing_class == "professional",
                )
                .group_by(Category.name)
            )
            for category_name, minutes in (await self.session.execute(category_stmt)).all():
                category_minutes[category_name] += int(minutes or 0)

            trend_stmt = (
                select(
                    func.date(func.timezone("UTC", Task.completed_at)),
                    func.count(Task.id),
                )
                .join(Category, Category.id == Task.category_id)
                .where(
                    *base_filters,
                    Task.status == "completed",
                    Task.completed_at >= start_utc,
                    Task.completed_at < end_utc,
                )
                .group_by(func.date(func.timezone("UTC", Task.completed_at)))
            )
            for point_date, count in (await self.session.execute(trend_stmt)).all():
                points[point_date]["completed"] += int(count)

            time_trend_stmt = (
                select(
                    func.date(func.timezone("UTC", TimeEntry.started_at)),
                    func.coalesce(
                        func.sum(
                            func.extract(
                                "epoch",
                                func.least(func.coalesce(TimeEntry.ended_at, utc_now()), end_utc)
                                - func.greatest(TimeEntry.started_at, start_utc),
                            )
                            / 60
                        ),
                        0,
                    ),
                )
                .join(Task, Task.id == TimeEntry.task_id)
                .join(Category, Category.id == Task.category_id)
                .where(
                    TimeEntry.user_id == membership.user_id,
                    TimeEntry.deleted_at.is_(None),
                    TimeEntry.started_at >= max(start_utc, consented_at),
                    TimeEntry.started_at < end_utc,
                    func.coalesce(TimeEntry.ended_at, utc_now()) > start_utc,
                    Task.created_at >= consented_at,
                    Task.deleted_at.is_(None),
                    Category.sharing_class == "professional",
                )
                .group_by(func.date(func.timezone("UTC", TimeEntry.started_at)))
            )
            for point_date, minutes in (await self.session.execute(time_trend_stmt)).all():
                points[point_date]["minutes"] += int(minutes or 0)

        # The time series is intentionally omitted when there is no verified data.
        activity = [
            {
                "date": day,
                "completed_tasks": values["completed"],
                "focus_time_min": values["minutes"],
            }
            for day, values in sorted(points.items())
        ]
        await self.audit_repo.record(
            action="org_dashboard_viewed",
            user_id=user_id,
            detail={"organization_id": str(organization_id)},
        )
        return {
            "organization_id": organization.id,
            "organization_name": organization.name,
            "period_start": start_date,
            "period_end": end_date,
            "consenting_members": len(member_rows),
            "completed_tasks": total_completed,
            "open_tasks": total_open,
            "focus_time_min": total_minutes,
            "average_productivity_score": round(sum(scores) / len(scores)) if scores else None,
            "members": member_rows,
            "time_by_category": [
                {"category_name": name, "minutes": minutes}
                for name, minutes in sorted(
                    category_minutes.items(), key=lambda row: row[1], reverse=True
                )
            ],
            "activity": activity,
        }

    async def get_member_activity(
        self,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
        membership_id: uuid.UUID,
        start_date: date,
        end_date: date,
    ) -> dict[str, object]:
        await self.require_membership(user_id, organization_id, manager_only=True)
        membership = await self.session.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.id == membership_id,
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.status == "active",
                OrganizationMembership.professional_sharing_consent.is_(True),
                OrganizationMembership.consented_at.is_not(None),
            )
        )
        if not membership or not membership.consented_at:
            raise NotFoundError("Consenting organization member not found.")
        if end_date < start_date or (end_date - start_date).days > 366:
            raise ConflictError(detail="Choose a date range of 1 to 366 days.")
        start_utc = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
        end_utc = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        activity_filters = [
            Task.user_id == membership.user_id,
            Task.created_at >= membership.consented_at,
            Task.deleted_at.is_(None),
            Category.sharing_class == "professional",
            (
                (Task.created_at >= start_utc)
                | (Task.completed_at >= start_utc)
                | (Task.deadline_at >= start_utc)
                | Task.status.in_(["pending", "in_progress"])
            ),
            (Task.created_at < end_utc)
            | (Task.completed_at < end_utc)
            | (Task.deadline_at < end_utc),
        ]
        rows = await self.session.execute(
            select(Task, Category.name)
            .join(Category, Category.id == Task.category_id)
            .where(*activity_filters)
            .order_by(Task.created_at.desc())
            .limit(200)
        )
        tasks = rows.all()
        time_query = (
            select(
                func.coalesce(
                    func.sum(
                        func.extract(
                            "epoch",
                            func.least(func.coalesce(TimeEntry.ended_at, utc_now()), end_utc)
                            - func.greatest(TimeEntry.started_at, start_utc),
                        )
                        / 60
                    ),
                    0,
                )
            )
            .join(Task, Task.id == TimeEntry.task_id)
            .join(Category, Category.id == Task.category_id)
            .where(
                TimeEntry.user_id == membership.user_id,
                TimeEntry.deleted_at.is_(None),
                TimeEntry.started_at >= max(start_utc, membership.consented_at),
                TimeEntry.started_at < end_utc,
                func.coalesce(TimeEntry.ended_at, utc_now()) > start_utc,
                Task.created_at >= membership.consented_at,
                Task.deleted_at.is_(None),
                Category.sharing_class == "professional",
            )
        )
        focus_time_min = int((await self.session.execute(time_query)).scalar_one())
        completed = int(
            (
                await self.session.execute(
                    select(func.count(Task.id))
                    .join(Category, Category.id == Task.category_id)
                    .where(
                        *activity_filters,
                        Task.status == "completed",
                        Task.completed_at >= start_utc,
                        Task.completed_at < end_utc,
                    )
                )
            ).scalar_one()
        )
        open_count = int(
            (
                await self.session.execute(
                    select(func.count(Task.id))
                    .join(Category, Category.id == Task.category_id)
                    .where(*activity_filters, Task.status.in_(["pending", "in_progress"]))
                )
            ).scalar_one()
        )
        score_response = await self.analytics.get_productivity_score(
            user_id=membership.user_id,
            period="custom",
            from_date=start_date,
            to_date=end_date,
            tz_str="UTC",
            sharing_class="professional",
            created_after=membership.consented_at,
        )
        member_user = await self.session.get(User, membership.user_id)
        await self.audit_repo.record(
            action="org_member_activity_viewed",
            user_id=user_id,
            detail={
                "organization_id": str(organization_id),
                "membership_id": str(membership_id),
            },
        )
        return {
            "membership_id": membership.id,
            "display_name": member_user.display_name if member_user else None,
            "period_start": start_date,
            "period_end": end_date,
            "productivity_score": score_response.score,
            "completed_tasks": completed,
            "open_tasks": open_count,
            "focus_time_min": focus_time_min,
            "tasks": [
                {
                    "id": task.id,
                    "title": task.title,
                    "status": task.status,
                    "category_name": category_name,
                    "created_at": task.created_at,
                    "deadline_at": task.deadline_at,
                    "completed_at": task.completed_at,
                    "actual_min": task.actual_min,
                }
                for task, category_name in tasks
            ],
        }
