# 13 — Deployment & Infrastructure

## 1. Configurations
**A. Local (primary, always supported)**
```
PC: docker compose → postgres(pgvector) · api · worker · web     Ollama on host (GPU access simpler)
Android ──(Tailscale or same Wi-Fi)──► http(s)://<pc>:8000
```
**B. Free cloud (optional, portable)**
```
Cloud VM or PaaS: api + worker (+ web)   DB: managed Postgres w/ pgvector OR self-hosted on same VM
LLM: cloud providers (if enabled) or Ollama on home PC reachable via Tailscale
```
Rule: nothing in code assumes a specific host. Everything is configured by env. Moving A↔B = export/backup → restore.

## 2. Repository infrastructure
```
infrastructure/
├── docker/
│   ├── backend.Dockerfile      # python:3.12-slim, uv, non-root user, pinned digests
│   ├── web.Dockerfile          # node:22-slim, pnpm, next build standalone
│   └── caddy/Caddyfile         # optional TLS reverse proxy (cloud)
├── scripts/
│   ├── doctor.sh / doctor.ps1  # checks tools, versions, ports, RAM/CPU/GPU, Ollama reachability
│   ├── benchmark_hardware.py   # LLM/STT/embedding benchmark (§6)
│   ├── backup.sh restore.sh    # pg_dump/pg_restore + storage tar
│   └── seed_dev_user.sh        # creates owner in DEV only (no sample tasks)
docker-compose.yml               # postgres, api, worker, web (+ caddy profile, + ollama profile)
docker-compose.test.yml          # ephemeral test DB (tmpfs)
Makefile                         # doctor up down migrate test check openapi client e2e bench backup restore
```

## 3. Environments
| Env | Purpose | DB | AI |
|-----|---------|----|----|
| `test` | CI + local tests | ephemeral container | fake provider only |
| `local` | daily use on PC | persistent volume | Ollama + optional cloud |
| `cloud` | optional hosted | managed/self-hosted | optional |
Dev convenience data must come from the owner's real usage or test fixtures in the test DB — never seeded into `local`/`cloud`.

## 4. CI (GitHub Actions, free for personal repos within limits — verify current limits)
Workflows:
1. `backend.yml`: ruff, mypy, import-linter, alembic up/down, pytest (unit+integration) with coverage gates, schemathesis smoke, bandit, pip-audit.
2. `frontend.yml`: pnpm install --frozen-lockfile, typecheck, eslint, unit tests (Vitest/Jest), OpenAPI client staleness check, Playwright (web) against compose stack.
3. `mobile.yml`: typecheck, Jest + RNTL; Android build (`expo prebuild` + Gradle assembleRelease) on tags; Maestro flows on emulator (nightly/on tag — emulators in CI are slow; also runnable locally).
4. `security.yml`: gitleaks, pnpm audit, ZAP baseline (on tag).
5. `nightly.yml`: learning eval on synthetic personas, scheduling benchmarks, RAG retrieval eval, sync fuzz long run.
If CI minutes become a constraint, the same commands run locally via `make ci`.

## 5. Android build & distribution
- Expo **development build** (custom native modules: sqlite, secure-store, audio, notifications). Build locally: `npx expo prebuild && cd android && ./gradlew assembleRelease` (free) — EAS cloud builds optional.
- Signing key generated locally, stored outside repo, backed up (losing it prevents updates).
- Distribution: sideload APK (personal use). Play Store optional later.
- Server URL configurable in app first-run screen (local IP/Tailscale name or cloud URL) + connectivity test.

## 6. Hardware benchmark & local model selection (resolves "Local model size")
`python infrastructure/scripts/benchmark_hardware.py` measures on the owner's PC:
| Test | Candidates | Metric | Selection rule |
|------|------------|--------|---------------|
| LLM extraction JSON | small instruct models available in Ollama in ~1–4B and ~7–9B classes, quantised (Q4) | tokens/s, p95 latency on 30 golden prompts, JSON validity %, golden accuracy | largest model with p95 ≤ 8 s and JSON validity ≥ 95% |
| LLM RAG answer | same | p95 ≤ 15 s for 400-token answer, citation validity | |
| STT | faster-whisper base / small / medium (int8) | real-time factor, WER on 20 clips | RTF ≤ 0.5 and best WER |
| Embeddings | bge-small (384) vs alternatives | docs/s, retrieval recall on RAG eval | default bge-small unless recall gain ≥ 5% |
Output: `docs/milestones/HARDWARE_BENCHMARK.md` + ADR in `DECISIONS.md`. Exact model names are chosen at benchmark time (the landscape changes); the doc records what was installed and why.
Minimum supported host: 8 GB RAM, 4 cores (LLM features may then be cloud-only or slow); recommended 16 GB+ or a GPU with ≥ 6 GB VRAM.

## 7. Free-cloud provider selection (M11)
Do not assume any free tier is permanent. Evaluate at M11 against criteria, record in ADR:
| Criterion | Requirement |
|-----------|-------------|
| Cost | ₹0 for expected load (1 user) |
| Postgres + pgvector | supported (managed) or VM can run Docker |
| Always-on vs sleep | API cold start acceptable (< 30 s) or always-on VM |
| Storage | ≥ 5 GB for files + DB growth |
| Background worker | supported (second process) |
| Region latency to India | acceptable |
| Exit path | standard Docker + pg_dump, no proprietary APIs |
Candidate types to evaluate: always-free VM tiers from major clouds, container PaaS free tiers, managed Postgres free tiers with pgvector. Fallback if none viable: stay local (A) with Tailscale for remote access.

## 8. Operations
- Migrations run on startup in `local` only after automatic pre-migration backup; in `cloud` via explicit `make migrate`.
- Health: `/health/ready` used by compose healthchecks; worker heartbeat row updated every 15 s.
- Disk guard: warn in UI when storage dir or DB > 80% of configured quota.
- Upgrades: `git pull && make up && make migrate`; rollback = previous tag + restore pre-migration backup.

## 9. Acceptance criteria
- AC-DEP-1 Fresh machine: clone → `.env` → `make doctor && make up && make migrate && make create-user` → working app in ≤ 15 min following README only (verified by owner on a clean VM/WSL).
- AC-DEP-2 Stack runs with no internet (after images/models pulled): core task flows pass E2E.
- AC-DEP-3 Android app connects over Tailscale and over LAN IP.
- AC-DEP-4 Cloud deployment (if chosen) passes the same E2E suite; migration A→B→A via backup/restore loses nothing (row counts + file hashes).
- AC-DEP-5 Benchmark report and model ADR exist before M4 exit.
- AC-DEP-6 Backups run nightly; restore drill passes.
