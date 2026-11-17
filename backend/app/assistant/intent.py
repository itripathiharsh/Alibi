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
    if "tomorrow" in t:
        tom = today + timedelta(days=1)
        return (tom, tom)
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

    # Check for explicit calendar year (e.g. 2021, 2024)
    year_match = re.search(r"\b(20\d\d)\b", t)
    if year_match:
        yr = int(year_match.group(1))
        return (date(yr, 1, 1), date(yr, 12, 31))

    return (None, None)


def route_intent(query: str, ref_date: date | None = None) -> IntentPlan:
    """Analyze query and formulate tool and retrieval execution plan."""
    q = query.lower().strip()
    plan = IntentPlan(cleaned_query=query.strip())
    start_date, end_date = parse_date_range(q, ref_date=ref_date)
    plan.start_date = start_date
    plan.end_date = end_date

    # 1. Greetings (conversational intent)
    if re.search(
        r"^(hi|hello|hey|howdy|good morning|good afternoon|good evening|yo|sup|greetings)\b", q
    ):
        plan.intents.append("GREETING")

    # 2. Capabilities & Help
    if any(
        k in q
        for k in [
            "what can you do",
            "help",
            "who are you",
            "what are your capabilities",
            "how do you work",
            "how does this work",
            "what are you",
            "guide me",
            "commands",
        ]
    ):
        plan.intents.append("CAPABILITIES")

    # 3. Work Breakdown / Subtasks
    if any(
        k in q
        for k in [
            "break down",
            "breakdown",
            "subtasks",
            "decompose",
            "steps for",
            "split task",
        ]
    ):
        plan.intents.append("BREAKDOWN")

    # 4. Accomplishments / completed tasks
    if any(
        k in q
        for k in [
            "accomplish",
            "complete",
            "completed",
            "finished",
            "what did i do",
            "what did i work on",
            "done",
            "what did i finish",
            "achieved",
            "what have i done",
            "what i did",
        ]
    ):
        plan.intents.append("COMPLETED_TASKS")

    # 5. Time spent / hours
    if any(
        k in q
        for k in [
            "time spent",
            "how much time",
            "how long",
            "hours",
            "minutes",
            "tracked",
            "time logged",
            "duration",
        ]
    ):
        plan.intents.append("TIME_SPENT")

    # 6. Pending / Overdue / Highest Priority Tasks / Agenda
    if any(
        k in q
        for k in [
            "pending",
            "overdue",
            "due",
            "upcoming",
            "what's next",
            "whats next",
            "task",
            "tasks",
            "priority",
            "priorities",
            "highest priority",
            "todo",
            "to do",
            "to-do",
            "what should i do",
            "what do i have",
            "my day",
            "plan my day",
            "agenda",
            "what to work on",
            "schedule",
        ]
    ):
        plan.intents.append("PENDING_OVERDUE")

    # 7. Work logs
    if any(k in q for k in ["work log", "work logs", "daily log", "daily logs", "journal", "logs"]):
        plan.intents.append("WORK_LOGS")

    # 8. Routines / habits / peak focus
    if any(
        k in q
        for k in [
            "routine",
            "routines",
            "habit",
            "habits",
            "pattern",
            "patterns",
            "typical day",
            "peak focus",
            "peak hours",
            "focus hours",
            "focus time",
            "productivity",
        ]
    ):
        plan.intents.append("PROFILE_FACTS")

    # 9. Notes / knowledge / default vault search
    if not plan.intents or any(
        k in q
        for k in [
            "note",
            "notes",
            "decision",
            "decisions",
            "document",
            "documents",
            "what was",
            "tell me about",
        ]
    ):
        plan.intents.append("VAULT_SEARCH")
        plan.needs_semantic = True

    return plan
