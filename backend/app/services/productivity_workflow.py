"""SQL-backed daily guidance and explicit end-of-day actions (FR-PROD-001/002)."""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.time import utc_now
from app.models.calendar import CalendarEvent
from app.models.task import Task
from app.models.user import User
from app.schemas.productivity import (
    DailyKickoffResponse,
    EndOfDayActionRequest,
    EndOfDayActionResponse,
    EndOfDayReviewResponse,
    EndOfDayTask,
    KickoffSuggestion,
)
from app.services.task_service import TaskService


class ProductivityWorkflowService:
    """Prepare suggested focus choices and apply only user-selected review actions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _timezone(user: User) -> ZoneInfo:
        try:
            return ZoneInfo(user.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            return ZoneInfo("UTC")

    async def daily_kickoff(self, user: User) -> DailyKickoffResponse:
        tz = self._timezone(user)
        now = utc_now()
        local_day = now.astimezone(tz).date()
        tasks = (
            await self.session.scalars(
                select(Task)
                .where(
                    Task.user_id == user.id,
                    Task.deleted_at.is_(None),
                    Task.status.in_(("pending", "in_progress")),
                )
                .order_by(
                    case((Task.status == "in_progress", 0), else_=1),
                    (Task.deadline_kind == "hard").desc(),
                    Task.deadline_at.asc().nulls_last(),
                    Task.priority.asc().nulls_last(),
                    Task.created_at.asc(),
                )
                .limit(3)
            )
        ).all()
        suggestions: list[KickoffSuggestion] = []
        for task in tasks:
            reasons: list[str] = []
            if task.status == "in_progress":
                reasons.append("Already in progress")
            if task.deadline_at is not None:
                due_day = task.deadline_at.astimezone(tz).date()
                if due_day < local_day:
                    reasons.append("Overdue")
                elif due_day == local_day:
                    reasons.append("Due today")
                elif task.deadline_kind == "hard":
                    reasons.append("Hard deadline")
            if task.priority is not None:
                reasons.append(f"Priority {task.priority}")
            suggestions.append(
                KickoffSuggestion(
                    id=task.id,
                    title=task.title,
                    status=task.status,
                    priority=task.priority,
                    deadline_at=task.deadline_at,
                    reasons=reasons,
                )
            )
        return DailyKickoffResponse(local_date=local_day, suggestions=suggestions)

    async def end_of_day_review(self, user: User) -> EndOfDayReviewResponse:
        tz = self._timezone(user)
        local_day = utc_now().astimezone(tz).date()
        start_at = datetime.combine(local_day, time.min, tzinfo=tz).astimezone(UTC)
        end_at = (datetime.combine(local_day, time.min, tzinfo=tz) + timedelta(days=1)).astimezone(UTC)

        scheduled_task_ids = select(CalendarEvent.task_id).where(
            CalendarEvent.user_id == user.id,
            CalendarEvent.task_id.is_not(None),
            CalendarEvent.kind == "work_block",
            CalendarEvent.start_at < end_at,
            CalendarEvent.end_at > start_at,
        )
        tasks = (
            await self.session.scalars(
                select(Task)
                .where(
                    Task.user_id == user.id,
                    Task.deleted_at.is_(None),
                    Task.status.in_(("pending", "in_progress")),
                    or_(
                        Task.deadline_at < end_at,
                        Task.id.in_(scheduled_task_ids),
                        Task.status == "in_progress",
                    ),
                )
                .order_by(Task.deadline_at.asc().nulls_last(), Task.priority.asc().nulls_last())
            )
        ).all()
        completed_count = int(
            await self.session.scalar(
                select(func.count(Task.id)).where(
                    Task.user_id == user.id,
                    Task.deleted_at.is_(None),
                    Task.status == "completed",
                    Task.completed_at >= start_at,
                    Task.completed_at < end_at,
                )
            )
            or 0
        )
        return EndOfDayReviewResponse(
            local_date=local_day,
            completed_count=completed_count,
            unfinished=[
                EndOfDayTask(
                    id=task.id,
                    title=task.title,
                    status=task.status,
                    deadline_at=task.deadline_at,
                    reschedule_count=task.reschedule_count,
                )
                for task in tasks
            ],
        )

    @staticmethod
    def _next_work_start(user: User, now: datetime) -> datetime:
        tz = ProductivityWorkflowService._timezone(user)
        local_now = now.astimezone(tz)
        working_hours = user.settings.get("working_hours", {})
        for offset in range(1, 15):
            work_date = local_now.date() + timedelta(days=offset)
            day = work_date.strftime("%A").lower()
            config = working_hours.get(day)
            if not isinstance(config, dict) or not config.get("enabled"):
                continue
            try:
                start_time = time.fromisoformat(str(config["start"]))
            except (KeyError, ValueError, TypeError):
                continue
            return datetime.combine(work_date, start_time, tzinfo=tz).astimezone(UTC)
        raise ConflictError("Set at least one working day in Settings before moving a task to tomorrow.")

    async def apply_end_of_day_action(
        self,
        user: User,
        task_id: uuid.UUID,
        body: EndOfDayActionRequest,
    ) -> EndOfDayActionResponse:
        service = TaskService(self.session, user.id)
        task = await service.task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")
        if task.status not in ("pending", "in_progress"):
            raise ConflictError("Only open tasks can be handled in the end-of-day review.")

        if body.action == "tomorrow":
            deadline = self._next_work_start(user, utc_now())
            task = await service.reschedule_task(task.id, deadline, "End-of-day review: next workday")
        elif body.action == "backlog":
            task = await service.update_task(task.id, deadline_at=None, deadline_kind=None, deadline_source=None)
        else:
            task = await service.update_status(task.id, "cancelled")

        return EndOfDayActionResponse(
            task_id=task.id,
            action=body.action,
            status=task.status,
            deadline_at=task.deadline_at,
            reschedule_count=task.reschedule_count,
        )
