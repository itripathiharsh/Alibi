"""Grounding validator enforcing strict input evidence checks (doc 06 §7)."""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.services.rules_parser import ParsedRulesResult, RulesParser


@dataclass
class GroundedField:
    value: Any
    confidence: float
    source: str  # 'rules', 'llm', 'user'
    evidence: str | None


@dataclass
class GroundedProposal:
    title: str
    deadline_at: datetime | None
    deadline_kind: str | None
    priority: int | None
    estimate_min: int | None
    category_id: Any | None
    project_id: Any | None
    tags: list[str]
    subtasks: list[str]
    raw_proposal: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "deadline_at": self.deadline_at.isoformat() if self.deadline_at else None,
            "deadline_kind": self.deadline_kind,
            "priority": self.priority,
            "estimate_user_min": self.estimate_min,
            "category_id": str(self.category_id) if self.category_id else None,
            "project_id": str(self.project_id) if self.project_id else None,
            "tags": self.tags,
            "subtasks": self.subtasks,
        }


class GroundingValidator:
    """Deterministic validator enforcing non-fabrication of deadlines, projects, estimates, and titles."""

    def __init__(self, rules_parser: RulesParser | None = None) -> None:
        self.rules_parser = rules_parser or RulesParser()

    def validate_and_merge(
        self,
        raw_input: str,
        rules_result: ParsedRulesResult,
        candidate_proposal: dict[str, Any] | None = None,
        existing_projects: list[Any] | None = None,
    ) -> GroundedProposal:
        """Validate candidate fields against raw input evidence, rejecting ungrounded values."""
        normalized_input = " ".join(raw_input.lower().split())

        # 1. Title validation: Must share >= 50% tokens with input
        input_tokens = set(re.findall(r"\w+", normalized_input))
        raw_proposed = (
            candidate_proposal.get("title")
            if candidate_proposal and candidate_proposal.get("title")
            else rules_result.cleaned_title
        )
        proposed_title = str(raw_proposed or rules_result.cleaned_title or raw_input.strip())
        title_tokens = set(re.findall(r"\w+", proposed_title.lower())) if proposed_title else set()

        if input_tokens and title_tokens:
            overlap = len(input_tokens.intersection(title_tokens)) / len(title_tokens)
            final_title = rules_result.cleaned_title if overlap < 0.5 else proposed_title
        else:
            final_title = rules_result.cleaned_title or raw_input.strip()

        # 2. Deadline validation: 0% fabricated deadline policy
        final_deadline: datetime | None = None
        final_deadline_kind: str | None = None

        if candidate_proposal and candidate_proposal.get("deadline"):
            c_deadline = candidate_proposal["deadline"]
            evidence_text = c_deadline.get("text", "")
            # Must be a substring of raw input
            if evidence_text and " ".join(evidence_text.lower().split()) in normalized_input:
                # Check consistency with rules parser
                if rules_result.deadline:
                    final_deadline = rules_result.deadline.dt
                    final_deadline_kind = rules_result.deadline.kind
            else:
                # Drop ungrounded candidate deadline!
                if rules_result.deadline:
                    final_deadline = rules_result.deadline.dt
                    final_deadline_kind = rules_result.deadline.kind
        elif rules_result.deadline:
            final_deadline = rules_result.deadline.dt
            final_deadline_kind = rules_result.deadline.kind

        # 3. Priority validation: Only allow if backed by explicit evidence
        final_priority: int | None = None
        if candidate_proposal and candidate_proposal.get("priority"):
            p_evidence = candidate_proposal["priority"].get("evidence", "")
            if p_evidence and " ".join(p_evidence.lower().split()) in normalized_input:
                final_priority = candidate_proposal["priority"].get("value")
            elif rules_result.priority:
                final_priority = rules_result.priority.value
        elif rules_result.priority:
            final_priority = rules_result.priority.value

        # 4. Estimate validation: Only allow if backed by input evidence
        final_estimate: int | None = None
        if candidate_proposal and candidate_proposal.get("estimate_minutes"):
            e_evidence = candidate_proposal["estimate_minutes"].get("evidence", "")
            if e_evidence and " ".join(e_evidence.lower().split()) in normalized_input:
                final_estimate = candidate_proposal["estimate_minutes"].get("value")
            elif rules_result.estimate:
                final_estimate = rules_result.estimate.minutes
        elif rules_result.estimate:
            final_estimate = rules_result.estimate.minutes

        # 5. Project validation: 0% fabricated project policy
        # Only accept if explicit @mention or structured context ('in <project>', 'for <project>')
        final_project_id: Any | None = None
        project_map = {p.name.lower(): p.id for p in (existing_projects or [])}

        # Check @mentions first
        for mention in rules_result.project_mentions:
            if mention.lower() in project_map:
                final_project_id = project_map[mention.lower()]
                break

        # Check explicit prepositional context: 'in <project>', 'for <project>', 'project: <project>'
        if not final_project_id and existing_projects:
            for p in existing_projects:
                p_name = p.name.lower()
                pat = rf"\b(?:in|for|project:?)\s+@?{re.escape(p_name)}\b"
                if re.search(pat, normalized_input):
                    final_project_id = p.id
                    break

        # 6. Tags & Subtasks
        tags = rules_result.tags
        subtasks = rules_result.subtasks
        if candidate_proposal and candidate_proposal.get("subtasks"):
            subtasks = candidate_proposal["subtasks"]

        return GroundedProposal(
            title=final_title,
            deadline_at=final_deadline,
            deadline_kind=final_deadline_kind,
            priority=final_priority,
            estimate_min=final_estimate,
            category_id=candidate_proposal.get("category_id") if candidate_proposal else None,
            project_id=final_project_id,
            tags=tags,
            subtasks=subtasks,
            raw_proposal=rules_result.to_dict(),
        )
