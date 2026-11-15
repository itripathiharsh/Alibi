"""NVIDIA NIM provider adapter (ADR-008, doc 06 §3)."""

from typing import Any

import httpx

from app.ai.adapters.base import ProviderAdapter
from app.ai.types import LLMRequest, ModelInfo, RawCompletion


class NvidiaProviderAdapter(ProviderAdapter):
    """Adapter for NVIDIA NIM API via OpenAI-compatible endpoint."""

    name: str = "nvidia"
    DEFAULT_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    DEFAULT_MODEL: str = "meta/llama-3.1-70b-instruct"

    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

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
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()

        models = []
        for item in data.get("data", []):
            models.append(ModelInfo(id=item["id"], name=item.get("id", item["id"])))
        return models or [
            ModelInfo(id="meta/llama-3.1-70b-instruct", name="Llama 3.1 70B Instruct"),
        ]

    async def health(self) -> dict[str, Any]:
        if not self.api_key:
            return {"status": "error", "error": "API key not configured", "provider": self.name}
        try:
            url = f"{self.base_url}/models"
            async with httpx.AsyncClient(timeout=5.0) as client:
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
