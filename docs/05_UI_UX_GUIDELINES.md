# 05 — UI/UX Guidelines

Principle: **simple on the outside, intelligent underneath.** Information over decoration. Mobile-first.

## 1. Navigation
Four primary destinations only — bottom tab bar on mobile, left rail on web ≥ 1024 px:

| Tab | Contains |
|-----|----------|
| **Dashboard** | Period switcher, score card, metric tiles, charts, today's timeline, pending proposals card |
| **Tasks** | Today / Upcoming / Backlog / Completed segments, **Calendar** toggle (day/week), task detail, search |
| **AI Intelligence** | Assistant chat, **Knowledge Vault** search, Learned patterns & maturity, Schedule proposals, AI settings link |
| **Reports** | Generate, history, shares & access logs |

Settings (account, working hours, categories, AI providers, privacy, devices, backup/export) via avatar menu — not a tab.
Global **Capture button** (FAB on mobile, `N` shortcut + top bar button on web) on every screen.

## 2. Critical flow: capture in ≤ 3 interactions
1. Tap FAB (or long-press for voice) → sheet opens with keyboard focused / recording started.
2. Type/speak → "Save". Task appears instantly in list with a subtle "understanding…" shimmer.
3. Confirm sheet slides up (only if extraction found something to confirm): fields as chips —
   `Category: Professional 92%` · `Deadline: Fri 14 Nov, 18:00 ("by Friday")` · `Estimate: ~1h 45m (from 6 similar)` · `Priority: —`.
   Primary button **"Looks right"**; tapping a chip edits it inline. Dismissing = keep raw task, no fields applied.

Rules: evidence text for every AI field (the quoted phrase or "based on N similar tasks"). Low-confidence (< 0.6) fields shown unselected.
Clarification appears as one question chip, never a blocking dialog. Voice: live waveform, max 120 s, "Cancel" always visible.

## 3. Screens & required states
Every data screen implements: **loading** (skeleton), **empty** (one-line guidance + capture CTA), **error** (message + retry), **offline** (banner + cached data + pending count), **insufficient data** (for analytics/learning).

| Screen | Key elements |
|--------|--------------|
| Today | Overdue section (red accent), in-progress with running timer, scheduled blocks in time order, unscheduled today tasks, "Plan my day" button |
| Task detail | Title, status control, chips (category, project, priority, deadline, estimate vs actual), timer, subtasks, notes, evidence, dependencies, history tab, predictions with "why" |
| Calendar | Day/week; legend: fixed event (solid, lock icon), work block (tinted, task color), deadline (flag marker), actual time (hatched strip) |
| Proposal review | Diff list: new blocks (+), displacements (↔, require individual tick), unscheduled tasks with reasons; Accept all / selected / Reject |
| Dashboard | Score ring with "How is this calculated?" sheet, 6 tiles, charts, every chart has data table toggle (a11y) |
| Assistant | Chat with source chips under each answer; tapping opens record; "Not found in your records" style when ungrounded |
| Vault | Search box, filters (date, category, project, source), results with snippets |
| Patterns | Cards: pattern statement, samples, confidence bar, last observed, Confirm / Dismiss |
| Reports | Type + period picker, scope toggles (Professional on; others off with warning), preview, export, share |
| Share dialog | Recipient label, expiry, included classes (warning when adding personal/academic), copy link (shown once) |
| Sync conflicts | Side-by-side field values, choose |
| AI settings | Provider cards: status dot, key set (••••1234), test button, models, fallback drag order, "Disable all external AI" master switch |

## 4. Design system
- **Typography:** Inter (web via self-hosted font files, mobile via expo-font) — scale 12/14/16/20/24/32; tabular numerals for metrics.
- **Spacing:** 4-pt grid. **Radius:** 8 (controls), 12 (cards), 20 (sheets).
- **Color tokens** (light/dark): `bg`, `surface`, `surface-2`, `text`, `text-muted`, `border`, `primary`, `success`, `warning`, `danger`,
  category tokens `cat-professional` (blue), `cat-academic` (violet), `cat-personal` (green), `cat-learning` (amber). Contrast ≥ 4.5:1 text, 3:1 UI.
- **Motion:** 150–250 ms ease-out; respect `prefers-reduced-motion` / Android animator scale.
- **Icons:** lucide (web: lucide-react, mobile: lucide-react-native).
- **Touch targets** ≥ 48 dp. **Haptics** on complete/accept (mobile).
- Tokens defined once in `packages/design-tokens` (JSON → Tailwind config + RN theme) so web and mobile stay consistent.

## 5. Copy rules
- Plain, short, factual. No guilt language ("You failed…"). Overdue = "Past deadline".
- AI never speaks as if it did something it didn't: "Suggested", "Proposed", "Based on 6 similar tasks".
- Numbers always show units and period.

## 6. Accessibility
WCAG 2.2 AA (web), TalkBack labels (mobile), keyboard navigation for all web flows, focus visible, charts have text alternatives,
voice capture always has a text alternative, dynamic type up to 200% without truncating actions.

## 7. Responsive breakpoints
`< 640` mobile single column · `640–1023` tablet two-pane where helpful · `≥ 1024` desktop: rail + list + detail panes.

## 8. UI acceptance criteria
- AC-UI-1 Capture-to-saved ≤ 3 interactions measured in Playwright/Maestro scripts.
- AC-UI-2 Every screen has the 5 states; Storybook-style state gallery page (`/dev/states`, dev builds only) shows each.
- AC-UI-3 axe-core: 0 serious/critical violations on all web routes.
- AC-UI-4 Dark/light visual snapshots for core screens (Playwright screenshot diff threshold 0.2%).
- AC-UI-5 Lighthouse mobile: Performance ≥ 85, Accessibility ≥ 95 on Dashboard and Tasks.
- AC-UI-6 No screen exceeds 4 primary nav items; settings not in tab bar.
