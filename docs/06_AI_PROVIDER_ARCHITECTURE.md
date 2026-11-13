# 06 — AI Provider Architecture

## 1. Goals
One gateway; business code never imports a provider. Local-first, private by default, every output validated, every failure degradable.

## 2. Interfaces (`backend/app/ai/`)
```python
class Capability(StrEnum): CHAT="chat"; JSON="json"; EMBED="embed"; STT="stt"

class LLMRequest(BaseModel):
    operation: Operation            # e.g. TASK_EXTRACTION
    messages: list[Message]
    response_schema: type[BaseModel] | None
    max_output_tokens: int = 800
    temperature: float = 0.1
    timeout_s: float
    privacy: PrivacyLevel           # derived from data classes in the prompt

class ProviderAdapter(Protocol):
    name: str
    async def chat(self, req: LLMRequest, model: str) -> RawCompletion: ...
    async def list_models(self) -> list[ModelInfo]: ...
    async def health(self) -> HealthResult: ...

class AIGateway:
    async def complete(self, req: LLMRequest) -> GatewayResult   # routing, fallback, validation, logging
    async def embed(self, texts: list[str]) -> list[list[float]]  # local only (fastembed)
    async def transcribe(self, audio: Path, lang: str|None) -> Transcript
```
`GatewayResult = {ok, data (validated model) | None, provider, model, attempts[], latency_ms, degraded: bool, error_code}`.

## 3. Adapters
All four chat providers are called over **plain `httpx`** using their OpenAI-compatible chat-completions endpoints where available
(Ollama `/v1/chat/completions`, NVIDIA NIM, Groq, Gemini OpenAI-compatibility endpoint). If any provider's compatible endpoint lacks a
needed feature (e.g. JSON schema mode), its adapter implements the native API instead — confined to that adapter. Base URLs are configuration,
not code constants. **Verify each provider's current endpoint, model names and free-tier limits during M4 and record them in `DECISIONS.md`
(they change frequently).**

Structured output strategy per adapter: (1) native JSON-schema mode if supported, (2) JSON mode + schema in prompt, (3) plain prompt + extraction of the first JSON object.

## 4. Routing
Config (`ai_provider_settings.routing_overrides` or defaults file `app/ai/routing_defaults.yaml`):

| Operation | Default chain (first available wins) | Timeout | Notes |
|-----------|--------------------------------------|---------|-------|
| TASK_EXTRACTION | groq → gemini → ollama | 8 s | rules parser always runs first |
| TASK_CLASSIFICATION | (local ML model) → groq → ollama | 5 s | ML first once maturity ≥ L2 |
| COMPLEX_UNDERSTANDING | gemini → nvidia → ollama | 20 s | subtasks/dependencies suggestions |
| DAILY_PLAN_NARRATIVE | strongest configured (rank) → ollama | 20 s | solver decides, LLM explains |
| RAG_ANSWER | gemini → ollama | 30 s | streaming |
| RAG_INTENT | groq → ollama → rules | 4 s | |
| WORK_SUMMARY / REPORT_NARRATIVE | groq → ollama | 20 s | validated against facts |
| LEARNING_INSIGHT_TEXT | gemini → ollama | 20 s | text only; numbers from engine |
| EMBEDDINGS | fastembed (in-process) | — | never external |
| STT | faster-whisper → groq | 60 s | |

Filtering before routing: provider enabled ∧ key present (if needed) ∧ circuit closed ∧ not in quota cooldown ∧ **privacy permits** (§6).
If chain empty → `ai_unavailable`, caller degrades (each caller has a documented degraded path).

## 5. Reliability
- Retries: network errors / 5xx → 1 retry same provider (jittered 300–800 ms), then next provider.
- 429 / quota messages → provider cooldown: `Retry-After` if given, else 60 s, doubling to max 1 h; mark `quota_exhausted` in health.
- Circuit breaker per provider: open after 5 failures in 2 min, half-open after 60 s with one probe.
- Timeouts per operation (table above); total budget across fallbacks ≤ 1.5× op timeout.
- Invalid structured output → one **repair** call (send validation errors back) on same provider → then next provider.
- Ollama model not pulled → health shows `model_missing`; never auto-pull large models without user action.

## 6. Privacy gating
- Global `ai_external_enabled` (default **false**). When false, only Ollama/local are eligible.
- Each prompt builder declares which data classes it includes (sharing classes of tasks/notes in context). If any included item belongs to a category with
  `external_ai_allowed=false`, external providers are excluded **for that call** (local only, else degrade).
- Minimisation: prompts include only needed fields (no IDs other than short aliases, no emails, no file contents unless the op needs them).
- Logs: `ai_usage_logs` stores metadata only. Prompt/response bodies are never persisted except `ai_extractions.final_proposal` (structured) and chat messages (user-visible history).

## 7. Task extraction pipeline (FR-TASK-003/004)
1. **Rules parser** (`tasks/extraction/rules.py`, deterministic, offline): `dateparser` with `DATE_ORDER=DMY`, `PREFER_DATES_FROM=future`,
   `RELATIVE_BASE=now in user tz`, `TIMEZONE=Asia/Kolkata`; patterns for "by <day>", "before", "tomorrow", "EOD"(=18:00 configurable), "next week" (=Monday),
   durations ("2h", "30 mins", "half an hour"), priority words ("urgent", "asap", "low priority"), counts ("three creatives" → subtask hint), #tags, @project mentions.
   Output fields each with `evidence_span` (start,end in input).
2. **ML/kNN hints** (doc 07): category, project, duration from history with confidence.
3. **LLM refine** (if available): prompt `task_extraction.v{n}.j2` returns schema:
   ```json
   {"title":"str","category":"professional|academic|personal|learning|null","project_name":"str|null",
    "deadline":{"text":"exact phrase from input|null","iso":"datetime|null"},"priority":{"value":1-4|null,"evidence":"phrase|null"},
    "estimate_minutes":{"value":int|null,"evidence":"phrase|null"},"subtasks":["str"],"clarification":"str|null"}
   ```
4. **Grounding validator** (deterministic, mandatory):
   - `deadline` accepted only if `deadline.text` is a substring (case/space-normalised) of the input **and** the rules parser resolves that phrase to the same datetime (±1 min). Otherwise rules-parser deadline (if any) or `null`.
   - `project` accepted only if it fuzzy-matches (token-set ratio ≥ 90) an **existing** project name mentioned in the input, or an `@mention`; never auto-creates projects (user may create from confirm sheet).
   - `estimate`: from input evidence, else from learning engine (labelled "predicted"), never from LLM without evidence.
   - `priority`: from evidence words or learning engine; LLM-only priority is dropped.
   - `category`: LLM value allowed (it's a classification, not a fact) but confidence = min(LLM self-score capped 0.8, agreement with ML); auto-applied only ≥ threshold.
   - `title`: must share ≥ 50% tokens with input (prevents hallucinated titles); else use cleaned input.
5. Merge → `final_proposal` with per-field `{value, confidence, source: rules|ml|llm|user, evidence}` → stored in `ai_extractions`.

Degraded path: no LLM → rules + ML only (still useful). No ML maturity → rules only.

## 8. Speech-to-text
- `faster-whisper` model size chosen by benchmark (doc 13 §6): candidates `base`, `small`, `medium`(int8). Default `small` int8 on CPU.
- VAD filter on; language auto with hint `en` (configurable; Hindi supported by Whisper for transcription).
- Audio deleted after transcription unless `settings.keep_voice_audio=true`.
- Optional Groq Whisper when external enabled.

## 9. Cost & usage
`ai/pricing.yaml` holds per-model price per 1M tokens (owner-maintained; default 0 for local/free tiers). Usage page shows tokens, calls, errors, latency p50/p95, estimated cost.
Cost is an **estimate** and labelled as such.

## 10. Prompt management
- Templates `app/ai/prompts/<operation>.v<N>.j2` + output schema in the same folder. Version bump on any change.
- `prompt_version` recorded with outputs. Golden tests pin versions.

## 11. Testing strategy (AI)
- **Unit:** adapters against `respx`-mocked HTTP (recorded fixtures per provider, incl. 429, 500, timeouts, malformed JSON).
- **Gateway:** fallback order, circuit breaker timing (frozen clock), privacy exclusion, repair loop, budget limit.
- **Golden extraction set** `backend/tests/ai_eval/extraction_golden.jsonl` — ≥ 150 hand-labelled utterances (incl. Indian date styles, no-deadline cases, adversarial "maybe sometime", Hinglish samples).
  Metrics (rules+grounding path, deterministic): deadline exact-match ≥ 95%, **fabricated deadline rate = 0%**, fabricated project rate = 0%.
  With LLM (run manually/nightly against local Ollama, not in CI): title acceptability ≥ 90% (rubric), category accuracy ≥ 85%.
- **STT:** 20 recorded clips (owner's voice, quiet + noisy) → WER reported; target WER ≤ 15% on quiet clips with chosen model.

## 11a. Hosting modes (ADR-018/020, owner 2026-11-13)
| Aspect | `ALIBI_MODE=hosted` (primary runtime) | `ALIBI_MODE=local` (dev / self-host) |
|---|---|---|
| Chat/JSON providers | Groq → Gemini → NVIDIA, **only when `ai_external_enabled=true`** (default false) | Same chains + Ollama |
| No provider eligible | `ai_unavailable` → rules/ML/deterministic path (FR-AI-009) | same |
| EMBEDDINGS | none in v1 (keyword search) unless M7 shows fastembed fits the 512 MB budget | fastembed in-process |
| STT | on-device Android recognition (client side); `/voice/transcribe` → Groq Whisper only if external enabled; audio never stored | faster-whisper → Groq |
| Golden/eval runs | recorded fake provider in CI (AGENTS §6); live cloud evals manual only | + local Ollama nightly/manual |
The routing table in §4 lists `ollama` in every chain; in hosted mode the adapter is simply not registered, so chains skip it. Privacy gating (§6) is unchanged and applies to every external call.

## 12. Acceptance criteria
- AC-AI-1 With `AI_EXTERNAL_ENABLED=false` no outbound request to any non-local host (network-deny test in CI).
- AC-AI-2 Provider down/timeout/429 → next provider used; all providers down → `degraded=true` and feature still completes via fallback path.
- AC-AI-3 Settings: key set → stored encrypted (DB value ≠ plaintext, decrypts with key), API returns only last4, logs contain no key (log capture test).
- AC-AI-4 Test-connection reports success/failure correctly for each adapter (mocked).
- AC-AI-5 Golden set thresholds in §11 met; fabricated deadline/project = 0.
- AC-AI-6 Changing routing config switches provider without code change (integration test).
- AC-AI-7 Usage log row written for every call, including failures.
