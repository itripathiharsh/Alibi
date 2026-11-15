"""Notifications API endpoints (doc 04, doc 01 §2.12)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.notifications.service import NotificationService
from app.schemas.notification import (
    NotificationCreateRequest,
    NotificationResponse,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.post("", response_model=NotificationResponse | None, status_code=status.HTTP_201_CREATED)
async def schedule_notification(
    body: NotificationCreateRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationResponse | None:
    """Schedule a notification with quiet hours suppression (AC-M8-3/5)."""
    service = NotificationService(db)
    notif = await service.schedule_notification(
        user_id=auth.user.id,
        kind=body.kind,
        fire_at=body.fire_at,
        title=body.title,
        body=body.body,
        task_id=body.task_id,
        event_id=body.event_id,
        suppress_in_quiet_hours=body.suppress_in_quiet_hours,
    )
    if notif is None:
        return None
    return NotificationResponse(
        id=notif.id,
        kind=notif.kind,
        task_id=notif.task_id,
        event_id=notif.event_id,
        fire_at=notif.fire_at,
        title=notif.title,
        body=notif.body,
        status=notif.status,
        delivered_at=notif.delivered_at,
        created_at=notif.created_at,
    )


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = None,
    limit: int = 50,
) -> list[NotificationResponse]:
    """List in-app notifications for the current user."""
    service = NotificationService(db)
    notifs = await service.list_notifications(user_id=auth.user.id, status=status, limit=limit)
    return [
        NotificationResponse(
            id=n.id,
            kind=n.kind,
            task_id=n.task_id,
            event_id=n.event_id,
            fire_at=n.fire_at,
            title=n.title,
            body=n.body,
            status=n.status,
            delivered_at=n.delivered_at,
            created_at=n.created_at,
        )
        for n in notifs
    ]


@router.post("/{notification_id}/dismiss", status_code=status.HTTP_200_OK)
async def dismiss_notification(
    notification_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Dismiss an in-app notification."""
    service = NotificationService(db)
    success = await service.dismiss_notification(
        user_id=auth.user.id, notification_id=notification_id
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return {"status": "dismissed"}


@router.post("/deliver", response_model=list[NotificationResponse])
async def deliver_notifications(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[NotificationResponse]:
    """Deliver all scheduled notifications that are due as of now."""
    service = NotificationService(db)
    delivered = await service.deliver_due_notifications(user_id=auth.user.id)
    return [
        NotificationResponse(
            id=n.id,
            kind=n.kind,
            task_id=n.task_id,
            event_id=n.event_id,
            fire_at=n.fire_at,
            title=n.title,
            body=n.body,
            status=n.status,
            delivered_at=n.delivered_at,
            created_at=n.created_at,
        )
        for n in delivered
    ]
