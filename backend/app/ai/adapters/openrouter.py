"""OpenRouter OpenAI-compatible provider adapter (ADR-028, doc 06 §3).

OpenRouter exposes free `:free` model variants behind one OpenAI-compatible endpoint.
Free models change over time, so the model id is configurable (OPENROUTER_MODEL or the
per-user `models.default` setting).
"""

from app.ai.adapters.groq import GroqProviderAdapter


class OpenRouterProviderAdapter(GroqProviderAdapter):
    """Adapter for OpenRouter using the same OpenAI chat-completions contract as Groq."""

    name: str = "openrouter"
    DEFAULT_BASE_URL: str = "https://openrouter.ai/api/v1"
    DEFAULT_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"

    def _headers(self) -> dict[str, str]:
        headers = super()._headers()
        headers["X-Title"] = "ALIBI"
        return headers
