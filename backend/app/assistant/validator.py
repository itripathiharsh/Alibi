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
    intents: list[str] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Generate a strictly factual, grounded response without using an LLM (AC-RAG-7)."""
    q_lower = query.lower().strip()
    has_period_scope = (
        any(
            token in q_lower
            for token in [
                "today",
                "yesterday",
                "last week",
                "this week",
                "this month",
                "last month",
                "202",
            ]
        )
        or re.search(r"\b(20\d\d)\b", q_lower) is not None
    )
    active_intents = list(intents) if intents is not None else []

    # If intents not explicitly passed, infer them from query
    if not active_intents and query:
        from app.assistant.intent import route_intent

        plan = route_intent(query)
        active_intents = plan.intents

    # 1. Handle Greetings
    if "GREETING" in active_intents:
        pending_tool = next(
            (t for t in tool_results if t.get("tool_name") == "pending_overdue"), None
        )
        pending_data = pending_tool.get("data", []) if pending_tool else []
        if pending_data:
            return (
                f"Hello! I am your ALIBI Grounded Assistant. You currently have {len(pending_data)} active task{'s' if len(pending_data) != 1 else ''} on your schedule.\n\n"
                "How can I help you today? You can ask:\n"
                '- *"What are my highest priority tasks today?"*\n'
                '- *"What did I accomplish this week?"*\n'
                '- *"What are my peak focus hours?"*',
                [],
            )
        return (
            "Hello! I am your ALIBI Grounded Assistant, strictly grounded in your verified tasks and data.\n\n"
            "You have no pending tasks right now. How can I assist you today?",
            [],
        )

    # 2. Handle Capabilities & Help
    if "CAPABILITIES" in active_intents:
        return (
            "I am your ALIBI Grounded Assistant. I operate under a strict zero-hallucination guarantee, providing answers verified directly by your database records.\n\n"
            "Here is what you can ask me:\n"
            '- **Priorities & Tasks**: *"What are my highest priority tasks today?"*, *"What is pending or overdue?"*\n'
            '- **Accomplishments**: *"What did I accomplish today?"*, *"What tasks did I complete this week?"*\n'
            '- **Time Tracking**: *"How much time did I spend this week?"*, *"How long did I work today?"*\n'
            '- **Habits & Focus**: *"What are my peak focus hours?"*, *"Summarize my routines"*\n'
            "- **Knowledge Vault**: Search past meeting notes, work logs, and decisions.",
            [],
        )

    # 3. Handle Work Breakdown
    if "BREAKDOWN" in active_intents:
        pending_tool = next(
            (t for t in tool_results if t.get("tool_name") == "pending_overdue"), None
        )
        pending_data = pending_tool.get("data", []) if pending_tool else []
        if pending_data:
            target_task = pending_data[0].get("title", "Upcoming Task")
            return (
                f"Here is a recommended execution breakdown for **{target_task}**:\n\n"
                "1. **Phase 1: Setup & Inputs** (~15 min)\n"
                "   - Review requirements, context, and dependencies.\n"
                "2. **Phase 2: Core Execution** (~30–45 min)\n"
                "   - Focus solely on the primary deliverable without interruptions.\n"
                "3. **Phase 3: Verification & Notes** (~15 min)\n"
                "   - Review output, confirm completion, and record notes.\n\n"
                "Tip: You can schedule a dedicated focus block for this task in your Timeline.",
                [],
            )
        return (
            'To break down work into subtasks, capture your task first or mention the task name (e.g. *"Break down: Launch new campaign"*).',
            [],
        )

    # 4. Handle Empty Specific Queries (Priorities, Habits, Completed, Time)
    pending_tool = next((t for t in tool_results if t.get("tool_name") == "pending_overdue"), None)
    if "PENDING_OVERDUE" in active_intents and (not pending_tool or not pending_tool.get("data")):
        return (
            "You currently have no pending or overdue tasks! Your task queue is completely clear.\n\n"
            "You can quickly capture a new task from the Tasks tab or ask me to help you plan your next goal.",
            [],
        )

    profile_tool = next((t for t in tool_results if t.get("tool_name") == "profile_facts"), None)
    if "PROFILE_FACTS" in active_intents and (not profile_tool or not profile_tool.get("data")):
        return (
            "I haven't observed enough tracked work sessions to detect your peak focus patterns yet.\n\n"
            "As you track time and complete tasks in ALIBI, my personal learning engine will automatically identify your peak focus hours, optimal session durations, and productivity rhythms.",
            [],
        )

    completed_tool = next(
        (t for t in tool_results if t.get("tool_name") == "completed_tasks"), None
    )
    if (
        "COMPLETED_TASKS" in active_intents
        and (not completed_tool or not completed_tool.get("data"))
        and not vault_sources
    ):
        if has_period_scope:
            return ("I don't have records about that for the requested period.", [])
        return (
            "You haven't completed any tasks for the requested period. Check your pending tasks to see what's on your agenda!",
            [],
        )

    time_tool = next((t for t in tool_results if t.get("tool_name") == "time_spent"), None)
    if "TIME_SPENT" in active_intents and (not time_tool or not time_tool.get("data")):
        return (
            "No time entries recorded for this period. Use the active timer or log your work sessions to see your tracked time summary.",
            [],
        )

    # 5. Check if empty context
    has_tools = any(t.get("data") for t in tool_results)
    has_vault = len(vault_sources) > 0

    if not has_tools and not has_vault:
        # Check for date or historical queries (AC-RAG-2)
        if has_period_scope or "VAULT_SEARCH" in active_intents:
            return ("I don't have records about that for the requested period.", [])
        return (
            "I couldn't find any matching records in your tasks or knowledge vault. Try asking about your pending tasks, completed work, time spent, or type 'help' to see what I can do.",
            [],
        )

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
            if tool_name == "pending_overdue":
                title = item.get("title", "")
                prio = item.get("priority")
                prio_str = f" [P{prio}]" if prio else ""
                dl = item.get("deadline")
                dl_str = f" (Due: {dl[:10]})" if dl else ""
                lines.append(f"- **{title}**{prio_str}{dl_str}")
            elif tool_name == "profile_facts":
                ptype = item.get("pattern_type", "Pattern")
                key = item.get("key", "")
                conf = int(float(item.get("confidence", 0)) * 100)
                lines.append(f"- **{ptype}**: {key} ({conf}% confidence)")
            else:
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
