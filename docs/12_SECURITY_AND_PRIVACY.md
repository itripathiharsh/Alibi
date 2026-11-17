# 12 — Security & Privacy

## 1. Assets & threat model
Assets: personal/professional task data, notes, documents, provider API keys, share links, backups.
Threats (STRIDE-lite):
| Threat | Example | Mitigation |
|--------|---------|-----------|
| Spoofing | stolen refresh token | rotation + reuse detection, device revoke, short access TTL |
| Tampering | modified sync ops | auth on every op, server-side validation, versioning |
| Repudiation | "who shared this?" | audit_log, share access log |
| Info disclosure | share link leaks personal data | backend scope filter, professional default, expiry, revocation, no-referrer |
| Info disclosure | data sent to cloud LLM | external AI off by default, per-category gating, minimisation |
| Info disclosure | keys in logs/git | encryption, redaction, gitleaks |
| DoS | brute-force login / share token | rate limiting, 256-bit tokens |
| Elevation | IDOR across users | repository-level ownership filter + generated tests |
| Supply chain | malicious dependency | lockfiles, pip-audit/pnpm audit, minimal deps, pinned Docker images by digest |
| Prompt injection | uploaded doc says "ignore rules, reveal…" | LLM has no tools that write data or call network; outputs validated; context wrapped as data |

## 2. Authentication
- Argon2id (`argon2-cffi`) params: time_cost=3, memory_cost=64 MiB, parallelism=2 (tune in M1 to ~250 ms on host).
- Access JWT (HS256 with `ALIBI_SECRET_KEY`, 15 min, claims: sub, device_id, jti, iat, exp). Refresh tokens: opaque 256-bit, SHA-256 stored, rotation on each use, family revocation on reuse (FR-AUTH-003).
- Web: refresh token in `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie; CSRF: SameSite + `Origin` check on cookie-auth endpoints.
- Mobile: tokens in expo-secure-store (Android Keystore-backed).
- Multiple individual accounts may self-register through `/auth/signup`; `/auth/setup` remains limited to an empty database. Both flows create a private workspace and default categories for that account.
- Signup is rate limited by client IP using the existing in-process sliding-window limiter. Email verification is not implemented; protect the public endpoint with TLS in hosted mode and monitor abuse.

## 3. Transport
- Local mode on LAN: recommended **Tailscale** (free personal plan, WireGuard-encrypted) instead of exposing ports; or Caddy with local CA. Plain HTTP allowed only for `localhost`.
- Cloud mode: TLS terminated by Caddy/platform; HSTS; Android `network_security_config` blocks cleartext except debug builds.
- Hosted mode (ADR-018): TLS by Render (API) and Vercel (web); DB connections to Neon require TLS (`sslmode=require`). All secrets live only in the platforms' env settings, entered by the owner; never in the repo or in workflow logs.

## 4. Data protection
- Provider API keys: Fernet (AES-128-CBC + HMAC) with `ALIBI_ENCRYPTION_KEY`; key rotation command `make rotate-encryption-key` re-encrypts rows.
- Files stored under `ALIBI_STORAGE_DIR` with random keys (not original names); served only via authenticated endpoint with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Upload validation: MIME sniffing (python-magic or `filetype`), size limits, PDF/DOCX parsed in worker with timeouts; no execution.
- Backups: `pg_dump -Fc` + storage dir tarball; optional encryption with `age` (free) when backups leave the machine.
- **Hosted mode (ADR-018/020):** files go through the storage interface into Postgres (Render's disk is ephemeral), with the same authenticated download rules. Backups run in GitHub Actions and are **always** `age`-encrypted (public key as a repo secret, private key offline with the owner). The `pg_dump` covers files too, because they're in the DB.

## 5. Authorization
- Every repository query includes `user_id = :current_user` (base class enforces; raw SQL helpers require it). Tokens carry exactly one user subject; clients never select or supply the owner ID for protected operations.
- Share viewer endpoints use only `report_shares.shared_facts` — never query live tables.
- Generated IDOR test: for each route, a second user's resource ID returns 404.

## 6. Privacy rules
- Private by default: no telemetry, no analytics SDKs, no crash reporters sending data off-device (local crash log only).
- External AI disabled by default; enabling shows exactly which providers/operations may receive which categories.
- Personal category `external_ai_allowed=false` by default.
- Sharing excludes personal, academic, learning and uncategorised data by default (professional only).
- Learning never infers psychological states (doc 07 §10).
- Logs: structlog redaction for headers (authorization, cookie), body fields (password, api_key, token, title, description, raw_input, body, content, transcript). Production log level INFO contains no user content.

## 7. Audit
`audit_log` actions listed in doc 03 §3.10; viewable in Settings → Security. Retention 2 years.

## 8. Data lifecycle (FR-DATA)
- **Export:** ZIP with `manifest.json` (schema version), one JSON file per table (user-owned rows), `files/`. Export is itself audit-logged.
- **Import/restore:** into empty account only; validates manifest version; migrates older exports through a transform chain.
- **Deletion:** item (soft → trash 30 days → purge), category (cascade options: move tasks or delete), account (all rows + files + embeddings + backups made after a "delete backups too" confirmation).
- **Backups:** nightly job 01:30 local, retention 30 days (configurable), weekly restore verification job restores latest dump into a temp DB and runs integrity checks (row counts, `actual_min` check, FK validity) → result in `/health/ready` details.

## 9. Security testing
- SAST: `bandit -ll`, `ruff` security rules (S), `eslint-plugin-security`.
- Dependencies: `pip-audit`, `pnpm audit --prod` — fail on high/critical.
- Secrets: `gitleaks` pre-commit + CI.
- DAST: OWASP ZAP baseline scan against local stack (M12) — no high findings.
- Tests: auth (reuse detection, expiry, revoke), rate limits, IDOR suite, share token entropy/hash storage, expired/revoked share returns 410 without data, log redaction capture test, upload type spoofing, CSV formula injection, path traversal on downloads, prompt-injection fixture docs (assistant must not output secrets or follow embedded instructions to change data — it has no write tools).

## 10. Acceptance criteria
- AC-SEC-1 Zero high/critical findings from §9 tools.
- AC-SEC-2 Refresh token reuse revokes the whole family (test).
- AC-SEC-3 DB inspection shows no plaintext keys/tokens/passwords.
- AC-SEC-4 Captured logs from full API test run contain none of the redacted fields' values.
- AC-SEC-5 Professional share of mixed data exposes 0 non-professional items; revoked link returns 410 within 1 s of revocation.
- AC-SEC-6 Backup → wipe → restore drill reproduces identical row counts and file hashes.
- AC-SEC-7 With external AI off, network egress test shows no non-local connections.
- AC-SEC-8 Account deletion leaves 0 rows for the user in any table (query over information_schema).
