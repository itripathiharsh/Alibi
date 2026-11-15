"""Notification and Reminder scheduler service (doc 01 §2.12, doc 03 §3.10, AC-M8-3/5).

Manages reminder scheduling, cancellation upon task completion, quiet hours suppression,
and notification delivery state transitions.
"""

import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.notification import Notification


def is_in_quiet_hours(
    dt: datetime,
    quiet_start_hour: int = 22,
    quiet_end_hour: int = 7,
    tz_name: str = "Asia/Kolkata",
) -> bool:
    """Check if a datetime falls within user's quiet hours (AC-M8-5)."""
    tz = ZoneInfo(tz_name)
    local_dt = dt.astimezone(tz)
    hour = local_dt.hour
    if quiet_start_hour > quiet_end_hour:
        # Crosses midnight: e.g. 22:00 to 07:00
        return hour >= quiet_start_hour or hour < quiet_end_hour
    else:
        return quiet_start_hour <= hour < quiet_end_hour


class NotificationService:
    """Service handling creation, cancellation, and retrieval of notifications."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def schedule_notification(
        self,
        user_id: uuid.UUID,
        kind: str,
        fire_at: datetime,
        title: str,
        body: str,
        task_id: uuid.UUID | None = None,
        event_id: uuid.UUID | None = None,
        suppress_in_quiet_hours: bool = True,
        tz_name: str = "Asia/Kolkata",
    ) -> Notification | None:
        """Schedule a notification with quiet hours suppression (AC-M8-3, AC-M8-5)."""
        if (
            suppress_in_quiet_hours
            and kind not in ("deadline_soon",)
            and is_in_quiet_hours(fire_at, tz_name=tz_name)
        ):
            # Suppress non-critical notification during quiet hours
            return None

        notif = Notification(
            user_id=user_id,
            kind=kind,
            task_id=task_id,
            event_id=event_id,
            fire_at=fire_at,
            title=title,
            body=body,
            status="scheduled",
        )
        self.session.add(notif)
        await self.session.flush()
        return notif

    async def cancel_task_reminders(
        self,
        user_id: uuid.UUID,
        task_id: uuid.UUID,
    ) -> int:
        """Cancel all pending scheduled reminders for a completed task (AC-M8-3)."""
        stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.task_id == task_id,
            Notification.status == "scheduled",
        )
        res = await self.session.execute(stmt)
        notifs = res.scalars().all()
        for n in notifs:
            n.status = "cancelled"
        await self.session.flush()
        return len(notifs)

    async def list_notifications(
        self,
        user_id: uuid.UUID,
        status: str | None = None,
        limit: int = 50,
    ) -> list[Notification]:
        """List in-app notifications for the user."""
        conditions = [Notification.user_id == user_id]
        if status:
            conditions.append(Notification.status == status)

        stmt = (
            select(Notification)
            .where(and_(*conditions))
            .order_by(Notification.fire_at.desc(), Notification.created_at.desc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def dismiss_notification(
        self,
        user_id: uuid.UUID,
        notification_id: uuid.UUID,
    ) -> bool:
        """Dismiss a notification."""
        stmt = select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        res = await self.session.execute(stmt)
        notif = res.scalar_one_or_none()
        if not notif:
            return False
        notif.status = "dismissed"
        await self.session.flush()
        return True

    async def deliver_due_notifications(
        self,
        user_id: uuid.UUID,
        as_of: datetime | None = None,
    ) -> list[Notification]:
        """Mark due notifications as delivered (for in-app / push delivery)."""
        now = as_of or datetime.now(UTC)
        stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.status == "scheduled",
            Notification.fire_at <= now,
        )
        res = await self.session.execute(stmt)
        due = list(res.scalars().all())
        for n in due:
            n.status = "delivered"
            n.delivered_at = utc_now()
        await self.session.flush()
        return due
