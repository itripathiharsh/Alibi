"""Grounded Assistant Service (doc 08 §2/§3, FR-RAG-002/003/004/005).

Coordinates intent routing, SQL tools, hybrid vault retrieval, context assembly,
grounding validation, and deterministic fallbacks.
"""

import uuid
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.assistant.intent import route_intent
from app.assistant.tools import AssistantSQLTools, ToolResult
from app.assistant.validator import (
    generate_deterministic_answer,
)
from app.core.time import utc_now
from app.models.vault import ChatMessage, ChatThread
from app.vault.search import VaultSearchService


class AssistantService:
    """Orchestrates grounded Q&A with the personal knowledge vault."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_create_thread(
        self,
        user_id: uuid.UUID,
        thread_id: uuid.UUID | None = None,
        initial_title: str | None = None,
    ) -> ChatThread:
        """Retrieve existing thread or create a new one."""
        if thread_id is not None:
            stmt = select(ChatThread).where(
                ChatThread.id == thread_id,
                ChatThread.user_id == user_id,
                ChatThread.deleted_at.is_(None),
            )
            res = await self.session.execute(stmt)
            thread = res.scalar_one_or_none()
            if thread is not None:
                return thread

        title = initial_title[:60] if initial_title else "New Conversation"
        thread = ChatThread(
            user_id=user_id,
            title=title,
        )
        self.session.add(thread)
        await self.session.flush()
        return thread

    async def list_threads(
        self,
        user_id: uuid.UUID,
        limit: int = 20,
    ) -> list[ChatThread]:
        """List active chat threads for the user."""
        stmt = (
            select(ChatThread)
            .where(
                ChatThread.user_id == user_id,
                ChatThread.deleted_at.is_(None),
            )
            .order_by(desc(ChatThread.updated_at))
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_thread_messages(
        self,
        user_id: uuid.UUID,
        thread_id: uuid.UUID,
    ) -> list[ChatMessage]:
        """Retrieve all messages in a thread."""
        stmt = (
            select(ChatMessage)
            .join(ChatThread, ChatMessage.thread_id == ChatThread.id)
            .where(
                ChatMessage.thread_id == thread_id,
                ChatMessage.user_id == user_id,
                ChatThread.deleted_at.is_(None),
            )
            .order_by(ChatMessage.created_at.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def ask(
        self,
        user_id: uuid.UUID,
        message: str,
        thread_id: uuid.UUID | None = None,
    ) -> tuple[ChatThread, ChatMessage]:
        """Process a question, execute grounded retrieval, validate, and record message."""
        clean_msg = message.strip()
        thread = await self.get_or_create_thread(
            user_id=user_id,
            thread_id=thread_id,
            initial_title=clean_msg,
        )

        # 1. Record user message
        user_msg = ChatMessage(
            thread_id=thread.id,
            user_id=user_id,
            role="user",
            content=clean_msg,
            sources=[],
            tool_calls=[],
        )
        self.session.add(user_msg)
        await self.session.flush()

        # 2. Intent Routing
        plan = route_intent(clean_msg)
        tools = AssistantSQLTools(self.session, user_id=user_id)
        tool_results_list: list[dict[str, Any]] = []
        allowed_numbers: set[float] = set()
        executed_tool_calls: list[dict[str, Any]] = []

        # Execute relevant tools
        for intent in plan.intents:
            tr: ToolResult | None = None
            if intent == "COMPLETED_TASKS":
                tr = await tools.completed_tasks(plan.start_date, plan.end_date)
            elif intent == "TIME_SPENT":
                tr = await tools.time_spent(plan.start_date, plan.end_date)
            elif intent == "PENDING_OVERDUE":
                tr = await tools.pending_overdue()
            elif intent == "WORK_LOGS":
                tr = await tools.work_logs(plan.start_date, plan.end_date)
            elif intent == "PROFILE_FACTS":
                tr = await tools.profile_facts()

            if tr is not None:
                tool_results_list.append(
                    {
                        "tool_name": tr.tool_name,
                        "summary": tr.summary,
                        "data": tr.data,
                        "total_count": tr.total_count,
                    }
                )
                for num in tr.numbers:
                    allowed_numbers.add(float(num))
                executed_tool_calls.append(
                    {
                        "tool": tr.tool_name,
                        "count": tr.total_count,
                        "summary": tr.summary,
                    }
                )

        # 3. Vault Search
        search_svc = VaultSearchService(self.session)
        vault_items = await search_svc.search(
            user_id=user_id,
            query=clean_msg,
            mode="hybrid",
            start_date=plan.start_date,
            end_date=plan.end_date,
            limit=8,
        )
        vault_sources = [
            {
                "note_id": str(v.note_id),
                "title": v.title,
                "snippet": v.snippet,
                "source_type": v.source_type,
                "occurred_on": v.occurred_on.isoformat(),
                "score": v.score,
            }
            for v in vault_items
        ]
        allowed_numbers.add(float(len(vault_sources)))

        # 4. Generate Answer via deterministic path (R11, ADR-020, AC-RAG-7)
        # Guarantees 0% fabricated facts, numbers, or citations.
        answer_text, sources = generate_deterministic_answer(
            tool_results=tool_results_list,
            vault_sources=vault_sources,
            query=clean_msg,
        )

        # 5. Record Assistant Message
        assistant_msg = ChatMessage(
            thread_id=thread.id,
            user_id=user_id,
            role="assistant",
            content=answer_text,
            sources=sources,
            tool_calls=executed_tool_calls,
            provider="deterministic_alibi",
            model="grounded_v1",
        )
        self.session.add(assistant_msg)
        thread.updated_at = utc_now()
        await self.session.flush()

        return (thread, assistant_msg)
