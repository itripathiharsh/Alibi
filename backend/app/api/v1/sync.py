"""Sync API endpoints (doc 04, doc 11)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.schemas.sync import (
    SyncBootstrapResponse,
    SyncConflictResolveRequest,
    SyncConflictResponse,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
)
from app.sync.service import ServerSyncService

router = APIRouter(prefix="/sync", tags=["Sync"])


@router.post("/push", response_model=SyncPushResponse)
async def push_sync_operations(
    body: SyncPushRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SyncPushResponse:
    """Push offline operations batch to server with idempotency and merge (doc 11 §4.2)."""
    service = ServerSyncService(db)
    ops_dicts = [op.model_dump() for op in body.operations]
    results = await service.push_operations(
        user_id=auth.user.id,
        device_id=body.device_id,
        operations=ops_dicts,
    )
    await db.commit()
    return SyncPushResponse(results=results)


@router.get("/pull", response_model=SyncPullResponse)
async def pull_sync_changes(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    since_seq: int = 0,
    limit: int = 200,
) -> SyncPullResponse:
    """Pull incremental server changes since a sequence cursor (doc 11 §4.3)."""
    service = ServerSyncService(db)
    data = await service.pull_changes(user_id=auth.user.id, since_seq=since_seq, limit=limit)
    return SyncPullResponse(
        server_epoch=data["server_epoch"],
        since_seq=data["since_seq"],
        next_seq=data["next_seq"],
        changes=data["changes"],
    )


@router.get("/bootstrap", response_model=SyncBootstrapResponse)
async def bootstrap_sync(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SyncBootstrapResponse:
    """Download full initial snapshot for new client or epoch reset (doc 11 §4.5)."""
    service = ServerSyncService(db)
    data = await service.bootstrap(user_id=auth.user.id)
    return SyncBootstrapResponse(
        server_epoch=data["server_epoch"],
        tasks=data["tasks"],
        categories=data["categories"],
        projects=data["projects"],
        tags=data["tags"],
    )


@router.get("/conflicts", response_model=list[SyncConflictResponse])
async def list_sync_conflicts(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SyncConflictResponse]:
    """List open conflicts requiring user decision (doc 11 §6)."""
    service = ServerSyncService(db)
    conflicts = await service.list_conflicts(user_id=auth.user.id)
    return [
        SyncConflictResponse(
            id=c.id,
            entity_type=c.entity_type,
            entity_id=c.entity_id,
            field=c.field,
            local_value=c.local_value,
            server_value=c.server_value,
            op_id=c.op_id,
            status=c.status,
            created_at=c.created_at,
        )
        for c in conflicts
    ]


@router.post("/conflicts/{conflict_id}/resolve", status_code=status.HTTP_200_OK)
async def resolve_sync_conflict(
    conflict_id: uuid.UUID,
    body: SyncConflictResolveRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Resolve a sync conflict choosing local or server value (doc 11 §6)."""
    service = ServerSyncService(db)
    success = await service.resolve_conflict(
        user_id=auth.user.id,
        conflict_id=conflict_id,
        resolution=body.resolution,
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conflict not found")
    await db.commit()
    return {"status": body.resolution}
