"""Tests for PLE Guardrails and Banned Vocabulary Filter (doc 07 §10, AC-PLE-8)."""

import pytest

from app.learning.guardrails import assert_clean_insight, contains_banned_vocabulary


def test_banned_vocabulary_detected() -> None:
    assert contains_banned_vocabulary("You are being lazy on Mondays") is True
    assert contains_banned_vocabulary("You tend to procrastinate on academic tasks") is True
    assert contains_banned_vocabulary("User shows signs of burnout and adhd") is True
    assert contains_banned_vocabulary("High stress levels observed") is True


def test_clean_behavioral_insights_pass() -> None:
    assert (
        contains_banned_vocabulary("You completed 14 tasks this week with 92% on-time rate.")
        is False
    )
    assert (
        contains_banned_vocabulary(
            "You typically work on professional tasks between 10:00 and 13:00."
        )
        is False
    )
    assert (
        contains_banned_vocabulary(
            "Average session duration is 48 minutes based on 26 completed sessions."
        )
        is False
    )


def test_assert_clean_insight_raises_on_banned() -> None:
    with pytest.raises(ValueError, match="Banned vocabulary 'lazy' detected"):
        assert_clean_insight("Do not be lazy with your deadlines.")
