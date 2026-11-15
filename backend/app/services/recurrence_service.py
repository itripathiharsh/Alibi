"""Recurrence service generating recurring task instances 14 days ahead idempotently (AC-M2-8)."""

import uuid
import zoneinfo
from datetime import date, datetime, timedelta

from dateutil import rrule
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.recurrence_rule import RecurrenceRule
from app.models.task import Task
from app.repositories.recurrence_repo import RecurrenceRepository


class RecurrenceService:
    """Service managing recurrence schedules and generating forward instances."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id
        self.recurrence_repo = RecurrenceRepository(session, user_id)

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
        start_date = rule.dtstart.astimezone(tz).date()
        # Compute start generation from either rule dtstart or today
        from_date = max(start_date, today)

        # Parse RRULE string
        try:
            rule_obj = rrule.rrulestr(rule.rrule, dtstart=rule.dtstart)
        except Exception:
            return []

        # Find occurrences between from_date and horizon_date
        if rule.dtstart.tzinfo is not None:
            start_dt = datetime.combine(from_date, datetime.min.time(), tzinfo=tz).astimezone(
                rule.dtstart.tzinfo
            )
            end_dt = datetime.combine(horizon_date, datetime.max.time(), tzinfo=tz).astimezone(
                rule.dtstart.tzinfo
            )
        else:
            start_dt = datetime.combine(from_date, datetime.min.time())
            end_dt = datetime.combine(horizon_date, datetime.max.time())

        # In dateutil, between works with datetime
        occurrences = rule_obj.between(
            start_dt,
            end_dt,
            inc=True,
        )

        new_tasks: list[Task] = []
        for occ in occurrences:
            occ_date = occ.date()

            # Check if an instance already exists for this (rule_id, occ_date)
            stmt = select(Task).where(
                Task.recurrence_rule_id == rule.id,
                Task.recurrence_instance_date == occ_date,
                Task.deleted_at.is_(None),
            )
            result = await self.session.execute(stmt)
            existing = result.scalars().first()
            if existing:
                continue

            # Create new task instance from template
            template = rule.template or {}
            task_deadline: datetime | None = None
            if "deadline_time" in template:
                # e.g. "18:00"
                try:
                    h, m = map(int, template["deadline_time"].split(":"))
                    task_deadline = datetime.combine(
                        occ_date, datetime.min.time().replace(hour=h, minute=m), tzinfo=tz
                    )
                except Exception:
                    task_deadline = datetime.combine(
                        occ_date, datetime.min.time().replace(hour=18, minute=0), tzinfo=tz
                    )
            else:
                task_deadline = datetime.combine(
                    occ_date, datetime.min.time().replace(hour=18, minute=0), tzinfo=tz
                )

            task = Task(
                id=uuid.uuid4(),
                user_id=self.user_id,
                workspace_id=uuid.UUID(template["workspace_id"])
                if "workspace_id" in template
                else rule.id,  # fallback
                category_id=uuid.UUID(template["category_id"])
                if template.get("category_id")
                else None,
                project_id=uuid.UUID(template["project_id"])
                if template.get("project_id")
                else None,
                title=template.get("title", "Recurring Task"),
                description=template.get("description"),
                status="pending",
                priority=template.get("priority", 3),
                deadline_at=task_deadline,
                deadline_kind="soft",
                deadline_source="recurrence",
                estimate_user_min=template.get("estimate_user_min"),
                origin="recurring",
                recurrence_rule_id=rule.id,
                recurrence_instance_date=occ_date,
            )
            self.session.add(task)
            new_tasks.append(task)

        rule.generated_until = horizon_date
        return new_tasks
