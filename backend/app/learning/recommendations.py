"""Personal recommendations from the user's own history (FR-LEARN-013, ADR-028).

Every number in a recommendation is counted from the user's rows here; no model is
involved. Recommendations unlock after the user has been active on 7 distinct local
days, and each one needs its own minimum sample size so a thin history never produces
a confident-sounding tip.
"""

import re
import statistics
import uuid
import zoneinfo
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.learning import BehaviorObservation
from app.models.task import Task
from app.schemas.learning import RecommendationItem, RecommendationsResponse

DAYS_NEEDED = 7
MAX_ITEMS = 3
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _part_of_day(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


def _norm_title(title: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", title.lower())).strip()


class RecommendationEngine:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def build(
        self, user_id: uuid.UUID, tz_name: str, now: datetime | None = None
    ) -> RecommendationsResponse:
        try:
            tz = zoneinfo.ZoneInfo(tz_name)
        except Exception:
            tz = zoneinfo.ZoneInfo("Asia/Kolkata")
        now = now or utc_now()
        since = now - timedelta(days=60)

        rows = (
            await self.db.execute(
                select(
                    Task.id,
                    Task.title,
                    Task.status,
                    Task.created_at,
                    Task.completed_at,
                    Task.deadline_at,
                    Task.reschedule_count,
                    Task.estimate_final_min,
                    Task.actual_min,
                    Task.recurrence_rule_id,
                ).where(
                    Task.user_id == user_id,
                    Task.deleted_at.is_(None),
                    or_(
                        Task.created_at >= since,
                        Task.completed_at >= since,
                        Task.status.in_(("pending", "in_progress")),
                    ),
                )
            )
        ).all()

        active_days: set[date] = set()
        recent = now - timedelta(days=30)
        for r in rows:
            for ts in (r.created_at, r.completed_at):
                if ts is not None and ts >= recent:
                    active_days.add(ts.astimezone(tz).date())
        days_observed = len(active_days)
        if days_observed < DAYS_NEEDED:
            return RecommendationsResponse(
                status="learning", days_observed=days_observed, days_needed=DAYS_NEEDED, items=[]
            )

        items: list[RecommendationItem] = []
        completed = [r for r in rows if r.status == "completed" and r.completed_at is not None]
        open_rows = [r for r in rows if r.status in ("pending", "in_progress")]

        # 1. Overdue pile
        overdue = [r for r in open_rows if r.deadline_at is not None and r.deadline_at < now]
        if len(overdue) >= 3:
            items.append(
                RecommendationItem(
                    id="overdue_pile",
                    kind="overdue_pile",
                    title=f"{len(overdue)} tasks are past their deadline",
                    body="Take two minutes: finish, move or drop each one so today's list is honest.",
                    evidence={"overdue_tasks": len(overdue)},
                    action="review_today",
                )
            )

        # 2. Stuck tasks (moved 3+ times and still open)
        stuck = sorted(
            (r for r in open_rows if (r.reschedule_count or 0) >= 3),
            key=lambda r: r.reschedule_count or 0,
            reverse=True,
        )
        if stuck:
            top = stuck[0]
            items.append(
                RecommendationItem(
                    id=f"stuck_task:{top.id}",
                    kind="stuck_task",
                    title=f"“{top.title[:60]}” keeps getting moved",
                    body=f"It has been moved {top.reschedule_count} times. Break it into a smaller first step, or drop it.",
                    evidence={"times_moved": int(top.reschedule_count or 0)},
                    task_id=str(top.id),
                    action="open_task",
                )
            )

        # 3. Check-ins mostly answered with "move to tomorrow"
        obs_rows = (
            await self.db.execute(
                select(BehaviorObservation.observation_type).where(
                    BehaviorObservation.user_id == user_id,
                    BehaviorObservation.observed_at >= now - timedelta(days=14),
                    BehaviorObservation.observation_type.in_(
                        ("checkin_done", "checkin_moved", "checkin_snoozed")
                    ),
                )
            )
        ).all()
        checkins = Counter(o.observation_type for o in obs_rows)
        answered = sum(checkins.values())
        moved = checkins.get("checkin_moved", 0)
        if answered >= 6 and moved * 2 >= answered:
            items.append(
                RecommendationItem(
                    id="too_many_moved",
                    kind="too_many_moved",
                    title="Most check-ins end with “tomorrow”",
                    body=f"You moved {moved} of {answered} checked-in tasks in the last 14 days. Plan fewer things per day so the plan holds.",
                    evidence={"moved": moved, "answered": answered},
                    action="none",
                )
            )

        # 4. Underestimation
        ratios = [
            r.actual_min / r.estimate_final_min
            for r in completed
            if r.estimate_final_min
            and r.estimate_final_min > 0
            and r.actual_min
            and r.actual_min > 0
        ]
        if len(ratios) >= 5:
            median_ratio = statistics.median(ratios)
            if median_ratio >= 1.3:
                items.append(
                    RecommendationItem(
                        id="underestimate",
                        kind="underestimate",
                        title="Tasks take longer than you plan",
                        body=f"Across {len(ratios)} timed tasks, the typical one took {median_ratio:.1f}× your estimate. Add buffer when you plan.",
                        evidence={"tasks": len(ratios), "median_ratio": round(median_ratio, 1)},
                        action="none",
                    )
                )

        # 5. Repeating task done on the same weekday (not already a routine)
        by_title_day: dict[tuple[str, int], list[str]] = defaultdict(list)
        for r in completed:
            if r.recurrence_rule_id is None and r.completed_at is not None:
                key = _norm_title(r.title)
                if key:
                    by_title_day[(key, r.completed_at.astimezone(tz).weekday())].append(r.title)
        routine = max(by_title_day.items(), key=lambda kv: len(kv[1]), default=None)
        if routine and len(routine[1]) >= 3:
            (_, weekday), titles = routine
            items.append(
                RecommendationItem(
                    id=f"routine:{_norm_title(titles[0])}:{weekday}",
                    kind="routine",
                    title=f"Make “{titles[0][:60]}” a {WEEKDAYS[weekday]} routine?",
                    body=f"You completed it on {WEEKDAYS[weekday]} {len(titles)} times in the last 60 days.",
                    evidence={"times": len(titles), "weekday": WEEKDAYS[weekday]},
                    action="make_routine",
                )
            )

        # 6. Best time of day
        recent_done = [
            r for r in completed if r.completed_at is not None and r.completed_at >= recent
        ]
        if len(recent_done) >= 10:
            parts = Counter(_part_of_day(r.completed_at.astimezone(tz).hour) for r in recent_done)
            part, count = parts.most_common(1)[0]
            if count * 2 >= len(recent_done):
                items.append(
                    RecommendationItem(
                        id=f"best_time:{part}",
                        kind="best_time",
                        title=f"You finish most things in the {part}",
                        body=f"{count} of your last {len(recent_done)} completed tasks were done in the {part}. Put important work there.",
                        evidence={"in_part": count, "completed": len(recent_done), "part": part},
                        action="none",
                    )
                )

        # Hide anything the user dismissed in the last 30 days.
        dismissed_rows = (
            await self.db.execute(
                select(BehaviorObservation.features).where(
                    BehaviorObservation.user_id == user_id,
                    BehaviorObservation.observation_type == "recommendation_dismissed",
                    BehaviorObservation.observed_at >= recent,
                )
            )
        ).all()
        dismissed = {str((f.features or {}).get("rec_id")) for f in dismissed_rows}
        items = [item for item in items if item.id not in dismissed]

        return RecommendationsResponse(
            status="ready",
            days_observed=days_observed,
            days_needed=DAYS_NEEDED,
            items=items[:MAX_ITEMS],
        )
