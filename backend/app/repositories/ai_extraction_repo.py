"""AIExtraction repository managing proposals and user decisions."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.ai_extraction import AIExtraction


class AIExtractionRepository:
    """Repository managing natural-language extraction history and confirmation states."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id

    async def create(
        self,
        task_id: uuid.UUID,
        input_text: str,
        rules_result: dict[str, Any],
        final_proposal: dict[str, Any],
        llm_result: dict[str, Any] | None = None,
        clarification: dict[str, Any] | None = None,
        provider: str | None = None,
        model: str | None = None,
        prompt_version: str | None = None,
        latency_ms: int | None = None,
        status: str = "proposed",
    ) -> AIExtraction:
        """Create a new extraction proposal record."""
        extraction = AIExtraction(
            id=uuid.uuid4(),
            user_id=self.user_id,
            task_id=task_id,
            input_text=input_text,
            rules_result=rules_result,
            llm_result=llm_result,
            final_proposal=final_proposal,
            clarification=clarification,
            provider=provider,
            model=model,
            prompt_version=prompt_version,
            latency_ms=latency_ms,
            status=status,
            created_at=utc_now(),
        )
        self.session.add(extraction)
        await self.session.flush()
        return extraction

    async def get_latest_for_task(self, task_id: uuid.UUID) -> AIExtraction | None:
        """Fetch the most recent extraction proposal for a task."""
        stmt = (
            select(AIExtraction)
            .where(
                AIExtraction.task_id == task_id,
                AIExtraction.user_id == self.user_id,
            )
            .order_by(AIExtraction.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def record_decision(
        self,
        extraction_id: uuid.UUID,
        user_decision: dict[str, Any],
        status: str = "accepted",
        decided_at: datetime | None = None,
    ) -> AIExtraction | None:
        """Record the user's decision (accepted, corrected, rejected) on a proposal."""
        stmt = select(AIExtraction).where(
            AIExtraction.id == extraction_id,
            AIExtraction.user_id == self.user_id,
        )
        result = await self.session.execute(stmt)
        extraction = result.scalars().first()
        if not extraction:
            return None

        extraction.user_decision = user_decision
        extraction.status = status
        extraction.decided_at = decided_at or utc_now()
        await self.session.flush()
        return extraction
