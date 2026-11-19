"""Task service managing task lifecycle, status transitions, mutations, and capture (AC-M2-1, AC-M2-3, AC-M2-4)."""

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.time import utc_now
from app.models.ai_extraction import AIExtraction
from app.models.subtask import Subtask
from app.models.task import Task
from app.models.task_event import TaskEvent
from app.repositories.ai_extraction_repo import AIExtractionRepository
from app.repositories.category_repo import CategoryRepository
from app.repositories.project_repo import ProjectRepository
from app.repositories.subtask_repo import SubtaskRepository
from app.repositories.tag_repo import TagRepository
from app.repositories.task_event_repo import TaskEventRepository
from app.repositories.task_repo import TaskRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.services.grounding_validator import GroundingValidator
from app.services.rules_parser import RulesParser
from app.vault.links import append_task_completion

# 16-pair transition table (doc 01 §4, AC-M2-3)
VALID_STATUS_TRANSITIONS: dict[tuple[str, str], bool] = {
    # From pending
    ("pending", "in_progress"): True,
    ("pending", "completed"): True,
    ("pending", "cancelled"): True,
    ("pending", "pending"): False,
    # From in_progress
    ("in_progress", "pending"): True,  # Pause
    ("in_progress", "completed"): True,
    ("in_progress", "cancelled"): True,
    ("in_progress", "in_progress"): False,
    # From completed
    ("completed", "pending"): True,  # Reopen
    ("completed", "in_progress"): False,
    ("completed", "completed"): False,
    ("completed", "cancelled"): False,
    # From cancelled
    ("cancelled", "pending"): True,  # Restore
    ("cancelled", "in_progress"): False,
    ("cancelled", "completed"): False,
    ("cancelled", "cancelled"): False,
}


class TaskService:
    """Service orchestrating task creation, capture, status transitions, and audit logging."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id
        self.task_repo = TaskRepository(session, user_id)
        self.task_event_repo = TaskEventRepository(session, user_id)
        self.ai_extraction_repo = AIExtractionRepository(session, user_id)
        self.tag_repo = TagRepository(session, user_id)
        self.project_repo = ProjectRepository(session, user_id)
        self.category_repo = CategoryRepository(session)
        self.workspace_repo = WorkspaceRepository(session)
        self.subtask_repo = SubtaskRepository(session, user_id)
        self.rules_parser = RulesParser()
        self.grounding_validator = GroundingValidator(self.rules_parser)

    async def capture_task(
        self,
        raw_input: str,
        origin: str = "manual",
        captured_at: datetime | None = None,
        category_hint: uuid.UUID | None = None,
        task_id: uuid.UUID | None = None,
        status: str | None = None,
        deadline_at: datetime | None = None,
    ) -> tuple[Task, AIExtraction | None]:
        """Capture task from natural language text.
        AC-M2-1: Persists task with raw input before parsing; parsing failure leaves task intact.
        """
        now = captured_at or utc_now()
        workspace = await self.workspace_repo.get_default(self.user_id)
        if not workspace:
            raise NotFoundError("Default workspace not found.")
        if category_hint and not await self.category_repo.get_by_id(self.user_id, category_hint):
            raise NotFoundError("Category not found.")

        initial_status = (
            status if status in ("pending", "in_progress", "completed", "cancelled") else "pending"
        )
        initial_completed_at = now if initial_status == "completed" else None

        # Step 1: Persist initial task with raw_input (AC-M2-1 guarantee)
        task = Task(
            id=task_id or uuid.uuid4(),
            user_id=self.user_id,
            workspace_id=workspace.id,
            category_id=category_hint,
            title=raw_input.strip()[:200] or "Untitled Task",
            raw_input=raw_input,
            status=initial_status,
            completed_at=initial_completed_at,
            deadline_at=deadline_at,
            deadline_kind="hard" if deadline_at else None,
            deadline_source="user" if deadline_at else None,
            origin=origin,
            parse_status="pending",
            created_at=now,
        )
        self.session.add(task)
        await self.session.flush()

        # Step 2: Rules parsing & Grounding validation
        extraction_row: AIExtraction | None = None
        try:
            rules_res = self.rules_parser.parse(raw_input, base_time=now)
            existing_projects = await self.project_repo.list_active()
            grounded = self.grounding_validator.validate_and_merge(
                raw_input=raw_input,
                rules_result=rules_res,
                existing_projects=list(existing_projects),
            )

            # Keep extracted fields in the proposal. The user's explicit capture fields
            # (status/deadline) were persisted above; all derived values wait for review.
            if status is not None:
                task.status = status
                if status == "completed":
                    task.completed_at = now
            task.parse_status = "proposed"

            proposal_fields = grounded.to_dict()
            if deadline_at is not None:
                # The date picker is explicit user input and takes precedence over
                # a different date inferred from the same text.
                proposal_fields["deadline_at"] = deadline_at.isoformat()
                proposal_fields["deadline_kind"] = "hard"

            # Record extraction proposal row
            extraction_row = await self.ai_extraction_repo.create(
                task_id=task.id,
                input_text=raw_input,
                rules_result=rules_res.to_dict(),
                final_proposal=proposal_fields,
                status="proposed",
            )

            # Record task creation event
            await self.task_event_repo.record_event(
                task_id=task.id,
                event_type="captured",
                changes={"raw_input": [None, raw_input], "title": [None, task.title]},
                actor="user",
            )

        except Exception:
            # AC-M2-1: parsing failure leaves task intact with parse_status='failed'
            task.parse_status = "failed"
            await self.task_event_repo.record_event(
                task_id=task.id,
                event_type="capture_failed",
                changes={"raw_input": [None, raw_input]},
                actor="system",
            )

        await self.session.flush()
        return task, extraction_row

    async def create_task(
        self,
        title: str,
        description: str | None = None,
        category_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        priority: int | None = None,
        deadline_at: datetime | None = None,
        deadline_kind: str | None = None,
        estimate_user_min: int | None = None,
        origin: str = "manual",
        tags: list[str] | None = None,
        subtasks: list[str] | None = None,
        task_id: uuid.UUID | None = None,
    ) -> Task:
        """Create a new task with full fields."""
        await self._assert_owned_references(category_id, project_id)
        workspace = await self.workspace_repo.get_default(self.user_id)
        if not workspace:
            raise NotFoundError("Default workspace not found.")

        task = Task(
            id=task_id or uuid.uuid4(),
            user_id=self.user_id,
            workspace_id=workspace.id,
            category_id=category_id,
            project_id=project_id,
            title=title.strip(),
            description=description,
            priority=priority,
            deadline_at=deadline_at,
            deadline_kind=deadline_kind,
            deadline_source="user" if deadline_at else None,
            estimate_user_min=estimate_user_min,
            estimate_final_min=estimate_user_min,
            status="pending",
            origin=origin,
            parse_status="none",
        )
        self.session.add(task)
        await self.session.flush()

        if tags:
            await self.tag_repo.sync_task_tags(task.id, tags)

        if subtasks:
            for idx, st_title in enumerate(subtasks):
                sub = Subtask(
                    id=uuid.uuid4(),
                    user_id=self.user_id,
                    task_id=task.id,
                    title=st_title,
                    position=idx,
                )
                self.session.add(sub)

        # Audit event (AC-M2-4)
        await self.task_event_repo.record_event(
            task_id=task.id,
            event_type="created",
            changes={"title": [None, task.title], "status": [None, task.status]},
            actor="user",
        )
        await self.session.flush()
        return task

    async def update_status(
        self,
        task_id: uuid.UUID,
        new_status: str,
        at: datetime | None = None,
        completion_note: str | None = None,
    ) -> Task:
        """Perform validated status transition on task (AC-M2-3).
        Invalid transition raises 409 Conflict.
        """
        task = await self.task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")

        old_status = task.status
        is_valid = VALID_STATUS_TRANSITIONS.get((old_status, new_status), False)
        if not is_valid:
            raise ConflictError(f"Invalid status transition from '{old_status}' to '{new_status}'.")

        event_time = at or utc_now()
        diff: dict[str, Any] = {"status": [old_status, new_status]}

        task.status = new_status
        if new_status == "completed":
            task.completed_at = event_time
            if completion_note:
                task.completion_note = completion_note
                diff["completion_note"] = [None, completion_note]
            diff["completed_at"] = [None, event_time.isoformat()]
        elif new_status == "cancelled":
            task.cancelled_at = event_time
            diff["cancelled_at"] = [None, event_time.isoformat()]
        elif new_status == "in_progress":
            if not task.started_at:
                task.started_at = event_time
                diff["started_at"] = [None, event_time.isoformat()]
        elif new_status == "pending":
            # Reopening or pausing
            if old_status == "completed":
                task.completed_at = None
                diff["completed_at"] = [old_status, None]
            elif old_status == "cancelled":
                task.cancelled_at = None
                diff["cancelled_at"] = [old_status, None]

        # Audit event (AC-M2-4)
        event_type = (
            "reopened"
            if old_status == "completed" and new_status == "pending"
            else f"status_{new_status}"
        )
        await self.task_event_repo.record_event(
            task_id=task.id,
            event_type=event_type,
            changes=diff,
            reason=completion_note,
            actor="user",
            occurred_at=event_time,
        )
        if new_status == "completed":
            await append_task_completion(
                session=self.session,
                user_id=self.user_id,
                task_id=task.id,
                task_title=task.title,
                completed_at=event_time,
            )
        await self.session.flush()
        return task

    async def reschedule_task(
        self,
        task_id: uuid.UUID,
        new_deadline_at: datetime | None,
        reason: str | None = None,
    ) -> Task:
        """Reschedule a task deadline, incrementing reschedule_count (FR-TASK-011, AC-M2-4)."""
        task = await self.task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")

        old_deadline = task.deadline_at
        task.deadline_at = new_deadline_at
        task.reschedule_count += 1
        diff = {
            "deadline_at": [
                old_deadline.isoformat() if old_deadline else None,
                new_deadline_at.isoformat() if new_deadline_at else None,
            ],
            "reschedule_count": [task.reschedule_count - 1, task.reschedule_count],
        }

        await self.task_event_repo.record_event(
            task_id=task.id,
            event_type="rescheduled",
            changes=diff,
            reason=reason,
            actor="user",
        )
        await self.session.flush()
        return task

    async def update_task(
        self,
        task_id: uuid.UUID,
        **updates: Any,
    ) -> Task:
        """Update arbitrary task fields with mutation diff recording (AC-M2-4)."""
        requested_tags = updates.pop("tags", None)
        task = await self.task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")

        if "category_id" in updates or "project_id" in updates:
            await self._assert_owned_references(
                updates.get("category_id", task.category_id),
                updates.get("project_id", task.project_id),
            )

        diff: dict[str, Any] = {}
        for key, val in updates.items():
            if hasattr(task, key) and getattr(task, key) != val:
                old_val = getattr(task, key)
                setattr(task, key, val)
                diff[key] = [
                    str(old_val) if old_val is not None else None,
                    str(val) if val is not None else None,
                ]

        if diff:
            await self.task_event_repo.record_event(
                task_id=task.id,
                event_type="updated",
                changes=diff,
                actor="user",
            )
            await self.session.flush()
        if requested_tags is not None:
            await self.tag_repo.sync_task_tags(task_id, requested_tags)
        return task

    async def _assert_owned_references(
        self,
        category_id: uuid.UUID | None,
        project_id: uuid.UUID | None,
    ) -> None:
        """Reject foreign category/project IDs before storing user-owned records."""
        if category_id and not await self.category_repo.get_by_id(self.user_id, category_id):
            raise NotFoundError("Category not found.")
        if project_id and not await self.project_repo.get_by_id(project_id):
            raise NotFoundError("Project not found.")

    async def soft_delete_task(self, task_id: uuid.UUID) -> None:
        """Soft delete a task and record audit event."""
        task = await self.task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")

        await self.task_repo.soft_delete(task_id)
        await self.task_event_repo.record_event(
            task_id=task_id,
            event_type="deleted",
            changes={"deleted_at": [None, utc_now().isoformat()]},
            actor="user",
        )

    async def restore_task(self, task_id: uuid.UUID) -> Task:
        """Restore soft-deleted task."""
        task = await self.task_repo.restore(task_id)
        if not task:
            raise NotFoundError("Task not found in trash.")

        await self.task_event_repo.record_event(
            task_id=task_id,
            event_type="restored",
            changes={"deleted_at": ["trash", None]},
            actor="user",
        )
        return task

    async def get_history(self, task_id: uuid.UUID, limit: int = 50) -> Sequence[TaskEvent]:
        """Fetch chronological activity history (AC-M2-4)."""
        return await self.task_event_repo.list_for_task(task_id, limit=limit)
