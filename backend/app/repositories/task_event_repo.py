"""TaskEvent repository for append-only audit activity log."""

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.task_event import TaskEvent


class TaskEventRepository:
    """Repository managing immutable, append-only TaskEvent logs."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id

    async def record_event(
        self,
        task_id: uuid.UUID,
        event_type: str,
        changes: dict[str, Any],
        reason: str | None = None,
        actor: str = "user",
        device_id: uuid.UUID | None = None,
        occurred_at: datetime | None = None,
    ) -> TaskEvent:
        """Append an immutable audit entry recording a state change or mutation."""
        event = TaskEvent(
            id=uuid.uuid4(),
            user_id=self.user_id,
            task_id=task_id,
            event_type=event_type,
            changes=changes,
            reason=reason,
            actor=actor,
            device_id=device_id,
            occurred_at=occurred_at or utc_now(),
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def list_for_task(
        self,
        task_id: uuid.UUID,
        limit: int = 50,
    ) -> Sequence[TaskEvent]:
        """Fetch chronological activity history for a task."""
        stmt = (
            select(TaskEvent)
            .where(
                TaskEvent.task_id == task_id,
                TaskEvent.user_id == self.user_id,
            )
            .order_by(TaskEvent.occurred_at.asc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()
