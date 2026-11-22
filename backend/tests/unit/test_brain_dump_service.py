"""Brain dump splitting and grounding (FR-TASK-022, ADR-028).

Uses the recorded-response fake provider; no external AI is called (AGENTS.md §6).
"""

import json
import uuid
import zoneinfo
from datetime import datetime

import pytest

from app.ai.adapters.fake import FakeProviderAdapter
from app.ai.gateway import AIGateway
from app.core.config import settings
from app.models.user import User
from app.services.brain_dump import BrainDumpService, split_without_ai

IST = zoneinfo.ZoneInfo("Asia/Kolkata")
MONDAY_10AM = datetime(2026, 11, 23, 10, 0, tzinfo=IST)

DUMP = (
    "mandir jana hai shaam ko, sabji lene jana hai, assignment kal tak dena hai, "
    "dost ka kaam karke dena hai, boss ne bola account create karna hai, "
    "application week ke end tak submit karni hai"
)


def _user() -> User:
    return User(
        id=uuid.uuid4(),
        email="dump@example.com",
        password_hash="x",
        timezone="Asia/Kolkata",
        settings={"cloud_ai_opt_in": True},
    )


def _gateway_with(response: dict[str, object]) -> AIGateway:
    gateway = AIGateway(db=None)
    canned = {"BRAIN_DUMP": json.dumps(response)}
    gateway.register_adapter("gemini", FakeProviderAdapter(name="gemini", canned_responses=canned))
    return gateway


@pytest.fixture
def no_ai(monkeypatch: pytest.MonkeyPatch) -> None:
    """No provider can run: external AI off and hosted mode (no local Ollama)."""
    monkeypatch.setattr(settings, "ai_external_enabled", False)
    monkeypatch.setattr(settings, "alibi_mode", "hosted")


@pytest.mark.asyncio
async def test_ai_items_are_grounded_and_bucketed() -> None:
    llm = {
        "items": [
            {"text": "mandir jana hai shaam ko", "title": "Mandir jana", "when": "shaam ko"},
            {"text": "sabji lene jana hai", "title": "Sabji lena", "when": None},
            {
                "text": "assignment kal tak dena hai",
                "title": "Assignment dena",
                "when": "kal tak",
                "category": "academic",
            },
            # Fabricated time: "friday 5pm" is not in the input, so it must be dropped.
            {"text": "dost ka kaam karke dena hai", "title": "Dost ka kaam", "when": "friday 5pm"},
            {
                "text": "application week ke end tak submit karni hai",
                "title": "Application submit karni",
                "when": "week ke end tak",
                "category": "professional",
            },
            # Hallucinated item: nothing like it in the dump.
            {
                "text": "Buy flight tickets to Goa",
                "title": "Buy flight tickets",
                "when": "tomorrow",
            },
        ]
    }
    service = BrainDumpService(None, _user(), gateway=_gateway_with(llm))
    result = await service.split(DUMP, now=MONDAY_10AM)

    assert result.mode == "ai"
    assert result.ai_status == "used"
    by_title = {item.title: item for item in result.items}
    assert "Buy flight tickets" not in by_title
    assert len(result.items) == 5

    mandir = by_title["Mandir jana"]
    assert mandir.deadline_at == datetime(2026, 11, 23, 18, 0, tzinfo=IST)
    assert mandir.bucket == "today"

    sabji = by_title["Sabji lena"]
    assert sabji.deadline_at is None
    assert sabji.time_source == "suggested"
    # Monday 10:00 -> first free slot is 10:15, in working hours, today.
    assert sabji.suggested_at == datetime(2026, 11, 23, 10, 15, tzinfo=IST)
    assert sabji.bucket == "today"

    assignment = by_title["Assignment dena"]
    assert assignment.deadline_at == datetime(2026, 11, 24, 18, 0, tzinfo=IST)
    assert assignment.deadline_kind == "hard"
    assert assignment.bucket == "this_week"
    assert assignment.category == "academic"

    assert by_title["Dost ka kaam"].deadline_at is None  # fabricated time rejected

    application = by_title["Application submit karni"]
    assert application.deadline_at == datetime(2026, 11, 29, 18, 0, tzinfo=IST)
    assert application.bucket == "this_week"


@pytest.mark.asyncio
async def test_ungrounded_title_falls_back_to_users_words() -> None:
    llm = {"items": [{"text": "sabji lene jana hai", "title": "Purchase weekly groceries"}]}
    service = BrainDumpService(None, _user(), gateway=_gateway_with(llm))
    result = await service.split("sabji lene jana hai", now=MONDAY_10AM)
    assert [i.title for i in result.items] == ["Sabji lene jana hai"]


@pytest.mark.asyncio
@pytest.mark.usefixtures("no_ai")
async def test_without_ai_the_rules_splitter_still_works() -> None:
    service = BrainDumpService(None, _user(), gateway=AIGateway(db=None))
    result = await service.split(DUMP, now=MONDAY_10AM)

    assert result.mode == "rules"
    assert result.ai_status == "server_disabled"
    titles = [i.title for i in result.items]
    assert len(titles) == 6
    assert titles[0] == "Mandir jana hai"
    assert result.items[0].deadline_at == datetime(2026, 11, 23, 18, 0, tzinfo=IST)
    assert result.items[2].bucket == "this_week"


@pytest.mark.asyncio
async def test_not_opted_in_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_external_enabled", True)
    monkeypatch.setattr(settings, "alibi_mode", "hosted")
    user = _user()
    user.settings = {}
    service = BrainDumpService(None, user, gateway=AIGateway(db=None))
    result = await service.split("sabzi lena", now=MONDAY_10AM)
    assert result.mode == "rules"
    assert result.ai_status == "not_opted_in"


def test_rules_splitter_keeps_and_inside_one_task() -> None:
    parts = split_without_ai(
        "Rahul and Priya ko call karna\nbijli ka bill bharna aur gas book karna"
    )
    assert parts == ["Rahul and Priya ko call karna", "bijli ka bill bharna", "gas book karna"]


@pytest.mark.asyncio
@pytest.mark.usefixtures("no_ai")
async def test_voice_run_on_dump_splits_into_clean_tasks() -> None:
    """The owner's real voice dump (2026-11-22): no punctuation, filler, Hinglish."""
    spoken = (
        "I have to check the otherwise pattern configuration and Uske bad APK install karna hai "
        "usko test karna hai 5 minut ke liye notification test karna hai "
        "I have to check the progress review today"
    )
    result = await BrainDumpService(None, _user(), gateway=AIGateway(db=None)).split(
        spoken, now=MONDAY_10AM
    )
    titles = [i.title for i in result.items]
    assert titles[0] == "Check the otherwise pattern configuration"
    # Without AI the middle run-on stays one line; the AI prompt splits it further.
    assert titles[1].startswith("APK install karna hai")
    assert titles[-1] == "Check the progress review today"
    assert result.items[1].estimate_minutes == 5
    assert all(i.title[0].isupper() for i in result.items)


@pytest.mark.asyncio
async def test_planner_suggests_ordered_non_overlapping_slots() -> None:
    llm = {
        "items": [
            {"text": "mandir jana hai shaam ko", "title": "Mandir jana", "when": "shaam ko"},
            {"text": "sabji lene jana hai", "title": "Sabji lena"},
            {"text": "assignment 1 ghanta", "title": "Assignment", "minutes": 60},
            {"text": "dost ka kaam", "title": "Dost ka kaam"},
        ]
    }
    text = "mandir jana hai shaam ko, sabji lene jana hai, assignment 1 ghanta, dost ka kaam"
    late = datetime(2026, 11, 23, 17, 0, tzinfo=IST)  # 17:00: shaam ko = 18:00 is taken
    result = await BrainDumpService(None, _user(), gateway=_gateway_with(llm)).split(text, now=late)
    by = {i.title: i for i in result.items}
    assert by["Mandir jana"].deadline_at == datetime(2026, 11, 23, 18, 0, tzinfo=IST)
    assert by["Sabji lena"].suggested_at == datetime(2026, 11, 23, 17, 15, tzinfo=IST)
    # 60 min would clash with mandir at 18:00, so it goes after it.
    assert by["Assignment"].estimate_minutes == 60
    assert by["Assignment"].suggested_at == datetime(2026, 11, 23, 18, 30, tzinfo=IST)
    assert by["Dost ka kaam"].suggested_at == datetime(2026, 11, 23, 19, 45, tzinfo=IST)


@pytest.mark.asyncio
async def test_planner_moves_to_next_morning_after_working_hours() -> None:
    llm = {"items": [{"text": "sabji lene jana hai", "title": "Sabji lena"}]}
    night = datetime(2026, 11, 23, 22, 0, tzinfo=IST)
    result = await BrainDumpService(None, _user(), gateway=_gateway_with(llm)).split(
        "sabji lene jana hai", now=night
    )
    item = result.items[0]
    assert item.suggested_at == datetime(2026, 11, 24, 9, 0, tzinfo=IST)
    assert item.bucket == "this_week"


def test_hinglish_durations_are_read() -> None:
    from app.services.rules_parser import RulesParser

    parser = RulesParser()
    assert parser.parse("usko test karna hai 5 minut ke liye").estimate.minutes == 5  # type: ignore[union-attr]
    assert parser.parse("padhai 2 ghante").estimate.minutes == 120  # type: ignore[union-attr]
