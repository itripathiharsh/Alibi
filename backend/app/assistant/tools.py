"""SQL Tools for the Grounded Assistant (doc 08 §2.2).

Deterministic, parameterised, read-only, strictly user-scoped queries.
The LLM never writes raw SQL; tools execute via SQLAlchemy ORM / Core.
"""

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning import LearnedPattern
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.work_log import WorkLog


@dataclass
class ToolResult:
    tool_name: str
    summary: str
    data: list[dict[str, Any]]
    total_count: int
    numbers: list[int | float]  # numbers exposed for the grounding validator


class AssistantSQLTools:
    """Read-only parameterised tool executor scoped to a single user."""

    def __init__(
        self, session: AsyncSession, user_id: uuid.UUID, tz_name: str = "Asia/Kolkata"
    ) -> None:
        self.session = session
        self.user_id = user_id
        self.tz_name = tz_name

    async def completed_tasks(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
        category_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
    ) -> ToolResult:
        """Query tasks completed within a date range."""
        conditions = [
            Task.user_id == self.user_id,
            Task.status == "completed",
            Task.deleted_at.is_(None),
        ]
        local_completed_date = func.date(func.timezone(self.tz_name, Task.completed_at))
        if start_date:
            conditions.append(local_completed_date >= start_date)
        if end_date:
            conditions.append(local_completed_date <= end_date)
        if category_id:
            conditions.append(Task.category_id == category_id)
        if project_id:
            conditions.append(Task.project_id == project_id)

        stmt = select(Task).where(and_(*conditions)).order_by(Task.completed_at.desc())
        res = await self.session.execute(stmt)
        tasks = res.scalars().all()

        data: list[dict[str, Any]] = []
        numbers: list[int | float] = [len(tasks)]
        total_minutes = 0

        for t in tasks:
            dur = t.actual_min or t.estimate_min or 0
            total_minutes += dur
            numbers.append(dur)
            data.append(
                {
                    "id": str(t.id),
                    "title": t.title,
                    "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                    "duration_min": dur,
                    "priority": t.priority,
                }
            )

        numbers.append(total_minutes)
        hours = round(total_minutes / 60.0, 1)
        numbers.append(hours)

        summary = f"Completed {len(tasks)} tasks ({total_minutes} minutes / {hours} hours)"
        return ToolResult(
            tool_name="completed_tasks",
            summary=summary,
            data=data,
            total_count=len(tasks),
            numbers=numbers,
        )

    async def time_spent(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> ToolResult:
        """Query total time tracked via time entries in date range."""
        conditions = [
            TimeEntry.user_id == self.user_id,
        ]
        local_started_date = func.date(func.timezone(self.tz_name, TimeEntry.started_at))
        if start_date:
            conditions.append(local_started_date >= start_date)
        if end_date:
            conditions.append(local_started_date <= end_date)

        stmt = select(TimeEntry).where(and_(*conditions)).order_by(TimeEntry.started_at.desc())
        res = await self.session.execute(stmt)
        entries = res.scalars().all()

        total_min = sum(int(e.duration_min or 0) for e in entries)
        hours = round(total_min / 60.0, 1)
        numbers: list[int | float] = [len(entries), total_min, hours]

        data = [
            {
                "id": str(e.id),
                "started_at": e.started_at.isoformat(),
                "duration_min": e.duration_min,
                "task_id": str(e.task_id) if e.task_id else None,
            }
            for e in entries
        ]
        summary = f"Total time recorded: {total_min} minutes ({hours} hours) across {len(entries)} sessions"
        return ToolResult(
            tool_name="time_spent",
            summary=summary,
            data=data,
            total_count=len(entries),
            numbers=numbers,
        )

    async def pending_overdue(self, as_of: date | None = None) -> ToolResult:
        """Query pending and overdue tasks."""
        ref_date = as_of or date.today()
        stmt = (
            select(Task)
            .where(
                Task.user_id == self.user_id,
                Task.status.in_(["draft", "active"]),
                Task.deleted_at.is_(None),
            )
            .order_by(Task.deadline_at.asc().nulls_last())
        )
        res = await self.session.execute(stmt)
        tasks = res.scalars().all()

        overdue: list[dict[str, Any]] = []
        pending: list[dict[str, Any]] = []
        numbers: list[int | float] = [len(tasks)]

        for t in tasks:
            item = {
                "id": str(t.id),
                "title": t.title,
                "deadline": t.deadline_at.isoformat() if t.deadline_at else None,
                "priority": t.priority,
            }
            if t.deadline_at and t.deadline_at.date() < ref_date:
                overdue.append(item)
            else:
                pending.append(item)

        numbers.extend([len(overdue), len(pending)])
        summary = f"{len(overdue)} overdue tasks and {len(pending)} pending tasks"
        return ToolResult(
            tool_name="pending_overdue",
            summary=summary,
            data=overdue + pending,
            total_count=len(tasks),
            numbers=numbers,
        )

    async def work_logs(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> ToolResult:
        """Query daily work logs."""
        conditions = [WorkLog.user_id == self.user_id]
        if start_date:
            conditions.append(WorkLog.log_date >= start_date)
        if end_date:
            conditions.append(WorkLog.log_date <= end_date)

        stmt = select(WorkLog).where(and_(*conditions)).order_by(WorkLog.log_date.desc())
        res = await self.session.execute(stmt)
        logs = res.scalars().all()

        data = [
            {
                "id": str(log_item.id),
                "log_date": log_item.log_date.isoformat(),
                "content": log_item.content,
            }
            for log_item in logs
        ]
        numbers: list[int | float] = [len(logs)]
        summary = f"{len(logs)} daily work log entries"
        return ToolResult(
            tool_name="work_logs",
            summary=summary,
            data=data,
            total_count=len(logs),
            numbers=numbers,
        )

    async def profile_facts(self) -> ToolResult:
        """Query confirmed and active learned routines and patterns."""
        stmt = (
            select(LearnedPattern)
            .where(
                LearnedPattern.user_id == self.user_id,
                LearnedPattern.status.in_(["active", "confirmed"]),
            )
            .order_by(LearnedPattern.confidence.desc())
        )
        res = await self.session.execute(stmt)
        patterns = res.scalars().all()

        data = [
            {
                "id": str(p.id),
                "pattern_type": p.pattern_type,
                "key": p.key,
                "confidence": float(p.confidence),
                "sample_count": p.sample_count,
            }
            for p in patterns
        ]
        numbers: list[int | float] = [len(patterns)]
        summary = f"{len(patterns)} confirmed behavioral patterns and routines"
        return ToolResult(
            tool_name="profile_facts",
            summary=summary,
            data=data,
            total_count=len(patterns),
            numbers=numbers,
        )
