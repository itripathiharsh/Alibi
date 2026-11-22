# ALIBI — Commercial Readiness & Production Feasibility Assessment

**Document Version:** 1.0.0  
**Assessment Date:** 2026-11-22  
**Target Repository:** `D:\alibi`  
**Evaluation Scope:** Commercialization, Monetization Engine, Integrations, Security, Privacy, and Public Launch Feasibility  

---

## 1. Commercial Strategy & Product Architecture

ALIBI is positioned as a **Personal Operating System** designed for freelancers, independent professionals, solo founders, and knowledge workers. Its value proposition is built upon three non-negotiable pillars:
1. **Local-First Reliability**: Instant interactions with zero network round-trip dependencies. Complete offline autonomy for task planning, focus tracking, and note-taking.
2. **Grounded Intelligence**: AI capabilities that never fabricate metrics, deadlines, or productivity scores. All suggestions are strictly tied to real user SQL data.
3. **Privacy by Default**: Zero unsolicited data sharing, client-side encryption primitives, and explicit user approval required for any external synchronization.

### 1.1 Commercial Monetization Model
The planned monetization model consists of three tiers:
- **FREE (₹0 forever)**: Local task management, unlimited local notes, background focus timers, local analytics, 15 daily grounded AI queries.
- **PRO (₹149 / month)**: AI Daily Chief of Staff morning briefings, Personal Learning Engine duration adaptations, Google OR-Tools CP-SAT smart scheduling, Knowledge Vault semantic RAG, verified report generation, 100 daily AI queries.
- **ULTRA (₹299 / month)**: Multi-model provider selection, priority routing, automated project risk tracking, deep document extraction, 1,000 daily AI queries.

---

## 2. In-Depth Subscription & Billing Audit

### 2.1 Code-Level Implementation Reality
An exhaustive audit of the codebase reveals that **subscription billing is currently a client-side UI prototype**:
- **Mobile UI**: `apps/mobile/src/components/upgrade-modal.tsx` provides plan comparison cards, feature breakdowns, and an "Upgrade" button.
- **Persistence Layer**: Tapping "Upgrade" invokes `saveLocalSubscription(userId, { tier, status: "active", valid_until })` in `apps/mobile/src/lib/offline-sync.ts`, writing to the local SQLite table `local_subscriptions`.
- **Backend Infrastructure**:
  - The PostgreSQL schema contains **zero tables** for customer billing, subscriptions, invoices, or payment transactions.
  - There are **zero backend endpoints** for checkout session creation, webhook listening, subscription cancellation, or entitlement synchronization.
  - The backend API does not inspect user subscription tiers; all authenticated users have identical access to backend API routes.
  - There is no integration with payment gateways (Stripe, Razorpay, LemonSqueezy, Cashfree) or mobile in-app purchase systems (Google Play Billing via `react-native-iap` or RevenueCat).

### 2.2 Client-Side Metering
Daily AI query metering is enforced locally on device via `checkAndIncrementAIUsage(userId)` in `apps/mobile/src/lib/offline-sync.ts`:
- Reads the current tier from `local_subscriptions`.
- Tracks query counts in `local_ai_usage` grouped by `usage_date` (YYYY-MM-DD).
- When the daily threshold is met, the UI displays an upgrade prompt and prevents outbound AI chat requests.
- *Limitation*: Because this check occurs on the client, clearing app storage or editing SQLite locally resets the quota.

### 2.3 Required Production Architecture for Commercial Launch
To launch commercially and collect real revenue, the following architecture must be deployed:
```
Mobile Client (Google Play Billing / RevenueCat SDK)
   │
   ├─► Google Play Store (In-App Purchase flow)
   │      │
   │      └─► Purchase Token Issued
   │
   └─► POST /api/v1/billing/verify-purchase (Token + Signature)
          │
          ▼
   ALIBI Backend API (FastAPI)
          │
          ├─► Google Play Developer API (Server-side receipt verification)
          │
          ├─► Update PostgreSQL `subscriptions` Table
          │      (tier, status, current_period_end, cancel_at_period_end)
          │
          └─► Issue Updated JWT / Entitlements Claim
```

---

## 3. Integrations Hub Reality Check

### 3.1 Code-Level Implementation Reality
The mobile application presents an "Integrations Hub" accessible from the Profile screen (`apps/mobile/src/components/integrations-hub-modal.tsx`), featuring cards for:
1. **Google Calendar** (`https://www.googleapis.com/auth/calendar.readonly`)
2. **Gmail Action Scanner** (`https://www.googleapis.com/auth/gmail.readonly`)
3. **Google Drive Second Brain** (`https://www.googleapis.com/auth/drive.readonly`)
4. **GitHub Repositories** (`repo`, `read:user`)

**Audit Findings**:
- Tapping "Connect" prompts for an email address and saves a row to SQLite `local_integrations` with `status: "connected"`.
- **No external OAuth flow is initiated.** The app does not open Android Custom Tabs, perform authorization code exchanges, or receive OAuth access/refresh tokens.
- **Backend has zero integration endpoints.** There are no background schedulers or API clients to fetch calendar events, scan emails, index Google Drive documents, or pull GitHub issues.
- *Verdict*: The Integrations Hub is a **mock visual interface** and cannot be advertised as an active capability in commercial marketing.

### 3.2 Production Integration Roadmap
Before enabling integrations in production:
1. **Google Cloud Console**: Register OAuth2 client IDs for Android (`com.alibi.app` with production SHA-1 fingerprint) and Backend Web.
2. **Token Security**: Store OAuth refresh tokens encrypted at rest using AES-GCM in PostgreSQL, or inside the Android Keystore on-device.
3. **Background Sync Worker**: Implement read-only Celery or APScheduler ingestion workers with exponential backoff and rate-limit compliance.
4. **Data Isolation**: Ensure ingested calendar events and emails are strictly classified under the user's private workspace with granular consent controls.

---

## 4. Security & Privacy Audit

The ALIBI codebase was evaluated against production security, authorization, data isolation, and privacy standards.

| Security Domain | Verification Status | Implementation Evidence | Code References |
|---|---|---|---|
| **Cross-User Data Isolation** | **VERIFIED PASS** | Every SQL query and update strictly filters by `user_id == auth.user.id`. IDOR vulnerability tests verify cross-account access is denied. | `backend/app/api/v1/tasks.py`<br>`backend/app/api/v1/projects.py`<br>`backend/tests/integration/test_organizations_api.py` |
| **Authentication & Token Storage** | **VERIFIED PASS** | Access and refresh tokens are stored exclusively in Android Keystore via `expo-secure-store`. No plaintext tokens in AsyncStorage. | `apps/mobile/src/lib/auth.ts` (lines 23–35) |
| **API Access Control** | **VERIFIED PASS** | FastAPI dependency `get_auth_context` validates JWT signature, expiration, and user revocation status before granting endpoint access. | `backend/app/api/deps.py` |
| **Data Export (GDPR / Portability)** | **VERIFIED PASS** | `GET /api/v1/data/export` compiles all user workspaces, categories, projects, tags, tasks, time entries, events, notes, and reports into a structured JSON archive. | `backend/app/api/v1/data.py` (lines 33–175) |
| **Account Deletion (Right to be Forgotten)** | **VERIFIED PASS** | `DELETE /api/v1/data/account` enforces password re-authentication and executes cascading deletion across all user foreign keys. | `backend/app/api/v1/data.py` (lines 177–208) |
| **Privacy Redaction & AI Guardrails** | **VERIFIED PASS** | Redaction module scrubs PII, API keys, and sensitive tokens. `GroundingValidator` prevents LLM hallucination and enforces strict data grounding. | `backend/app/security/redaction.py`<br>`backend/app/assistant/validator.py` |
| **Sync Conflict Resolution** | **VERIFIED PASS** | Monotonic version numbers, 3-way field merge, and idempotent operation keys prevent data loss during offline-to-online reconciliation. | `packages/sync-core/`<br>`backend/app/sync/service.py` |
| **Formula Injection Defense** | **VERIFIED PASS** | CSV and Excel exports sanitize formula trigger characters (`=`, `+`, `-`, `@`) with prepended apostrophes. | `backend/app/reports/csv_renderer.py`<br>`backend/tests/unit/test_reports_renderers.py` |

---

## 5. Commercial Readiness Scorecard

| Area | Readiness Score | Commercial Viability | Launch Blocker? |
|---|---|---|---|
| **Core Offline Productivity** | 98 / 100 | **Production Ready** | No |
| **Focus Timers & Background Service** | 95 / 100 | **Production Ready** | No |
| **Knowledge Vault & Note Organization** | 90 / 100 | **Production Ready** (Local) | No |
| **AI Chief of Staff (Rule-Based)** | 85 / 100 | **Production Ready** (Local) | No |
| **Grounded Assistant & RAG** | 80 / 100 | **Production Ready** (Requires API Key) | No |
| **CP-SAT Smart Scheduling** | 80 / 100 | **Production Ready** (Online Backend) | No |
| **Cloud Cross-Device Sync (Notes & Projects)**| 50 / 100 | **Incomplete** | ⚠️ **P1 Gap** |
| **External Integrations (Google/GitHub)** | 10 / 100 | **Mock / Prototype** | ⚠️ **P0 Blocker (Must hide or build)** |
| **Monetization & Billing Gateway** | 10 / 100 | **Prototype Only** | 🔴 **P0 Blocker (For Commercial Launch)** |

### Overall Commercial Readiness: **65% (Beta / Dogfooding Ready; Commercial Public Launch Blocked)**

- **Can ALIBI be released as a free community beta?** **YES**. The core offline experience, timers, notes, task management, and local productivity analytics provide immense standalone value.
- **Can ALIBI be launched as a paid commercial product today?** **NO**. Payment processing is not connected, and advertising external integrations would constitute misrepresentation.

---

## 6. Pre-Launch Remediation Roadmap

To achieve 100% commercial readiness, the following phased remediation plan must be executed:

### Phase 1: Pre-Release Stabilization (Immediate - 1 Week)
1. **Fix Sync Push Entity Dispatcher**:
   - Add `_apply_project_op` and `_apply_vault_note_op` to `backend/app/sync/service.py`.
   - Update `pull_changes` to return changed projects and vault notes alongside tasks.
2. **Wire Duration Predictor & Profile Reset**:
   - Connect mobile task creation sheet to `POST /api/v1/learning/predict-duration`.
   - Update `handleResetLearningData` in `profile.tsx` to invoke `POST /api/v1/learning/reset` and wipe local SQLite tables.
3. **Refine Integrations UI**:
   - Add explicit "Coming Soon" or "Beta Waitlist" badges to Google Calendar, Gmail, Drive, and GitHub cards to set accurate user expectations.

### Phase 2: Commercial Billing Deployment (2–3 Weeks)
1. **Integrate Google Play Billing**:
   - Add `@revenuecat/purchases-react-native` or `react-native-iap` to `apps/mobile`.
   - Create Google Play Developer Console in-app products (`alibi_pro_monthly`, `alibi_ultra_monthly`).
2. **Backend Billing Engine**:
   - Create Alembic migration `0015_subscriptions_and_invoices.py`.
   - Build `/api/v1/billing/verify-purchase` and webhook receiver for Google Play Real-Time Developer Notifications (RTDN).
   - Gate server-side AI query routing based on verified database tier.

### Phase 3: Live Integrations Rollout (4 Weeks)
1. Register verified OAuth applications with Google Cloud and GitHub.
2. Build Android deep-link OAuth callback flow (`alibi://oauth/callback`).
3. Deploy read-only calendar and repository synchronizers.
