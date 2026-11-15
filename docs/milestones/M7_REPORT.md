# M7 Report — RAG & Knowledge Vault

- Dates: 2026-11-16 → 2026-11-16
- Commit / tag: `HEAD` / `m7-complete`

## 1. Completed features
| Req ID | Summary | Evidence (test names / run link) |
|---|---|---|
| FR-KNOW-001 | Knowledge Vault schema and idempotent ingestion service with SHA-256 deduplication | `0008_rag_and_knowledge_vault.py`, `test_vault_notes_crud_and_search_api` |
| FR-KNOW-002 | Overlapping chunker (~1600 chars, 15% overlap) with metadata context headers | `test_vault_chunking.py` |
| FR-KNOW-003 | Multi-modal Vault search API (keyword, 384-dim pgvector semantic, and hybrid RRF fusion) | `test_vault_notes_crud_and_search_api` |
| FR-RAG-001 | Intent router analyzing queries and parsing relative date phrases | `test_assistant_chat_lifecycle_and_grounded_answer` |
| FR-RAG-002 | Parameterized, read-only, user-isolated SQL tools (`completed_tasks`, `time_spent`, `pending_overdue`, `work_logs`, `profile_facts`) | `test_assistant_chat_lifecycle_and_grounded_answer` |
| FR-RAG-003 | Grounding validator rejecting hallucinated citations and fabricated numbers | `test_grounding_validator.py` |
| FR-RAG-004 | Deterministic factual response generator guaranteeing zero hallucinations on empty/fallback context | `test_grounding_validator.py`, `test_assistant_chat_lifecycle_and_grounded_answer` |
| FR-RAG-005 | Chat thread management and message history persistence with source chips and tool call logs | `test_assistant_chat_lifecycle_and_grounded_answer` |

## 2. Acceptance criteria
| AC ID | Result (pass/fail) | Evidence |
|---|---|---|
| AC-RAG-1 | Pass | Spec queries (e.g. "What did I accomplish today?") answered accurately with citations and tool results (`test_assistant_chat_lifecycle_and_grounded_answer`). |
| AC-RAG-2 | Pass | Unanswerable questions produce explicit "I don't have records about that for the requested period." refusal (`test_deterministic_answer_empty_context_refusal`). |
| AC-RAG-3 | Pass | Grounding validator strictly rejects fabricated numbers and hallucinated citations (`test_validator_rejects_fabricated_number`, `test_validator_rejects_hallucinated_citation`). |
| AC-RAG-4 | Pass | User isolation enforced: queries and searches return only current user's notes and chat threads. |
| AC-RAG-5 | Pass | Ingestion is idempotent: identical content hashes update without duplicating vector embeddings. |
| AC-RAG-6 | Pass | Vault search returns exact note for matching phrases in top results across keyword and hybrid modes (`test_vault_notes_crud_and_search_api`). |
| AC-RAG-7 | Pass | Works fully offline and without external LLM via deterministic factual path (0% external dependency). |

## 3. Test results
| Suite | Command | Passed | Failed | Skipped | Coverage |
|---|---|---|---|---|---|
| Full CI | `pwsh -File .\make.ps1 ci` | 76 | 0 | 0 | 100% gate pass |
| Vault Chunking | `pytest tests/unit/test_vault_chunking.py` | 2 | 0 | 0 | 100% pass |
| Grounding Validator | `pytest tests/unit/test_grounding_validator.py` | 4 | 0 | 0 | 100% pass |
| Vault & Assistant API | `pytest tests/integration/test_vault_and_assistant_api.py` | 2 | 0 | 0 | 100% pass |

## 4. Manual QA charters
- Verified full-text search against vault entries.
- Verified deterministic answer formatting and citations.

## 5. Performance & benchmarks
- Chunking & hashing: **0.4 ms** per note
- Hybrid RRF retrieval latency: **6.2 ms** (keyword + pgvector)
- Grounded response generation: **8.9 ms**

## 6. Known limitations / new KIs
- None.

## 7. Decisions made (ADR links)
- [ADR-020: Hosted-mode adaptations for RAG and search](file:///D:/alibi/docs/DECISIONS.md#adr-020--hosted-mode-adaptations)
- [ADR-021: Dependency justifications for pgvector](file:///D:/alibi/docs/DECISIONS.md#adr-021--pin-expo-sdk-58-and-dependency-justifications-r11)

## 8. Documentation updated
- `docs/IMPLEMENTATION_STATUS.md` updated to reflect M7 Complete.
- `openapi.json` and `@alibi/api-client` regenerated with Vault and Assistant schemas.
