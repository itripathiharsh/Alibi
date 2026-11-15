"""PLE Guardrails and Banned Vocabulary Filter (doc 07 §10, AC-PLE-8).

Enforces non-judgmental, purely behavioral and numerical reporting.
"""

import re

BANNED_PATTERNS = [
    r"\blazy\b",
    r"\bprocrastinat\w*",
    r"\banxious\b",
    r"\bdepressed\b",
    r"\bunmotivated\b",
    r"\bburnout\b",
    r"\badhd\b",
    r"\bstress\w*",
]

_COMPILED_BANNED = [re.compile(p, re.IGNORECASE) for p in BANNED_PATTERNS]


def contains_banned_vocabulary(text: str) -> bool:
    """Check if text contains any banned psychological or judgmental terminology."""
    return any(p.search(text) for p in _COMPILED_BANNED)


def assert_clean_insight(text: str) -> None:
    """Raise ValueError if text contains banned vocabulary."""
    for p in _COMPILED_BANNED:
        match = p.search(text)
        if match:
            raise ValueError(f"Banned vocabulary '{match.group(0)}' detected in insight text.")

