"""Recurrence repository managing recurring task templates and rules."""

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.repository import BaseRepository
from app.models.recurrence_rule import RecurrenceRule


class RecurrenceRepository(BaseRepository[RecurrenceRule]):
    """Repository managing RecurrenceRule templates."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        super().__init__(RecurrenceRule, session, user_id)

    async def list_active(self) -> Sequence[RecurrenceRule]:
        """Fetch all active, non-deleted recurrence rules."""
        stmt = (
            select(RecurrenceRule)
            .where(
                RecurrenceRule.user_id == self.user_id,
                RecurrenceRule.active.is_(True),
                RecurrenceRule.deleted_at.is_(None),
            )
            .order_by(RecurrenceRule.created_at.asc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def update_generated_until(
        self,
        rule_id: uuid.UUID,
        generated_until: date,
    ) -> RecurrenceRule | None:
        """Advance the generation horizon date for a recurrence rule."""
        rule = await self.get_by_id(rule_id)
        if not rule:
            return None
        rule.generated_until = generated_until
        await self.session.flush()
        return rule
