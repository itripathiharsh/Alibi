"""Time report: where recorded work time goes (FR-DASH-010, ADR-032).

Every number is counted from finished work sessions in `time_entries` (timer sessions and
manual logs) and from task rows; nothing is estimated or generated. Days are the user's
local days. A session that crosses midnight is split by the minutes it spent in each day;
a session stored without an end time counts on the day it started.
"""

import statistics
import uuid
import zoneinfo
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.category import Category
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.schemas.analytics import (
    PeriodType,
    TimeReportCategory,
    TimeReportDay,
    TimeReportResponse,
    TimeReportTask,
    TimeReportWeek,
)
from app.services.analytics_service import resolve_period

MAX_TASK_ROWS = 50


def _split_by_day(
    started: datetime, ended: datetime | None, minutes: int, tz: zoneinfo.ZoneInfo
) -> dict[date, float]:
    """Spread a session's recorded minutes over the local days it covered."""
    start_local = started.astimezone(tz)
    if ended is None or ended <= started:
        return {start_local.date(): float(minutes)}
    end_local = ended.astimezone(tz)
    total_seconds = (ended - started).total_seconds()
    shares: dict[date, float] = {}
    cursor = start_local
    while cursor < end_local:
        next_midnight = datetime.combine(cursor.date() + timedelta(days=1), time.min, tzinfo=tz)
        chunk_end = min(next_midnight, end_local)
        shares[cursor.date()] = shares.get(cursor.date(), 0.0) + minutes * (
            (chunk_end - cursor).total_seconds() / total_seconds
        )
        cursor = chunk_end
    return shares


class TimeReportBuilder:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def build(
        self,
        user_id: uuid.UUID,
        tz_name: str,
        period: PeriodType,
        from_date: date | None = None,
        to_date: date | None = None,
        now: datetime | None = None,
    ) -> TimeReportResponse:
        try:
            tz = zoneinfo.ZoneInfo(tz_name)
        except Exception:
            tz = zoneinfo.ZoneInfo("Asia/Kolkata")
            tz_name = "Asia/Kolkata"
        now = now or utc_now()
        start_utc, end_utc = resolve_period(period, tz_name, from_date, to_date, reference_dt=now)
        start_day = start_utc.astimezone(tz).date()
        end_day = (end_utc.astimezone(tz) - timedelta(seconds=1)).date()
        today = now.astimezone(tz).date()
        week_start_utc, week_end_utc = resolve_period("weekly", tz_name, reference_dt=now)
        week_start = week_start_utc.astimezone(tz).date()

        # Sessions that touch the selected period or this week (for the fixed today/week figures).
        window_start = min(start_utc, week_start_utc)
        window_end = max(end_utc, week_end_utc)
        rows = (
            await self.session.execute(
                select(
                    TimeEntry.task_id,
                    TimeEntry.started_at,
                    TimeEntry.ended_at,
                    TimeEntry.duration_min,
                ).where(
                    TimeEntry.user_id == user_id,
                    TimeEntry.deleted_at.is_(None),
                    TimeEntry.duration_min.is_not(None),
                    TimeEntry.duration_min > 0,
                    TimeEntry.started_at < window_end,
                    or_(TimeEntry.ended_at.is_(None), TimeEntry.ended_at > window_start),
                )
            )
        ).all()

        per_day: dict[date, float] = defaultdict(float)
        per_day_tasks: dict[date, set[uuid.UUID]] = defaultdict(set)
        task_minutes: dict[uuid.UUID, float] = defaultdict(float)
        task_sessions: dict[uuid.UUID, int] = defaultdict(int)
        today_minutes = 0.0
        week_minutes = 0.0
        for task_id, started, ended, session_minutes in rows:
            shares = _split_by_day(started, ended, int(session_minutes or 0), tz)
            in_period = False
            for day, share in shares.items():
                if day == today:
                    today_minutes += share
                if week_start <= day < week_start + timedelta(days=7):
                    week_minutes += share
                if start_day <= day <= end_day:
                    per_day[day] += share
                    per_day_tasks[day].add(task_id)
                    task_minutes[task_id] += share
                    in_period = True
            if in_period:
                task_sessions[task_id] += 1

        completed_rows = (
            await self.session.execute(
                select(Task.id, Task.completed_at, Task.category_id).where(
                    Task.user_id == user_id,
                    Task.deleted_at.is_(None),
                    Task.status == "completed",
                    Task.completed_at >= start_utc,
                    Task.completed_at < end_utc,
                )
            )
        ).all()
        completed_per_day: dict[date, int] = defaultdict(int)
        for _, completed_at, _ in completed_rows:
            if completed_at is not None:
                completed_per_day[completed_at.astimezone(tz).date()] += 1

        # Task details for worked and completed tasks, with all-time recorded minutes.
        task_ids = set(task_minutes) | {row[0] for row in completed_rows}
        details: dict[uuid.UUID, tuple[str, str, int | None, str | None]] = {}
        all_time: dict[uuid.UUID, int] = defaultdict(int)
        if task_ids:
            for task_id, title, status, estimate_final, estimate_user, category in (
                await self.session.execute(
                    select(
                        Task.id,
                        Task.title,
                        Task.status,
                        Task.estimate_final_min,
                        Task.estimate_user_min,
                        Category.name,
                    )
                    .outerjoin(
                        Category, and_(Category.id == Task.category_id, Category.user_id == user_id)
                    )
                    .where(Task.user_id == user_id, Task.id.in_(task_ids))
                )
            ).all():
                details[task_id] = (title, status, estimate_final or estimate_user, category)
            for task_id, entry_minutes in (
                await self.session.execute(
                    select(TimeEntry.task_id, TimeEntry.duration_min).where(
                        TimeEntry.user_id == user_id,
                        TimeEntry.deleted_at.is_(None),
                        TimeEntry.task_id.in_(task_ids),
                        TimeEntry.duration_min.is_not(None),
                    )
                )
            ).all():
                all_time[task_id] += int(entry_minutes or 0)

        tasks: list[TimeReportTask] = []
        for task_id, period_minutes in sorted(
            task_minutes.items(), key=lambda kv: kv[1], reverse=True
        ):
            if task_id not in details or round(period_minutes) <= 0:
                continue
            task_title, task_status, planned, category_name = details[task_id]
            total = all_time.get(task_id, 0)
            tasks.append(
                TimeReportTask(
                    task_id=str(task_id),
                    title=task_title,
                    status=task_status,
                    category=category_name,
                    minutes=round(period_minutes),
                    sessions=task_sessions[task_id],
                    total_minutes=total,
                    planned_minutes=planned,
                    difference_minutes=(total - planned) if planned else None,
                )
            )

        completed_minutes = [
            all_time[row[0]] for row in completed_rows if all_time.get(row[0], 0) > 0
        ]
        by_category: dict[str, list[int]] = defaultdict(list)
        for task_id, _, _ in completed_rows:
            if all_time.get(task_id, 0) > 0 and task_id in details:
                by_category[details[task_id][3] or "Uncategorised"].append(all_time[task_id])

        days: list[TimeReportDay] = []
        cursor = start_day
        while cursor <= end_day and len(days) < 400:
            day_minutes = round(per_day.get(cursor, 0.0))
            worked = len(per_day_tasks.get(cursor, set()))
            days.append(
                TimeReportDay(
                    date=cursor,
                    minutes=day_minutes,
                    tasks_completed=completed_per_day.get(cursor, 0),
                    tasks_worked=worked,
                    average_minutes_per_task=round(day_minutes / worked) if worked else None,
                )
            )
            cursor += timedelta(days=1)

        weeks: dict[date, list[int]] = {}
        for entry in days:
            key = entry.date - timedelta(days=entry.date.weekday())
            bucket = weeks.setdefault(key, [0, 0])
            bucket[0] += entry.minutes
            bucket[1] += entry.tasks_completed

        total_minutes = round(sum(per_day.values()))
        last_counted = min(end_day, today)
        days_counted = max(0, (last_counted - start_day).days + 1)
        return TimeReportResponse(
            period=period,
            start_date=start_day,
            end_date=end_day,
            timezone=tz_name,
            total_minutes=total_minutes,
            today_minutes=round(today_minutes),
            this_week_minutes=round(week_minutes),
            days_counted=days_counted,
            daily_average_minutes=round(total_minutes / days_counted) if days_counted else 0,
            tasks_completed=len(completed_rows),
            average_completion_minutes=round(statistics.mean(completed_minutes))
            if completed_minutes
            else None,
            completed_with_time=len(completed_minutes),
            tasks=tasks[:MAX_TASK_ROWS],
            days=days,
            weeks=[
                TimeReportWeek(week_start=key, minutes=value[0], tasks_completed=value[1])
                for key, value in sorted(weeks.items())
            ],
            categories=sorted(
                (
                    TimeReportCategory(
                        category=name,
                        completed_tasks=len(values),
                        average_minutes=round(statistics.mean(values)),
                    )
                    for name, values in by_category.items()
                ),
                key=lambda c: c.average_minutes,
                reverse=True,
            ),
        )
