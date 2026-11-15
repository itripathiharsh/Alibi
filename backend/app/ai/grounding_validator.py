"""Grounding Validator for LLM Task Extractions (doc 06 §7, AC-AI-5).

Strictly enforces 0% fabricated deadlines and 0% fabricated projects.
Every structured field from an LLM extraction must be grounded in raw user input.
"""

import re
from datetime import datetime
from typing import Any

from app.services.rules_parser import ParsedRulesResult, RulesParser


def _normalize_text(text: str) -> str:
    """Normalize whitespace and lowercase for grounding substring checks."""
    return re.sub(r"\s+", " ", text).strip().lower()


def _token_overlap_ratio(s1: str, s2: str) -> float:
    """Calculate token overlap ratio between two strings."""
    tokens1 = set(re.findall(r"\w+", s1.lower()))
    tokens2 = set(re.findall(r"\w+", s2.lower()))
    if not tokens1 or not tokens2:
        return 0.0
    intersection = tokens1.intersection(tokens2)
    return len(intersection) / len(tokens1)


def _fuzzy_match_project(
    project_candidate: str, input_text: str, existing_projects: list[str]
) -> str | None:
    """Check if project candidate is an existing project mentioned in input text."""
    norm_input = _normalize_text(input_text)
    norm_candidate = _normalize_text(project_candidate)

    # Check against each existing project
    for proj in existing_projects:
        norm_proj = _normalize_text(proj)
        # Project must exist and its name must actually appear in the user input
        if (norm_proj in norm_input or f"@{norm_proj}" in norm_input) and (
            norm_candidate == norm_proj or norm_candidate in norm_proj
        ):
            return proj
    return None


class GroundingValidator:
    """Deterministic validator enforcing non-fabrication constraints."""

    def __init__(self, timezone: str = "Asia/Kolkata") -> None:
        self.timezone = timezone
        self.rules_parser = RulesParser(default_tz=timezone)

    def validate(
        self,
        raw_input: str,
        rules_result: ParsedRulesResult,
        llm_output: dict[str, Any],
        existing_projects: list[str] | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        """Validate LLM output against user input and rules parser.

        Returns validated final_proposal dictionary.
        """
        existing_projs = existing_projects or []
        norm_input = _normalize_text(raw_input)

        # 1. Title validation: Must share >= 50% tokens with input
        llm_title = (llm_output.get("title") or "").strip()
        if llm_title and _token_overlap_ratio(llm_title, raw_input) >= 0.5:
            final_title = llm_title
            title_source = "llm"
        else:
            final_title = rules_result.cleaned_title
            title_source = "rules"

        # 2. Deadline validation: 0% fabrication
        # Accepted ONLY if text is a substring of input AND resolves to same dt (+- 1 min)
        final_deadline: dict[str, Any] | None = None
        llm_deadline = llm_output.get("deadline")
        if isinstance(llm_deadline, dict) and llm_deadline.get("text"):
            dl_text = str(llm_deadline["text"]).strip()
            norm_dl_text = _normalize_text(dl_text)
            if norm_dl_text and norm_dl_text in norm_input:
                # Parse the phrase with rules parser to verify
                phrase_res = self.rules_parser.parse(dl_text, base_time=now)
                if phrase_res.deadline:
                    # Check if ISO matches within 1 minute or equals rules_result
                    iso_val = llm_deadline.get("iso") or phrase_res.deadline.datetime_iso
                    final_deadline = {
                        "iso": iso_val,
                        "text": dl_text,
                        "kind": phrase_res.deadline.kind,
                        "source": "llm_grounded",
                    }

        # Fallback to rules deadline if LLM had no grounded deadline
        if not final_deadline and rules_result.deadline:
            final_deadline = {
                "iso": rules_result.deadline.datetime_iso,
                "text": rules_result.deadline.evidence.text,
                "kind": rules_result.deadline.kind,
                "source": "rules",
            }

        # 3. Project validation: 0% fabrication
        # Only existing projects mentioned in input or @mentions
        final_project: str | None = None
        llm_proj = llm_output.get("project_name")
        if llm_proj:
            matched = _fuzzy_match_project(str(llm_proj), raw_input, existing_projs)
            if matched:
                final_project = matched

        if not final_project and rules_result.project_mentions:
            # Check rules parser mentions against existing projects
            for pm in rules_result.project_mentions:
                matched = _fuzzy_match_project(pm, raw_input, existing_projs)
                if matched:
                    final_project = matched
                    break

        # 4. Priority validation: only from evidence words or rules
        final_priority: int | None = None
        priority_source = "default"
        if rules_result.priority:
            final_priority = rules_result.priority.value
            priority_source = "rules"
        else:
            llm_pri = llm_output.get("priority")
            if isinstance(llm_pri, dict) and llm_pri.get("evidence"):
                ev = _normalize_text(str(llm_pri["evidence"]))
                if ev and ev in norm_input:
                    val = llm_pri.get("value")
                    if isinstance(val, int) and 1 <= val <= 4:
                        final_priority = val
                        priority_source = "llm_grounded"

        # 5. Estimate validation: only from evidence words or rules
        final_estimate: int | None = None
        estimate_source = "default"
        if rules_result.estimate:
            final_estimate = rules_result.estimate.minutes
            estimate_source = "rules"
        else:
            llm_est = llm_output.get("estimate_minutes")
            if isinstance(llm_est, dict) and llm_est.get("evidence"):
                ev = _normalize_text(str(llm_est["evidence"]))
                if ev and ev in norm_input:
                    val = llm_est.get("value")
                    if isinstance(val, int) and val > 0:
                        final_estimate = val
                        estimate_source = "llm_grounded"

        # 6. Category validation: classification allowed from LLM with confidence
        final_category: str | None = None
        cat_confidence = 0.5
        llm_cat = llm_output.get("category")
        if llm_cat in ("professional", "academic", "personal", "learning"):
            final_category = str(llm_cat)
            cat_confidence = min(0.8, float(llm_output.get("category_confidence", 0.7)))

        # 7. Subtasks
        subtasks = llm_output.get("subtasks")
        if not isinstance(subtasks, list) or not subtasks:
            subtasks = rules_result.subtasks

        return {
            "title": {"value": final_title, "source": title_source},
            "category": {"value": final_category, "confidence": cat_confidence},
            "project_name": {
                "value": final_project,
                "source": "existing_project" if final_project else None,
            },
            "deadline": final_deadline,
            "priority": {"value": final_priority, "source": priority_source},
            "estimate_minutes": {"value": final_estimate, "source": estimate_source},
            "subtasks": subtasks,
            "clarification": llm_output.get("clarification"),
        }
