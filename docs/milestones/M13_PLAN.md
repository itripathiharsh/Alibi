# M13 Plan — Mobile app visual refresh

- Scope: Rework Android visuals and implement account sign-up/login flows across Android and web, matching the owner's supplied screens and preserving account-level data isolation.
- Requirement IDs: FR-AUTH-001..007, FR-TASK-001..020, FR-CAL-001..007, FR-DASH-001..006, FR-LEARN-005..009, FR-KNOW-001..004, FR-REP-001..005.
- Entry: M12/v1.0 release is complete; owner approved six tabs and public self-signup (ADR-022/023). Auth API changes are in scope; no schema or sync-protocol changes are planned.
- Read first: `docs/05_UI_UX_GUIDELINES.md`, `docs/14_TESTING_AND_ACCEPTANCE.md`, `docs/16_REQUIREMENTS_TRACEABILITY.md`, ADR-020, and existing mobile screen/API code.
- Tasks: establish shared mobile visual tokens and branded header/backdrop; restyle existing Home, Tasks, Calendar, Insights, AI assistant and Settings screens; add API-backed Vault and Profile tabs; retain assistant access from Vault; add rate-limited signup API and web/mobile signup forms; verify user scoping; update UI guidance and ADRs; update status and known issues.
- Acceptance criteria:
  - AC-M13-1 Six requested destinations render in the requested order with a clear selected state and accessible labels.
  - AC-M13-2 Home, task lists, calendar, and insights continue using existing authenticated API data and existing actions.
  - AC-M13-3 Vault reads notes/search results from `/api/v1/vault/*`; empty, loading, and error states are visible; the existing grounded assistant remains reachable.
  - AC-M13-4 Profile uses `/api/v1/auth/me`, analytics summary, and learning profile where available; no sample metrics or personal records are hard-coded.
  - AC-M13-5 Capture and event flows retain their existing API contracts and user confirmation behavior.
  - AC-M13-6 Light mobile surfaces, typography, iconography, spacing, and shared card treatment align with the supplied references; controls meet 48 dp targets and reduced motion/contrast guidance.
  - AC-M13-7 Settings/logout and login remain navigable and visually consistent; no schema, sync, provider, or dependency changes.
  - AC-M13-8 Any visitor can create an isolated account from web or Android; duplicate email is handled safely; signup creates only that account's default workspace and categories; protected data remains scoped to the authenticated user.
- Risks: screenshots contain example numbers/records; these must not be copied as production data. Public signup has no email verification and uses process-local rate limiting. Android visual QA may reveal layout and touch-target issues; keep M13 in progress until reviewed.
- Test plan: run the mobile typecheck and Android export/build; manually inspect all six screens and capture/event sheets on an Android emulator/device. (Tests are not added or run under current session instructions.)
- Exit gate: acceptance criteria reviewed; all routes and existing data/actions retained; status and known issues updated; report written after evidence is available. Do not mark complete without test evidence.
