"""Intent Router for Grounded Assistant (doc 08 §2.1).

Parses questions into structured intents and resolved date ranges using
deterministic rules and regex before selecting SQL tools and retrieval modes.
"""

import re
from dataclasses import dataclass, field
from datetime import date, timedelta


@dataclass
class IntentPlan:
    intents: list[str] = field(default_factory=list)
    start_date: date | None = None
    end_date: date | None = None
    needs_semantic: bool = False
    cleaned_query: str = ""


def parse_date_range(text: str, ref_date: date | None = None) -> tuple[date | None, date | None]:
    """Parse common relative date phrases into (start_date, end_date)."""
    today = ref_date or date.today()
    t = text.lower()

    if "today" in t:
        return (today, today)
    if "yesterday" in t:
        y = today - timedelta(days=1)
        return (y, y)
    if "last week" in t:
        # Previous Monday to Sunday
        days_since_monday = today.weekday()
        last_sunday = today - timedelta(days=days_since_monday + 1)
        last_monday = last_sunday - timedelta(days=6)
        return (last_monday, last_sunday)
    if "this week" in t:
        days_since_monday = today.weekday()
        monday = today - timedelta(days=days_since_monday)
        return (monday, today)
    if "this month" in t:
        first_day = today.replace(day=1)
        return (first_day, today)
    if "last month" in t:
        first_current = today.replace(day=1)
        last_prev = first_current - timedelta(days=1)
        first_prev = last_prev.replace(day=1)
        return (first_prev, last_prev)

    # Check for explicit year-month or days ago
    days_match = re.search(r"last\s+(\d+)\s+days", t)
    if days_match:
        count = int(days_match.group(1))
        return (today - timedelta(days=count), today)

    return (None, None)


def route_intent(query: str, ref_date: date | None = None) -> IntentPlan:
    """Analyze query and formulate tool and retrieval execution plan."""
    q = query.lower().strip()
    plan = IntentPlan(cleaned_query=query.strip())
    start_date, end_date = parse_date_range(q, ref_date=ref_date)
    plan.start_date = start_date
    plan.end_date = end_date

    # 1. Accomplishments / completed tasks
    if any(
        k in q
        for k in ["accomplish", "complete", "finished", "what did i do", "what did i work on"]
    ):
        plan.intents.append("COMPLETED_TASKS")

    # 2. Time spent / hours
    if any(k in q for k in ["time spent", "how much time", "how long", "hours", "minutes"]):
        plan.intents.append("TIME_SPENT")

    # 3. Pending / Overdue
    if any(k in q for k in ["pending", "overdue", "due", "upcoming", "what's next"]):
        plan.intents.append("PENDING_OVERDUE")

    # 4. Work logs
    if any(k in q for k in ["work log", "daily log", "journal"]):
        plan.intents.append("WORK_LOGS")

    # 5. Routines / habits
    if any(k in q for k in ["routine", "habit", "pattern", "typical day"]):
        plan.intents.append("PROFILE_FACTS")

    # 6. Notes / knowledge / default vault search
    if not plan.intents or any(
        k in q for k in ["note", "decision", "document", "what was", "tell me about"]
    ):
        plan.intents.append("VAULT_SEARCH")
        plan.needs_semantic = True

    return plan
