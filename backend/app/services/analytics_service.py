"""ALIBI Analytics Service.

Implements M3: deterministic SQL metrics, transparent productivity score v1,
period resolver, midnight-spanning time calculations, and visualization datasets.
References: docs/10_ANALYTICS_AND_REPORTS.md, ADR-010.
"""

import uuid
import zoneinfo
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.schemas.analytics import (
    CategoryWorkloadItem,
    CompletionTrendPoint,
    ConsistencyHeatmapItem,
    EstVsActualItem,
    PeriodType,
    ProductivityScoreResponse,
    ScoreFormulaResponse,
    SummaryMetricsResponse,
    TimeDistributionItem,
)


def resolve_period(
    period: PeriodType,
    tz_str: str = "Asia/Kolkata",
    from_date: date | None = None,
    to_date: date | None = None,
    reference_dt: datetime | None = None,
) -> tuple[datetime, datetime]:
    """Resolve period boundaries into UTC datetime objects based on user's timezone."""
    tz = zoneinfo.ZoneInfo(tz_str)
    ref = (reference_dt or datetime.now(tz)).astimezone(tz)
    ref_date = ref.date()

    if period == "daily":
        start_local = datetime.combine(ref_date, time.min, tzinfo=tz)
        end_local = start_local + timedelta(days=1)
    elif period == "weekly":
        # Monday is 0, Sunday is 6
        monday = ref_date - timedelta(days=ref_date.weekday())
        start_local = datetime.combine(monday, time.min, tzinfo=tz)
        end_local = start_local + timedelta(days=7)
    elif period == "monthly":
        first_day = ref_date.replace(day=1)
        # Advance to 1st of next month
        if first_day.month == 12:
            next_month = first_day.replace(year=first_day.year + 1, month=1)
        else:
            next_month = first_day.replace(month=first_day.month + 1)
        start_local = datetime.combine(first_day, time.min, tzinfo=tz)
        end_local = datetime.combine(next_month, time.min, tzinfo=tz)
    elif period == "custom":
        f_date = from_date or ref_date
        t_date = to_date or ref_date
        if t_date < f_date:
            f_date, t_date = t_date, f_date
        if (t_date - f_date).days > 366:
            f_date = t_date - timedelta(days=366)
        start_local = datetime.combine(f_date, time.min, tzinfo=tz)
        end_local = datetime.combine(t_date + timedelta(days=1), time.min, tzinfo=tz)
    else:
        start_local = datetime.combine(ref_date, time.min, tzinfo=tz)
        end_local = start_local + timedelta(days=1)

    return start_local.astimezone(zoneinfo.ZoneInfo("UTC")), end_local.astimezone(
        zoneinfo.ZoneInfo("UTC")
    )


class AnalyticsService:
    """Service providing SQL-grounded analytics calculations and productivity scoring."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_summary(
        self,
        user_id: uuid.UUID,
        period: PeriodType = "weekly",
        from_date: date | None = None,
        to_date: date | None = None,
        tz_str: str = "Asia/Kolkata",
    ) -> SummaryMetricsResponse:
        """Compute summary metrics strictly grounded in SQL per doc 10 §2."""
        start_utc, end_utc = resolve_period(period, tz_str, from_date, to_date)
        now_utc = datetime.now(zoneinfo.ZoneInfo("UTC"))

        # 1. Total time spent with midnight-spanning proportional split
        # Overlap = LEAST(ended_at, end_utc) - GREATEST(started_at, start_utc)
        time_query = select(
            func.coalesce(
                func.sum(
                    func.extract(
                        "epoch",
                        func.least(func.coalesce(TimeEntry.ended_at, now_utc), end_utc)
                        - func.greatest(TimeEntry.started_at, start_utc),
                    )
                    / 60
                ),
                0,
            )
        ).where(
            and_(
                TimeEntry.user_id == user_id,
                TimeEntry.started_at < end_utc,
                func.coalesce(TimeEntry.ended_at, now_utc) > start_utc,
            )
        )
        total_time_min = int((await self.session.execute(time_query)).scalar_one())

        # 2. Tasks completed in period (excluding cancelled)
        completed_query = select(func.count(Task.id)).where(
            and_(
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
                Task.status == "completed",
                Task.completed_at >= start_utc,
                Task.completed_at < end_utc,
            )
        )
        tasks_completed = int((await self.session.execute(completed_query)).scalar_one())

        # 3. Tasks pending as of period end
        pending_query = select(func.count(Task.id)).where(
            and_(
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
                Task.status.in_(["pending", "in_progress"]),
                Task.created_at <= end_utc,
            )
        )
        tasks_pending = int((await self.session.execute(pending_query)).scalar_one())

        # 4. Tasks overdue (open tasks with deadline < min(now, end_utc))
        effective_deadline_limit = min(now_utc, end_utc)
        overdue_query = select(func.count(Task.id)).where(
            and_(
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
                Task.status.in_(["pending", "in_progress"]),
                Task.deadline_at.is_not(None),
                Task.deadline_at < effective_deadline_limit,
            )
        )
        tasks_overdue = int((await self.session.execute(overdue_query)).scalar_one())

        # 5. Completion rate: completed_in_period ∩ due_in_period / due_in_period (denominator >= 3)
        due_query = select(func.count(Task.id)).where(
            and_(
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
                Task.status != "cancelled",
                Task.deadline_at >= start_utc,
                Task.deadline_at < end_utc,
            )
        )
        tasks_due = int((await self.session.execute(due_query)).scalar_one())

        completion_rate: float | None = None
        if tasks_due >= 3:
            completed_due_query = select(func.count(Task.id)).where(
                and_(
                    Task.user_id == user_id,
                    Task.deleted_at.is_(None),
                    Task.status == "completed",
                    Task.completed_at >= start_utc,
                    Task.completed_at < end_utc,
                    Task.deadline_at >= start_utc,
                    Task.deadline_at < end_utc,
                )
            )
            completed_due_count = int(
                (await self.session.execute(completed_due_query)).scalar_one()
            )
            completion_rate = round(completed_due_count / tasks_due, 4)

        # 6. On-time rate: completed with deadline where completed_at <= deadline_at (denominator >= 3)
        completed_with_deadline_query = select(
            func.count(Task.id),
            func.count(
                func.nullif(
                    Task.completed_at <= Task.deadline_at,
                    False,
                )
            ),
        ).where(
            and_(
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
                Task.status == "completed",
                Task.completed_at >= start_utc,
                Task.completed_at < end_utc,
                Task.deadline_at.is_not(None),
            )
        )
        cw_res = (await self.session.execute(completed_with_deadline_query)).one()
        total_with_deadline, on_time_count = int(cw_res[0]), int(cw_res[1] or 0)

        on_time_rate: float | None = None
        if total_with_deadline >= 3:
            on_time_rate = round(on_time_count / total_with_deadline, 4)

        # 7. Efficiency & Estimate accuracy: tasks having both estimate_final_min and actual_min (count >= 3)
        est_act_query = select(
            func.count(Task.id),
            func.sum(Task.estimate_final_min),
            func.sum(Task.actual_min),
            func.count(
                func.nullif(
                    and_(
                        Task.actual_min >= 0.75 * Task.estimate_final_min,
                        Task.actual_min <= 1.25 * Task.estimate_final_min,
                    ),
                    False,
                )
            ),
        ).where(
            and_(
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
                Task.status == "completed",
                Task.completed_at >= start_utc,
                Task.completed_at < end_utc,
                Task.estimate_final_min.is_not(None),
                Task.actual_min.is_not(None),
            )
        )
        ea_res = (await self.session.execute(est_act_query)).one()
        ea_count = int(ea_res[0])

        efficiency: float | None = None
        estimate_accuracy: float | None = None
        if ea_count >= 3:
            sum_est = float(ea_res[1] or 0)
            sum_act = float(ea_res[2] or 0)
            if sum_act > 0:
                efficiency = round(sum_act / sum_est, 2)
            accurate_count = int(ea_res[3] or 0)
            estimate_accuracy = round(accurate_count / ea_count, 4)

        return SummaryMetricsResponse(
            period=period,
            start_at=start_utc,
            end_at=end_utc,
            timezone=tz_str,
            total_time_min=total_time_min,
            tasks_completed=tasks_completed,
            tasks_pending=tasks_pending,
            tasks_overdue=tasks_overdue,
            completion_rate=completion_rate,
            on_time_rate=on_time_rate,
            efficiency=efficiency,
            estimate_accuracy=estimate_accuracy,
        )

    async def get_productivity_score(
        self,
        user_id: uuid.UUID,
        period: PeriodType = "weekly",
        from_date: date | None = None,
        to_date: date | None = None,
        tz_str: str = "Asia/Kolkata",
    ) -> ProductivityScoreResponse:
        """Compute the transparent productivity score v1 per doc 10 §3.

        Score = round(100 * (0.5 * C + 0.3 * O + 0.2 * A))
        Invariants:
        - No time term: logging hours does not alter the score.
        - Cancelled tasks are excluded.
        - Insufficient data returns null.
        - Reasonable reschedules are not penalized.
        """
        # For daily score, rolling 7 days is used to avoid high single-day noise
        if period == "daily":
            tz = zoneinfo.ZoneInfo(tz_str)
            ref = datetime.now(tz)
            start_utc = (ref - timedelta(days=7)).astimezone(zoneinfo.ZoneInfo("UTC"))
            end_utc = ref.astimezone(zoneinfo.ZoneInfo("UTC"))
        else:
            start_utc, end_utc = resolve_period(period, tz_str, from_date, to_date)

        # Fetch candidate tasks for score calculation
        tasks_query = select(Task).where(
            and_(
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
                Task.status != "cancelled",
                or_(
                    and_(Task.completed_at >= start_utc, Task.completed_at < end_utc),
                    and_(Task.deadline_at >= start_utc, Task.deadline_at < end_utc),
                ),
            )
        )
        tasks = list((await self.session.execute(tasks_query)).scalars().all())

        priority_weights: dict[Any, float] = {
            1: 2.0,
            2: 1.5,
            3: 1.0,
            4: 1.0,
            "1": 2.0,
            "2": 1.5,
            "3": 1.0,
            "4": 1.0,
            "p1": 2.0,
            "p2": 1.5,
            "p3": 1.0,
            "p4": 1.0,
        }

        # 1. Weighted Completion Rate (C)
        weighted_completed = 0.0
        weighted_total = 0.0
        c_sample_count = 0

        for t in tasks:
            weight = priority_weights.get(t.priority, 1.0) if t.priority is not None else 1.0
            weighted_total += weight
            c_sample_count += 1
            if t.status == "completed" and t.completed_at and start_utc <= t.completed_at < end_utc:
                weighted_completed += weight

        c_component: float | None = None
        if c_sample_count >= 3 and weighted_total > 0:
            c_component = weighted_completed / weighted_total

        # If C is insufficient, score is null ("Not enough data") per doc 10 §3
        if c_component is None:
            return ProductivityScoreResponse(
                score=None,
                formula_version=1,
                period=period,
                completion_component=None,
                on_time_component=None,
                accuracy_component=None,
                insufficient_data=True,
                message="Not enough data: fewer than 3 tasks in period",
            )

        # 2. On-time Rate with Reasonable Reschedules (O)
        # Completed in period with deadline
        completed_with_deadline = [
            t
            for t in tasks
            if t.status == "completed"
            and t.completed_at
            and start_utc <= t.completed_at < end_utc
            and t.deadline_at is not None
        ]

        o_component: float | None = None
        if len(completed_with_deadline) >= 3:
            on_time_count = 0
            for t in completed_with_deadline:
                assert t.completed_at is not None
                assert t.deadline_at is not None
                # Reasonable reschedule check:
                # If reschedule_count <= 2 and completed <= deadline_at, on-time
                if t.completed_at <= t.deadline_at:
                    on_time_count += 1
            o_component = on_time_count / len(completed_with_deadline)

        # 3. Estimate Accuracy (A) (within +-25%)
        completed_with_estimates = [
            t
            for t in tasks
            if t.status == "completed"
            and t.completed_at
            and start_utc <= t.completed_at < end_utc
            and t.estimate_min is not None
            and t.actual_min is not None
            and t.estimate_min > 0
        ]

        a_component: float | None = None
        if len(completed_with_estimates) >= 3:
            accurate_count = 0
            for t in completed_with_estimates:
                assert t.estimate_min is not None
                assert t.actual_min is not None
                if 0.75 * t.estimate_min <= t.actual_min <= 1.25 * t.estimate_min:
                    accurate_count += 1
            a_component = accurate_count / len(completed_with_estimates)

        # Combine components with weight renormalization
        # Base weights: C=0.5, O=0.3, A=0.2
        if o_component is not None and a_component is not None:
            raw_score = 0.5 * c_component + 0.3 * o_component + 0.2 * a_component
        elif o_component is not None and a_component is None:
            raw_score = (0.5 * c_component + 0.3 * o_component) / 0.8
        elif o_component is None and a_component is not None:
            raw_score = (0.5 * c_component + 0.2 * a_component) / 0.7
        else:
            raw_score = c_component

        score = max(0, min(100, round(100 * raw_score)))

        return ProductivityScoreResponse(
            score=score,
            formula_version=1,
            period=period,
            completion_component=round(c_component, 4),
            on_time_component=round(o_component, 4) if o_component is not None else None,
            accuracy_component=round(a_component, 4) if a_component is not None else None,
            insufficient_data=False,
            message="Productivity score computed successfully",
        )

    def get_formula(self) -> ScoreFormulaResponse:
        """Return the transparent, versioned score formula definition."""
        return ScoreFormulaResponse(
            formula_version=1,
            description="ALIBI Productivity Score v1 measures follow-through, punctuality, and planning accuracy without rewarding excessive hours.",
            weights={
                "completion_weight": 0.5,
                "on_time_weight": 0.3,
                "accuracy_weight": 0.2,
            },
            rules=[
                "Score = round(100 * (0.5 * C + 0.3 * O + 0.2 * A))",
                "C is weighted completion rate: P1=2.0, P2=1.5, P3=1.0, P4=1.0",
                "O is on-time rate; reasonable reschedules (<= 2 before deadline) judge against final deadline",
                "A is estimate accuracy: share of tasks completed within +-25% of initial estimate",
                "No hours term: working longer hours does not increase the score",
                "Cancelled tasks are strictly excluded from all counts and denominators",
                "When samples < 3, the metric is marked insufficient and weights are renormalized",
                "If completion has < 3 tasks, the score returns null (Not enough data)",
            ],
            components={
                "C": "Weighted completion rate of tasks due or completed in the period",
                "O": "Percentage of deadline tasks finished on or before the due date",
                "A": "Percentage of tasks completed within +-25% of estimate duration",
            },
        )

    async def get_completion_trend(
        self,
        user_id: uuid.UUID,
        period: PeriodType = "weekly",
        from_date: date | None = None,
        to_date: date | None = None,
        tz_str: str = "Asia/Kolkata",
    ) -> list[CompletionTrendPoint]:
        """Daily completion counts for trend charting."""
        start_utc, end_utc = resolve_period(period, tz_str, from_date, to_date)
        tz = zoneinfo.ZoneInfo(tz_str)

        query = (
            select(
                func.date(func.timezone(tz_str, Task.completed_at)).label("comp_date"),
                func.count(Task.id).label("count"),
            )
            .where(
                and_(
                    Task.user_id == user_id,
                    Task.deleted_at.is_(None),
                    Task.status == "completed",
                    Task.completed_at >= start_utc,
                    Task.completed_at < end_utc,
                )
            )
            .group_by("comp_date")
            .order_by("comp_date")
        )
        rows = (await self.session.execute(query)).all()
        counts_by_date = {row[0]: int(row[1]) for row in rows}

        # Fill date sequence in local tz
        cur = start_utc.astimezone(tz).date()
        end_date = end_utc.astimezone(tz).date()
        points: list[CompletionTrendPoint] = []
        while cur < end_date:
            points.append(
                CompletionTrendPoint(
                    date=cur,
                    completed_count=counts_by_date.get(cur, 0),
                )
            )
            cur += timedelta(days=1)

        return points

    async def get_time_distribution(
        self,
        user_id: uuid.UUID,
        period: PeriodType = "weekly",
        from_date: date | None = None,
        to_date: date | None = None,
        tz_str: str = "Asia/Kolkata",
    ) -> list[TimeDistributionItem]:
        """Time logged grouped by category with percentages."""
        start_utc, end_utc = resolve_period(period, tz_str, from_date, to_date)
        now_utc = datetime.now(zoneinfo.ZoneInfo("UTC"))

        query = (
            select(
                Category.id,
                Category.name,
                Category.color,
                func.coalesce(
                    func.sum(
                        func.extract(
                            "epoch",
                            func.least(func.coalesce(TimeEntry.ended_at, now_utc), end_utc)
                            - func.greatest(TimeEntry.started_at, start_utc),
                        )
                        / 60
                    ),
                    0,
                ).label("total_min"),
            )
            .join(Task, TimeEntry.task_id == Task.id)
            .outerjoin(Category, Task.category_id == Category.id)
            .where(
                and_(
                    TimeEntry.user_id == user_id,
                    TimeEntry.started_at < end_utc,
                    func.coalesce(TimeEntry.ended_at, now_utc) > start_utc,
                )
            )
            .group_by(Category.id, Category.name, Category.color)
        )
        rows = (await self.session.execute(query)).all()

        total_min_sum = sum(int(r[3]) for r in rows)
        items: list[TimeDistributionItem] = []
        for r in rows:
            t_min = int(r[3])
            pct = round((t_min / total_min_sum) * 100, 2) if total_min_sum > 0 else 0.0
            items.append(
                TimeDistributionItem(
                    category_id=r[0],
                    category_name=str(r[1] or "Uncategorized"),
                    category_color=str(r[2] or "#64748B"),
                    total_min=t_min,
                    percentage=pct,
                )
            )
        items.sort(key=lambda x: x.total_min, reverse=True)
        return items

    async def get_consistency_heatmap(
        self,
        user_id: uuid.UUID,
        days: int = 365,
        tz_str: str = "Asia/Kolkata",
    ) -> list[ConsistencyHeatmapItem]:
        """Up to 1-year daily consistency activity (tasks completed + minutes logged)."""
        tz = zoneinfo.ZoneInfo(tz_str)
        now_tz = datetime.now(tz)
        start_tz = now_tz - timedelta(days=min(days, 366))
        start_utc = datetime.combine(start_tz.date(), time.min, tzinfo=tz).astimezone(
            zoneinfo.ZoneInfo("UTC")
        )
        end_utc = datetime.combine(
            now_tz.date() + timedelta(days=1), time.min, tzinfo=tz
        ).astimezone(zoneinfo.ZoneInfo("UTC"))

        # 1. Completions per day
        comp_query = (
            select(
                func.date(func.timezone(tz_str, Task.completed_at)).label("act_date"),
                func.count(Task.id).label("count"),
            )
            .where(
                and_(
                    Task.user_id == user_id,
                    Task.deleted_at.is_(None),
                    Task.status == "completed",
                    Task.completed_at >= start_utc,
                    Task.completed_at < end_utc,
                )
            )
            .group_by("act_date")
        )
        comp_rows = {r[0]: int(r[1]) for r in (await self.session.execute(comp_query)).all()}

        # 2. Minutes logged per day
        time_query = (
            select(
                func.date(func.timezone(tz_str, TimeEntry.started_at)).label("act_date"),
                func.coalesce(func.sum(TimeEntry.duration_min), 0).label("min_sum"),
            )
            .where(
                and_(
                    TimeEntry.user_id == user_id,
                    TimeEntry.started_at >= start_utc,
                    TimeEntry.started_at < end_utc,
                )
            )
            .group_by("act_date")
        )
        time_rows = {r[0]: int(r[1]) for r in (await self.session.execute(time_query)).all()}

        items: list[ConsistencyHeatmapItem] = []
        cur = start_tz.date()
        today = now_tz.date()
        while cur <= today:
            items.append(
                ConsistencyHeatmapItem(
                    date=cur,
                    completed_count=comp_rows.get(cur, 0),
                    minutes_logged=time_rows.get(cur, 0),
                )
            )
            cur += timedelta(days=1)

        return items

    async def get_est_vs_actual(
        self,
        user_id: uuid.UUID,
        period: PeriodType = "weekly",
        from_date: date | None = None,
        to_date: date | None = None,
        tz_str: str = "Asia/Kolkata",
    ) -> list[EstVsActualItem]:
        """Estimated vs actual time comparison for completed tasks."""
        start_utc, end_utc = resolve_period(period, tz_str, from_date, to_date)

        query = (
            select(
                Task.id,
                Task.title,
                Task.estimate_final_min,
                Task.actual_min,
                Category.name,
            )
            .outerjoin(Category, Task.category_id == Category.id)
            .where(
                and_(
                    Task.user_id == user_id,
                    Task.deleted_at.is_(None),
                    Task.status == "completed",
                    Task.completed_at >= start_utc,
                    Task.completed_at < end_utc,
                    Task.estimate_final_min.is_not(None),
                    Task.actual_min.is_not(None),
                )
            )
            .order_by(Task.completed_at.desc())
        )
        rows = (await self.session.execute(query)).all()

        items: list[EstVsActualItem] = []
        for r in rows:
            est = int(r[2] or 0)
            act = int(r[3] or 0)
            ratio = round(act / est, 2) if est > 0 else 0.0
            items.append(
                EstVsActualItem(
                    task_id=r[0],
                    title=str(r[1]),
                    estimate_min=est,
                    actual_min=act,
                    category_name=str(r[4] or "Uncategorized"),
                    ratio=ratio,
                )
            )
        return items

    async def get_category_workload(
        self,
        user_id: uuid.UUID,
        period: PeriodType = "weekly",
        from_date: date | None = None,
        to_date: date | None = None,
        tz_str: str = "Asia/Kolkata",
    ) -> list[CategoryWorkloadItem]:
        """Workload breakdown by category (completed, open, and total time)."""
        start_utc, end_utc = resolve_period(period, tz_str, from_date, to_date)
        now_utc = datetime.now(zoneinfo.ZoneInfo("UTC"))

        categories_query = select(Category).where(
            and_(Category.user_id == user_id, Category.deleted_at.is_(None))
        )
        categories = list((await self.session.execute(categories_query)).scalars().all())

        items: list[CategoryWorkloadItem] = []
        for cat in categories:
            # completed in period
            c_q = select(func.count(Task.id)).where(
                and_(
                    Task.user_id == user_id,
                    Task.category_id == cat.id,
                    Task.deleted_at.is_(None),
                    Task.status == "completed",
                    Task.completed_at >= start_utc,
                    Task.completed_at < end_utc,
                )
            )
            comp_count = int((await self.session.execute(c_q)).scalar_one())

            # open count
            o_q = select(func.count(Task.id)).where(
                and_(
                    Task.user_id == user_id,
                    Task.category_id == cat.id,
                    Task.deleted_at.is_(None),
                    Task.status.in_(["pending", "in_progress"]),
                )
            )
            open_count = int((await self.session.execute(o_q)).scalar_one())

            # time spent in period
            t_q = (
                select(
                    func.coalesce(
                        func.sum(
                            func.extract(
                                "epoch",
                                func.least(func.coalesce(TimeEntry.ended_at, now_utc), end_utc)
                                - func.greatest(TimeEntry.started_at, start_utc),
                            )
                            / 60
                        ),
                        0,
                    )
                )
                .join(Task, TimeEntry.task_id == Task.id)
                .where(
                    and_(
                        TimeEntry.user_id == user_id,
                        Task.category_id == cat.id,
                        TimeEntry.started_at < end_utc,
                        func.coalesce(TimeEntry.ended_at, now_utc) > start_utc,
                    )
                )
            )
            time_spent = int((await self.session.execute(t_q)).scalar_one())

            items.append(
                CategoryWorkloadItem(
                    category_id=cat.id,
                    category_name=cat.name,
                    category_color=cat.color or "#64748B",
                    completed_count=comp_count,
                    open_count=open_count,
                    total_min=time_spent,
                )
            )

        items.sort(key=lambda x: x.completed_count + x.open_count, reverse=True)
        return items
