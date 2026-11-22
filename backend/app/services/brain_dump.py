"""Brain dump: turn one free-text (often spoken) dump into a planned list of task proposals.

FR-TASK-022 (brain dump), ADR-028. The LLM splits the dump into separate actions and
writes short, clean titles; it quotes the time words and durations it heard. Every date is
resolved by the deterministic rules parser from a phrase that literally appears in the
text (doc 06 §7 grounding rules). Tasks without a spoken time get a *suggested* slot from a
deterministic planner (working hours, spoken order, no overlaps), clearly marked as a
suggestion the user can drop. Nothing is saved here: the device saves what the user keeps.
"""

import logging
import re
import zoneinfo
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gateway import AIGateway, user_cloud_ai_opt_in
from app.ai.types import LLMRequest, Message, Operation
from app.core.config import settings
from app.core.time import utc_now
from app.models.user import User
from app.services.rules_parser import RulesParser

logger = logging.getLogger("alibi.brain_dump")

MAX_ITEMS = 40
Bucket = Literal["today", "this_week", "later", "anytime"]
AIStatus = Literal["used", "not_opted_in", "server_disabled", "unavailable"]
TimeSource = Literal["said", "suggested"]
CATEGORIES = ("personal", "professional", "academic", "learning")

# Planner settings for suggested times.
DAY_START_HOUR = 9
DAY_END_HOUR = 21
DEFAULT_TASK_MINUTES = 30
GAP_MINUTES = 15


class _LLMItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = ""
    title: str = ""
    when: str | None = None
    minutes: int | None = None
    category: str | None = None


class _LLMOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: list[_LLMItem] = Field(default_factory=list)


SYSTEM_PROMPT = """You turn a person's brain dump into a clean, separate to-do list.
The input is English, Hindi, Hinglish (Hindi in English letters) or a mix. It is often
voice typing: no punctuation, run-on sentences and a few misheard words.

Return only JSON:
{"items":[{"text":"...","title":"...","when":null,"minutes":null,"category":null}]}

Think it through before answering:
1. Find every separate thing the person has to do. Words like "and", "aur", "phir",
   "uske baad", "then", "I have to", "mujhe" usually start a new task. One action per item.
   Drop filler and chit-chat. Never invent a task and never merge two tasks.
2. "text": copy the exact words from the input for this item (keep their spelling).
3. "title": a short, clear action of 2 to 7 words that starts with the verb, e.g.
   "Install the new APK", "Test notifications", "Check the progress review", "Mandir jana".
   Use the person's own words and language (do not translate Hinglish). Fix a misheard
   word only when the intended word is obvious from context. Add nothing that wasn't said.
4. "when": copy the exact time words said for this item, e.g. "shaam ko", "kal subah",
   "5 baje", "by friday", "today". null if none was said. Never guess a time.
5. "minutes": a duration only if one was said for this item ("5 minute ke liye" -> 5,
   "1 ghanta" -> 60), else null.
6. "category": personal, professional, academic, learning, or null."""


@dataclass
class BrainDumpItem:
    title: str
    source_text: str
    deadline_at: datetime | None
    deadline_phrase: str | None
    deadline_kind: str | None
    bucket: Bucket
    priority: int | None
    estimate_minutes: int | None
    category: str | None
    suggested_at: datetime | None = None
    time_source: TimeSource | None = None


@dataclass
class BrainDumpResult:
    items: list[BrainDumpItem]
    mode: Literal["ai", "rules"]
    ai_status: AIStatus
    provider: str | None


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _stem(token: str) -> str:
    return token[:-1] if len(token) > 3 and token.endswith("s") else token


def _tokens(text: str) -> set[str]:
    return {_stem(t) for t in re.findall(r"\w+", text.lower())}


def _overlap(candidate: str, source: str) -> float:
    cand = _tokens(candidate)
    if not cand:
        return 0.0
    return len(cand & _tokens(source)) / len(cand)


# Where one spoken or typed task ends and the next begins. Plain "and" is left out on
# purpose ("Rahul and Priya ko call" is one task); "and then", "uske baad" and a new
# "I have to …" do start a new task.
_SPLIT_PATTERN = re.compile(
    r"\n+|;|•|।|\.\s+|,\s*"
    r"|\s+(?:and\s+then|and\s+after\s+that|after\s+that|aur\s+(?:phir|fir)|aur|phir|fir|then|also"
    r"|uske\s+(?:baad|bad)|iske\s+(?:baad|bad))\s+"
    r"|\s+(?=(?:i\s+(?:have|need|want)\s+to|i\s+also\s+have\s+to|mujhe|muje)\s)",
    re.IGNORECASE,
)
_LEADING_FILLER = re.compile(
    r"^(?:(?:and|aur|so|then|also|ok|okay)\s+)*"
    r"(?:i\s+(?:also\s+)?(?:have|need|want)\s+to|i\s+will|i'll|i\s+should|have\s+to|need\s+to|mujhe|muje)\s+",
    re.IGNORECASE,
)
_TRAILING_FILLER = re.compile(r"\s+(?:and|aur|or|to|toh|bhi|also|that)$", re.IGNORECASE)


def tidy_title(text: str) -> str:
    """Make a readable title from raw words when no AI is available."""
    title = re.sub(r"\s+", " ", text).strip(" .,-")
    for _ in range(3):
        title = _LEADING_FILLER.sub("", title)
        title = _TRAILING_FILLER.sub("", title).strip(" .,-")
    return (title[:1].upper() + title[1:]) if title else text.strip()


def split_without_ai(text: str) -> list[str]:
    """Deterministic fallback splitter used when no AI provider is available."""
    parts = [
        re.sub(r"^(?:[-*]|\d+[.)])\s*", "", p or "").strip(" .-")
        for p in _SPLIT_PATTERN.split(text)
    ]
    return [p for p in parts if p and len(p) >= 2 and _tokens(p)]


class BrainDumpService:
    """Turns a free-text dump into grounded, planned task proposals."""

    def __init__(
        self, db: AsyncSession | None, user: User, gateway: AIGateway | None = None
    ) -> None:
        self.db = db
        self.user = user
        self.gateway = gateway or AIGateway(db)
        tz_name = user.timezone or settings.alibi_timezone
        try:
            self.tz = zoneinfo.ZoneInfo(tz_name)
            self.tz_name = tz_name
        except Exception:
            self.tz = zoneinfo.ZoneInfo("Asia/Kolkata")
            self.tz_name = "Asia/Kolkata"
        self.rules = RulesParser(default_tz=self.tz_name)

    async def split(self, text: str, now: datetime | None = None) -> BrainDumpResult:
        local_now = (now or utc_now()).astimezone(self.tz)
        ai_items, ai_status, provider = await self._ask_ai(text)

        items: list[BrainDumpItem] = []
        if ai_items:
            for raw in ai_items:
                item = self._ground_ai_item(raw, text, local_now)
                if item is not None:
                    items.append(item)
        if not items:
            items = [self._from_segment(seg, local_now) for seg in split_without_ai(text)]
            mode: Literal["ai", "rules"] = "rules"
            if ai_status == "used":
                ai_status = "unavailable"  # the model answered but nothing was usable
                provider = None
        else:
            mode = "ai"

        items = self._dedupe(items)[:MAX_ITEMS]
        self._plan_times(items, local_now)
        return BrainDumpResult(items=items, mode=mode, ai_status=ai_status, provider=provider)

    async def _ask_ai(self, text: str) -> tuple[list[_LLMItem], AIStatus, str | None]:
        req = LLMRequest(
            operation=Operation.BRAIN_DUMP,
            messages=[
                Message(role="system", content=SYSTEM_PROMPT),
                Message(role="user", content=f"Brain dump:\n<<<\n{text}\n>>>"),
            ],
            response_schema=_LLMOutput,
            max_output_tokens=2000,
            temperature=0.1,
            timeout_s=20.0,
        )
        try:
            result = await self.gateway.complete(req, user_id=self.user.id)
        except Exception as exc:  # the dump must still work without AI
            logger.debug("Brain dump AI call failed: %s", type(exc).__name__)
            result = None

        if result is not None and result.ok and isinstance(result.data, _LLMOutput):
            return result.data.items[: MAX_ITEMS * 2], "used", result.provider

        if not settings.ai_external_enabled:
            status: AIStatus = "server_disabled"
        elif not user_cloud_ai_opt_in(self.user.settings):
            status = "not_opted_in"
        else:
            status = "unavailable"
        return [], status, None

    def _ground_ai_item(
        self, raw: _LLMItem, full_text: str, local_now: datetime
    ) -> BrainDumpItem | None:
        norm_full = _norm(full_text)
        segment = raw.text.strip()
        if not segment or _norm(segment) not in norm_full:
            # The model did not quote the input; accept its title only if it is grounded.
            segment = raw.title.strip()
            if not segment or _overlap(segment, full_text) < 0.5:
                return None

        seg_parse = self.rules.parse(segment, base_time=local_now, tz_name=self.tz_name)

        title = raw.title.strip()
        if not title or _overlap(title, segment) < 0.5:
            title = tidy_title(seg_parse.cleaned_title)
        title = title[:200]

        deadline_at: datetime | None = None
        phrase: str | None = None
        kind: str | None = None
        when = (raw.when or "").strip()
        if when and _norm(when) in norm_full:
            when_parse = self.rules.parse(when, base_time=local_now, tz_name=self.tz_name)
            if when_parse.deadline:
                deadline_at = when_parse.deadline.dt
                phrase = when_parse.deadline.evidence.text
                kind = when_parse.deadline.kind
        if deadline_at is None and seg_parse.deadline:
            deadline_at = seg_parse.deadline.dt
            phrase = seg_parse.deadline.evidence.text
            kind = seg_parse.deadline.kind

        # Duration: the rules parser's reading of the words first; the model's number only
        # when that exact number was said in this item.
        estimate = seg_parse.estimate.minutes if seg_parse.estimate else None
        if (
            estimate is None
            and raw.minutes
            and 0 < raw.minutes <= 600
            and re.search(rf"\b{raw.minutes}\b", segment)
        ):
            estimate = raw.minutes

        category = raw.category if raw.category in CATEGORIES else None
        return BrainDumpItem(
            title=title,
            source_text=segment,
            deadline_at=deadline_at,
            deadline_phrase=phrase,
            deadline_kind=kind,
            bucket=self._bucket(deadline_at, local_now),
            priority=seg_parse.priority.value if seg_parse.priority else None,
            estimate_minutes=estimate,
            category=category,
            time_source="said" if deadline_at else None,
        )

    def _from_segment(self, segment: str, local_now: datetime) -> BrainDumpItem:
        parsed = self.rules.parse(segment, base_time=local_now, tz_name=self.tz_name)
        deadline = parsed.deadline
        return BrainDumpItem(
            title=tidy_title(parsed.cleaned_title)[:200],
            source_text=segment,
            deadline_at=deadline.dt if deadline else None,
            deadline_phrase=deadline.evidence.text if deadline else None,
            deadline_kind=deadline.kind if deadline else None,
            bucket=self._bucket(deadline.dt if deadline else None, local_now),
            priority=parsed.priority.value if parsed.priority else None,
            estimate_minutes=parsed.estimate.minutes if parsed.estimate else None,
            category=None,
            time_source="said" if deadline else None,
        )

    @staticmethod
    def _round_up(moment: datetime, minutes: int = 15) -> datetime:
        moment = moment.replace(second=0, microsecond=0)
        extra = (-moment.minute) % minutes
        return moment + timedelta(minutes=extra)

    def _plan_times(self, items: list[BrainDumpItem], local_now: datetime) -> None:
        """Suggest a slot for each task without a spoken time, in the order it was said.

        Slots sit inside working hours, start after now, never overlap a time the user said
        or each other, and spill into the next day when today is full.
        """
        busy: list[tuple[datetime, datetime]] = []
        for item in items:
            if item.deadline_at is not None:
                start = item.deadline_at.astimezone(self.tz)
                busy.append(
                    (
                        start,
                        start + timedelta(minutes=item.estimate_minutes or DEFAULT_TASK_MINUTES),
                    )
                )

        cursor = self._round_up(local_now + timedelta(minutes=GAP_MINUTES))
        if cursor.hour < DAY_START_HOUR:
            cursor = cursor.replace(hour=DAY_START_HOUR, minute=0)

        for item in items:
            if item.deadline_at is not None:
                continue
            length = timedelta(minutes=item.estimate_minutes or DEFAULT_TASK_MINUTES)
            for _ in range(200):
                day_end = cursor.replace(hour=DAY_END_HOUR, minute=0)
                if cursor + length > day_end:
                    cursor = (cursor + timedelta(days=1)).replace(hour=DAY_START_HOUR, minute=0)
                    continue
                clash = next((b for b in busy if cursor < b[1] and cursor + length > b[0]), None)
                if clash is None:
                    break
                cursor = self._round_up(clash[1])
            item.suggested_at = cursor
            item.time_source = "suggested"
            item.bucket = self._bucket(cursor, local_now)
            busy.append((cursor, cursor + length))
            cursor = self._round_up(cursor + length + timedelta(minutes=GAP_MINUTES))

    def _bucket(self, deadline: datetime | None, local_now: datetime) -> Bucket:
        if deadline is None:
            return "anytime"
        local_deadline = deadline.astimezone(self.tz)
        today = local_now.date()
        if local_deadline.date() <= today:
            return "today"  # due today, or already overdue
        end_of_week = today + timedelta(days=6 - today.weekday())  # Sunday
        if local_deadline.date() <= end_of_week:
            return "this_week"
        return "later"

    @staticmethod
    def _dedupe(items: list[BrainDumpItem]) -> list[BrainDumpItem]:
        seen: set[str] = set()
        unique: list[BrainDumpItem] = []
        for item in items:
            key = _norm(item.title)
            if key and key not in seen:
                seen.add(key)
                unique.append(item)
        return unique
