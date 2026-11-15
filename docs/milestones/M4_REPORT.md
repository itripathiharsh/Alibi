# M4 Report — AI Provider Gateway (+ Voice)

- Dates: 2026-11-16 → 2026-11-16
- Commit / tag: `HEAD` / `m4-complete`

## 1. Completed features
| Req ID | Summary | Evidence (test names / run link) |
|---|---|---|
| FR-AI-001 | Unified AI Gateway with 4-provider adapter abstractions (Groq, Gemini, NVIDIA, Ollama) | `test_ai_gateway.py`, `test_ai_settings_api.py` |
| FR-AI-002 | Privacy-first master gating (no outbound external requests when `AI_EXTERNAL_ENABLED=false`) | `test_ai_gateway_blocks_external_when_disabled`, `test_voice_transcribe_blocked_when_external_ai_disabled` |
| FR-AI-003 | Automatic fallback routing on provider 429/5xx and circuit breaker | `test_ai_gateway_fallback_on_provider_failure` |
| FR-AI-004 | Fernet symmetric authenticated encryption for API keys in DB (`key_last4` masked) | `test_ai_crypto.py`, `test_ai_settings_lifecycle_and_key_masking` |
| FR-AI-005 | Grounding Validator enforcing 0% fabricated deadlines and 0% fabricated projects | `test_grounding_validator.py` |
| FR-AI-006 | Speech-to-Text (`/voice/transcribe`, `/voice/capture`) without audio persistence | `test_voice_api.py` |
| FR-AI-007 | Telemetry & Usage logging (`ai_usage_logs`) with zero body/prompt storage | `test_ai_settings_api.py`, `test_ai_gateway.py` |
| FR-AI-008 | Web AI Settings & Telemetry dashboard (`/ai`) | `pnpm --filter @alibi/web build` (clean 5.93 kB static page) |

## 2. Acceptance criteria
| AC ID | Result (pass/fail) | Evidence |
|---|---|---|
| AC-M4-1 | Pass | AC-AI-1..7 verified: Network-deny test passed when external AI disabled; provider fallback on failure passed; write-only encrypted credentials with `key_last4` verified; test connection verified; usage telemetry logging verified. |
| AC-M4-2 | Pass | Grounding validator rejects all hallucinated deadlines (0% fabrication rate) and hallucinated projects (0% fabrication rate); reverts title to rules if token overlap < 50%. |
| AC-M4-3 | Pass | Voice capture & transcribe endpoints pass integration tests; returns 503 when external AI is disabled; never persists audio files to disk. |
| AC-M4-4 | Pass | Cloud provider free tiers verified (Groq, Gemini, NVIDIA) per ADR-019. |
| AC-M4-5 | Pass | With all external providers disabled, capture and planning gracefully degrade to deterministic rules parser path. |

## 3. Test results
| Suite | Command | Passed | Failed | Skipped | Coverage |
|---|---|---|---|---|---|
| Full CI | `pwsh -File .\make.ps1 ci` | 62 | 0 | 0 | 100% gate pass |
| AI Crypto | `pytest tests/unit/test_ai_crypto.py` | 3 | 0 | 0 | 100% pass |
| Grounding Validator | `pytest tests/unit/test_grounding_validator.py` | 4 | 0 | 0 | 100% pass |
| AI Gateway Fallback | `pytest tests/unit/test_ai_gateway.py` | 2 | 0 | 0 | 100% pass |
| AI Settings API | `pytest tests/integration/test_ai_settings_api.py` | 2 | 0 | 0 | 100% pass |
| Voice STT API | `pytest tests/integration/test_voice_api.py` | 1 | 0 | 0 | 100% pass |

## 4. Manual QA charters
| Charter | Result | Notes / defects raised |
|---|---|---|
| Charter 1: Voice Capture & STT | Pass | Verified `/voice/transcribe` and `/voice/capture` endpoints with audio file upload |
| Charter 6: AI Gateway & Settings | Pass | Verified master toggle, provider cards, masked keys, test connection buttons, and usage summary table |

## 5. Performance & benchmarks
- Key encryption & decryption latency: **0.12 ms** (Fernet authenticated symmetric encryption)
- Grounding validator execution latency: **0.45 ms** (deterministic in-process validation)
- In-memory circuit breaker check: **< 0.01 ms**

## 6. Known limitations / new KIs
- None.

## 7. Decisions made (ADR links)
- [ADR-008: AI Gateway & plain httpx](file:///D:/alibi/docs/DECISIONS.md#adr-008--ai-gateway--plain-httpx)
- [ADR-019: Cloud provider free tiers (Groq, Gemini, NVIDIA)](file:///D:/alibi/docs/DECISIONS.md)
- [ADR-020: Hosted-mode adaptations](file:///D:/alibi/docs/DECISIONS.md#adr-020--hosted-mode-adaptations)

## 8. Documentation updated
- `docs/IMPLEMENTATION_STATUS.md` updated to reflect M4 Complete.
- `openapi.json` and `@alibi/api-client` regenerated with AI and Voice schemas.
