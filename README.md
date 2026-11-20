# ALIBI — Your Life. Your Work. Your Intelligence.

<p align="center">
  <img src="apps/web/public/logo.png" alt="ALIBI Logo" width="140" />
</p>

<p align="center">
  <strong>Adaptive Planning, Grounded Productivity & Work Intelligence</strong><br />
  <em>Zero Fabricated Metrics • Zero-Cost Cloud & Local-First • Private by Default</em>
</p>

<p align="center">
  <a href="#-quick-download-android-apk"><img src="https://img.shields.io/badge/Release-v0.1.0%20(APK)-orange.svg?style=flat-square" alt="Release APK" /></a>
  <img src="https://img.shields.io/badge/Python-3.12-blue.svg?style=flat-square" alt="Python 3.12" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat-square" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React%20Native-0.76%20(Hermes)-61DAFB.svg?style=flat-square" alt="React Native 0.76" />
  <img src="https://img.shields.io/badge/Next.js-14%2F15%20(App%20Router)-black.svg?style=flat-square" alt="Next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-336791.svg?style=flat-square" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Architecture-Local--First%20%7C%20%E2%82%B90%20Hosted-success.svg?style=flat-square" alt="Local First" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [The 3 Core Pillars](#-the-3-core-pillars)
- [Key Features](#-key-features)
  - [Mobile App (Android)](#-mobile-app-android)
  - [Personal Learning Engine (PLE)](#-personal-learning-engine-ple)
  - [Scheduling & Optimization](#-scheduling--optimization-google-or-tools)
  - [Grounded RAG Assistant & Knowledge Vault](#-grounded-rag-assistant--knowledge-vault)
  - [Analytics, Reports & Organization Portal](#-analytics-reports--organization-portal)
- [Quick Download (Android APK)](#-quick-download-android-apk)
- [System Architecture & Stack](#-system-architecture--stack)
- [Repository Structure](#-repository-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development Setup](#local-development-setup)
  - [Running the Services](#running-the-services)
- [Documentation Index](#-documentation-index)
- [Development Contract & Guarantees](#-development-contract--guarantees)
- [Licence](#-licence)

---

## 🌟 Overview

**ALIBI** is an intelligent personal productivity and adaptive planning system built to eliminate productivity guilt, unrealistic schedules, and manual task maintenance. 

Unlike conventional productivity tools that demand constant manual reorganization or hallucinate arbitrary schedules, ALIBI continuously learns how you actually work, safeguards your energy peaks, schedules work blocks mathematically around fixed commitments, and provides an auditable, grounded trail of your achievements.

### The Unified Lifecycle
$$\text{Capture} \longrightarrow \text{Organize} \longrightarrow \text{Schedule} \longrightarrow \text{Execute} \longrightarrow \text{Learn} \longrightarrow \text{Analyze} \longrightarrow \text{Report}$$

1. **Capture**: Capture thoughts instantly via text or on-device voice dictation.
2. **Organize**: Automatically categorize and prioritize without inventing deadlines or data you didn't state.
3. **Schedule**: Google OR-Tools CP-SAT generates conflict-free schedules around your real life.
4. **Execute**: Track focus with concurrent task timers, haptic feedback, and proactive check-ins.
5. **Learn**: The Personal Learning Engine models your true duration estimates, fatigue, and routines.
6. **Analyze**: Explore 365-day heatmaps, category distributions, and SQL-backed productivity metrics.
7. **Report**: Generate professional, privacy-filtered PDF/XLSX/CSV summaries for clients or employers.

---

## 🛡️ The 3 Core Pillars

### 1. Zero Fabrication & 100% Grounded Intelligence
- **No Hallucinated Numbers**: LLMs are never permitted to generate or calculate productivity metrics, duration totals, or completion scores. Every number comes directly from verified SQL aggregates.
- **Strict Grounding Validator**: The AI never invents a deadline, tag, or project unless explicitly present in your input text.
- **Proposals, Never Mandates**: Every AI-driven schedule adjustment or field extraction is presented as an explicit *proposal*. Nothing is changed silently or without user confirmation.

### 2. Local-First & ₹0 Cloud-Agnostic
- Runs 100% offline on your device with an account-scoped SQLite database, local task caches, and an automatic outbox synchronization engine.
- Self-hostable locally on your PC via Docker Compose, or deployable completely free-of-cost on managed infrastructure (Render free container + Neon free PostgreSQL/pgvector + Vercel Hobby) with zero paid API lock-in.

### 3. Private by Default with Context Separation
- Built-in data classification: `Personal`, `Academic`, `Professional`, and `Learning`.
- Shared reports and organization portals strictly isolate and exclude personal notes and tasks by default, ensuring your personal life remains private even when sharing work summaries.

---

## 🚀 Key Features

### 📱 Mobile App (Android)
Built with **React Native 0.76** and the **Hermes Bytecode Engine**, offering native performance, fluid gestures, and offline durability:

- **Executive Warm Light Dashboard**:
  - Dynamic time-of-day greeting (`Good Morning, Harsh 👋`) with subtle peach dune art.
  - Floating Quick Capture bar with native on-device speech-to-text dictation.
  - Split dual-column interface: Today's Tasks checklist alongside an active Focus deep work timer and timeline.
  - Visual Mini-Calendar timeline with task density indicators.
- **125+ Short & Crunchy Pop-Culture Notifications**:
  - Witty, meme-aware, Bollywood & cinema alerts (Zomato/Blinkit-style humor) across 5 scenarios:
    - *Timer Runaway (> 2 hrs)*: "25 din mein paisa double? 💸", "70 minute khatam Kabir Khan ⏱️", "Control Uday, Control! 🧘".
    - *15-Min Deadline Crunch*: "Sirf 15 minute bache hain! ⏳", "Picture abhi baaki hai dost 🎞️".
    - *Morning Kickoff (9:00 AM)*: "Subah ho gayi Mamu! ☀️", "Wake Up Sid! 🏙️", "Ashneer: 'Bhai kya kar raha hai?' 🦈".
    - *Sunset Sweep (8:00 PM)*: "O Stree kal aana! 👻", "Biryani thandi ho rahi hai 🍗", "Rest kar lijiye 🛏️".
    - *Inactivity Ghosting*: "Hum aapke hain koun? 🥺", "CID ACP: 'Kuch toh gadbad hai' 🔍".
  - Configurable toggle and an instant 2-second test trigger in Settings.
- **Morning Kickoff & Big Rocks**:
  - Daily morning modal to identify and pin your Top 3 daily priorities (`★ TOP PRIORITY`).
- **Evening Sunset Sweep**:
  - Clean-slate banner after 5:00 PM to sweep unfinished tasks into tomorrow or backlog with zero guilt.
- **Concurrent Task Timers & Native Haptics**:
  - Start, pause, and record multiple task timers independently.
  - Persistent sticky heads-up notification with live elapsed time.
  - Native tactile vibration patterns on completion, selection, and batch actions.
- **Batch Task Management**:
  - Multi-select tasks to batch complete, reschedule to tomorrow, or delete in one tap.

### 🧠 Personal Learning Engine (PLE)
ALIBI doesn't guess; it observes how you work and gets smarter over time:
- **Duration Learning**: Learns your actual completion velocity across task types, moving from cold-start heuristics to personalized Bayesian estimates.
- **Fatigue & Routine Modeling**: Detects when your focus degrades and identifies natural recurring work routines.
- **Peak Energy Shield**: Automatically detects your peak cognitive hours (e.g., 9:30 AM – 11:30 AM) and visually protects this block in your daily schedule from low-value interruptions.

### 🗓️ Scheduling & Optimization (Google OR-Tools)
- **Constraint Satisfaction (CP-SAT)**: Formulates your day as a mathematical optimization problem.
- **Hard vs. Soft Constraints**: Fixed events (meetings, doctor appointments) are immutable; flexible tasks are scheduled around them based on priority, energy match, and deadlines.
- **Buffer & Commute Awareness**: Automatically preserves breathing room between deep-work sessions.

### 🔍 Grounded RAG Assistant & Knowledge Vault
- **Knowledge Vault**: Write, format, and organize rich personal notes. Convert any note or raw idea directly into an actionable task in one tap.
- **FastEmbed + pgvector**: Embeds tasks, notes, and work history locally using `BAAI/bge-small-en-v1.5` (384-dimensional vectors running on CPU ONNX).
- **Grounded Assistant**: Ask questions like *"What did I accomplish on the authentication service last Tuesday?"* and receive precise answers with direct citations to database records.

### 📊 Analytics, Reports & Organization Portal
- **SQL-Grounded Analytics**: 365-day commit-style activity heatmap, time-spent breakdowns by category, and evidence-based task scoring.
- **Exportable Reports**: Generate beautiful PDF summaries (ReportLab), detailed spreadsheets (openpyxl), or CSV exports.
- **Organization Portal (Web)**: Invite team members to an organization workspace with explicit, versioned, professional-only consent. Team dashboards reflect strictly professional hours while personal activities remain completely hidden.

---

## 📦 Quick Download (Android APK)

A production-ready release APK compiled with the Hermes engine and full ABI architecture support is available directly in this repository:

| Asset | Details | Direct Download |
| :--- | :--- | :--- |
| **ALIBI-0.1.0.apk** | **Version:** `0.1.0`<br>**Engine:** Hermes Bytecode (`0x1F1903C1...`)<br>**Size:** `69.1 MB`<br>**SHA-256:** `B078B87851340E6833146442F85A727B9B98744C3E6D597F966BFBF7CD4AF6DC` | [📥 **Download ALIBI-0.1.0.apk (Raw)**](https://github.com/itripathiharsh/Alibi/raw/main/apk/ALIBI-0.1.0.apk) |

### Installing on Android
1. Download the APK directly on your phone using Chrome or your browser.
2. When prompted, tap **Download anyway** and open the file.
3. Allow **Install unknown apps** for Chrome if prompted.
4. Alternatively, install via ADB from your development terminal:
   ```bash
   adb install -r -d apk/ALIBI-0.1.0.apk
   ```

---

## 🏗️ System Architecture & Stack

```
                          ┌─────────────────────────────────────┐
                          │         CLIENT APPLICATIONS         │
                          ├──────────────────┬──────────────────┤
                          │  Android Mobile  │     Next.js      │
                          │   React Native   │    Web Portal    │
                          │   (Hermes/Expo)  │   (App Router)   │
                          └─────────┬────────┴─────────┬────────┘
                                    │                  │
                           HTTPS    │                  │  HTTPS
                         REST/JSON  │                  │  REST/JSON
                                    ▼                  ▼
                          ┌─────────────────────────────────────┐
                          │      FASTAPI MODULAR MONOLITH       │
                          │  (Auth, Tasks, Analytics, Vault)    │
                          ├──────────────────┬──────────────────┤
                          │  CP-SAT Planner  │ Grounded RAG     │
                          │ (Google OR-Tools)│ (FastEmbed ONNX) │
                          └─────────┬────────┴─────────┬────────┘
                                    │                  │
                                    ▼                  ▼
                          ┌──────────────────┬──────────────────┐
                          │  PostgreSQL 16   │ APScheduler + DB │
                          │   (+ pgvector)   │   Jobs Worker    │
                          └──────────────────┴──────────────────┘
```

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Backend** | Python 3.12, FastAPI, Pydantic v2 | High-performance asynchronous API, strict type validation, auto OpenAPI generation |
| **Database** | PostgreSQL 16 + pgvector (≥0.7) | Robust relational ACID integrity, native vector similarity search |
| **ORM & Migrations** | SQLAlchemy 2.0 (async), asyncpg, Alembic | Fully asynchronous SQL execution, forward & backward migration audits |
| **Mobile App** | React Native 0.76, Expo, Hermes, TypeScript | Cross-platform native mobile experience with fast Hermes bytecode boot |
| **Mobile Storage** | `expo-sqlite`, `expo-secure-store` | Local-first offline persistence, credentials encryption |
| **Web App** | Next.js 14/15, Tailwind CSS, Radix UI, Recharts | Server-rendered desktop dashboard, accessible components, real-time charts |
| **Client Gen** | OpenAPI TypeScript Codegen (`packages/api-client`) | End-to-end type safety between backend Pydantic models and frontend TS |
| **Optimization** | Google OR-Tools (CP-SAT) | Exact constraint programming for conflict-free schedule generation |
| **Embeddings** | `fastembed` (`BAAI/bge-small-en-v1.5`, 384-dim) | Lightweight, high-accuracy CPU vector embeddings with zero external API calls |
| **Background Work**| In-process APScheduler + PostgreSQL `jobs` table | Reliable job queuing and periodic maintenance without heavy external Redis |

---

## 📂 Repository Structure

```
ALIBI/
├── apk/                             # Compiled official Android release APKs & verify manifests
│   ├── ALIBI-0.1.0.apk              # Latest release package (~69.1 MB)
│   └── README.md                    # APK verification checksums and release notes
├── apps/
│   ├── mobile/                      # React Native + Expo Android application
│   │   ├── android/                 # Native Android Gradle configuration (Hermes enabled)
│   │   └── src/
│   │       ├── app/                 # Expo Router tabs (Home, Tasks, Calendar, Insights, Vault, Profile)
│   │       ├── components/          # Reusable UI components & modals (Kickoff, Intro, Timers)
│   │       └── lib/                 # Witty notification engine, SQLite database, audio, sync
│   └── web/                         # Next.js App Router web portal & organization dashboard
├── backend/
│   ├── alembic/                     # Database migrations with forward & rollback support
│   └── app/
│       ├── api/v1/                  # REST API routers (tasks, planner, assistant, analytics, orgs)
│       ├── core/                    # Security, JWT tokens, config, database sessions
│       ├── models/                  # SQLAlchemy ORM database models
│       ├── schemas/                 # Pydantic request/response data contracts
│       └── services/                # Business logic, PLE learning engine, OR-Tools scheduler
├── docs/                            # Complete system specifications & design contracts
│   ├── 00_INDEX.md                  # Master documentation index
│   ├── 01_PRODUCT_REQUIREMENTS.md   # Traceable product requirements (FR-*)
│   ├── 02_SYSTEM_ARCHITECTURE.md    # Architecture and module design
│   ├── 03_DATABASE_SCHEMA.md        # Relational schema & indexing
│   ├── IMPLEMENTATION_STATUS.md     # Live milestone progress tracking
│   └── DECISIONS.md                 # Architecture Decision Records (ADRs)
├── packages/
│   ├── api-client/                  # Generated TypeScript API SDK from OpenAPI
│   ├── domain-types/                # Shared cross-platform domain contracts
│   └── sync-core/                   # Shared offline sync protocol & conflict resolvers
├── AGENTS.md                        # Permanent, binding development rules and safety contract
└── docker-compose.yml               # Local multi-service development stack
```

---

## 🛠️ Getting Started

### Prerequisites
- **Docker & Docker Compose** (for PostgreSQL + pgvector and full-stack local testing)
- **Python 3.12+** & **uv** package manager
- **Node.js 20+** & **pnpm 9+**
- *(Optional for Android native builds)*: Android Studio / Android SDK, Java 17

---

### Local Development Setup

#### 1. Clone & Configure Environment
```bash
git clone https://github.com/itripathiharsh/Alibi.git
cd Alibi

# Copy the example environment file
cp .env.example .env
```

#### 2. Start PostgreSQL + pgvector
```bash
docker compose up -d postgres
```

#### 3. Setup Backend & Apply Migrations
```bash
cd backend

# Create virtual environment and sync dependencies using uv
uv sync

# Run database migrations
uv run alembic upgrade head

# Start the FastAPI server
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The interactive API documentation is now live at [http://localhost:8000/docs](http://localhost:8000/docs).

#### 4. Setup Frontend & Shared Packages
From the repository root:
```bash
# Install all node dependencies across pnpm workspaces
pnpm install

# Build shared TypeScript packages (api-client, domain-types, sync-core)
pnpm --filter @alibi/api-client build

# Start the Next.js Web App
pnpm --filter @alibi/web dev
```
The web dashboard is now accessible at [http://localhost:3000](http://localhost:3000).

#### 5. Run the Mobile App
```bash
# Start the Expo development server
pnpm --filter @alibi/mobile start
```

---

## 🧪 Testing & Quality Gates

ALIBI enforces strict testing and type safety across all layers:

```bash
# Run backend unit, integration, and grounding validator tests
cd backend
uv run pytest -v

# Run backend linter & formatting checks
uv run ruff check app tests
uv run ruff format --check app tests

# Run TypeScript checks across all frontend applications and shared packages
pnpm -r run typecheck
```

---

## 📚 Documentation Index

For in-depth architectural specifications and implementation details, refer to the `docs/` directory:

| Document | Purpose |
| :--- | :--- |
| [`docs/00_INDEX.md`](docs/00_INDEX.md) | Master documentation index and reading guide |
| [`docs/01_PRODUCT_REQUIREMENTS.md`](docs/01_PRODUCT_REQUIREMENTS.md) | Comprehensive functional requirement specifications |
| [`docs/02_SYSTEM_ARCHITECTURE.md`](docs/02_SYSTEM_ARCHITECTURE.md) | Component interactions, module boundaries, and data flow |
| [`docs/03_DATABASE_SCHEMA.md`](docs/03_DATABASE_SCHEMA.md) | PostgreSQL entity relationship diagrams, tables, and indexes |
| [`docs/07_PERSONAL_LEARNING_ENGINE.md`](docs/07_PERSONAL_LEARNING_ENGINE.md) | Bayesian duration learning, energy curves, and pattern algorithms |
| [`docs/09_SCHEDULING_ENGINE.md`](docs/09_SCHEDULING_ENGINE.md) | CP-SAT constraint satisfaction formulation |
| [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) | Live tracking of milestones and requirement coverage |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Log of Architectural Decision Records (ADRs) |

---

## 📜 Development Contract & Guarantees

Any engineer or autonomous agent working on ALIBI is bound by [`AGENTS.md`](AGENTS.md). Notable guarantees include:
- **No Mock Data in Production**: Stubs and fixtures exist exclusively in test suites.
- **Strict Grounding**: The AI is forbidden from inferring or setting deadlines not rooted in user statements.
- **No Paid Dependencies**: Zero requirement for commercial APIs or proprietary cloud infrastructure.
- **Auditable Migrations**: Every schema alteration must provide both clean `upgrade()` and tested `downgrade()` routines.

---

## 📄 Licence

Private Project. Third-party libraries and dependencies used in this project are governed by their respective permissive open-source licenses (MIT, Apache-2.0, BSD, ISC). See [`docs/DECISIONS.md`](docs/DECISIONS.md).

<p align="center">
  <sub>Built with care for focused minds. ALIBI — Your Life. Your Work. Your Intelligence.</sub>
</p>
