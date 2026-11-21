"""Server Sync Engine: Push, Pull, Bootstrap, and Conflict Resolution (doc 11, AC-SYNC-1..4).

Implements savepoint-isolated idempotent push processing, field-level 3-way merging,
and explicit non-destructive conflict surfacing.
"""

import hashlib
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
from app.models.vault import Note
from app.models.workspace import Workspace
from app.vault.links import append_task_completion

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
            elif entity_type == "project":
                result, result_detail, new_version = await self._apply_project_op(
                    user_id=user_id,
                    op_id=op_id,
                    entity_id=entity_id,
                    op_type=op_type,
                    base_version=base_version,
                    payload=payload,
                )
            elif entity_type in ("vault_note", "note"):
                result, result_detail, new_version = await self._apply_vault_note_op(
                    user_id=user_id,
                    op_id=op_id,
                    entity_id=entity_id,
                    op_type=op_type,
                    base_version=base_version,
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

            est_min = payload.get("estimate_min")
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
                estimate_user_min=est_min,
                estimate_final_min=est_min,
                actual_min=int(payload.get("actual_min") or 0),
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
                task.estimate_user_min = payload["estimate_min"]
                task.estimate_final_min = payload["estimate_min"]
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
            default_ws = Workspace(
                user_id=user_id, name="Default Workspace", is_default=True
            )
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
                        select(Workspace.id).where(Workspace.id == requested_ws_id, Workspace.user_id == user_id)
                    )
                    ws_id = requested_ws_id if ws_exists else await self._get_or_create_default_workspace(user_id)
                except Exception:
                    ws_id = await self._get_or_create_default_workspace(user_id)
            else:
                ws_id = await self._get_or_create_default_workspace(user_id)

            cat_id: uuid.UUID | None = None
            if payload.get("category_id"):
                try:
                    requested_cat_id = uuid.UUID(str(payload["category_id"]))
                    cat_exists = await self.session.scalar(
                        select(Category.id).where(Category.id == requested_cat_id, Category.user_id == user_id)
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

            if "name" in payload and payload["name"]:
                project.name = str(payload["name"]).strip()
            if "description" in payload:
                project.description = str(payload["description"]).strip() if payload["description"] else None
            if "status" in payload:
                s_val = str(payload["status"]).strip().lower()
                if s_val in ("active", "paused", "done", "archived"):
                    project.status = s_val
            if "color" in payload and payload["color"]:
                project.color = str(payload["color"]).strip()
            if "category_id" in payload:
                try:
                    cid = uuid.UUID(str(payload["category_id"])) if payload["category_id"] else None
                    if cid:
                        cat_exists = await self.session.scalar(
                            select(Category.id).where(Category.id == cid, Category.user_id == user_id)
                        )
                        if cat_exists:
                            project.category_id = cid
                    else:
                        project.category_id = None
                except Exception:
                    pass

            project.version += 1
            await self.session.flush()
            return ("applied", {"updated": True}, project.version)

        elif op_type == "delete":
            if project is not None:
                project.deleted_at = utc_now()
                project.version += 1
                await self.session.flush()
                return ("applied", {"deleted": True}, project.version)
            return ("applied", {"note": "Already deleted"}, 0)

        return ("rejected", {"error": f"Unknown op_type: {op_type}"}, 0)

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
            occurred_on_val: datetime.date
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

            if "title" in payload and payload["title"]:
                note.title = str(payload["title"]).strip()
            if "body" in payload and payload["body"] is not None:
                note.body = str(payload["body"]).strip()
                note.content_hash = hashlib.sha256(note.body.encode("utf-8")).hexdigest()
            if "privacy_class" in payload:
                p_val = str(payload["privacy_class"]).strip().lower()
                if p_val in ("personal", "work", "shared", "confidential"):
                    note.privacy_class = p_val
            if "project_id" in payload:
                try:
                    p_uuid = uuid.UUID(str(payload["project_id"])) if payload["project_id"] else None
                    if p_uuid:
                        p_exists = await self.session.scalar(
                            select(Project.id).where(Project.id == p_uuid, Project.user_id == user_id)
                        )
                        if p_exists:
                            note.project_id = p_uuid
                    else:
                        note.project_id = None
                except Exception:
                    pass

            note.version += 1
            await self.session.flush()
            return ("applied", {"updated": True}, note.version)

        elif op_type == "delete":
            if note is not None:
                note.deleted_at = utc_now()
                note.version += 1
                await self.session.flush()
                return ("applied", {"deleted": True}, note.version)
            return ("applied", {"note": "Already deleted"}, 0)

        return ("rejected", {"error": f"Unknown op_type: {op_type}"}, 0)

    async def pull_changes(
        self,
        user_id: uuid.UUID,
        since_seq: int = 0,
        limit: int = 200,
    ) -> dict[str, Any]:
        """Pull changed entities since a sequence cursor across tasks, projects, and notes (doc 11 §4.3)."""
        # 1. Tasks
        t_stmt = (
            select(Task)
            .where(Task.user_id == user_id, Task.server_seq > since_seq)
            .order_by(Task.server_seq.asc())
            .limit(limit)
        )
        t_res = await self.session.execute(t_stmt)
        tasks = list(t_res.scalars().all())

        # 2. Projects
        p_stmt = (
            select(Project)
            .where(Project.user_id == user_id, Project.server_seq > since_seq)
            .order_by(Project.server_seq.asc())
            .limit(limit)
        )
        p_res = await self.session.execute(p_stmt)
        projects = list(p_res.scalars().all())

        # 3. Notes
        n_stmt = (
            select(Note)
            .where(Note.user_id == user_id, Note.server_seq > since_seq)
            .order_by(Note.server_seq.asc())
            .limit(limit)
        )
        n_res = await self.session.execute(n_stmt)
        notes = list(n_res.scalars().all())

        max_seq = since_seq
        changes: list[dict[str, Any]] = []
        for t in tasks:
            if t.server_seq > max_seq:
                max_seq = t.server_seq
            changes.append(self._serialize_task(t))

        for p in projects:
            if p.server_seq > max_seq:
                max_seq = p.server_seq
            changes.append(self._serialize_project(p))

        for n in notes:
            if n.server_seq > max_seq:
                max_seq = n.server_seq
            changes.append(self._serialize_note(n))

        changes.sort(key=lambda c: int(c.get("server_seq") or 0))

        return {
            "server_epoch": str(SERVER_EPOCH),
            "since_seq": since_seq,
            "next_seq": max_seq,
            "changes": changes[:limit],
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
            "occurred_on": note.occurred_on.isoformat() if hasattr(note.occurred_on, "isoformat") else str(note.occurred_on),
            "privacy_class": note.privacy_class,
            "category_id": str(note.category_id) if note.category_id else None,
            "project_id": str(note.project_id) if note.project_id else None,
            "task_id": str(note.task_id) if note.task_id else None,
            "version": getattr(note, "version", 1),
            "server_seq": getattr(note, "server_seq", 0),
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

        conflict.status = resolution
        conflict.resolved_at = utc_now()
        await self.session.flush()
        return True
