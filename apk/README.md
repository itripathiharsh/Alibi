# ALIBI Android App Releases

This directory hosts the official compiled Android application package (`.apk`) builds for ALIBI.

## Latest Release

- **File**: [`ALIBI-0.1.0.apk`](./ALIBI-0.1.0.apk)
- **Direct Download Link**: [Download ALIBI-0.1.0.apk (Raw)](https://github.com/itripathiharsh/Alibi/raw/main/apk/ALIBI-0.1.0.apk)
- **Version**: `0.1.0`
- **Build Date**: November 20, 2026
- **Variant**: Android release APK, Hermes Bytecode Engine (React Native 0.76 New Architecture)
- **Signing**: Signed with the repository's current Android debug keystore. This is installable for direct distribution/testing, but it is not a Play Store production signature.
- **SHA-256**: `78ADF6E532D20A68BD644C411CB33B8741E47CB91510F1F37B26A9AF96E89844`
- **Build verification**: `assembleRelease` succeeded; APK v2 signature verified; includes Android 13+ POST_NOTIFICATIONS runtime prompt on boot, high-importance heads-up notification channels (v2) with audible sound and vibration, RECEIVE_BOOT_COMPLETED & SCHEDULE_EXACT_ALARM permissions, 125+ Short & Crunchy Zomato-style pop-culture notifications across 5 scenarios, in-settings instant 2-second test notification trigger, and Hermes engine fix.

---

## What's New in This Build

1. **Hermes Engine Restored (Fixes White Screen)**:
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
