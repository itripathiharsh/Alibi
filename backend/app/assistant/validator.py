"""Grounding Validator and Deterministic Fallback (doc 08 §3, AC-RAG-3).

Enforces non-negotiable grounding constraints:
1. Every [S#] cited must exist in the context sources.
2. Every number in the answer must appear in tool results or counts of listed items.
3. If validation fails twice or no LLM is available, generates a deterministic
   factual answer citing tool results directly.
4. Empty context produces an explicit refusal.
"""

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ValidationResult:
    is_valid: bool
    reason: str | None = None
    extracted_citations: list[str] | None = None
    unsupported_numbers: list[str] | None = None


def extract_citations(text: str) -> list[str]:
    """Find all [S#] citations in text."""
    return re.findall(r"\[(S\d+)\]", text)


def extract_numbers(text: str) -> list[float]:
    """Extract numeric values from text while ignoring year numbers like 2024..2030."""
    # Matches integers and decimals
    raw_nums = re.findall(r"\b\d+(?:\.\d+)?\b", text)
    nums: list[float] = []
    for n in raw_nums:
        val = float(n)
        # Skip calendar years
        if 2000 <= val <= 2100:
            continue
        nums.append(val)
    return nums


class GroundingValidator:
    """Deterministic validator verifying that answers cite only provided context."""

    def __init__(
        self,
        valid_source_aliases: set[str],
        allowed_numbers: set[float],
    ) -> None:
        self.valid_source_aliases = valid_source_aliases
        # Allow numbers with small floating point tolerance
        self.allowed_numbers = allowed_numbers

    def validate(self, answer: str) -> ValidationResult:
        """Validate citations and numbers in the answer."""
        if not answer.strip():
            return ValidationResult(is_valid=False, reason="Empty answer")

        # 1. Check citations
        citations = extract_citations(answer)
        for c in citations:
            if c not in self.valid_source_aliases:
                return ValidationResult(
                    is_valid=False,
                    reason=f"Citation [{c}] does not exist in context sources",
                )

        # 2. Check numbers
        nums = extract_numbers(answer)
        unsupported: list[str] = []
        for n in nums:
            # Check if n is close to any allowed number
            matched = any(abs(n - a) < 0.05 for a in self.allowed_numbers)
            if not matched:
                unsupported.append(str(n))

        if unsupported:
            return ValidationResult(
                is_valid=False,
                reason=f"Numbers {unsupported} were not found in tool results or source counts",
                unsupported_numbers=unsupported,
            )

        return ValidationResult(is_valid=True, extracted_citations=citations)


def generate_deterministic_answer(
    tool_results: list[dict[str, Any]],
    vault_sources: list[dict[str, Any]],
    query: str = "",
) -> tuple[str, list[dict[str, Any]]]:
    """Generate a strictly factual, grounded response without using an LLM (AC-RAG-7)."""
    _ = query
    # Check if empty context
    has_tools = any(t.get("data") for t in tool_results)
    has_vault = len(vault_sources) > 0

    if not has_tools and not has_vault:
        return ("I don't have records about that for the requested period.", [])

    lines: list[str] = []
    sources: list[dict[str, Any]] = []
    source_idx = 1

    # Format tool results
    for tr in tool_results:
        tool_name = tr.get("tool_name", "")
        summary = tr.get("summary", "")
        data = tr.get("data", [])
        if not data and not summary:
            continue

        alias = f"S{source_idx}"
        source_idx += 1
        lines.append(f"**{summary}** [{alias}]:")
        sources.append(
            {
                "alias": alias,
                "title": f"SQL Tool: {tool_name}",
                "snippet": summary,
                "type": "tool_result",
                "data": data[:10],
            }
        )

        for item in data[:8]:
            title = item.get("title") or item.get("content") or item.get("started_at")
            dur = item.get("duration_min")
            dur_str = f" ({dur} min)" if dur is not None else ""
            lines.append(f"- {title}{dur_str}")

    # Format vault notes
    if vault_sources:
        if lines:
            lines.append("")
        lines.append("**Relevant Notes & Knowledge Vault Records:**")
        for vs in vault_sources[:5]:
            alias = f"S{source_idx}"
            source_idx += 1
            title = vs.get("title", "Note")
            snippet = vs.get("snippet", "")
            lines.append(f"- **{title}** [{alias}]: {snippet}")
            sources.append(
                {
                    "alias": alias,
                    "note_id": vs.get("note_id"),
                    "title": title,
                    "snippet": snippet,
                    "type": "vault_note",
                }
            )

    return ("\n".join(lines), sources)
