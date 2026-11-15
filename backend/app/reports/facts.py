"""Pure, deterministic Report Fact Builder with SQL scope filtering (doc 10 §5.1, AC-REP-1).

Constructs frozen factual report snapshots with strict sharing-class filters.
Uncategorized tasks default to 'personal' (excluded from professional scope).
"""

import hashlib
import json
import uuid
from datetime import date
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.task import Task
from app.models.time_entry import TimeEntry


def compute_facts_hash(facts: dict[str, Any]) -> str:
    """Compute deterministic SHA-256 hash of canonical JSON facts."""
    raw = json.dumps(facts, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class ReportFactBuilder:
    """Queries base tables to assemble verified, scope-filtered report facts."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def build_facts(
        self,
        user_id: uuid.UUID,
        period_start: date,
        period_end: date,
        include_classes: list[str],
        tz_name: str = "Asia/Kolkata",
    ) -> dict[str, Any]:
        """Assemble factual report snapshot with SQL-level privacy class isolation."""
        # 1. Base category filter:
        # Category has sharing_class in include_classes.
        # If task has no category: treated as 'personal'. If 'personal' in include_classes, allow uncategorized.
        cat_filter = Category.sharing_class.in_(include_classes)
        if "personal" in include_classes:
            scope_condition = or_(cat_filter, Task.category_id.is_(None))
        else:
            scope_condition = and_(Task.category_id.is_not(None), cat_filter)

        # 2. Completed Tasks in period
        local_completed_date = func.date(func.timezone(tz_name, Task.completed_at))
        completed_stmt = (
            select(Task, Category.name.label("category_name"))
            .outerjoin(Category, Task.category_id == Category.id)
            .where(
                Task.user_id == user_id,
                Task.status == "completed",
                Task.deleted_at.is_(None),
                local_completed_date >= period_start,
                local_completed_date <= period_end,
                scope_condition,
            )
            .order_by(Task.completed_at.asc())
        )
        res = await self.session.execute(completed_stmt)
        completed_rows = res.all()

        completed_tasks: list[dict[str, Any]] = []
        total_actual_min = 0
        for task, cat_name in completed_rows:
            dur = task.actual_min or task.estimate_min or 0
            total_actual_min += dur
            completed_tasks.append(
                {
                    "id": str(task.id),
                    "title": task.title,
                    "category": cat_name or "General",
                    "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                    "duration_min": dur,
                    "priority": task.priority,
                }
            )

        # 3. Pending & Overdue Tasks
        pending_stmt = (
            select(Task, Category.name.label("category_name"))
            .outerjoin(Category, Task.category_id == Category.id)
            .where(
                Task.user_id == user_id,
                Task.status.in_(["draft", "active"]),
                Task.deleted_at.is_(None),
                scope_condition,
            )
            .order_by(Task.deadline_at.asc().nulls_last())
        )
        p_res = await self.session.execute(pending_stmt)
        pending_rows = p_res.all()

        pending_tasks: list[dict[str, Any]] = []
        overdue_tasks: list[dict[str, Any]] = []
        today = date.today()

        for task, cat_name in pending_rows:
            item = {
                "id": str(task.id),
                "title": task.title,
                "category": cat_name or "General",
                "deadline_at": task.deadline_at.isoformat() if task.deadline_at else None,
                "priority": task.priority,
            }
            if task.deadline_at and task.deadline_at.date() < today:
                overdue_tasks.append(item)
            else:
                pending_tasks.append(item)

        # 4. Time tracked in period
        local_started_date = func.date(func.timezone(tz_name, TimeEntry.started_at))
        time_stmt = (
            select(
                Category.name.label("category_name"),
                func.sum(TimeEntry.duration_min).label("total_min"),
            )
            .outerjoin(Task, TimeEntry.task_id == Task.id)
            .outerjoin(Category, Task.category_id == Category.id)
            .where(
                TimeEntry.user_id == user_id,
                local_started_date >= period_start,
                local_started_date <= period_end,
                scope_condition,
            )
            .group_by(Category.name)
        )
        t_res = await self.session.execute(time_stmt)
        time_by_cat = {
            (row.category_name or "General"): int(row.total_min or 0) for row in t_res.all()
        }

        total_time_min = sum(time_by_cat.values())
        if total_time_min == 0 and total_actual_min > 0:
            total_time_min = total_actual_min

        facts: dict[str, Any] = {
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "scope": include_classes,
            "summary": {
                "completed_count": len(completed_tasks),
                "pending_count": len(pending_tasks),
                "overdue_count": len(overdue_tasks),
                "total_time_minutes": total_time_min,
                "total_time_hours": round(total_time_min / 60.0, 1),
            },
            "completed_tasks": completed_tasks,
            "pending_tasks": pending_tasks,
            "overdue_tasks": overdue_tasks,
            "time_by_category": time_by_cat,
        }
        return facts
