"""Grounded Assistant API endpoints (doc 04, doc 08)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.assistant.service import AssistantService
from app.schemas.vault import (
    ChatAskRequest,
    ChatMessageResponse,
    ChatThreadResponse,
)

router = APIRouter(prefix="/assistant", tags=["Grounded Assistant"])


@router.post("/chat", response_model=ChatMessageResponse, status_code=status.HTTP_200_OK)
async def chat_with_assistant(
    body: ChatAskRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatMessageResponse:
    """Send a question to the assistant and receive a grounded response with citations."""
    service = AssistantService(db)
    thread, msg = await service.ask(
        user_id=auth.user.id,
        message=body.message,
        thread_id=body.thread_id,
    )
    return ChatMessageResponse(
        id=msg.id,
        thread_id=thread.id,
        role=msg.role,
        content=msg.content,
        sources=msg.sources,
        tool_calls=msg.tool_calls,
        provider=msg.provider,
        model=msg.model,
        created_at=msg.created_at,
    )


@router.get("/threads", response_model=list[ChatThreadResponse])
async def list_chat_threads(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 20,
) -> list[ChatThreadResponse]:
    """List recent conversation threads with the grounded assistant."""
    service = AssistantService(db)
    threads = await service.list_threads(user_id=auth.user.id, limit=limit)
    return [
        ChatThreadResponse(
            id=t.id,
            title=t.title,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in threads
    ]


@router.get("/threads/{thread_id}/messages", response_model=list[ChatMessageResponse])
async def get_thread_messages(
    thread_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ChatMessageResponse]:
    """Retrieve message history for a specific conversation thread."""
    service = AssistantService(db)
    messages = await service.get_thread_messages(user_id=auth.user.id, thread_id=thread_id)
    return [
        ChatMessageResponse(
            id=m.id,
            thread_id=m.thread_id,
            role=m.role,
            content=m.content,
            sources=m.sources,
            tool_calls=m.tool_calls,
            provider=m.provider,
            model=m.model,
            created_at=m.created_at,
        )
        for m in messages
    ]
