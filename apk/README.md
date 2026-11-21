# ALIBI Android App Releases

This directory hosts the official compiled Android application package (`.apk`) builds for ALIBI.

## Latest Release

- **File**: [`ALIBI-0.1.0.apk`](./ALIBI-0.1.0.apk)
- **Direct Download Link**: [Download ALIBI-0.1.0.apk (Raw)](https://github.com/itripathiharsh/Alibi/raw/main/apk/ALIBI-0.1.0.apk)
- **Version**: `0.1.0`
- **Build Date**: November 21, 2026
- **Variant**: Android release APK, Hermes Bytecode Engine (React Native 0.76 New Architecture)
- **Signing**: Signed with the repository's current Android debug keystore. This is installable for direct distribution/testing, but it is not a Play Store production signature.
- **SHA-256**: `5C0B5C5646BC04787F08F75302B6F15B7CD17799845A9BBB8CDBF66DD65FC590`
- **Build verification**: `assembleRelease` succeeded; verified Hermes Bytecode (`C6 1F BC 03` header, 69.1 MB); APK v2 signature verified; includes Stage 1 Runtime UI Fixes (synchronized application-level offline state across all 6 tabs via `useOfflineStatus` and in-memory cache, eliminated tab navigation and period-switching badge/card flickers, stabilized Android safe-area insets in `BrandHeader`, eliminated modal dismissal layout jumping/clipping with `statusBarTranslucent` dialogs and `overScrollMode="never"`, added offline coverage to Profile tab), Phase 1 Step 1 (Design Tokens Foundation) & Step 2 (Header & Canvas Unification), Complete Offline Mode Implementation, critical Android startup crash fix, and 125+ Short & Crunchy notifications.
- **Previous Build Backup**: [`ALIBI-0.1.0-backup-step2.apk`](./ALIBI-0.1.0-backup-step2.apk) (preserved).

---

## What's New in This Build

1. **Stage 1 Runtime UI Fixes (Offline State Synchronization & Modal Stability)**:
   - **Application-Level Offline Source of Truth**: Centralized offline state management in `apps/mobile/src/lib/auth.ts` with an in-memory cached state (`_cachedIsOffline`), pub/sub event listener (`subscribeOfflineStatus`), and synchronous `useOfflineStatus()` hook. All six primary tabs (`Home`, `Tasks`, `Calendar`, `Insights`, `Vault`, `Profile`) now resolve `isOffline` synchronously on the very first frame with zero flicker, zero keystore read latency, and no temporary badge disappearance during tab navigation or Insights period changes (`Today` / `This Week` / `This Month`).
   - **Stabilized Android Safe-Area Insets**: Guarded `BrandHeader` on Android with `Math.max(insets.top, StatusBar.currentHeight ?? 0)`, preventing header height collapse during Android dialog window destruction.
   - **Translucent Native Window Flags on Modals**: Added `statusBarTranslucent` and `onRequestClose` to all `<Modal>` components (Quick Capture, Morning Kickoff, Evening Sunset Sweep, Event Creation, Note Detail, Tag Modal). This prevents Android from altering the activity window's system UI visibility flags, eliminating the brief clipping/jumping of Home's `OfflineNoticeCard` beneath the header.
   - **Profile Tab Offline Support**: Extended offline coverage to `profile.tsx` with `<BrandHeader showOfflineBadge={isOffline} />` and an `<OfflineNoticeCard featureName="Profile" />`.

1. **Design System Foundation & Mobile UI Unification (Phase 1, Steps 1 & 2)**:
   - **Unified Design Tokens**: Synchronized `packages/design-tokens/tokens.json` and `apps/mobile/src/lib/theme.ts`. Standardized primary brand colors: Primary Orange (`#FF741F`), Primary Navy (`#0B2030`), Warm Off-White Canvas (`#FBF9F8`), and brand peach tones (`#FFF0E6`, `#FFE2D1`).
   - **Consistent Card Radii & Elevation**: Defined strict numeric radii in mobile theme tokens (`card: 20` for primary hero/action cards, `cardSecondary: 14` for task/note/event cards, `control: 8` for buttons/inputs, `sheet: 24` for modal bottom sheets).
   - **Header Layout & Logo Alignment**: Standardized `<BrandHeader />` across all 6 primary tabs (`Home`, `Tasks`, `Calendar`, `Insights`, `Vault`, `Profile`). Mounted header components directly outside `ScrollView` containers with safe-area insets (`insets.top + 48`), eliminating 40px double-indentation offsets and locking the ALIBI brand logo and offline indicator to consistent screen coordinates across tab switches.
   - **Standardized Screen Backgrounds**: Replaced divergent slate backgrounds (`#F8FAFC`) with the uniform `#FBF9F8` canvas background across all app screens.
   - **SunriseArt Alignment**: Standardized `SunriseArt` backdrop height to 175px across all six tabs without content clipping or header overlapping.
   - **Unified Offline Notice Styling**: Standardized `<OfflineNoticeCard />` presentation and callbacks across all screens without layout jumps.

1. **Complete Offline-First Architecture & Experience**:
   - **Welcome to ALIBI Offline Mode Modal**: When users select *Continue in Offline Mode*, a comprehensive modal clearly details available offline functionality (tasks, focus timer, on-device voice capture, local calendar, local vault notes, local SQL analytics) versus cloud requirements (cloud sync, cloud-grounded assistant). Includes a persistent "Don't show this introduction again" toggle.
   - **Offline Calendar**: Eliminated the blocking "Sign in to load your calendar" error. Calendar reads local SQLite events and task deadlines, allows creating local events with custom colors and priorities, queues them in the sync outbox, and provides an empty-state action button.
   - **Offline Knowledge Vault**: Wired `local_notes` SQLite table into the mobile Vault screen. Users can view, search, create (with real-time voice dictation), convert to tasks, and delete notes completely offline.
   - **Honest SQL-Driven Insights**: Replaced server-dependent analytics with `getLocalAnalyticsSummary` which computes genuine local completion rates, on-time rates, and tracked time from SQLite without fabricating productivity scores (`score: null, insufficient_data: true`). Weekly retrospective reviews are saved directly to SQLite offline.
   - **Offline Focus Session Controls**: Focus screen enables stopping and completing running timers offline without throwing authentication errors.
   - **Seamless Local-to-Cloud Migration on Sign In**: When an offline user signs in or registers an account, `migrateOfflineUserToAccount()` automatically transfers all `local_user` tasks, cached views, calendar events, vault notes, timers, time entries, and queued outbox operations to the authenticated user ID and triggers an immediate cloud push.
   - **Consistent Offline UI Indicators**: Integrated `<OfflineNoticeCard />` and subtle `<BrandHeader showOfflineBadge />` and top-bar offline pills across all screens adhering to ALIBI's navy/peach/orange visual identity.

2. **Android Startup Crash Fix ("ALIBI keeps stopping" resolved)**:
   - **Eliminated Navigation Race Conditions**: Removed competing `router.replace()` calls between `finishIntro()` and `guardRoute()`. Consolidated route guarding into a single authoritative handler with active navigation locks to prevent simultaneous native FragmentManager transactions.
   - **Gated Dashboard Mounting**: The application navigation stack (`<Stack>`) is no longer rendered underneath the intro animation or splash screen. During startup (`checking`), only the branded launch cover renders. During onboarding (`intro`), only the intro animation renders. The dashboard mounts strictly after intro completion and auth check.
   - **Resolved SQLite Connection Pool Premature Closure**: Eliminated `database.closeAsync()` in `hasLegacyLocalData()` which previously closed the native SQLite connection pool out from under `offline-sync.ts` and the Dashboard. Added a singleton mutex initialization promise (`dbInitPromise`) in `offline-sync.ts` to serialize database setup and prevent concurrent schema races.
   - **Guaranteed Task Capture Offline**: Defaulted offline task creation to `"local_user"` when no profile is yet saved locally, ensuring quick capture and dashboard task adds never fail or drop tasks when the server is unavailable or cold-starting.

2. **Intro Transition & Black Screen Fix**:
   - Replaced modal presentation on `login` and `signup` routes with standard stack navigation. Android Fragment Manager previously threw an unhandled state exception when replacing the root screen with a modal.
   - Pre-checks auth tokens before dismissing the intro animation to transition directly to `/login` or `/(tabs)` without screen flicker or race conditions.
   - Guarded notification scheduling so background alarms only schedule once the user is authenticated.
   - Converted inactivity nudges to safe non-exact `TIME_INTERVAL` triggers to avoid permission crashes on Android 14.

2. **Local-First Offline Task Capture (Never Lose Tasks)**:
   - Added automatic fallback to local SQLite (`createTaskOffline`) and `sync_outbox` in Quick Capture and the Tasks tab. If the cloud backend is sleeping (Render cold start), offline, or behind a Cloudflare challenge, tasks are safely saved locally on device and synced when connected.
   - Safe token refresh: transient 502/503/403 errors will no longer clear stored credentials or log the user out.
   - Added an offline mode shortcut on the login screen for instant device-only usage without waiting for cloud sign-in.

3. **Hermes Engine Restored (Fixes White Screen)**:
   - React Native 0.76 with New Architecture (Fabric + TurboModules) strictly requires Hermes bytecode. Restoring `hermesEnabled=true` resolves the blank white screen crash on boot.
2. **125+ Short & Crunchy Zomato-Style Notifications**:
   - 25 unique, short & punchy lines for each of the 5 scenarios:
     - **Timer Runaway (> 2 hrs)**: *"25 din mein paisa double? 💸"*, *"70 minute khatam Kabir Khan ⏱️"*, *"Control Uday, Control! 🧘"*, *"Pushpa jhukega nahi... 🌺"*, *"Chilla chilla ke scheme bata de 📢"*.
     - **Upcoming Deadline (15 min crunch)**: *"Sirf 15 minute bache hain! ⏳"*, *"Picture abhi baaki hai dost 🎞️"*, *"Darr ke aage jeet hai 🧗"*, *"Khatam, tata, bye-bye, goodbye! 👋"*.
     - **Morning Kickoff (9:00 AM)**: *"Subah ho gayi Mamu! ☀️"*, *"Wake Up Sid! 🏙️"*, *"Ashneer: 'Bhai kya kar raha hai?' 🦈"*, *"Utho Anarkali, meeting bohot hain 💃"*.
     - **Sunset Sweep (8:00 PM)**: *"O Stree kal aana! 👻"*, *"Biryani thandi ho rahi hai 🍗"*, *"Sholay: 'Yeh haath mujhe de de' 🖐️"*, *"Mirzapur: 'Rest kar lijiye' 🛏️"*.
     - **Ghosting Inactivity (36-48 hrs)**: *"Hum aapke hain koun? 🥺"*, *"Seen pe chhod diya? 💔"*, *"CID ACP: 'Kuch toh gadbad hai' 🔍"*, *"Zomato: 'We miss cravings' / ALIBI: 'We miss task checkmarks' ✅"*.
   - Switchable in **Settings -> Notifications -> Pop-culture & Zomato-style humor** (defaults to ON).
3. **Daily Automatic Kickoff & Sunset Reminders**:
   - Automatically registers 9:00 AM Morning Kickoff and 8:00 PM Evening Sweep check-ins via local on-device Android notifications.
4. **Morning Kickoff & Big Rocks**:
   - Interactive morning modal to curate your Top 3 daily priorities.
   - Pinned at the top of the dashboard with a golden `★ TOP PRIORITY` pill and live completion tracking.
2. **Evening Sunset Sweep**:
   - Clean-slate evening banner (after 5 PM) to easily postpone all uncompleted tasks to tomorrow or backlog with zero guilt.
3. **Batch Multi-Select Mode in Tasks**:
   - "Select" button or long-press on task cards to activate batch mode.
   - Floating action bar to batch mark **Done**, reschedule to **Tomorrow**, or **Delete** with one tap.
4. **Bi-directional Vault Note to Task**:
   - Convert any note or raw idea directly into an actionable task from the Knowledge Vault in one tap.
5. **Tactile Haptic Feedback & Live Focus Notifications**:
   - Native tactile vibration patterns on task completion, selection, and batch operations.
   - Sticky ongoing focus notification showing active task name and elapsed/countdown time.
6. **PLE Peak Energy Shield**:
   - Visual shield banner in *Today's Plan* safeguarding the personal 9:30 AM – 11:30 AM deep work window.
7. **Executive Light Theme Dashboard**:
   - Modern warm light UI matching executive dashboard design.
   - Dynamic greeting (`Good Morning/Afternoon/Evening, Harsh 👋`) with subtle peach dune art.
   - Floating Quick Capture pill with instant voice dictation.
   - 4 Action Shortcut tiles: `New Task` (orange), `Schedule` (blue), `Notes` (purple), `Knowledge Vault` (green).
   - Staggered dual-column layout:
     - Left column: `Today` task card with real-time completion toggles, category badges (`Work`, `Academic`, `Personal`), and priority flags.
     - Right column: `Focus` deep work Pomodoro timer (`25:00`) with circular orange play/pause button and progress bar, plus `Today's Plan` timeline.
   - Middle metric row:
     - `Progress` (Today vs Goal) with completion percentage pill, progress bar, and 3 SQL-grounded metric columns (`Tasks`, `Focus Time`, `Efficiency`).
     - `Mini Calendar` strip with current month header (`Nov 2026`), navigation controls, active date circle, and task activity dots.
   - Bottom card: `Your Learning Engine` (PLE) with personalized productivity peak schedule insight.
2. **Account sign-in and first-run setup**:
   - Android and web offer account creation at any time; each new account receives a private workspace and default categories.
   - Sign in with the same account on web and Android to access the same data. Separate accounts have separate records.
   - Removed the previous hard-coded automatic owner login so a fresh install cannot silently enter an existing account.
3. **6-Tab Bottom Navigation**:
   - `Home`, `Tasks`, `Calendar`, `Insights`, `Vault`, and `Profile`.
   - Profile shows account details, API-backed monthly activity, learning information, settings access, and logout.
   - The grounded assistant remains accessible from Vault.
4. **Interactive Calendar / Schedule Tab**:
   - Dedicated weekly schedule view with upcoming events and deadlines.
5. **Enhanced Task Capture**:
   - Native Android `SpeechRecognizer` real-time dictation without external cloud dependencies.
   - Optional `Pending` / `Completed` status toggle.
   - Deadline date presets (`Today`, `Tomorrow`, `Next Week`, `Custom`) + aligned time presets (`Morning 9 AM`, `Afternoon 2 PM`, `Evening 6 PM`, `Night 9 PM`, `Custom`).
6. **Individual task time tracking**:
   - Start and stop a separate timer on each task; different tasks may be tracked concurrently.
   - Each task displays its own live elapsed time and persists actual minutes separately.
   - Optional private Android reminder after two hours; stopping a timer cancels only its reminder.
   - Insights adds per-task recorded minutes, evidence-based task scores, and a 365-day activity heatmap.
7. **Faster entry to the app**:
   - Signup form and authenticated app shell render without host discovery or setup-status waits. The first server operation can still wait for a sleeping free-tier host to wake.
8. **Partial offline task support**:
   - Task views, task capture, status changes, and task timer sessions use an account-scoped local SQLite cache and sync outbox.
   - Calendar, Vault, voice/file uploads, and other app surfaces are not yet available offline; see `docs/KNOWN_ISSUES.md` (KI-016).

---

## Installation Instructions

### Option 1: Direct Download on Phone
1. Open [Download ALIBI-0.1.0.apk](https://github.com/itripathiharsh/Alibi/raw/main/apk/ALIBI-0.1.0.apk) in Chrome on your Android phone.
2. When prompted, tap **Download anyway**.
3. Tap the downloaded file to install. If prompted, enable **Install unknown apps** for Chrome in Android Settings.

### Option 2: Install via ADB (USB / Wireless)
With your phone connected via USB (USB Debugging enabled):
```powershell
adb install -r -d apk/ALIBI-0.1.0.apk
```
