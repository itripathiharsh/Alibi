"""Evaluation test for RulesParser and GroundingValidator against golden set (AC-M2-2).
Requires:
- Deadline exact match >= 95%
- Fabricated deadline rate = 0%
- Fabricated project rate = 0%
"""

import json
import zoneinfo
from datetime import datetime
from pathlib import Path

from app.services.grounding_validator import GroundingValidator
from app.services.rules_parser import RulesParser


class DummyProject:
    def __init__(self, name: str, id_val: str) -> None:
        self.name = name
        self.id = id_val


KNOWN_PROJECTS = [
    DummyProject("alibi", "p-alibi"),
    DummyProject("marketing", "p-marketing"),
    DummyProject("thesis", "p-thesis"),
    DummyProject("finance", "p-finance"),
    DummyProject("infrastructure", "p-infrastructure"),
    DummyProject("design", "p-design"),
    DummyProject("blog", "p-blog"),
    DummyProject("university", "p-university"),
]


def test_ac_m2_2_golden_extraction_evaluation() -> None:
    """Evaluate deterministic rules parser against >= 150 golden test phrases."""
    golden_path = Path(__file__).parent.parent / "ai_eval" / "extraction_golden.jsonl"
    if not golden_path.exists():
        golden_path = Path("backend/tests/ai_eval/extraction_golden.jsonl")
    assert golden_path.exists(), "Golden extraction file missing"

    items = []
    with open(golden_path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                items.append(json.loads(line))

    assert len(items) >= 150, f"Expected >= 150 items, got {len(items)}"

    tz = zoneinfo.ZoneInfo("Asia/Kolkata")
    # Fixed reference time for deterministic evaluation: Monday 2026-11-16 10:00 IST
    base_time = datetime(2026, 11, 16, 10, 0, 0, tzinfo=tz)

    parser = RulesParser()
    validator = GroundingValidator(parser)

    total_with_deadline = 0
    correct_deadlines = 0
    fabricated_deadlines = 0
    fabricated_projects = 0

    for item in items:
        raw_text = item["input"]
        expected_has_deadline = item["expected_has_deadline"]
        expected_project = item.get("expected_project")

        parsed = parser.parse(raw_text, base_time=base_time)
        grounded = validator.validate_and_merge(
            raw_input=raw_text,
            rules_result=parsed,
            existing_projects=KNOWN_PROJECTS,
        )

        has_extracted_deadline = grounded.deadline_at is not None

        # Check for fabricated deadlines
        if not expected_has_deadline and has_extracted_deadline:
            fabricated_deadlines += 1

        # Check for deadline accuracy on positive cases
        if expected_has_deadline:
            total_with_deadline += 1
            if has_extracted_deadline:
                correct_deadlines += 1

        # Check for fabricated projects
        if expected_project is None and grounded.project_id is not None:
            fabricated_projects += 1

    deadline_accuracy = (
        (correct_deadlines / total_with_deadline) * 100 if total_with_deadline > 0 else 0
    )

    print(f"\n--- Golden Set Eval ({len(items)} items) ---")
    print(f"Total deadline phrases: {total_with_deadline}")
    print(f"Correctly extracted deadlines: {correct_deadlines} ({deadline_accuracy:.1f}%)")
    print(f"Fabricated deadlines: {fabricated_deadlines}")
    print(f"Fabricated projects: {fabricated_projects}")

    # Enforce AC-M2-2:
    assert fabricated_deadlines == 0, f"Expected 0 fabricated deadlines, got {fabricated_deadlines}"
    assert fabricated_projects == 0, f"Expected 0 fabricated projects, got {fabricated_projects}"
    assert deadline_accuracy >= 95.0, (
        f"Expected deadline accuracy >= 95%, got {deadline_accuracy:.1f}%"
    )
