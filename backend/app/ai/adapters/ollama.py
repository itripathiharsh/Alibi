"""Ollama local provider adapter (ADR-008, ADR-020, doc 06 §3)."""

from typing import Any

import httpx

from app.ai.adapters.base import ProviderAdapter
from app.ai.types import LLMRequest, ModelInfo, RawCompletion


class OllamaProviderAdapter(ProviderAdapter):
    """Adapter for local Ollama instance via OpenAI-compatible endpoint."""

    name: str = "ollama"
    DEFAULT_BASE_URL: str = "http://localhost:11434/v1"
    DEFAULT_MODEL: str = "llama3.2:3b"

    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        self.api_key = api_key or "ollama"
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    async def chat(self, req: LLMRequest, model: str) -> RawCompletion:
        url = f"{self.base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": model or self.DEFAULT_MODEL,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
            "max_tokens": req.max_output_tokens,
            "temperature": req.temperature,
        }
        if req.response_schema is not None:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=req.timeout_s) as client:
            resp = await client.post(url, headers=self._headers(), json=payload)
            resp.raise_for_status()
            data = resp.json()

        choice = data["choices"][0]["message"]
        usage = data.get("usage", {})
        return RawCompletion(
            content=choice.get("content", ""),
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            latency_ms=int(resp.elapsed.total_seconds() * 1000) if resp.elapsed else 0,
            model=model or self.DEFAULT_MODEL,
        )

    async def list_models(self) -> list[ModelInfo]:
        url = f"{self.base_url}/models"
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url, headers=self._headers())
                resp.raise_for_status()
                data = resp.json()

            models = []
            for item in data.get("data", []):
                models.append(ModelInfo(id=item["id"], name=item.get("id", item["id"])))
            return models or [ModelInfo(id="llama3.2:3b", name="Llama 3.2 3B")]
        except Exception:
            return [ModelInfo(id="llama3.2:3b", name="Llama 3.2 3B (Offline)")]

    async def health(self) -> dict[str, Any]:
        try:
            url = f"{self.base_url}/models"
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url, headers=self._headers())
                if resp.status_code == 200:
                    return {"status": "ok", "provider": self.name}
                return {
                    "status": "error",
                    "error": f"HTTP {resp.status_code}",
                    "provider": self.name,
                }
        except Exception as e:
            return {"status": "error", "error": str(e), "provider": self.name}
