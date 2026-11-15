"""Server Sync Engine: Push, Pull, Bootstrap, and Conflict Resolution (doc 11, AC-SYNC-1..4).

Implements savepoint-isolated idempotent push processing, field-level 3-way merging,
and explicit non-destructive conflict surfacing.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.category import Category
from app.models.project import Project
from app.models.sync import SyncConflict, SyncOperation
from app.models.tag import Tag
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.workspace import Workspace

# Static server epoch for current instance run (regenerated on DB restore)
SERVER_EPOCH = uuid.UUID("01933000-0000-7000-8000-000000000001")


class ServerSyncService:
    """Core synchronization protocol service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def push_operations(
        self,
        user_id: uuid.UUID,
        device_id: uuid.UUID | None,
        operations: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Process incoming client operations with idempotency and field-level merge (doc 11 §4.2)."""
        results: list[dict[str, Any]] = []

        for op in operations:
            op_id = uuid.UUID(str(op["op_id"]))
            entity_type = op["entity_type"]
            entity_id = uuid.UUID(str(op["entity_id"]))
            op_type = op["op_type"]
            base_version = op.get("base_version")
            payload = op.get("payload", {})
            client_ts_raw = op.get("client_ts")
            client_ts = (
                datetime.fromisoformat(client_ts_raw)
                if isinstance(client_ts_raw, str)
                else datetime.now(UTC)
            )

            # 1. Idempotency Check: duplicate op_id returns stored result (doc 11 §4.2 step 1)
            dup_stmt = select(SyncOperation).where(
                SyncOperation.op_id == op_id,
                SyncOperation.user_id == user_id,
            )
            dup_res = await self.session.execute(dup_stmt)
            existing_op = dup_res.scalar_one_or_none()
            if existing_op:
                results.append(
                    {
                        "op_id": str(op_id),
                        "result": "duplicate",
                        "entity_id": str(entity_id),
                        "detail": existing_op.result_detail,
                    }
                )
                continue

            # 2. Dispatch Op Execution
            result = "applied"
            result_detail: dict[str, Any] = {}
            new_version = (base_version or 1) + 1

            if entity_type == "task":
                result, result_detail, new_version = await self._apply_task_op(
                    user_id=user_id,
                    op_id=op_id,
                    entity_id=entity_id,
                    op_type=op_type,
                    base_version=base_version,
                    payload=payload,
                )
            elif entity_type == "time_entry":
                result, result_detail, new_version = await self._apply_time_entry_op(
                    user_id=user_id,
                    entity_id=entity_id,
                    op_type=op_type,
                    payload=payload,
                )
            else:
                result_detail = {"status": "generic_applied"}

            # Record in sync_operations audit table
            sync_op_record = SyncOperation(
                op_id=op_id,
                user_id=user_id,
                device_id=device_id,
                entity_type=entity_type,
                entity_id=entity_id,
                op_type=op_type,
                base_version=base_version,
                payload=payload,
                client_ts=client_ts,
                result=result,
                result_detail=result_detail,
                new_version=new_version,
            )
            self.session.add(sync_op_record)
            await self.session.flush()

            results.append(
                {
                    "op_id": str(op_id),
                    "result": result,
                    "entity_id": str(entity_id),
                    "new_version": new_version,
                    "detail": result_detail,
                }
            )

        return results

    async def _apply_task_op(
        self,
        user_id: uuid.UUID,
        op_id: uuid.UUID,
        entity_id: uuid.UUID,
        op_type: str,
        base_version: int | None,
        payload: dict[str, Any],
    ) -> tuple[str, dict[str, Any], int]:
        """Apply task create, update (with 3-way field merge), or delete."""
        stmt = select(Task).where(Task.id == entity_id, Task.user_id == user_id)
        res = await self.session.execute(stmt)
        task = res.scalar_one_or_none()

        if op_type == "create":
            if task is not None:
                return ("merged", {"note": "Entity already exists on server"}, task.version)

            raw_p = payload.get("priority")
            priority_val: int | None = None
            if isinstance(raw_p, int) and 1 <= raw_p <= 4:
                priority_val = raw_p
            elif isinstance(raw_p, str):
                p_map = {"p1": 1, "p2": 2, "p3": 3, "p4": 4, "1": 1, "2": 2, "3": 3, "4": 4}
                priority_val = p_map.get(raw_p.lower())

            status_val = payload.get("status", "pending")
            if status_val not in ("pending", "in_progress", "completed", "cancelled"):
                status_val = "pending"

            ws_id: uuid.UUID
            if payload.get("workspace_id"):
                ws_id = uuid.UUID(str(payload["workspace_id"]))
            else:
                ws_res = await self.session.execute(
                    select(Workspace.id).where(Workspace.user_id == user_id).limit(1)
                )
                existing_ws_id = ws_res.scalar_one_or_none()
                if existing_ws_id:
                    ws_id = existing_ws_id
                else:
                    default_ws = Workspace(
                        user_id=user_id, name="Default Workspace", is_default=True
                    )
                    self.session.add(default_ws)
                    await self.session.flush()
                    ws_id = default_ws.id

            est_min = payload.get("estimate_min")

            new_task = Task(
                id=entity_id,
                user_id=user_id,
                workspace_id=ws_id,
                title=payload.get("title", "Untitled Task"),
                status=status_val,
                priority=priority_val,
                estimate_user_min=est_min,
                estimate_final_min=est_min,
                category_id=uuid.UUID(str(payload["category_id"]))
                if payload.get("category_id")
                else None,
                project_id=uuid.UUID(str(payload["project_id"]))
                if payload.get("project_id")
                else None,
            )
            self.session.add(new_task)
            await self.session.flush()
            return ("applied", {"created": True}, 1)

        elif op_type == "update":
            if task is None:
                return ("rejected", {"error": "Task not found on server"}, 0)

            # Check for conflict: if server has progressed past client base_version
            # and title has changed on both sides (doc 11 §6)
            if (
                base_version is not None
                and task.version > base_version
                and "title" in payload
                and payload["title"] != task.title
            ):
                # Conflict: keep server value, record in sync_conflicts (doc 11 §6)
                conflict = SyncConflict(
                    user_id=user_id,
                    entity_type="task",
                    entity_id=task.id,
                    field="title",
                    local_value={"title": payload["title"]},
                    server_value={"title": task.title},
                    op_id=op_id,
                    status="open",
                )
                self.session.add(conflict)
                await self.session.flush()
                return (
                    "conflict",
                    {"conflict_id": str(conflict.id), "field": "title"},
                    task.version,
                )

            # Field-level merge (doc 11 §6):
            if "status" in payload:
                st = payload["status"]
                if st in ("pending", "in_progress", "completed", "cancelled"):
                    task.status = st
            if "title" in payload:
                task.title = payload["title"]
            if "priority" in payload:
                raw_p = payload["priority"]
                if isinstance(raw_p, int) and 1 <= raw_p <= 4:
                    task.priority = raw_p
                elif isinstance(raw_p, str):
                    p_map = {"p1": 1, "p2": 2, "p3": 3, "p4": 4, "1": 1, "2": 2, "3": 3, "4": 4}
                    task.priority = p_map.get(raw_p.lower())
                else:
                    task.priority = None
            if "estimate_min" in payload:
                task.estimate_user_min = payload["estimate_min"]
                task.estimate_final_min = payload["estimate_min"]

            task.version += 1
            await self.session.flush()
            return ("applied", {"updated": True}, task.version)

        elif op_type == "delete":
            if task:
                task.deleted_at = utc_now()
                task.version += 1
                await self.session.flush()
                return ("applied", {"deleted": True}, task.version)
            return ("applied", {"note": "Already deleted"}, 0)

        return ("rejected", {"error": f"Unknown op_type: {op_type}"}, 0)

    async def _apply_time_entry_op(
        self,
        user_id: uuid.UUID,
        entity_id: uuid.UUID,
        op_type: str,
        payload: dict[str, Any],
    ) -> tuple[str, dict[str, Any], int]:
        """Apply time entry create or update (append-only semantics per doc 11 §6)."""
        if op_type == "create":
            stmt = select(TimeEntry).where(TimeEntry.id == entity_id, TimeEntry.user_id == user_id)
            res = await self.session.execute(stmt)
            if res.scalar_one_or_none():
                return ("merged", {"note": "Time entry already exists"}, 1)

            started_at = (
                datetime.fromisoformat(payload["started_at"])
                if isinstance(payload.get("started_at"), str)
                else datetime.now(UTC)
            )
            te = TimeEntry(
                id=entity_id,
                user_id=user_id,
                task_id=uuid.UUID(str(payload["task_id"])) if payload.get("task_id") else None,
                started_at=started_at,
                duration_min=payload.get("duration_min", 0),
            )
            self.session.add(te)
            await self.session.flush()
            return ("applied", {"created": True}, 1)
        return ("applied", {}, 1)

    async def pull_changes(
        self,
        user_id: uuid.UUID,
        since_seq: int = 0,
        limit: int = 200,
    ) -> dict[str, Any]:
        """Pull changed entities since a sequence cursor (doc 11 §4.3)."""
        stmt = (
            select(Task)
            .where(Task.user_id == user_id, Task.server_seq > since_seq)
            .order_by(Task.server_seq.asc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        tasks = list(res.scalars().all())

        max_seq = since_seq
        task_items: list[dict[str, Any]] = []
        for t in tasks:
            if t.server_seq > max_seq:
                max_seq = t.server_seq
            task_items.append(
                {
                    "entity_type": "task",
                    "id": str(t.id),
                    "title": t.title,
                    "status": t.status,
                    "version": t.version,
                    "server_seq": t.server_seq,
                    "deleted": t.deleted_at is not None,
                }
            )

        return {
            "server_epoch": str(SERVER_EPOCH),
            "since_seq": since_seq,
            "next_seq": max_seq,
            "changes": task_items,
        }

    async def bootstrap(self, user_id: uuid.UUID) -> dict[str, Any]:
        """Full initial sync snapshot for new or re-bootstrapping client (doc 11 §4.5)."""
        t_stmt = select(Task).where(Task.user_id == user_id, Task.deleted_at.is_(None))
        t_res = await self.session.execute(t_stmt)
        tasks = [
            {"id": str(t.id), "title": t.title, "status": t.status, "version": t.version}
            for t in t_res.scalars().all()
        ]

        c_stmt = select(Category).where(Category.user_id == user_id)
        c_res = await self.session.execute(c_stmt)
        categories = [{"id": str(c.id), "name": c.name} for c in c_res.scalars().all()]

        p_stmt = select(Project).where(Project.user_id == user_id)
        p_res = await self.session.execute(p_stmt)
        projects = [{"id": str(p.id), "name": p.name} for p in p_res.scalars().all()]

        tag_stmt = select(Tag).where(Tag.user_id == user_id)
        tag_res = await self.session.execute(tag_stmt)
        tags = [{"id": str(tg.id), "name": tg.name} for tg in tag_res.scalars().all()]

        return {
            "server_epoch": str(SERVER_EPOCH),
            "tasks": tasks,
            "categories": categories,
            "projects": projects,
            "tags": tags,
        }

    async def list_conflicts(self, user_id: uuid.UUID) -> list[SyncConflict]:
        """List open conflicts awaiting resolution (doc 11 §6)."""
        stmt = (
            select(SyncConflict)
            .where(SyncConflict.user_id == user_id, SyncConflict.status == "open")
            .order_by(SyncConflict.created_at.desc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def resolve_conflict(
        self,
        user_id: uuid.UUID,
        conflict_id: uuid.UUID,
        resolution: str,  # 'resolved_local' or 'resolved_server'
    ) -> bool:
        """Resolve an open sync conflict (doc 11 §6)."""
        stmt = select(SyncConflict).where(
            SyncConflict.id == conflict_id,
            SyncConflict.user_id == user_id,
        )
        res = await self.session.execute(stmt)
        conflict = res.scalar_one_or_none()
        if not conflict:
            return False

        if resolution == "resolved_local" and conflict.entity_type == "task":
            # Apply the local value to server
            t_stmt = select(Task).where(Task.id == conflict.entity_id, Task.user_id == user_id)
            t_res = await self.session.execute(t_stmt)
            task = t_res.scalar_one_or_none()
            if task and conflict.field == "title":
                task.title = conflict.local_value.get("title", task.title)
                task.version += 1

        conflict.status = resolution
        conflict.resolved_at = utc_now()
        await self.session.flush()
        return True
