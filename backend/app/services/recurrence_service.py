"""Recurrence service generating recurring task instances 14 days ahead idempotently (AC-M2-8)."""

import uuid
import zoneinfo
from datetime import date, datetime, timedelta

from dateutil import rrule
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.core.uuid import generate_uuid7
from app.models.recurrence_rule import RecurrenceRule
from app.models.subtask import Subtask
from app.models.task import Task
from app.models.task_event import TaskEvent
from app.repositories.category_repo import CategoryRepository
from app.repositories.project_repo import ProjectRepository
from app.repositories.recurrence_repo import RecurrenceRepository
from app.repositories.tag_repo import TagRepository
from app.repositories.workspace_repo import WorkspaceRepository


class RecurrenceService:
    """Service managing recurrence schedules and generating forward instances."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id
        self.recurrence_repo = RecurrenceRepository(session, user_id)
        self.workspace_repo = WorkspaceRepository(session)
        self.category_repo = CategoryRepository(session)
        self.project_repo = ProjectRepository(session, user_id)
        self.tag_repo = TagRepository(session, user_id)

    async def generate_instances_ahead(
        self,
        horizon_days: int = 14,
        tz_name: str = "Asia/Kolkata",
    ) -> list[Task]:
        """Generate task instances for all active recurrence rules up to horizon_days ahead.
        Guaranteed to be idempotent (AC-M2-8).
        """
        try:
            tz = zoneinfo.ZoneInfo(tz_name)
        except Exception:
            tz = zoneinfo.ZoneInfo("Asia/Kolkata")

        now = utc_now().astimezone(tz)
        today = now.date()
        horizon_date = today + timedelta(days=horizon_days)

        active_rules = await self.recurrence_repo.list_active()
        created_tasks: list[Task] = []

        for rule in active_rules:
            instances = await self._generate_for_rule(rule, today, horizon_date, tz)
            created_tasks.extend(instances)

        await self.session.flush()
        return created_tasks

    async def _generate_for_rule(
        self,
        rule: RecurrenceRule,
        today: date,
        horizon_date: date,
        tz: zoneinfo.ZoneInfo,
    ) -> list[Task]:
        """Generate missing task instances for a single rule up to horizon_date."""
        rule_start = rule.dtstart if rule.dtstart.tzinfo else rule.dtstart.replace(tzinfo=tz)
        start_date = rule_start.astimezone(tz).date()
        # Compute start generation from either rule dtstart or today
        from_date = max(start_date, today)

        template = rule.template or {}
        title = template.get("title")
        if not isinstance(title, str) or not title.strip():
            return []

        default_workspace = await self.workspace_repo.get_default(self.user_id)
        if not default_workspace:
            return []
        template_workspace_id = default_workspace.id
        if template.get("workspace_id"):
            try:
                requested_workspace_id = uuid.UUID(template["workspace_id"])
            except (TypeError, ValueError):
                requested_workspace_id = default_workspace.id
            workspace = await self.workspace_repo.get_by_id(self.user_id, requested_workspace_id)
            if workspace:
                template_workspace_id = workspace.id

        category_id = None
        if template.get("category_id"):
            try:
                requested_category_id = uuid.UUID(template["category_id"])
                if await self.category_repo.get_by_id(self.user_id, requested_category_id):
                    category_id = requested_category_id
            except (TypeError, ValueError):
                category_id = None

        project_id = None
        if template.get("project_id"):
            try:
                requested_project_id = uuid.UUID(template["project_id"])
                if await self.project_repo.get_by_id(requested_project_id):
                    project_id = requested_project_id
            except (TypeError, ValueError):
                project_id = None

        # Parse RRULE string
        try:
            rule_obj = rrule.rrulestr(rule.rrule, dtstart=rule_start)
        except Exception:
            return []

        # Find occurrences between from_date and horizon_date
        start_dt = datetime.combine(from_date, datetime.min.time(), tzinfo=tz).astimezone(
            rule_start.tzinfo
        )
        rule_until = rule.until
        if rule_until and not rule_until.tzinfo:
            rule_until = rule_until.replace(tzinfo=tz)
        rule_end_date = (
            min(rule_until.astimezone(tz).date(), horizon_date) if rule_until else horizon_date
        )
        end_dt = datetime.combine(rule_end_date, datetime.max.time(), tzinfo=tz).astimezone(
            rule_start.tzinfo
        )

        # In dateutil, between works with datetime
        occurrences = rule_obj.between(
            start_dt,
            end_dt,
            inc=True,
        )

        new_tasks: list[Task] = []
        for occ in occurrences:
            occ_date = occ.astimezone(tz).date() if occ.tzinfo else occ.date()

            # Check if an instance already exists for this (rule_id, occ_date)
            stmt = select(Task).where(
                Task.user_id == self.user_id,
                Task.recurrence_rule_id == rule.id,
                Task.recurrence_instance_date == occ_date,
                Task.deleted_at.is_(None),
            )
            result = await self.session.execute(stmt)
            existing = result.scalars().first()
            if existing:
                continue

            # Create a real, user-owned task from the approved recurrence template.
            task_deadline: datetime | None = None
            if "deadline_time" in template:
                try:
                    h, m = map(int, template["deadline_time"].split(":"))
                    task_deadline = datetime.combine(
                        occ_date, datetime.min.time().replace(hour=h, minute=m), tzinfo=tz
                    )
                except (AttributeError, TypeError, ValueError):
                    task_deadline = None

            task = Task(
                id=generate_uuid7(),
                user_id=self.user_id,
                workspace_id=template_workspace_id,
                category_id=category_id,
                project_id=project_id,
                title=title.strip(),
                description=template.get("description"),
                status="pending",
                priority=template.get("priority"),
                deadline_at=task_deadline,
                deadline_kind="soft" if task_deadline else None,
                deadline_source="recurrence" if task_deadline else None,
                estimate_user_min=template.get("estimate_user_min"),
                origin="recurring",
                recurrence_rule_id=rule.id,
                recurrence_instance_date=occ_date,
            )
            self.session.add(task)
            tags = template.get("tags", [])
            if isinstance(tags, list) and all(isinstance(tag, str) for tag in tags):
                await self.tag_repo.sync_task_tags(task.id, tags)
            subtask_titles = template.get("subtasks", [])
            if isinstance(subtask_titles, list):
                for position, subtask_title in enumerate(subtask_titles):
                    if isinstance(subtask_title, str) and subtask_title.strip():
                        self.session.add(
                            Subtask(
                                id=generate_uuid7(),
                                user_id=self.user_id,
                                task_id=task.id,
                                title=subtask_title.strip(),
                                position=position,
                            )
                        )
            self.session.add(
                TaskEvent(
                    user_id=self.user_id,
                    task_id=task.id,
                    event_type="recurring_instance_created",
                    changes={
                        "status": [None, "pending"],
                        "recurrence_instance_date": [None, occ_date.isoformat()],
                    },
                    actor="system",
                )
            )
            new_tasks.append(task)

        rule.generated_until = min(rule_end_date, horizon_date)
        return new_tasks
