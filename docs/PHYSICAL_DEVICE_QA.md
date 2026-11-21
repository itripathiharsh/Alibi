# ALIBI — Physical Device QA & Release Verification Protocol

**Document Version:** 1.0.0  
**Verification Date:** 2026-11-22  
**Target Release APK:** `D:\alibi\apk\ALIBI-0.1.0.apk`  
**File Size:** 69,185,513 bytes (65.98 MB)  
**SHA-256 Checksum:** `1A3CD18BE6DDFEEF95D605C9CE147BB77B83F744A8A32468AE650F4EC6E49F72`  
**Target Package:** `com.alibi.app` (v0.1.0, Build 1)  
**Architecture:** `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` (Universal APK, Hermes Bytecode Enabled)  

---

## 1. Verification Architecture & Layer Separation

To ensure absolute rigor, the ALIBI quality assurance protocol strictly separates **Automated Static/Unit Checks** (executed in developer and CI environments) from **Physical Device Manual Tests** (executed on real Android hardware).

```
┌────────────────────────────────────────────────────────┐
│ Layer 1: Automated Static & Unit Verification          │
│ • TypeScript typechecking (6/6 projects clean)         │
│ • Unit & Property tests (Sync-core 7/7, Backend 57/63) │
│ • Alembic schema migration chain (0014 head)           │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Layer 2: Static Binary & Package Analysis              │
│ • Android APK v2 Signature Verification                │
│ • AAPT Manifest & Permission Extraction                │
│ • Native Services & Widget Declarations Validation     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ Layer 3: Physical Device Manual QA Scenarios           │
│ • 9 Field-Testing Scenarios across OS OEM Flavors      │
│ • Battery Optimization & Background Execution Audits   │
│ • Native App Shortcuts, Widgets & Gesture Controls     │
└────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1 & 2: Automated Verification Summary

### 2.1 Workspace Compilation & Unit Suite Results
| Suite | Command | Exit Code | Results |
|---|---|---|---|
| **TypeScript Typecheck** | `pnpm -r run typecheck` | `0` | **6 / 6 workspace projects passed** with 0 errors |
| **Sync-Core Tests** | `pnpm -r test` | `0` | **7 / 7 unit tests passed** (165 ms) |
| **Backend Unit Tests** | `pytest backend/tests/unit` | `1` (6 DB tests) | **57 passed**, 6 failed due to `[WinError 1225]` (offline Postgres) |
| **Alembic Revisions** | `alembic heads` | `0` | **`0014 (head)` verified** |

### 2.2 Release Binary Analysis (AAPT & Apksigner)
```
Package: com.alibi.app
Version Code: 1
Version Name: 0.1.0
Min SDK: 24 (Android 7.0)
Target SDK: 34 (Android 14)
Signature: v2 verified (Debug keystore)
```
- **Declared Native Permissions**:
  - `android.permission.INTERNET`
  - `android.permission.ACCESS_NETWORK_STATE`
  - `android.permission.RECORD_AUDIO` (Live note & prompt dictation)
  - `android.permission.POST_NOTIFICATIONS` (Android 13+ runtime permission)
  - `android.permission.RECEIVE_BOOT_COMPLETED` (Alarm restoration after reboot)
  - `android.permission.SCHEDULE_EXACT_ALARM` (Precise task reminders)
  - `android.permission.VIBRATE` (Haptic feedback)
  - `android.permission.FOREGROUND_SERVICE` (Unkillable background focus timer)
- **Declared Native Components**:
  - `com.alibi.app.FocusSessionService` (`android.app.Service` with `foregroundServiceType="specialUse"`)
  - `com.alibi.app.QuickCaptureWidget` (`AppWidgetProvider` with `alibi_quick_capture_widget_info.xml`)
  - `res/xml/shortcuts.xml` (Static launcher shortcuts: `add_task`, `capture_idea`, `voice_capture`, `open_calendar`)

---

## 3. Layer 3: Physical Device Manual QA Scenarios

The following 9 test cases must be executed on physical hardware prior to public distribution.

---

### TC-QA-01: Clean Installation & In-Place Upgrade
- **Objective**: Verify error-free installation, first-launch routing, permission prompts, and data retention across app updates.
- **Preconditions**: Device running Android 10, 12, 13, or 14.
- **Execution Steps**:
  1. Transfer `D:\alibi\apk\ALIBI-0.1.0.apk` to device storage or install via ADB:
     ```bash
     adb install -r D:\alibi\apk\ALIBI-0.1.0.apk
     ```
  2. Launch ALIBI for the first time.
  3. Observe First-Launch Intro slider. Tap "Get Started".
  4. Create 3 tasks and 1 note in offline mode.
  5. Install the update over the existing install (`adb install -r`).
  6. Re-launch ALIBI.
- **Expected Results**:
  - App installs without parse errors or signature conflicts.
  - Intro slider renders smoothly without flickering.
  - User lands on Home screen with `local_user` initialized in SQLite.
  - After in-place upgrade, all 3 tasks and 1 note remain intact in SQLite.

---

### TC-QA-02: Cold, Warm, and Hot Launch Latency
- **Objective**: Measure launch speed and ensure no white flashes or blocking network calls occur during startup.
- **Execution Steps**:
  1. **Cold Launch**: Kill app process via Task Manager (`adb shell am force-stop com.alibi.app`). Launch app and record time until Home screen renders.
  2. **Warm Launch**: Press Home button, wait 60 seconds, tap ALIBI icon.
  3. **Hot Launch**: Switch between another open app and ALIBI.
- **Expected Results**:
  - **Cold Launch**: First frame within $<1.2\text{ s}$ on mid-range hardware. SunriseArt renders instantly; no network discovery delays.
  - **Warm Launch**: Immediate resume within $<300\text{ ms}$.
  - **Hot Launch**: Immediate resume within $<100\text{ ms}$ with scroll position preserved.

---

### TC-QA-03: Full Airplane-Mode Offline Operation
- **Objective**: Verify that 100% of core productivity workflows function in complete network isolation.
- **Execution Steps**:
  1. Enable Airplane Mode on the physical device. Turn off Wi-Fi.
  2. Launch ALIBI.
  3. Verify top header displays the amber "Offline" badge.
  4. Create a task: "Offline Task Test", Priority: High, Deadline: Today.
  5. Create a note in Vault: "Offline Strategy Idea", Category: Idea, Pin the note.
  6. Open Calendar tab: Verify day view displays today's offline tasks.
  7. Open Insights tab: Verify productivity summary calculates local totals from SQLite without crashing.
  8. Open Ask ALIBI tab: Verify clear offline notice is presented explaining that cloud AI models require network while local tools remain accessible.
- **Expected Results**:
  - Zero crashes, zero unhandled promise rejections, zero network alert modals.
  - Tasks, notes, and local calendar events persist immediately to SQLite.

---

### TC-QA-04: Android Home Screen Widget & Dynamic App Shortcuts
- **Objective**: Verify native launcher shortcuts and AppWidgetProvider deep-links.
- **Execution Steps**:
  1. Long-press ALIBI app icon on the Android launcher.
  2. Verify 4 dynamic shortcuts appear:
     - *Add Task* (`alibi://capture?mode=task`)
     - *Capture Idea* (`alibi://capture?mode=idea`)
     - *Voice Capture* (`alibi://capture?mode=voice`)
     - *Open Calendar* (`alibi://calendar`)
  3. Tap "Add Task". Verify app opens directly to Capture modal with mode set to Task.
  4. Add the **ALIBI Quick Capture** widget to the home screen.
  5. Tap the widget's input bar. Verify app opens to Capture.
  6. Tap the widget's microphone icon. Verify app opens with speech recognition active.
- **Expected Results**:
  - All deep-link intents route correctly to `com.alibi.app.MainActivity`.
  - Capture modal opens smoothly without crashing the FragmentManager.

---

### TC-QA-05: Background Timer Reliability & OS Memory Pressure
- **Objective**: Verify that task focus timers do not stop when the screen is locked, the app is backgrounded, or OEM battery savers kick in.
- **Execution Steps**:
  1. Open ALIBI. Tap "Start Focus" on a 25-minute task.
  2. Verify the Android system status bar displays the active focus notification.
  3. Press Home button. Lock the device screen for 10 minutes.
  4. Open 3 memory-heavy applications (e.g., YouTube, Chrome with multiple tabs, Camera).
  5. Unlock device and inspect the notification shade.
  6. Tap the ongoing focus notification.
- **Expected Results**:
  - `FocusSessionService` remains active in the foreground; elapsed timer increments continuously.
  - Android OS does not terminate the process because it holds an active Foreground Service.
  - Tapping notification returns user directly to the active Focus screen with accurate elapsed time.

---

### TC-QA-06: Low Memory / Process Death & State Restoration
- **Objective**: Verify graceful state restoration when Android OS terminates the background activity.
- **Execution Steps**:
  1. In Android Developer Options, enable **"Don't keep activities"** (simulates aggressive low-memory process kills).
  2. In ALIBI, navigate to Vault -> open an existing note -> enter edit mode.
  3. Type several sentences in the body. Do not tap save yet.
  4. Switch to another app, then switch back to ALIBI.
  5. Disable "Don't keep activities" after test.
- **Expected Results**:
  - App restores without crash or blank screen.
  - SQLite data integrity is preserved.

---

### TC-QA-07: Light/Dark Mode & Orientation Handling
- **Objective**: Verify visual rendering stability across device display modes.
- **Execution Steps**:
  1. Toggle Android system theme between Light Mode and Dark Mode.
  2. Rotate device to Landscape, then back to Portrait.
  3. Verify header heights, SunriseArt ($175\text{ px}$ height), card radii ($20\text{ px}$ primary, $14\text{ px}$ secondary), and tab bar navigation.
- **Expected Results**:
  - `orientation: "portrait"` locked in `app.json` prevents accidental landscape layout distortion.
  - Screen backgrounds remain consistent (`#FBF9F8`); text remains legible with high contrast (`#0B2030`).

---

### TC-QA-08: Android System Back-Button & Gesture Navigation
- **Objective**: Verify standard Android predictive back gestures and hardware back button behavior.
- **Execution Steps**:
  1. On Home screen, tap Chief of Staff "How it works" help icon (opens modal). Swipe back / press Back button. Modal must dismiss.
  2. Open Tasks tab -> open Project Manager sheet. Swipe back. Sheet must close.
  3. Navigate: Home -> Tasks -> Calendar -> Vault -> Profile.
  4. On Profile screen, press Back button.
- **Expected Results**:
  - Open modals, sheets, and drop-downs close on first Back press without exiting the app.
  - Back navigation from secondary tabs returns to the Home tab. Pressing Back on Home minimizes the app to the background without crashing.

---

### TC-QA-09: Fluidity, Frame Drops, and UI Responsiveness
- **Objective**: Verify smooth 60 FPS / 120 FPS rendering during intensive list scrolling.
- **Execution Steps**:
  1. Enable "Show refresh rate" and "Profile HWUI rendering" in Android Developer Options.
  2. Rapidly scroll the Tasks list with 50+ items.
  3. Rapidly scroll the Vault notes grid.
  4. Switch between the 6 bottom tabs repeatedly.
- **Expected Results**:
  - Frame rendering stays within the 16.6 ms (60 Hz) or 8.3 ms (120 Hz) green line.
  - Tab transitions execute instantly without layout jumping or header flickering.

---

## 4. Hardware OEM Matrix & QA Sign-Off Template

### 4.1 Recommended Physical Test Devices
| Manufacturer | Model | Android Version | Skin / UI | Key Focus Area |
|---|---|---|---|---|
| **Google** | Pixel 7 / 8 / 9 | Android 14 / 15 | Stock Android | Notification permissions, exact alarms, widget layout |
| **Samsung** | Galaxy S22 / S23 / A54 | Android 13 / 14 | One UI 5 / 6 | Deep sleep battery killer, background service retention |
| **Xiaomi / Poco**| Redmi Note 12 / 13 | Android 13 / 14 | MIUI / HyperOS | Autostart permissions, battery saver restrictions |
| **OnePlus** | OnePlus 11 / Nord | Android 13 / 14 | OxygenOS 13 / 14 | Aggressive RAM management, haptic feedback |

### 4.2 Sign-Off Record Template
```
Tester Name: ___________________________
Device Model: __________________________
OS Version: Android ____________________
Build Tested: ALIBI-0.1.0.apk (SHA-256: 1A3CD18BE6DDFEEF95D605C9CE147BB77B83F744A8A32468AE650F4EC6E49F72)

Test Case Results:
[ ] TC-QA-01: Clean Installation & Upgrade       [ PASS / FAIL ]
[ ] TC-QA-02: Launch Latency (Cold/Warm/Hot)      [ PASS / FAIL ]
[ ] TC-QA-03: Full Airplane-Mode Offline          [ PASS / FAIL ]
[ ] TC-QA-04: Home Screen Widget & Shortcuts     [ PASS / FAIL ]
[ ] TC-QA-05: Background Timer Reliability       [ PASS / FAIL ]
[ ] TC-QA-06: Process Death & State Restoration  [ PASS / FAIL ]
[ ] TC-QA-07: Orientation & Visual Contrast      [ PASS / FAIL ]
[ ] TC-QA-08: System Back & Gesture Navigation   [ PASS / FAIL ]
[ ] TC-QA-09: 60/120 FPS Fluidity & Motion       [ PASS / FAIL ]

Overall Status: [ APPROVED FOR BETA / BLOCKED ]
Defects Noted: ___________________________________________________________
Sign-Off Signature: ______________________ Date: _________________________
```
