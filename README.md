# ALIBI — Your Life. Your Work. Your Intelligence.

Personal productivity, adaptive planning and work intelligence system.
Mobile-first, local-first, free-first, private by default.

> **Status:** Planning pack complete. Implementation begins at milestone M0.
> See `docs/IMPLEMENTATION_STATUS.md` for live progress.

## What ALIBI does

Capture → Organize → Schedule → Execute → Learn → Analyze → Report.

- Create tasks by text or voice; ALIBI extracts title, category, deadline, priority and estimate — and never invents what you didn't say.
- A Personal Learning Engine learns your real durations, routines and working patterns, with confidence levels.
- An optimiser (OR-Tools) proposes schedules around your fixed events; nothing moves without your approval.
- A RAG assistant answers "what did I do last week?" from your actual records, with sources.
- Dashboards and EOD/weekly/monthly reports are computed from the database; shared reports exclude personal and academic data by default.
- Works offline on Android; syncs when connected. Runs fully on your own PC with no paid service.

## Repository layout

```
ALIBI/
├── AGENTS.md            # binding contract for coding agents
├── docs/                # planning pack (start at docs/00_INDEX.md)
├── apps/web             # Next.js responsive web app
├── apps/mobile          # React Native + Expo Android app
├── packages/            # shared TS: api-client (generated), sync-core, domain-types   (created in M0)
├── backend/             # FastAPI modular monolith
├── infrastructure/      # docker, scripts
└── tests/               # cross-app E2E (Playwright, Maestro), load and security tests
```

## Quick start (available after M0)

```bash
cp .env.example .env           # fill ALIBI_SECRET_KEY etc. — see docs/13
make doctor                    # checks Docker, Python, Node, pnpm, Ollama, hardware
make up                        # postgres+pgvector, backend, web
make migrate                   # alembic upgrade head
make create-user               # interactive; creates the single owner account
open http://localhost:3000
```

## Documentation

Start with [`docs/00_INDEX.md`](docs/00_INDEX.md).

## Licence

Private project. Third-party dependencies must use permissive licences (MIT, BSD, Apache-2.0, ISC, MPL-2.0). See `docs/DECISIONS.md`.
