"""Server Sync Engine: Push, Pull, Bootstrap, and Conflict Resolution (doc 11, AC-SYNC-1..4).

Implements savepoint-isolated idempotent push processing, field-level 3-way merging,
and explicit non-destructive conflict surfacing.
"""

import hashlib
import logging
import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.category import Category
from app.models.project import Project
from app.models.sync import SyncConflict, SyncOperation
from app.models.tag import Tag
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.vault import Note, NoteEmbedding
from app.models.workspace import Workspace
from app.vault.links import append_task_completion

# Static server epoch for current instance run (regenerated on DB restore)
SERVER_EPOCH = uuid.UUID("01933000-0000-7000-8000-000000000001")

logger = logging.getLogger("alibi.sync")

MAX_ESTIMATE_MIN = 10080  # tasks table check constraint (one week)


def _minutes(value: Any) -> int | None:
    """An estimate the tasks table accepts (1..10080 minutes), else None."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    minutes = round(value)
    return minutes if 1 <= minutes <= MAX_ESTIMATE_MIN else None


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

            # 2. Dispatch Op Execution, one savepoint per op. A malformed op used to raise
            # out of the loop: the whole push failed with a 500, the phone retried the same
            # batch forever and nothing queued after it ever synced (logic audit S1).
            result = "applied"
            result_detail: dict[str, Any] = {}
            new_version = (base_version or 1) + 1
            try:
                async with self.session.begin_nested():
                    result, result_detail, new_version = await self._dispatch_op(
                        user_id=user_id,
                        op_id=op_id,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        op_type=op_type,
                        base_version=base_version,
                        payload=payload,
                        default=(result, result_detail, new_version),
                    )
            except (SQLAlchemyError, ValueError, TypeError, KeyError) as exc:
                logger.warning(
                    "Sync op rejected (%s %s): %s", entity_type, op_type, type(exc).__name__
                )
                result, result_detail, new_version = (
                    "rejected",
                    {"error": "The server could not apply this change"},
                    base_version or 0,
                )

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

    async def _dispatch_op(
        self,
        *,
        user_id: uuid.UUID,
        op_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        op_type: str,
        base_version: int | None,
        payload: dict[str, Any],
        default: tuple[str, dict[str, Any], int],
    ) -> tuple[str, dict[str, Any], int]:
        """Apply one op to its entity type; unknown types keep the generic result."""
        if entity_type == "task":
            return await self._apply_task_op(
                user_id=user_id,
                op_id=op_id,
                entity_id=entity_id,
                op_type=op_type,
                base_version=base_version,
                payload=payload,
            )
        if entity_type == "time_entry":
            return await self._apply_time_entry_op(
                user_id=user_id,
                entity_id=entity_id,
                op_type=op_type,
                payload=payload,
            )
        if entity_type == "project":
            return await self._apply_project_op(
                user_id=user_id,
                op_id=op_id,
                entity_id=entity_id,
                op_type=op_type,
                base_version=base_version,
                payload=payload,
            )
        if entity_type in ("vault_note", "note"):
            return await self._apply_vault_note_op(
                user_id=user_id,
                op_id=op_id,
                entity_id=entity_id,
                op_type=op_type,
                base_version=base_version,
                payload=payload,
            )
        return default[0], {"status": "generic_applied"}, default[2]

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
                requested_ws_id = uuid.UUID(str(payload["workspace_id"]))
                workspace_exists = await self.session.scalar(
                    select(Workspace.id).where(
                        Workspace.id == requested_ws_id,
                        Workspace.user_id == user_id,
                    )
                )
                if not workspace_exists:
                    return ("rejected", {"error": "Workspace not found"}, 0)
                ws_id = requested_ws_id
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

            category_id = None
            if payload.get("category_id"):
                category_id = uuid.UUID(str(payload["category_id"]))
                category_exists = await self.session.scalar(
                    select(Category.id).where(
                        Category.id == category_id,
                        Category.user_id == user_id,
                    )
                )
                if not category_exists:
                    return ("rejected", {"error": "Category not found"}, 0)

            project_id = None
            if payload.get("project_id"):
                project_id = uuid.UUID(str(payload["project_id"]))
                project_exists = await self.session.scalar(
                    select(Project.id).where(
                        Project.id == project_id,
                        Project.user_id == user_id,
                    )
                )
                if not project_exists:
                    return ("rejected", {"error": "Project not found"}, 0)

            # Logic audit B2: phones send estimate_user_min / estimate_final_min, which this
            # path ignored (older clients send estimate_min). Out-of-range values are dropped.
            est_user = _minutes(payload.get("estimate_user_min")) or _minutes(
                payload.get("estimate_min")
            )
            est_final = _minutes(payload.get("estimate_final_min")) or est_user
            raw_actual = payload.get("actual_min")
            actual_min = (
                round(raw_actual)
                if isinstance(raw_actual, int | float)
                and not isinstance(raw_actual, bool)
                and raw_actual > 0
                else 0
            )
            created_at = self._parse_datetime(payload.get("created_at")) or utc_now()
            deadline_at = self._parse_datetime(payload.get("deadline_at"))
            completed_at = self._parse_datetime(payload.get("completed_at"))
            if status_val == "completed" and completed_at is None:
                completed_at = created_at

            new_task = Task(
                id=entity_id,
                user_id=user_id,
                workspace_id=ws_id,
                title=payload.get("title", "Untitled Task"),
                status=status_val,
                priority=priority_val,
                category_id=category_id,
                project_id=project_id,
                deadline_at=deadline_at,
                estimate_user_min=est_user,
                estimate_final_min=est_final,
                actual_min=actual_min,
                created_at=created_at,
                completed_at=completed_at,
                origin=payload.get("origin")
                if payload.get("origin")
                in (
                    "manual",
                    "voice",
                    "ai_recommendation",
                    "meeting",
                    "external_assignment",
                    "recurring",
                )
                else "manual",
            )
            self.session.add(new_task)
            await self.session.flush()
            return ("applied", {"created": True}, 1)

        elif op_type == "update":
            if task is None:
                return ("rejected", {"error": "Task not found on server"}, 0)
            prior_status = task.status

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
                # None clears the estimate; an out-of-range value is ignored (logic audit B2).
                minutes = _minutes(payload["estimate_min"])
                if payload["estimate_min"] is None or minutes is not None:
                    task.estimate_user_min = minutes
                    task.estimate_final_min = minutes
            if "reschedule_count" in payload:
                # Logic audit B3: the phone counts moves of a due date locally, and this
                # count was dropped. Keep the higher value so a replayed or older op never
                # lowers it.
                count = payload["reschedule_count"]
                if isinstance(count, int) and not isinstance(count, bool) and 0 <= count <= 10_000:
                    task.reschedule_count = max(task.reschedule_count or 0, count)
            if "deadline_at" in payload:
                task.deadline_at = self._parse_datetime(payload.get("deadline_at"))
            if "category_id" in payload:
                category_id = (
                    uuid.UUID(str(payload["category_id"])) if payload["category_id"] else None
                )
                if category_id and not await self.session.scalar(
                    select(Category.id).where(
                        Category.id == category_id,
                        Category.user_id == user_id,
                    )
                ):
                    return ("rejected", {"error": "Category not found"}, task.version)
                task.category_id = category_id
            if "project_id" in payload:
                project_id = (
                    uuid.UUID(str(payload["project_id"])) if payload["project_id"] else None
                )
                if project_id and not await self.session.scalar(
                    select(Project.id).where(
                        Project.id == project_id,
                        Project.user_id == user_id,
                    )
                ):
                    return ("rejected", {"error": "Project not found"}, task.version)
                task.project_id = project_id
            if task.status == "completed" and task.completed_at is None:
                task.completed_at = self._parse_datetime(payload.get("completed_at")) or utc_now()
            elif task.status != "completed":
                task.completed_at = None

            if prior_status != "completed" and task.status == "completed":
                await append_task_completion(
                    session=self.session,
                    user_id=user_id,
                    task_id=task.id,
                    task_title=task.title,
                    completed_at=task.completed_at or utc_now(),
                )

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
            existing_entry = res.scalar_one_or_none()
            if existing_entry:
                # An offline stop of a timer started online replays the same timer
                # id as a create op. Finalize that still-open record exactly once.
                ended_at = self._parse_datetime(payload.get("ended_at"))
                duration_min = payload.get("duration_min")
                if (
                    existing_entry.ended_at is None
                    and ended_at is not None
                    and isinstance(duration_min, int)
                    and 1 <= duration_min <= 1440
                ):
                    if ended_at < existing_entry.started_at:
                        return ("rejected", {"error": "End time precedes start time"}, 1)
                    existing_entry.ended_at = ended_at
                    existing_entry.duration_min = duration_min
                    task = await self.session.scalar(
                        select(Task).where(
                            Task.id == existing_entry.task_id,
                            Task.user_id == user_id,
                        )
                    )
                    if task is None:
                        return ("rejected", {"error": "Task not found"}, 1)
                    task.actual_min += duration_min
                    await self.session.flush()
                    return ("applied", {"stopped": True}, 1)
                return ("merged", {"note": "Time entry already exists"}, 1)

            started_at = (
                datetime.fromisoformat(payload["started_at"])
                if isinstance(payload.get("started_at"), str)
                else datetime.now(UTC)
            )
            task = (
                await self.session.scalar(
                    select(Task).where(
                        Task.id == uuid.UUID(str(payload["task_id"])), Task.user_id == user_id
                    )
                )
                if payload.get("task_id")
                else None
            )
            if task is None:
                return ("rejected", {"error": "Task not found"}, 0)
            duration_min = payload.get("duration_min")
            if not isinstance(duration_min, int) or not 1 <= duration_min <= 1440:
                return ("rejected", {"error": "Duration must be between 1 and 1440 minutes"}, 0)
            ended_at = self._parse_datetime(payload.get("ended_at"))
            te = TimeEntry(
                id=entity_id,
                user_id=user_id,
                task_id=task.id,
                started_at=started_at,
                ended_at=ended_at or started_at,
                duration_min=duration_min,
                source="timer" if payload.get("source") == "timer" else "manual",
            )
            self.session.add(te)
            task.actual_min += duration_min
            await self.session.flush()
            return ("applied", {"created": True}, 1)
        return ("applied", {}, 1)

    async def _get_or_create_default_workspace(self, user_id: uuid.UUID) -> uuid.UUID:
        ws_res = await self.session.execute(
            select(Workspace.id).where(Workspace.user_id == user_id).limit(1)
        )
        ws_id = ws_res.scalar_one_or_none()
        if not ws_id:
            default_ws = Workspace(user_id=user_id, name="Default Workspace", is_default=True)
            self.session.add(default_ws)
            await self.session.flush()
            ws_id = default_ws.id
        return ws_id

    async def _apply_project_op(
        self,
        user_id: uuid.UUID,
        op_id: uuid.UUID,
        entity_id: uuid.UUID,
        op_type: str,
        base_version: int | None,
        payload: dict[str, Any],
    ) -> tuple[str, dict[str, Any], int]:
        """Apply project create, update (with field merge), or delete."""
        stmt = select(Project).where(Project.id == entity_id, Project.user_id == user_id)
        res = await self.session.execute(stmt)
        project = res.scalar_one_or_none()

        if op_type == "create":
            if project is not None:
                return ("merged", {"note": "Project already exists on server"}, project.version)

            ws_id: uuid.UUID
            if payload.get("workspace_id"):
                try:
                    requested_ws_id = uuid.UUID(str(payload["workspace_id"]))
                    ws_exists = await self.session.scalar(
                        select(Workspace.id).where(
                            Workspace.id == requested_ws_id, Workspace.user_id == user_id
                        )
                    )
                    ws_id = (
                        requested_ws_id
                        if ws_exists
                        else await self._get_or_create_default_workspace(user_id)
                    )
                except Exception:
                    ws_id = await self._get_or_create_default_workspace(user_id)
            else:
                ws_id = await self._get_or_create_default_workspace(user_id)

            cat_id: uuid.UUID | None = None
            if payload.get("category_id"):
                try:
                    requested_cat_id = uuid.UUID(str(payload["category_id"]))
                    cat_exists = await self.session.scalar(
                        select(Category.id).where(
                            Category.id == requested_cat_id, Category.user_id == user_id
                        )
                    )
                    if cat_exists:
                        cat_id = requested_cat_id
                except Exception:
                    pass

            name_val = str(payload.get("name", "Untitled Project")).strip() or "Untitled Project"
            desc_val = str(payload.get("description", "")).strip() or None
            status_val = str(payload.get("status", "active")).strip().lower()
            if status_val not in ("active", "paused", "done", "archived"):
                status_val = "active"
            color_val = str(payload.get("color", "#FF741F")).strip() or "#FF741F"

            new_project = Project(
                id=entity_id,
                user_id=user_id,
                workspace_id=ws_id,
                category_id=cat_id,
                name=name_val,
                description=desc_val,
                status=status_val,
                color=color_val,
                version=1,
            )
            self.session.add(new_project)
            await self.session.flush()
            return ("applied", {"created": True}, new_project.version)

        elif op_type == "update":
            if project is None:
                return await self._apply_project_op(
                    user_id=user_id,
                    op_id=op_id,
                    entity_id=entity_id,
                    op_type="create",
                    base_version=base_version,
                    payload=payload,
                )

            if project.deleted_at is not None:
                # Update on a tombstone: never resurrect silently (doc 11 §6, scenario S6).
                return await self._tombstone_conflict(
                    user_id,
                    op_id,
                    "project",
                    project.id,
                    project.deleted_at,
                    payload,
                    project.version,
                )

            conflicted = await self._open_field_conflicts(
                user_id=user_id,
                op_id=op_id,
                entity_type="project",
                entity_id=project.id,
                server_version=project.version,
                base_version=base_version,
                payload=payload,
                server_values={
                    "name": project.name,
                    "description": project.description,
                    "status": project.status,
                    "category_id": project.category_id,
                },
            )
            remaining = {k: v for k, v in payload.items() if k not in conflicted}
            # One UPDATE per op: the version trigger bumps once per UPDATE, so lookups inside
            # the apply step must not autoflush a half-applied row.
            with self.session.no_autoflush:
                changed = await self._apply_project_fields(project, user_id, remaining)
            if changed:
                project.version += 1
            await self.session.flush()
            if conflicted:
                return ("conflict", {"conflict_fields": conflicted}, project.version)
            return ("applied", {"updated": True}, project.version)

        elif op_type == "delete":
            if project is None or project.deleted_at is not None:
                return ("applied", {"note": "Already deleted"}, project.version if project else 0)
            if base_version is not None and project.version > base_version:
                # Delete on an entity modified since the client saw it (doc 11 §6).
                return await self._delete_conflict(
                    user_id, op_id, "project", project.id, project.version
                )
            project.deleted_at = utc_now()
            project.version += 1
            await self.session.flush()
            return ("applied", {"deleted": True}, project.version)

        return ("rejected", {"error": f"Unknown op_type: {op_type}"}, 0)

    async def _apply_project_fields(
        self, project: Project, user_id: uuid.UUID, payload: dict[str, Any]
    ) -> bool:
        """Apply validated project fields from a sync payload. Returns True if anything changed."""
        changed = False
        if payload.get("name"):
            name = str(payload["name"]).strip()
            if name and name != project.name:
                project.name = name
                changed = True
        if "description" in payload:
            desc = str(payload["description"]).strip() if payload["description"] else None
            if desc != project.description:
                project.description = desc
                changed = True
        if "status" in payload:
            s_val = str(payload["status"]).strip().lower()
            if s_val in ("active", "paused", "done", "archived") and s_val != project.status:
                project.status = s_val
                changed = True
        if payload.get("color"):
            color = str(payload["color"]).strip()
            if color != project.color:
                project.color = color
                changed = True
        if "category_id" in payload:
            cid = self._parse_uuid(payload["category_id"])
            if cid is None and payload["category_id"]:
                pass  # malformed id: ignore rather than clear the category
            elif cid is None:
                if project.category_id is not None:
                    project.category_id = None
                    changed = True
            elif cid != project.category_id and await self.session.scalar(
                select(Category.id).where(Category.id == cid, Category.user_id == user_id)
            ):
                project.category_id = cid
                changed = True
        return changed

    async def _open_field_conflicts(
        self,
        *,
        user_id: uuid.UUID,
        op_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        server_version: int,
        base_version: int | None,
        payload: dict[str, Any],
        server_values: dict[str, Any],
    ) -> list[str]:
        """Open a conflict for each guarded field both sides changed (doc 11 §6).

        When the server has moved past the client's base version and the client sends a
        different value for a guarded field, the server value is kept and the local value is
        stored in ``sync_conflicts`` for the user to choose. Nothing is discarded.
        """
        if base_version is None or server_version <= base_version:
            return []
        conflicted: list[str] = []
        for field, server_value in server_values.items():
            if field not in payload:
                continue
            local_value = payload[field]
            if self._comparable(local_value) == self._comparable(server_value):
                continue
            self.session.add(
                SyncConflict(
                    user_id=user_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    field=field,
                    local_value={field: self._comparable(local_value)},
                    server_value={field: self._comparable(server_value)},
                    op_id=op_id,
                    status="open",
                )
            )
            conflicted.append(field)
        if conflicted:
            await self.session.flush()
        return conflicted

    async def _tombstone_conflict(
        self,
        user_id: uuid.UUID,
        op_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        deleted_at: datetime,
        payload: dict[str, Any],
        version: int,
    ) -> tuple[str, dict[str, Any], int]:
        conflict = SyncConflict(
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            field="deleted",
            local_value={"restore_with": {k: self._comparable(v) for k, v in payload.items()}},
            server_value={"deleted_at": deleted_at.isoformat()},
            op_id=op_id,
            status="open",
        )
        self.session.add(conflict)
        await self.session.flush()
        return ("conflict", {"conflict_id": str(conflict.id), "field": "deleted"}, version)

    async def _delete_conflict(
        self,
        user_id: uuid.UUID,
        op_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        version: int,
    ) -> tuple[str, dict[str, Any], int]:
        conflict = SyncConflict(
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            field="deleted",
            local_value={"deleted": True},
            server_value={"version": version},
            op_id=op_id,
            status="open",
        )
        self.session.add(conflict)
        await self.session.flush()
        return ("conflict", {"conflict_id": str(conflict.id), "field": "deleted"}, version)

    @staticmethod
    def _comparable(value: Any) -> Any:
        """Normalise a field value for comparison and JSON storage."""
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return str(value)
        if isinstance(value, str):
            return value.strip() or None
        return value

    @staticmethod
    def _parse_uuid(value: Any) -> uuid.UUID | None:
        if not value:
            return None
        try:
            return uuid.UUID(str(value))
        except ValueError:
            return None

    async def _apply_vault_note_op(
        self,
        user_id: uuid.UUID,
        op_id: uuid.UUID,
        entity_id: uuid.UUID,
        op_type: str,
        base_version: int | None,
        payload: dict[str, Any],
    ) -> tuple[str, dict[str, Any], int]:
        """Apply vault note create, update, or delete."""
        stmt = select(Note).where(Note.id == entity_id, Note.user_id == user_id)
        res = await self.session.execute(stmt)
        note = res.scalar_one_or_none()

        if op_type == "create":
            if note is not None:
                return ("merged", {"note": "Note already exists on server"}, note.version)

            title_val = str(payload.get("title", "Untitled Note")).strip() or "Untitled Note"
            body_val = str(payload.get("body", "")).strip()
            source_type_val = str(payload.get("source_type", "manual")).strip().lower()
            valid_sources = (
                "task_description",
                "completion_note",
                "work_log",
                "project_note",
                "meeting_note",
                "document",
                "decision",
                "deliverable",
                "manual",
            )
            if source_type_val not in valid_sources:
                source_type_val = "manual"

            privacy_val = str(payload.get("privacy_class", "personal")).strip().lower()
            if privacy_val not in ("personal", "work", "shared", "confidential"):
                privacy_val = "personal"

            raw_date = payload.get("occurred_on")
            occurred_on_val: date
            if isinstance(raw_date, str) and raw_date:
                try:
                    occurred_on_val = datetime.fromisoformat(raw_date.split("T")[0]).date()
                except Exception:
                    occurred_on_val = utc_now().date()
            else:
                occurred_on_val = utc_now().date()

            content_hash_val = hashlib.sha256(body_val.encode("utf-8")).hexdigest()

            proj_id: uuid.UUID | None = None
            if payload.get("project_id"):
                try:
                    p_uuid = uuid.UUID(str(payload["project_id"]))
                    p_exists = await self.session.scalar(
                        select(Project.id).where(Project.id == p_uuid, Project.user_id == user_id)
                    )
                    if p_exists:
                        proj_id = p_uuid
                except Exception:
                    pass

            new_note = Note(
                id=entity_id,
                user_id=user_id,
                source_type=source_type_val,
                title=title_val,
                body=body_val,
                occurred_on=occurred_on_val,
                privacy_class=privacy_val,
                content_hash=content_hash_val,
                project_id=proj_id,
                version=1,
            )
            self.session.add(new_note)
            await self.session.flush()
            return ("applied", {"created": True}, new_note.version)

        elif op_type == "update":
            if note is None:
                return await self._apply_vault_note_op(
                    user_id=user_id,
                    op_id=op_id,
                    entity_id=entity_id,
                    op_type="create",
                    base_version=base_version,
                    payload=payload,
                )

            if note.deleted_at is not None:
                return await self._tombstone_conflict(
                    user_id, op_id, "vault_note", note.id, note.deleted_at, payload, note.version
                )

            conflicted = await self._open_field_conflicts(
                user_id=user_id,
                op_id=op_id,
                entity_type="vault_note",
                entity_id=note.id,
                server_version=note.version,
                base_version=base_version,
                payload=payload,
                server_values={
                    "title": note.title,
                    "body": note.body,
                    "privacy_class": note.privacy_class,
                    "project_id": note.project_id,
                },
            )
            remaining = {k: v for k, v in payload.items() if k not in conflicted}
            with self.session.no_autoflush:
                changed = await self._apply_note_fields(note, user_id, remaining)
            if changed:
                note.version += 1
            await self.session.flush()
            if conflicted:
                return ("conflict", {"conflict_fields": conflicted}, note.version)
            return ("applied", {"updated": True}, note.version)

        elif op_type == "delete":
            if note is None or note.deleted_at is not None:
                return ("applied", {"note": "Already deleted"}, note.version if note else 0)
            if base_version is not None and note.version > base_version:
                return await self._delete_conflict(
                    user_id, op_id, "vault_note", note.id, note.version
                )
            note.deleted_at = utc_now()
            note.version += 1
            await self.session.flush()
            return ("applied", {"deleted": True}, note.version)

        return ("rejected", {"error": f"Unknown op_type: {op_type}"}, 0)

    async def _apply_note_fields(
        self, note: Note, user_id: uuid.UUID, payload: dict[str, Any]
    ) -> bool:
        """Apply validated note fields from a sync payload. Returns True if anything changed."""
        changed = False
        if payload.get("title"):
            title = str(payload["title"]).strip()
            if title and title != note.title:
                note.title = title
                changed = True
        if payload.get("body") is not None:
            body = str(payload["body"]).strip()
            if body != note.body:
                note.body = body
                note.content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
                # Old chunks no longer match the text; drop them so search never cites stale
                # content. The note is re-embedded when it is next ingested (KI-026).
                await self.session.execute(
                    delete(NoteEmbedding).where(NoteEmbedding.note_id == note.id)
                )
                note.embed_status = "pending"
                changed = True
        if "privacy_class" in payload:
            p_val = str(payload["privacy_class"]).strip().lower()
            if (
                p_val in ("personal", "work", "shared", "confidential")
                and p_val != note.privacy_class
            ):
                note.privacy_class = p_val
                changed = True
        if "project_id" in payload:
            pid = self._parse_uuid(payload["project_id"])
            if pid is None and payload["project_id"]:
                pass  # malformed id: ignore rather than unlink the project
            elif pid is None:
                if note.project_id is not None:
                    note.project_id = None
                    changed = True
            elif pid != note.project_id and await self.session.scalar(
                select(Project.id).where(Project.id == pid, Project.user_id == user_id)
            ):
                note.project_id = pid
                changed = True
        return changed

    async def pull_changes(
        self,
        user_id: uuid.UUID,
        since_seq: int = 0,
        limit: int = 200,
    ) -> dict[str, Any]:
        """Pull changed entities since a sequence cursor across tasks, projects, and notes (doc 11 §4.3).

        All three tables share the global ``sync_seq`` sequence. Each table is read with
        ``limit + 1`` rows, the union is ordered by ``server_seq`` and cut to ``limit``, and the
        cursor advances only to the last row actually returned. Rows past the cut are delivered
        by the next pull (``has_more``), so no change can be skipped.
        """
        limit = max(1, min(limit, 500))
        fetch = limit + 1

        t_stmt = (
            select(Task)
            .where(Task.user_id == user_id, Task.server_seq > since_seq)
            .order_by(Task.server_seq.asc())
            .limit(fetch)
        )
        p_stmt = (
            select(Project)
            .where(Project.user_id == user_id, Project.server_seq > since_seq)
            .order_by(Project.server_seq.asc())
            .limit(fetch)
        )
        n_stmt = (
            select(Note)
            .where(Note.user_id == user_id, Note.server_seq > since_seq)
            .order_by(Note.server_seq.asc())
            .limit(fetch)
        )

        candidates: list[tuple[int, dict[str, Any]]] = []
        for t in (await self.session.execute(t_stmt)).scalars().all():
            candidates.append((t.server_seq, self._serialize_task(t)))
        for p in (await self.session.execute(p_stmt)).scalars().all():
            candidates.append((p.server_seq, self._serialize_project(p)))
        for n in (await self.session.execute(n_stmt)).scalars().all():
            candidates.append((n.server_seq, self._serialize_note(n)))

        candidates.sort(key=lambda item: item[0])
        page = candidates[:limit]
        has_more = len(candidates) > limit
        next_seq = page[-1][0] if page else since_seq

        return {
            "server_epoch": str(SERVER_EPOCH),
            "since_seq": since_seq,
            "next_seq": next_seq,
            "has_more": has_more,
            "changes": [change for _, change in page],
        }

    async def bootstrap(self, user_id: uuid.UUID) -> dict[str, Any]:
        """Full initial sync snapshot for new or re-bootstrapping client (doc 11 §4.5)."""
        t_stmt = select(Task).where(Task.user_id == user_id, Task.deleted_at.is_(None))
        t_res = await self.session.execute(t_stmt)
        tasks = [self._serialize_task(t) for t in t_res.scalars().all()]

        c_stmt = select(Category).where(Category.user_id == user_id)
        c_res = await self.session.execute(c_stmt)
        categories = [{"id": str(c.id), "name": c.name} for c in c_res.scalars().all()]

        p_stmt = select(Project).where(Project.user_id == user_id, Project.deleted_at.is_(None))
        p_res = await self.session.execute(p_stmt)
        projects = [self._serialize_project(p) for p in p_res.scalars().all()]

        n_stmt = select(Note).where(Note.user_id == user_id, Note.deleted_at.is_(None))
        n_res = await self.session.execute(n_stmt)
        notes = [self._serialize_note(n) for n in n_res.scalars().all()]

        tag_stmt = select(Tag).where(Tag.user_id == user_id)
        tag_res = await self.session.execute(tag_stmt)
        tags = [{"id": str(tg.id), "name": tg.name} for tg in tag_res.scalars().all()]

        return {
            "server_epoch": str(SERVER_EPOCH),
            "tasks": tasks,
            "categories": categories,
            "projects": projects,
            "notes": notes,
            "tags": tags,
        }

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value
        if not isinstance(value, str) or not value:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed

    @staticmethod
    def _serialize_task(task: Task) -> dict[str, Any]:
        return {
            "entity_type": "task",
            "id": str(task.id),
            "user_id": str(task.user_id),
            "workspace_id": str(task.workspace_id),
            "category_id": str(task.category_id) if task.category_id else None,
            "project_id": str(task.project_id) if task.project_id else None,
            "title": task.title,
            "status": task.status,
            "priority": task.priority,
            "deadline_at": task.deadline_at.isoformat() if task.deadline_at else None,
            "original_deadline_at": (
                task.original_deadline_at.isoformat() if task.original_deadline_at else None
            ),
            "estimate_user_min": task.estimate_user_min,
            "estimate_final_min": task.estimate_final_min,
            "actual_min": task.actual_min,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            "created_at": task.created_at.isoformat(),
            "version": task.version,
            "server_seq": task.server_seq,
            "deleted": task.deleted_at is not None,
        }

    @staticmethod
    def _serialize_project(project: Project) -> dict[str, Any]:
        return {
            "entity_type": "project",
            "id": str(project.id),
            "user_id": str(project.user_id),
            "workspace_id": str(project.workspace_id),
            "category_id": str(project.category_id) if project.category_id else None,
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "color": project.color,
            "version": project.version,
            "server_seq": project.server_seq,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat(),
            "deleted": project.deleted_at is not None,
        }

    @staticmethod
    def _serialize_note(note: Note) -> dict[str, Any]:
        return {
            "entity_type": "vault_note",
            "id": str(note.id),
            "user_id": str(note.user_id),
            "source_type": note.source_type,
            "title": note.title,
            "body": note.body,
            "occurred_on": note.occurred_on.isoformat()
            if hasattr(note.occurred_on, "isoformat")
            else str(note.occurred_on),
            "privacy_class": note.privacy_class,
            "category_id": str(note.category_id) if note.category_id else None,
            "project_id": str(note.project_id) if note.project_id else None,
            "task_id": str(note.task_id) if note.task_id else None,
            "version": note.version,
            "server_seq": note.server_seq,
            "created_at": note.created_at.isoformat(),
            "updated_at": note.updated_at.isoformat(),
            "deleted": note.deleted_at is not None,
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
        elif resolution == "resolved_local" and conflict.entity_type in ("project", "vault_note"):
            await self._resolve_project_or_note_locally(user_id, conflict)

        conflict.status = resolution
        conflict.resolved_at = utc_now()
        await self.session.flush()
        return True

    async def _resolve_project_or_note_locally(
        self, user_id: uuid.UUID, conflict: SyncConflict
    ) -> None:
        """Apply the user's local choice for a project or note conflict (doc 11 §6)."""
        entity: Project | Note | None
        if conflict.entity_type == "project":
            entity = await self.session.scalar(
                select(Project).where(Project.id == conflict.entity_id, Project.user_id == user_id)
            )
        else:
            entity = await self.session.scalar(
                select(Note).where(Note.id == conflict.entity_id, Note.user_id == user_id)
            )
        if entity is None:
            return

        local = conflict.local_value if isinstance(conflict.local_value, dict) else {}
        with self.session.no_autoflush:  # one UPDATE, so the version trigger bumps once
            if conflict.field == "deleted":
                if local.get("deleted"):
                    entity.deleted_at = utc_now()
                else:
                    # "Restore with my changes": undelete, then apply the edit that hit the tombstone.
                    entity.deleted_at = None
                    restore = local.get("restore_with")
                    if isinstance(restore, dict):
                        await self._apply_entity_fields(entity, user_id, restore)
            else:
                await self._apply_entity_fields(
                    entity, user_id, {conflict.field: local.get(conflict.field)}
                )
        entity.version += 1
        await self.session.flush()

    async def _apply_entity_fields(
        self, entity: Project | Note, user_id: uuid.UUID, payload: dict[str, Any]
    ) -> bool:
        if isinstance(entity, Project):
            return await self._apply_project_fields(entity, user_id, payload)
        return await self._apply_note_fields(entity, user_id, payload)
