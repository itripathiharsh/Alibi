"""The assistant's "break down" answer invents no steps or minutes (logic audit B4)."""

import re
from typing import Any

import pytest

from app.assistant.validator import generate_deterministic_answer

MINUTES = re.compile(r"\d+\s*(?:[-–]\s*\d+\s*)?min", re.IGNORECASE)


def _pending(*titles: str) -> list[dict[str, Any]]:
    return [{"tool_name": "pending_overdue", "data": [{"title": t} for t in titles]}]


@pytest.mark.req("FR-RAG-001")
def test_breakdown_names_the_task_the_user_asked_about() -> None:
    answer, sources = generate_deterministic_answer(
        tool_results=_pending("Pay rent", "Launch new campaign"),
        vault_sources=[],
        query="Break down: launch new campaign",
        intents=["BREAKDOWN", "PENDING_OVERDUE"],
    )
    assert "Launch new campaign" in answer
    assert "Pay rent" not in answer  # used to pick the first pending task
    assert not MINUTES.search(answer)
    assert sources == []


@pytest.mark.req("FR-RAG-001")
def test_breakdown_without_a_task_name_asks_which_task() -> None:
    answer, _ = generate_deterministic_answer(
        tool_results=_pending("Pay rent"),
        vault_sources=[],
        query="break down my tasks",
        intents=["BREAKDOWN", "PENDING_OVERDUE"],
    )
    assert "Pay rent" not in answer
    assert "Break down:" in answer
    assert not MINUTES.search(answer)
