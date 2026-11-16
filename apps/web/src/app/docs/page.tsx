"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Box, ChevronRight, Code2, Download, FileText, Menu, Monitor, Rocket, Search, ShieldCheck, SlidersHorizontal, X, type LucideIcon } from "lucide-react";

const ANDROID_APK_URL = "https://github.com/itripathiharsh/Alibi/raw/refs/heads/main/apk/ALIBI-0.1.0.apk";

type DocItem = { title: string; summary: string; icon: LucideIcon; tone: string; detail: string[] };
const docs: DocItem[] = [
  { title: "Quick Start", summary: "Get ALIBI up and running in minutes.", icon: Rocket, tone: "orange", detail: ["Check prerequisites with the project doctor script.", "Start the local services and apply database migrations.", "Create the owner account, then open the web app or connect Android."] },
  { title: "User Guide", summary: "Learn features, workflows and best practices.", icon: BookOpen, tone: "blue", detail: ["Capture tasks, review extracted details and organize your work.", "Build a plan around fixed events, then approve the changes you want.", "Use your dashboard and reports to understand recorded work."] },
  { title: "Architecture", summary: "System design, components and data flow.", icon: Box, tone: "purple", detail: ["FastAPI backend with PostgreSQL persistence and modular services.", "Next.js web dashboard and React Native Android client.", "Shared TypeScript packages keep domain types and sync rules aligned."] },
  { title: "API Reference", summary: "Backend APIs, examples and usage.", icon: Code2, tone: "green", detail: ["Versioned REST endpoints under /api/v1.", "JSON request and response bodies with documented error formats.", "OpenAPI is the source for the generated TypeScript client."] },
  { title: "Configuration", summary: "Environment setup, models and integrations.", icon: SlidersHorizontal, tone: "orange", detail: ["Use the environment template for local setup; keep secrets out of source control.", "External AI providers are optional and disabled by default.", "Choose local or hosted mode using documented deployment settings."] },
  { title: "Privacy & Security", summary: "Data, storage and privacy-first design.", icon: ShieldCheck, tone: "blue", detail: ["ALIBI is designed for a single owner and private use by default.", "Provider credentials are write-only through settings and encrypted at rest.", "Shared reports default to professional scope; other classes require explicit choice."] },
];
const allDocs = [
  "Product Requirements", "System Architecture", "Database Schema", "API Specification",
  "UI/UX Guidelines", "AI Provider Architecture", "Personal Learning Engine",
  "RAG & Knowledge Vault", "Scheduling Engine", "Analytics & Reports", "Offline & Sync",
  "Security & Privacy", "Deployment & Infrastructure", "Testing & Acceptance",
  "Implementation Roadmap", "Requirements Traceability",
];
const allDetails: Record<string, string[]> = {
  "Product Requirements": ["Defines product scope and testable requirement IDs.", "Includes v1 boundaries and release success criteria."],
  "System Architecture": ["Describes module boundaries and data flow.", "Explains how web, Android, shared packages and backend fit together."],
  "Database Schema": ["Defines tables, columns, constraints and indexes.", "Schema changes are tracked through Alembic migrations."],
  "API Specification": ["Defines versioned HTTP endpoints, payloads and error responses.", "OpenAPI generates the shared TypeScript client."],
  "UI/UX Guidelines": ["Defines navigation, capture flows, screen states, visual tokens and accessibility.", "Web is a dashboard; Android supports offline task work."],
  "AI Provider Architecture": ["Defines provider routing, privacy filters, grounding and validation.", "External AI is opt-in and off by default."],
  "Personal Learning Engine": ["Defines learning signals, maturity levels and evaluation.", "Patterns use recorded observations and visible confidence."],
  "RAG & Knowledge Vault": ["Defines ingestion, retrieval and grounded assistant responses.", "Answers cite records and derive numbers from SQL results."],
  "Scheduling Engine": ["Defines schedule constraints, proposals and approval behavior.", "Fixed events and accepted blocks are protected."],
  "Analytics & Reports": ["Defines metric formulas, report facts and sharing rules.", "Numbers come from database records."],
  "Offline & Sync": ["Defines Android outbox, cursors, conflicts and merge rules.", "Human review is required for unresolved conflicts."],
  "Security & Privacy": ["Defines authentication, encryption, privacy controls and threat model.", "Personal data is private by default."],
  "Deployment & Infrastructure": ["Documents local development and hosted deployment.", "Includes backup and restore procedures."],
  "Testing & Acceptance": ["Defines unit, API, integration, accessibility and release gates.", "Feature completion needs passing evidence."],
  "Implementation Roadmap": ["Tracks milestones M0 through M12 and acceptance gates.", "Current release status is maintained separately."],
  "Requirements Traceability": ["Maps requirement IDs to milestones and tests.", "Used to audit release coverage."],
};

export default function DocsPage() {
  const [query, setQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<{ title: string; detail: string[] } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = docs.filter((item) => (item.title + " " + item.summary).toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        if (selectedDoc) setSelectedDoc(null);
        else if (query) setQuery("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [query, selectedDoc]);

  const closeMenu = () => setMenuOpen(false);
  const openAllDoc = (title: string) => setSelectedDoc({ title, detail: allDetails[title] ?? ["Project reference documentation for the ALIBI system."] });

  return <div className="docs-page">
    <header className="landing-header docs-header">
      <Link href="/" className="brand" aria-label="ALIBI home"><img src="/logo-site.png" alt="ALIBI" /></Link>
      <nav className={"landing-nav " + (menuOpen ? "open" : "")} aria-label="Main navigation">
        <Link href="/" onClick={closeMenu}>Home</Link><Link href="/features" onClick={closeMenu}>Features</Link><Link href="/how-it-works" onClick={closeMenu}>How it Works</Link><Link href="/why-alibi" onClick={closeMenu}>Why ALIBI</Link><Link href="/docs" className="docs-active" onClick={closeMenu}>Docs</Link>
        <div className="mobile-nav-actions"><Link href="/login" className="nav-download" onClick={closeMenu}><Monitor size={17} /> Open ALIBI</Link><a href={ANDROID_APK_URL} className="nav-download nav-android" download="ALIBI-0.1.0.apk" onClick={closeMenu}><Download size={17} /> Download Android</a><Link href="/login" className="nav-start" onClick={closeMenu}>Get Started</Link></div>
      </nav>
      <div className="header-actions"><Link href="/login" className="nav-download"><Monitor size={17} /> Open ALIBI</Link><a href={ANDROID_APK_URL} className="nav-download nav-android" download="ALIBI-0.1.0.apk"><Download size={17} /> Download Android</a><Link href="/login" className="nav-start">Get Started</Link></div>
      <button className="docs-menu" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
    </header>

    <main className="docs-main">
      <section className="docs-hero">
        <div className="docs-hero-copy"><span className="docs-pill">Documentation</span><h1>ALIBI <em>Documentation</em></h1><p>Everything you need to understand, set up and make the most of ALIBI — from quick start to advanced configuration.</p>
          <label className="docs-search"><Search size={24} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documentation..." aria-label="Search documentation" /><kbd>Ctrl + K</kbd>{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>}</label>
        </div>
        <div className="docs-art" aria-label="Code-built documentation illustration">
          <div className="docs-art-glow" />
          <div className="docs-terminal"><div className="terminal-top"><i /><i /><i /></div><Code2 size={31} /><span /><span /><span /><span /><span /></div>
          <div className="docs-browser"><div className="browser-dots"><i /><i /><i /></div><div className="browser-layout"><div className="browser-sidebar"><b><img src="/icon.png" alt="" /> ALIBI</b><i /><i /><i /><i /><i /></div><div className="browser-document"><div className="browser-rule" /><small>GETTING STARTED</small><b>Build a clearer day.</b><span /><span /><span /><div className="browser-code"><i>$</i> make up</div></div></div></div>
        </div>
      </section>

      <section className="docs-browse" id="browse-docs"><div className="docs-section-title"><div><span /><h2>{query ? "Search Results" : "Browse Documentation"}</h2></div><button onClick={() => setShowAll(!showAll)}>{showAll ? "Hide All Docs" : "View All Docs"} <ArrowRight size={19} /></button></div>
        <div className="docs-card-grid">{filtered.map((item) => { const Icon = item.icon; return <button className="docs-card" key={item.title} onClick={() => setSelectedDoc(item)}><span className={"docs-card-icon " + item.tone}><Icon size={31} strokeWidth={1.8} /></span><span className="docs-card-copy"><b>{item.title}</b><small>{item.summary}</small></span><ChevronRight size={20} /></button>; })}</div>
        {query && filtered.length === 0 && <p className="docs-empty">No matching guides. Try a broader search.</p>}
        {showAll && <div className="all-docs-panel"><h3>All project documentation</h3><div>{allDocs.map((title) => <button key={title} onClick={() => openAllDoc(title)}><FileText size={17} />{title}<ArrowUpRight size={15} /></button>)}</div></div>}
      </section>

      <section className="docs-status"><FileText size={53} strokeWidth={1.6} /><div><b>Implementation Status</b><span>v1.0.0 release complete · Milestones M0–M12</span></div><Link href="/docs#status">View Implementation Status <ArrowUpRight size={19} /></Link></section>
      <section className="status-details" id="status"><span className="docs-pill">Project Status</span><h2>ALIBI v1.0.0 is released.</h2><p>The implementation status records all milestones M0–M12 as complete and 124 of 124 requirements verified. See the project documentation for acceptance evidence and release reports.</p></section>
    </main>

    {selectedDoc && <div className="docs-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDoc(null); }}><section className="docs-modal" role="dialog" aria-modal="true" aria-labelledby="doc-modal-title"><button className="docs-modal-close" aria-label="Close documentation preview" onClick={() => setSelectedDoc(null)}><X size={20} /></button><span className="docs-pill">ALIBI Documentation</span><h2 id="doc-modal-title">{selectedDoc.title}</h2><ul>{selectedDoc.detail.map((line) => <li key={line}>{line}</li>)}</ul><p className="docs-modal-note">This overview is based on the ALIBI project documentation.</p><Link className="docs-modal-cta" href="/login" onClick={() => setSelectedDoc(null)}>Open ALIBI <ArrowRight size={17} /></Link></section></div>}
  </div>;
}

