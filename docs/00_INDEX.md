# ALIBI Documentation Index

| # | Document | Purpose | Owner of truth for |
|---|----------|---------|--------------------|
| 01 | PRODUCT_REQUIREMENTS | What to build; requirement IDs | Scope, requirement IDs |
| 02 | SYSTEM_ARCHITECTURE | How the pieces fit | Module boundaries, data flow |
| 03 | DATABASE_SCHEMA | Tables, columns, constraints, indexes | Persistence |
| 04 | API_SPECIFICATION | REST contracts | Endpoints, payloads, errors |
| 05 | UI_UX_GUIDELINES | Screens, flows, design system | UI behaviour |
| 06 | AI_PROVIDER_ARCHITECTURE | Gateway, routing, validation | All LLM/STT/embedding calls |
| 07 | PERSONAL_LEARNING_ENGINE | Learning algorithms, maturity, eval | Predictions, patterns |
| 08 | RAG_AND_KNOWLEDGE | Retrieval, vault, grounding | Assistant answers |
| 09 | SCHEDULING_ENGINE | CP-SAT model, permissions | Schedule proposals |
| 10 | ANALYTICS_AND_REPORTS | Metric formulas, reports, sharing | Every number shown |
| 11 | OFFLINE_AND_SYNC | Local DBs, sync protocol, conflicts | Data consistency |
| 12 | SECURITY_AND_PRIVACY | Auth, crypto, privacy, backups | Threat model |
| 13 | DEPLOYMENT_AND_INFRASTRUCTURE | ₹0 hosted runtime (ADR-018) + local dev stack, benchmarks | Running the system |
| 14 | TESTING_AND_ACCEPTANCE | Test strategy, QA scope, gates | Quality bar |
| 15 | IMPLEMENTATION_ROADMAP | M0–M12 tasks, acceptance, exit gates | Order of work |
| 16 | REQUIREMENTS_TRACEABILITY | Req → milestone → test mapping | Coverage proof |
| — | IMPLEMENTATION_STATUS | Live progress | Current state |
| — | DECISIONS | ADR log | Why things are the way they are |
| — | KNOWN_ISSUES | Open defects/limitations | Risk register |
| — | templates/ | Milestone report, ADR, bug, test-run templates | Formats |

## Precedence when documents disagree
`AGENTS.md` > `01_PRODUCT_REQUIREMENTS` > `DECISIONS.md` (newer ADR wins) > numbered specs > everything else.
A disagreement is itself a defect: log it in `KNOWN_ISSUES.md` and ask the owner.

## Glossary
| Term | Meaning |
|------|---------|
| Task | A responsibility the user must do; has status, may have deadline |
| Work block | A planned time slot to work on a task (`calendar_events.kind = work_block`) |
| Fixed event | A calendar commitment the AI may never move (`kind = fixed_event`) |
| Deadline | When a task must be finished (`tasks.deadline_at`) — not a time slot |
| Actual time | Sum of `time_entries` for a task |
| Proposal | Any AI-originated change awaiting user decision |
| Pattern | A learned regularity with sample count + confidence (`learned_patterns`) |
| Sharing class | professional / personal / academic / learning — drives what can be shared |
| Maturity level | L0–L3 stage of the learning engine per prediction type (doc 07 §3) |
| Grounding | Proof that an extracted field appears in the user's own input |
