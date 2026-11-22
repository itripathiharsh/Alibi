"""Brain dump: split one free-text dump into reviewable task proposals.

FR-TASK-022 (brain dump), ADR-028. The LLM only splits and names items and quotes the
time words it saw. Every date is resolved by the deterministic rules parser from a
phrase that literally appears in the user's text (doc 06 §7 grounding rules), and the
day/week bucket is computed here, not by the model. Nothing is saved: the result is a
proposal the user edits and accepts on the device.
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
CATEGORIES = ("personal", "professional", "academic", "learning")


class _LLMItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = ""
    title: str = ""
    when: str | None = None
    category: str | None = None


class _LLMOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: list[_LLMItem] = Field(default_factory=list)


SYSTEM_PROMPT = """You split a person's brain dump into separate to-do items.
The input can be English, Hindi, Hinglish (Hindi written in English letters) or a mix.

Return only JSON: {"items":[{"text":"...","title":"...","when":null,"category":null}]}

Rules:
- One item for each separate thing to do. Never invent items and never merge two items.
- "text": copy the exact words from the input that describe this item.
- "title": a short task title using the person's own words and language
  (for example "Mandir jana", "Sabzi lena", "Boss wala account create karna"). Do not translate.
- "when": copy the exact time words written for this item, such as "shaam ko",
  "kal subah", "week ke end tak", "by friday". Use null if no time is written. Never guess.
- "category": one of personal, professional, academic, learning, or null.
- Never add dates, numbers, durations or priorities that are not written in the input."""


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


@dataclass
class BrainDumpResult:
    items: list[BrainDumpItem]
    mode: Literal["ai", "rules"]
    ai_status: AIStatus
    provider: str | None


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower()))


def _overlap(candidate: str, source: str) -> float:
    cand = _tokens(candidate)
    if not cand:
        return 0.0
    return len(cand & _tokens(source)) / len(cand)


# Connectors that separate items in a spoken or typed dump. "and" is left out on
# purpose: "Rahul and Priya ko call" is one task.
_SPLIT_PATTERN = re.compile(
    r"\n+|;|•|।|\.\s+|,\s*|\s+(?:aur\s+(?:phir|fir)|aur|phir|fir|then|also|uske\s+baad)\s+",
    re.IGNORECASE,
)


def split_without_ai(text: str) -> list[str]:
    """Deterministic fallback splitter used when no AI provider is available."""
    parts = [
        re.sub(r"^(?:[-*]|\d+[.)])\s*", "", p).strip(" .-") for p in _SPLIT_PATTERN.split(text)
    ]
    return [p for p in parts if p and len(_tokens(p)) >= 1 and len(p) >= 2]


class BrainDumpService:
    """Turns a free-text dump into grounded, bucketed task proposals."""

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

        return BrainDumpResult(
            items=self._dedupe(items)[:MAX_ITEMS],
            mode=mode,
            ai_status=ai_status,
            provider=provider,
        )

    async def _ask_ai(self, text: str) -> tuple[list[_LLMItem], AIStatus, str | None]:
        gateway = self.gateway
        req = LLMRequest(
            operation=Operation.BRAIN_DUMP,
            messages=[
                Message(role="system", content=SYSTEM_PROMPT),
                Message(role="user", content=f"Brain dump:\n<<<\n{text}\n>>>"),
            ],
            response_schema=_LLMOutput,
            max_output_tokens=1800,
            temperature=0.0,
            timeout_s=20.0,
        )
        try:
            result = await gateway.complete(req, user_id=self.user.id)
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
            title = seg_parse.cleaned_title
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

        category = raw.category if raw.category in CATEGORIES else None
        return BrainDumpItem(
            title=title,
            source_text=segment,
            deadline_at=deadline_at,
            deadline_phrase=phrase,
            deadline_kind=kind,
            bucket=self._bucket(deadline_at, local_now),
            priority=seg_parse.priority.value if seg_parse.priority else None,
            estimate_minutes=seg_parse.estimate.minutes if seg_parse.estimate else None,
            category=category,
        )

    def _from_segment(self, segment: str, local_now: datetime) -> BrainDumpItem:
        parsed = self.rules.parse(segment, base_time=local_now, tz_name=self.tz_name)
        deadline = parsed.deadline
        return BrainDumpItem(
            title=parsed.cleaned_title[:200],
            source_text=segment,
            deadline_at=deadline.dt if deadline else None,
            deadline_phrase=deadline.evidence.text if deadline else None,
            deadline_kind=deadline.kind if deadline else None,
            bucket=self._bucket(deadline.dt if deadline else None, local_now),
            priority=parsed.priority.value if parsed.priority else None,
            estimate_minutes=parsed.estimate.minutes if parsed.estimate else None,
            category=None,
        )

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
