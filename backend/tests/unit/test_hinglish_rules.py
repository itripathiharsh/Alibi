"""Hinglish deadline phrases in the rules parser (FR-TASK-003, FR-TASK-022)."""

import zoneinfo
from datetime import datetime

import pytest

from app.services.rules_parser import RulesParser

IST = zoneinfo.ZoneInfo("Asia/Kolkata")
MONDAY_10AM = datetime(2026, 11, 23, 10, 0, tzinfo=IST)  # a Monday
parser = RulesParser()


@pytest.mark.parametrize(
    ("text", "expected", "kind"),
    [
        ("mandir jana hai shaam ko", datetime(2026, 11, 23, 18, 0, tzinfo=IST), "soft"),
        ("assignment kal tak dena hai", datetime(2026, 11, 24, 18, 0, tzinfo=IST), "hard"),
        ("Send report kal shaam tak", datetime(2026, 11, 24, 18, 0, tzinfo=IST), "hard"),
        ("Call electricity department kal subah", datetime(2026, 11, 24, 9, 0, tzinfo=IST), "soft"),
        ("doctor ke paas parso subah", datetime(2026, 11, 25, 9, 0, tzinfo=IST), "soft"),
        ("application week ke end tak submit", datetime(2026, 11, 29, 18, 0, tzinfo=IST), "hard"),
        ("bills weekend se pehle", datetime(2026, 11, 27, 18, 0, tzinfo=IST), "hard"),
        ("mummy ko call 5 baje", datetime(2026, 11, 23, 17, 0, tzinfo=IST), "soft"),
        ("kal shaam 7 baje meeting", datetime(2026, 11, 24, 19, 0, tzinfo=IST), "soft"),
        ("dost ka kaam raat ko", datetime(2026, 11, 23, 21, 0, tzinfo=IST), "soft"),
    ],
)
def test_hinglish_deadlines_resolve(text: str, expected: datetime, kind: str) -> None:
    result = parser.parse(text, base_time=MONDAY_10AM)
    assert result.deadline is not None, text
    assert result.deadline.dt == expected
    assert result.deadline.kind == kind


def test_bare_part_of_day_already_past_moves_to_next_day() -> None:
    afternoon = datetime(2026, 11, 23, 15, 0, tzinfo=IST)
    result = parser.parse("subah ko gym", base_time=afternoon)
    assert result.deadline is not None
    assert result.deadline.dt == datetime(2026, 11, 24, 9, 0, tzinfo=IST)


def test_aaj_stays_today_after_evening() -> None:
    late = datetime(2026, 11, 23, 19, 30, tzinfo=IST)
    result = parser.parse("aaj report bhejna", base_time=late)
    assert result.deadline is not None
    assert result.deadline.dt == datetime(2026, 11, 23, 23, 59, tzinfo=IST)


def test_deadline_words_removed_from_title() -> None:
    result = parser.parse("sabzi lene jana hai shaam ko", base_time=MONDAY_10AM)
    assert result.cleaned_title == "sabzi lene jana hai"


def test_no_time_words_means_no_deadline() -> None:
    result = parser.parse("dost ka kaam karke dena hai", base_time=MONDAY_10AM)
    assert result.deadline is None


def test_english_phrases_unchanged() -> None:
    result = parser.parse("Submit project report by tomorrow 5pm", base_time=MONDAY_10AM)
    assert result.deadline is not None
    assert result.deadline.dt.astimezone(IST) == datetime(2026, 11, 24, 17, 0, tzinfo=IST)
