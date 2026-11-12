# 08 — RAG Assistant & Knowledge Vault

## 1. Knowledge Vault ingestion (FR-KNOW-001/002)
Automatic, idempotent (`UNIQUE(source_type, source_id)`), via job `knowledge.ingest` triggered by domain events:

| Source | Trigger | Note text | occurred_on |
|--------|---------|-----------|-------------|
| task_description | task created/updated with description ≥ 20 chars | title + description | created date |
| completion_note | task completed with note/evidence text | title + note | completed date |
| work_log | work log saved | content | log_date |
| project_note | project description updated | | updated date |
| meeting_note / decision / manual | user creates note with that type | | user date |
| document | upload (pdf via `pypdf`, docx via `python-docx`, txt/md) | extracted text (≤ 2 MB text) | upload date |
| deliverable | evidence flagged `is_deliverable` | title + text/filename | evidence date |

Metadata copied: category, project, task, privacy_class (= category sharing_class). Updates re-ingest (content_hash change → re-embed). Deleting source → tombstone note + delete embeddings.

**Chunking:** ~400 tokens (approx 1,600 chars) with 15% overlap, split on paragraph/sentence boundaries; short notes = 1 chunk. Each chunk prefixed with a header line
`[{source_type}] {title} — {date} — {category}/{project}` before embedding (improves retrieval for metadata-ish queries).

## 2. Retrieval architecture (FR-RAG-002)
```
question ─► Intent router ─► plan { intents[], filters{date_range, category, project, status}, needs_semantic }
                │
     ┌──────────┴───────────────┐
     ▼                          ▼
 SQL tools (structured)     Vector + keyword retrieval (filtered)
     │                          │   pgvector cosine top 30 ∪ trigram/full-text top 30 → RRF fusion → top 12
     └──────────┬───────────────┘   (optional rerank: cross-encoder via fastembed rerank model, off by default; enable after benchmark)
                ▼
         Context assembler (budget ~6k tokens; tool results first, then chunks; each item has alias S1..Sn)
                ▼
         LLM answer (cites [S#]) ─► Validator ─► answer + sources
```

### 2.1 Intent router
Rules first (regex/date phrases via the same rules parser), LLM `RAG_INTENT` fallback for ambiguous questions. Date phrases resolve in user tz:
"yesterday", "last week" (= previous Mon–Sun), "this month", "in October", explicit ranges.

### 2.2 SQL tools (deterministic, parameterised, read-only, user-scoped)
| Tool | Answers |
|------|---------|
| `completed_tasks(range, category?, project?)` | what did I accomplish / complete |
| `time_spent(range, group_by=category|project|day)` | how much time |
| `postponed_tasks(min_reschedules=2, range?)` | repeatedly postponed |
| `pending_overdue(as_of)` | what's pending/overdue |
| `deliverables(range)` | which deliverables |
| `learning_activities(range)` | what did I learn (Learning category + notes) |
| `work_logs(range)` | daily logs |
| `profile_facts()` | learned patterns (active/confirmed) |
| `metric(name, range)` | any dashboard metric via analytics service (same code path as dashboard) |
The LLM never writes SQL. Tool selection is from the plan; arguments validated by Pydantic.

## 3. Answer generation & grounding (FR-RAG-003/004/005)
System prompt rules: answer only from context; cite every factual sentence with [S#]; if context insufficient say so; never compute new totals — use tool numbers verbatim.
**Validator (deterministic):**
1. Every `[S#]` exists in context. Sentences without citation that contain a date, number, or task-like noun phrase → removed or answer marked `grounded=false`.
2. Every number in the answer (regex incl. "3 hours", "2.5h", "45 minutes", percentages) must appear in tool results (with unit normalisation) or as a count of listed sources.
3. If validation fails twice → **deterministic fallback**: template answer listing tool results ("You completed 6 tasks last week: …") with sources.
4. Empty retrieval → "I don't have records about that for <range>." + suggestion of nearest available range if any.

No LLM available → deterministic fallback for SQL intents; semantic-only questions return top matching vault items as a list.

## 4. Privacy
- External LLM allowed only if every included source's category permits it (doc 06 §6); otherwise local LLM or deterministic answer.
- Chat history stored in `chat_messages`; deletable per thread; excluded from vault ingestion.

## 5. Vault UI search (FR-KNOW-003)
Modes: keyword (pg_trgm + `websearch_to_tsquery`), semantic (pgvector), hybrid (RRF, default). Filters: date range, category, project, source type. Results: title, snippet with highlight, date, source chip, open-original link.

## 6. Evaluation
`backend/tests/rag_eval/`: a seeded fixture world (test DB only) of ~300 tasks, 80 notes, 60 work logs over 90 days with a question set of 60 Q/A pairs:
- Retrieval recall@12 ≥ 0.9 for questions with gold sources.
- SQL-intent answers: numeric exact-match 100% (deterministic path).
- With local LLM (nightly/manual): citation precision ≥ 0.95, unsupported-claim rate ≤ 2%, correct refusal on 10 unanswerable questions = 10/10.

## 7. Acceptance criteria
- AC-RAG-1 Example questions from the spec (7) all answered correctly on fixture world, with sources.
- AC-RAG-2 Unanswerable questions → explicit "no records" (10/10).
- AC-RAG-3 Number validator rejects an injected fabricated number (unit test with stubbed LLM).
- AC-RAG-4 Answers never include records of other users (isolation test) or deleted items.
- AC-RAG-5 Ingestion idempotent: re-running ingest creates no duplicates; edits re-embed once.
- AC-RAG-6 Vault search returns the exact note for a known phrase (keyword) and a paraphrased query (semantic) in top 5.
- AC-RAG-7 Works fully offline-from-cloud with Ollama; works without any LLM via deterministic fallback.
- AC-RAG-8 Retrieval p95 < 500 ms on 50k chunks (benchmark script).
