"""ALIBI AI Gateway Types and Data Contracts.

Implements doc 06 §2: Capability, Operation, LLMRequest, GatewayResult.
"""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class Capability(StrEnum):
    CHAT = "chat"
    JSON = "json"
    EMBED = "embed"
    STT = "stt"


class Operation(StrEnum):
    TASK_EXTRACTION = "TASK_EXTRACTION"
    BRAIN_DUMP = "BRAIN_DUMP"
    TASK_CLASSIFICATION = "TASK_CLASSIFICATION"
    COMPLEX_UNDERSTANDING = "COMPLEX_UNDERSTANDING"
    DAILY_PLAN_NARRATIVE = "DAILY_PLAN_NARRATIVE"
    RAG_ANSWER = "RAG_ANSWER"
    RAG_INTENT = "RAG_INTENT"
    WORK_SUMMARY = "WORK_SUMMARY"
    REPORT_NARRATIVE = "REPORT_NARRATIVE"
    LEARNING_INSIGHT_TEXT = "LEARNING_INSIGHT_TEXT"
    STT = "STT"


class Message(BaseModel):
    role: str  # "system" | "user" | "assistant"
    content: str


class LLMRequest(BaseModel):
    operation: Operation
    messages: list[Message]
    response_schema: type[BaseModel] | None = None
    max_output_tokens: int = 800
    temperature: float = 0.1
    timeout_s: float = 8.0
    privacy_level: str = "personal"


class RawCompletion(BaseModel):
    content: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: int = 0
    model: str


class ModelInfo(BaseModel):
    id: str
    name: str
    context_window: int = 8192


class GatewayResult(BaseModel):
    ok: bool
    data: Any | None = None
    raw_content: str | None = None
    provider: str
    model: str
    attempts: list[dict[str, Any]] = Field(default_factory=list)
    latency_ms: int = 0
    degraded: bool = False
    error_code: str | None = None
