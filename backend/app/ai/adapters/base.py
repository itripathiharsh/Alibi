"""Base provider adapter contract."""

from abc import ABC, abstractmethod
from typing import Any

from app.ai.types import LLMRequest, ModelInfo, RawCompletion


class ProviderAdapter(ABC):
    """Protocol for an AI provider client interacting via raw httpx (ADR-008)."""

    name: str

    @abstractmethod
    async def chat(self, req: LLMRequest, model: str) -> RawCompletion:
        """Execute chat completion request."""
        ...

    @abstractmethod
    async def list_models(self) -> list[ModelInfo]:
        """Query available models from provider."""
        ...

    @abstractmethod
    async def health(self) -> dict[str, Any]:
        """Verify connectivity and credentials."""
        ...

