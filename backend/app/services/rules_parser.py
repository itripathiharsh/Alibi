"""Rules-based deterministic natural language task capture parser (doc 06 §7)."""

import re
import zoneinfo
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from typing import Any, cast

import dateparser  # type: ignore[import-untyped]


@dataclass
class EvidenceSpan:
    text: str
    start: int
    end: int


@dataclass
class ParsedDeadline:
    datetime_iso: str
    dt: datetime
    evidence: EvidenceSpan
    kind: str = "soft"  # 'hard' if 'by' / 'before' / 'deadline', else 'soft'


@dataclass
class ParsedPriority:
    value: int  # 1 to 4
    evidence: EvidenceSpan


@dataclass
class ParsedEstimate:
    minutes: int
    evidence: EvidenceSpan


@dataclass
class ParsedRulesResult:
    raw_input: str
    cleaned_title: str
    deadline: ParsedDeadline | None = None
    priority: ParsedPriority | None = None
    estimate: ParsedEstimate | None = None
    project_mentions: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    subtasks: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "raw_input": self.raw_input,
            "cleaned_title": self.cleaned_title,
            "deadline": {
                "iso": self.deadline.datetime_iso,
                "kind": self.deadline.kind,
                "text": self.deadline.evidence.text,
                "span": [self.deadline.evidence.start, self.deadline.evidence.end],
            }
            if self.deadline
            else None,
            "priority": {
                "value": self.priority.value,
                "text": self.priority.evidence.text,
                "span": [self.priority.evidence.start, self.priority.evidence.end],
            }
            if self.priority
            else None,
            "estimate_minutes": {
                "value": self.estimate.minutes,
                "text": self.estimate.evidence.text,
                "span": [self.estimate.evidence.start, self.estimate.evidence.end],
            }
            if self.estimate
            else None,
            "project_mentions": self.project_mentions,
            "tags": self.tags,
            "subtasks": self.subtasks,
        }


PRIORITY_PATTERNS = [
    (1, re.compile(r"\b(urgent|asap|critical|p1|highest priority|emergency)\b", re.IGNORECASE)),
    (2, re.compile(r"\b(high priority|important|p2)\b", re.IGNORECASE)),
    (3, re.compile(r"\b(medium priority|normal priority|p3)\b", re.IGNORECASE)),
    (4, re.compile(r"\b(low priority|someday|trivial|p4)\b", re.IGNORECASE)),
]

DURATION_PATTERNS = [
    # "half an hour"
    (re.compile(r"\b(half\s+an\s+hour)\b", re.IGNORECASE), lambda _: 30),
    # "1.5 hours" / "2.5h"
    (
        re.compile(r"\b(\d+(?:\.\d+)?)\s*(?:hours|hrs|hr|h)\b", re.IGNORECASE),
        lambda m: int(float(m.group(1)) * 60),
    ),
    # "45 mins" / "30 min" / "30m"
    (re.compile(r"\b(\d+)\s*(?:minutes|mins|min|m)\b", re.IGNORECASE), lambda m: int(m.group(1))),
]

DEADLINE_PREFIX_PATTERN = re.compile(
    r"\b(?:by|before|due|until|on|at|deadline:?)\s+", re.IGNORECASE
)


class RulesParser:
    """Deterministic, offline rules-based extractor with Indian DMY date preference."""

    def __init__(self, default_tz: str = "Asia/Kolkata") -> None:
        self.default_tz = default_tz

    def parse(
        self,
        text: str,
        base_time: datetime | None = None,
        tz_name: str | None = None,
    ) -> ParsedRulesResult:
        user_tz_str = tz_name or self.default_tz
        try:
            tz = zoneinfo.ZoneInfo(user_tz_str)
        except Exception:
            tz = zoneinfo.ZoneInfo("Asia/Kolkata")

        ref_time = base_time or datetime.now(tz)
        if ref_time.tzinfo is None:
            ref_time = ref_time.replace(tzinfo=tz)

        removed_spans: list[tuple[int, int]] = []

        # 1. Tags extraction (#tag)
        tags: list[str] = []
        for m in re.finditer(r"#([a-zA-Z0-9_\-]+)", text):
            tags.append(m.group(1).lower())
            removed_spans.append((m.start(), m.end()))

        # 2. Project mentions (@project)
        projects: list[str] = []
        for m in re.finditer(r"@([a-zA-Z0-9_\-]+)", text):
            projects.append(m.group(1))
            removed_spans.append((m.start(), m.end()))

        # 3. Priority extraction
        parsed_priority: ParsedPriority | None = None
        for p_val, regex in PRIORITY_PATTERNS:
            match = regex.search(text)
            if match:
                parsed_priority = ParsedPriority(
                    value=p_val,
                    evidence=EvidenceSpan(
                        text=match.group(0),
                        start=match.start(),
                        end=match.end(),
                    ),
                )
                removed_spans.append((match.start(), match.end()))
                break

        # 4. Duration/Estimate extraction
        parsed_estimate: ParsedEstimate | None = None
        for regex, calc in DURATION_PATTERNS:
            match = regex.search(text)
            if match:
                minutes = int(calc(match))  # type: ignore[no-untyped-call]
                if 0 < minutes <= 10080:  # Max 7 days in minutes
                    parsed_estimate = ParsedEstimate(
                        minutes=minutes,
                        evidence=EvidenceSpan(
                            text=match.group(0),
                            start=match.start(),
                            end=match.end(),
                        ),
                    )
                    removed_spans.append((match.start(), match.end()))
                    break

        # 5. Deadline extraction
        parsed_deadline = self._extract_deadline(text, ref_time, user_tz_str, removed_spans)

        # 6. Clean title
        cleaned = self._clean_title(text, removed_spans)

        # 7. Subtasks heuristic (e.g. bulleted lines or "1. ..., 2. ...")
        subtasks = self._extract_subtasks(text)

        return ParsedRulesResult(
            raw_input=text,
            cleaned_title=cleaned,
            deadline=parsed_deadline,
            priority=parsed_priority,
            estimate=parsed_estimate,
            project_mentions=projects,
            tags=tags,
            subtasks=subtasks,
        )

    def _extract_deadline(
        self,
        text: str,
        ref_time: datetime,
        tz_name: str,
        removed_spans: list[tuple[int, int]],
    ) -> ParsedDeadline | None:
        """Find candidate deadline phrases and resolve them deterministically."""
        # Candidate temporal phrases
        patterns = [
            # "by tomorrow 5pm", "due next monday", "by friday", "on thursday", "due friday 4pm"
            r"\b(?:by|before|due|until|on|at|deadline:?)\s+(?:eod|end of day|tonight|tomorrow(?:\s+(?:morning|afternoon|evening|night|\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?|next\s+[a-z]+|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening|night|\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)\b",
            # standalone relative/absolute: "tomorrow 5pm", "eod", "tonight", "next monday", "friday 4pm"
            r"\b(?:eod|end of day|tonight|tomorrow(?:\s+(?:morning|afternoon|evening|night|\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:morning|afternoon|evening|night|\d{1,2}(?::\d{2})?\s*(?:am|pm)?))\b",
            # explicit date: "15th nov", "25 dec 5pm", "15/11/2026"
            r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\b",
            # Hinglish temporal phrases
            r"\b(?:kal\s+(?:shaam|subah|raat|dopahar)(?:\s+tak)?|agle\s+hafte|aaj\s+raat)\b",
        ]

        for pat in patterns:
            for match in re.finditer(pat, text, re.IGNORECASE):
                phrase = match.group(0).strip()
                kind = (
                    "hard"
                    if re.match(r"^(?:by|before|due|until|deadline)", phrase, re.IGNORECASE)
                    else "soft"
                )
                dt = self._resolve_datetime(phrase, ref_time, tz_name)
                if dt:
                    span = (match.start(), match.end())
                    removed_spans.append(span)
                    return ParsedDeadline(
                        datetime_iso=dt.isoformat(),
                        dt=dt,
                        evidence=EvidenceSpan(text=phrase, start=match.start(), end=match.end()),
                        kind=kind,
                    )
        return None

    def _resolve_weekday(self, day_name: str, ref_time: datetime) -> datetime | None:
        """Find next occurrence of named weekday."""
        weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        day_lower = day_name.lower().strip()
        if day_lower not in weekdays:
            return None
        target_idx = weekdays.index(day_lower)
        days_ahead = (target_idx - ref_time.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        return ref_time + timedelta(days=days_ahead)

    def _resolve_datetime(self, phrase: str, ref_time: datetime, tz_name: str) -> datetime | None:
        """Parse phrase with dateparser or custom overrides."""
        lower = phrase.lower().strip()
        clean_phrase = DEADLINE_PREFIX_PATTERN.sub("", lower).strip()

        # Custom overrides for Indian / standard workplace vernacular
        # Hinglish mappings
        if "kal shaam" in clean_phrase or "friday shaam" in clean_phrase:
            base = (
                ref_time + timedelta(days=1)
                if "kal" in clean_phrase
                else self._resolve_weekday("friday", ref_time)
            )
            return (base or ref_time + timedelta(days=1)).replace(
                hour=18, minute=0, second=0, microsecond=0
            )

        if "kal subah" in clean_phrase:
            return (ref_time + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)

        if "kal raat" in clean_phrase or "aaj raat" in clean_phrase:
            day_offset = 1 if "kal" in clean_phrase else 0
            return (ref_time + timedelta(days=day_offset)).replace(
                hour=21, minute=0, second=0, microsecond=0
            )

        if "agle hafte" in clean_phrase:
            days_ahead = (7 - ref_time.weekday()) % 7 or 7
            return (ref_time + timedelta(days=days_ahead)).replace(
                hour=9, minute=0, second=0, microsecond=0
            )

        if clean_phrase in ("eod", "end of day"):
            # 18:00 today (or tomorrow if already past 18:00)
            target = ref_time.replace(hour=18, minute=0, second=0, microsecond=0)
            if target <= ref_time:
                target += timedelta(days=1)
            return target

        if clean_phrase == "tonight":
            target = ref_time.replace(hour=21, minute=0, second=0, microsecond=0)
            if target <= ref_time:
                target += timedelta(days=1)
            return target

        if clean_phrase == "tomorrow":
            return (ref_time + timedelta(days=1)).replace(
                hour=18, minute=0, second=0, microsecond=0
            )

        if clean_phrase == "tomorrow morning":
            return (ref_time + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)

        if clean_phrase == "tomorrow afternoon":
            return (ref_time + timedelta(days=1)).replace(
                hour=14, minute=0, second=0, microsecond=0
            )

        if clean_phrase in ("tomorrow evening", "tomorrow eod"):
            return (ref_time + timedelta(days=1)).replace(
                hour=18, minute=0, second=0, microsecond=0
            )

        if clean_phrase == "tomorrow night":
            return (ref_time + timedelta(days=1)).replace(
                hour=21, minute=0, second=0, microsecond=0
            )

        if clean_phrase == "next week":
            # Monday of next week at 09:00
            days_ahead = (7 - ref_time.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            target = (ref_time + timedelta(days=days_ahead)).replace(
                hour=9, minute=0, second=0, microsecond=0
            )
            return target

        # Weekday phrases: "friday", "next monday", "friday morning", "friday 4pm"
        for w_name in [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ]:
            if w_name in clean_phrase:
                weekday_target = self._resolve_weekday(w_name, ref_time)
                if weekday_target is not None:
                    if "morning" in clean_phrase:
                        return weekday_target.replace(hour=9, minute=0, second=0, microsecond=0)
                    if "afternoon" in clean_phrase:
                        return weekday_target.replace(hour=14, minute=0, second=0, microsecond=0)
                    if "evening" in clean_phrase or "eod" in clean_phrase:
                        return weekday_target.replace(hour=18, minute=0, second=0, microsecond=0)
                    if "night" in clean_phrase:
                        return weekday_target.replace(hour=21, minute=0, second=0, microsecond=0)
                    time_match = re.search(
                        r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", clean_phrase, re.IGNORECASE
                    )
                    if time_match:
                        hr = int(time_match.group(1))
                        mn = int(time_match.group(2) or 0)
                        ampm = (time_match.group(3) or "").lower()
                        if ampm == "pm" and hr < 12:
                            hr += 12
                        elif ampm == "am" and hr == 12:
                            hr = 0
                        return weekday_target.replace(hour=hr, minute=mn, second=0, microsecond=0)
                    return weekday_target.replace(hour=18, minute=0, second=0, microsecond=0)

        # Use dateparser
        settings = {
            "DATE_ORDER": "DMY",
            "PREFER_DATES_FROM": "future",
            "RELATIVE_BASE": ref_time.replace(tzinfo=None),
            "TIMEZONE": tz_name,
            "RETURN_AS_TIMEZONE_AWARE": True,
            "DEFAULT_LANGUAGES": ["en"],
        }
        parsed: Any = dateparser.parse(clean_phrase, settings=settings)
        if parsed and isinstance(parsed, datetime):
            # If no time was specified in phrase, default to 18:00 (EOD)
            has_explicit_time = bool(
                re.search(
                    r"\b(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm)|morning|evening|night)\b",
                    clean_phrase,
                    re.IGNORECASE,
                )
            )
            if not has_explicit_time and parsed.time() == time(0, 0):
                parsed = parsed.replace(hour=18, minute=0, second=0, microsecond=0)
            return cast(datetime, parsed)

        return None

    def _clean_title(self, raw: str, removed_spans: list[tuple[int, int]]) -> str:
        """Strip matched spans and clean punctuation and extra whitespace."""
        if not removed_spans:
            return raw.strip()

        # Sort spans in reverse order to slice safely
        sorted_spans = sorted(removed_spans, key=lambda s: s[0], reverse=True)
        chars = list(raw)
        for start, end in sorted_spans:
            chars[start:end] = [" "] * (end - start)

        cleaned = "".join(chars)
        # Collapse multiple spaces and trim leftover trailing connectors like 'by', 'due', 'for', 'before', '-'
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        cleaned = re.sub(r"^(?:by|due|for|before|-|:)\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*(?:by|due|for|before|-|:)$", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.strip()

        # Fallback to raw if stripped too much
        return cleaned if len(cleaned) >= 2 else raw.strip()

    def _extract_subtasks(self, text: str) -> list[str]:
        """Detect bullet points or list items."""
        subtasks: list[str] = []
        for line in text.splitlines():
            line_s = line.strip()
            # Match '- item', '* item', '1. item'
            match = re.match(r"^(?:[-*]|\d+\.)\s+(.+)$", line_s)
            if match:
                subtasks.append(match.group(1).strip())
        return subtasks
