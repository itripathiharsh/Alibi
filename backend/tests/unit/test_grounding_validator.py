"""Unit tests for Grounding Validator and Deterministic Fallback (doc 08 §3, AC-RAG-2/3)."""

from app.assistant.validator import (
    GroundingValidator,
    generate_deterministic_answer,
)


def test_validator_accepts_valid_citations_and_numbers() -> None:
    validator = GroundingValidator(
        valid_source_aliases={"S1", "S2"},
        allowed_numbers={5.0, 120.0, 2.0},
    )
    answer = "You completed 5 tasks [S1] totaling 120 minutes across 2 projects [S2]."
    res = validator.validate(answer)
    assert res.is_valid is True
    assert res.extracted_citations == ["S1", "S2"]


def test_validator_rejects_hallucinated_citation() -> None:
    validator = GroundingValidator(
        valid_source_aliases={"S1"},
        allowed_numbers={5.0},
    )
    answer = "You completed 5 tasks [S99]."
    res = validator.validate(answer)
    assert res.is_valid is False
    assert "Citation [S99] does not exist" in (res.reason or "")


def test_validator_rejects_fabricated_number() -> None:
    # AC-RAG-3: Number validator rejects an injected fabricated number
    validator = GroundingValidator(
        valid_source_aliases={"S1"},
        allowed_numbers={3.0},  # only 3 is permitted
    )
    answer = "You completed 42 tasks [S1]."  # 42 is fabricated
    res = validator.validate(answer)
    assert res.is_valid is False
    assert "42.0" in str(res.unsupported_numbers)


def test_deterministic_answer_empty_context_refusal() -> None:
    # AC-RAG-2: Unanswerable questions produce explicit refusal
    answer, sources = generate_deterministic_answer(
        tool_results=[],
        vault_sources=[],
        query="What did I do in 2021?",
    )
    assert "I don't have records about that for the requested period." in answer
    assert sources == []
