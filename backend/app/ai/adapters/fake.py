"""Deterministic Fake Provider for tests (AGENTS §6, doc 06 §11)."""

import json
from typing import Any

from app.ai.adapters.base import ProviderAdapter
from app.ai.types import LLMRequest, ModelInfo, RawCompletion


class FakeProviderAdapter(ProviderAdapter):
    """Deterministic, fixture-driven mock provider for automated tests."""

    def __init__(
        self,
        name: str = "fake",
        canned_responses: dict[str, str] | None = None,
        should_fail: bool = False,
        fail_status_code: int = 500,
    ) -> None:
        self.name = name
        self.canned_responses = canned_responses or {}
        self.should_fail = should_fail
        self.fail_status_code = fail_status_code
        self.call_history: list[dict[str, Any]] = []

    async def chat(self, req: LLMRequest, model: str) -> RawCompletion:
        self.call_history.append(
            {"op": req.operation.value, "model": model, "messages": req.messages}
        )

        if self.should_fail:
            raise RuntimeError(f"Fake provider error HTTP {self.fail_status_code}")

        # If canned response exists for this operation, return it
        op_key = req.operation.value
        if op_key in self.canned_responses:
            resp_str = self.canned_responses[op_key]
        elif req.response_schema is not None:
            # Produce mock data matching response schema if possible
            if op_key == "TASK_EXTRACTION":
                resp_str = json.dumps(
                    {
                        "title": "Clean living room",
                        "category": "personal",
                        "project_name": None,
                        "deadline": {"text": "tomorrow at 5pm", "iso": "2026-11-17T17:00:00Z"},
                        "priority": {"value": 2, "evidence": "urgent"},
                        "estimate_minutes": {"value": 45, "evidence": "45 mins"},
                        "subtasks": ["vacuum", "dust"],
                        "clarification": None,
                    }
                )
            else:
                resp_str = "{}"
        else:
            resp_str = "This is a deterministic fake completion."

        return RawCompletion(
            content=resp_str,
            prompt_tokens=42,
            completion_tokens=24,
            latency_ms=15,
            model=model,
        )

    async def list_models(self) -> list[ModelInfo]:
        return [
            ModelInfo(id="fake-model-fast", name="Fake Fast", context_window=8192),
            ModelInfo(id="fake-model-smart", name="Fake Smart", context_window=16384),
        ]

    async def health(self) -> dict[str, Any]:
        if self.should_fail:
            return {"status": "error", "error": f"Failed with {self.fail_status_code}"}
        return {"status": "ok", "provider": self.name}
