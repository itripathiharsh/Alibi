"""Tests for Grounding Validator enforcing 0% fabrications (doc 06 §7, AC-AI-5)."""

from app.ai.grounding_validator import GroundingValidator
from app.services.rules_parser import RulesParser


def test_grounding_validator_blocks_hallucinated_deadline() -> None:
    validator = GroundingValidator(timezone="Asia/Kolkata")
    parser = RulesParser(default_tz="Asia/Kolkata")

    raw_input = "Submit chemistry lab notes"
    rules_res = parser.parse(raw_input)

    # LLM hallucinated a deadline not in the input text
    llm_output = {
        "title": "Submit chemistry lab notes",
        "deadline": {"text": "next Friday at 5pm", "iso": "2026-11-20T17:00:00Z"},
        "project_name": None,
    }

    validated = validator.validate(raw_input, rules_res, llm_output, existing_projects=[])
    # Deadline must be rejected and null
    assert validated["deadline"] is None


def test_grounding_validator_blocks_hallucinated_project() -> None:
    validator = GroundingValidator(timezone="Asia/Kolkata")
    parser = RulesParser(default_tz="Asia/Kolkata")

    raw_input = "Finish wireframes for client"
    rules_res = parser.parse(raw_input)

    # LLM guessed a project name that does not exist or was not mentioned
    llm_output = {
        "title": "Finish wireframes for client",
        "project_name": "Project Apollo",
    }

    validated = validator.validate(
        raw_input, rules_res, llm_output, existing_projects=["Website Redesign"]
    )
    assert validated["project_name"]["value"] is None


def test_grounding_validator_accepts_grounded_deadline_and_project() -> None:
    validator = GroundingValidator(timezone="Asia/Kolkata")
    parser = RulesParser(default_tz="Asia/Kolkata")

    raw_input = "Finish sprint report for Website Redesign by tomorrow 5pm"
    rules_res = parser.parse(raw_input)

    llm_output = {
        "title": "Finish sprint report",
        "deadline": {
            "text": "by tomorrow 5pm",
            "iso": rules_res.deadline.datetime_iso if rules_res.deadline else None,
        },
        "project_name": "Website Redesign",
    }

    validated = validator.validate(
        raw_input, rules_res, llm_output, existing_projects=["Website Redesign"]
    )
    assert validated["deadline"] is not None
    assert validated["project_name"]["value"] == "Website Redesign"


def test_grounding_validator_rejects_hallucinated_title() -> None:
    validator = GroundingValidator(timezone="Asia/Kolkata")
    parser = RulesParser(default_tz="Asia/Kolkata")

    raw_input = "Review financial budget spreadsheet"
    rules_res = parser.parse(raw_input)

    # Hallucinated title has 0 token overlap
    llm_output = {
        "title": "Clean kitchen pantry and organize groceries",
    }

    validated = validator.validate(raw_input, rules_res, llm_output)
    # Must revert to rules cleaned title
    assert validated["title"]["value"] == rules_res.cleaned_title
    assert validated["title"]["source"] == "rules"
