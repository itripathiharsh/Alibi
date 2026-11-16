"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BarChart3, Brain, CalendarDays, Check, ChevronRight, Download, Layers3, Menu,
  Leaf, LockKeyhole, Mic, MessageSquare, MonitorSmartphone, Plus,
  ShieldCheck, WifiOff, X, type LucideIcon,
} from "lucide-react";

const ANDROID_APK_URL = "https://github.com/itripathiharsh/Alibi/raw/refs/heads/main/apk/ALIBI-0.1.0.apk";

type FeatureItem = { icon: LucideIcon; tone: string; title: string; body: string };
const leftFeatures: FeatureItem[] = [
  { icon: Mic, tone: "orange", title: "Smart Capture", body: "Add tasks by text or voice. ALIBI helps structure what you said for your review." },
  { icon: Layers3, tone: "blue", title: "Organize Your Work", body: "Auto-tag, prioritize and structure your personal and professional tasks." },
  { icon: CalendarDays, tone: "orange", title: "Intelligent Scheduling", body: "Get a plan around your fixed events. Review every proposal and stay in control." },
  { icon: BarChart3, tone: "purple", title: "Execute & Track", body: "Stay focused, track time, and see your work clearly over time." },
];
const rightFeatures: FeatureItem[] = [
  { icon: Brain, tone: "purple", title: "Personal Learning Engine", body: "Learns from your recorded work patterns, task durations and routines." },
  { icon: MessageSquare, tone: "green", title: "RAG Assistant", body: "Ask about your work and get answers grounded in your actual records." },
  { icon: BarChart3, tone: "blue", title: "Reports & Analytics", body: "Explore factual insights and create professional reports from your data." },
  { icon: LockKeyhole, tone: "orange", title: "Private & Local-First", body: "Work offline on Android. Keep control of your data, with optional sync." },
];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const tasks = ["Review today’s priorities", "Make room for focused work", "Reflect on the week"];

function FeatureCard({ feature, active, onSelect }: {
  feature: FeatureItem;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = feature.icon;
  return (
    <button className={"feature-card " + (active ? "active" : "")} onClick={onSelect} aria-pressed={active}>
      <span className={"feature-icon " + feature.tone}><Icon size={27} strokeWidth={1.8} /></span>
      <span className="feature-copy"><b>{feature.title}</b><span>{feature.body}</span></span>
      <ChevronRight className="feature-chevron" size={20} />
    </button>
  );
}

function ProductPhone({ activeFeature }: { activeFeature: string | null }) {
  const [day, setDay] = useState("Tue");
  const [checked, setChecked] = useState<number[]>([]);
  const [showCapture, setShowCapture] = useState(false);
  const [tab, setTab] = useState("Home");
  const toggleTask = (index: number) => setChecked((current) =>
    current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
  );

  return (
    <div className="feature-phone-wrap">
      <div className="feature-phone-halo" />
      <div className="feature-phone" aria-label="Interactive ALIBI mobile preview">
        <div className="feature-phone-island" />
        <div className="feature-phone-screen">
          <div className="feature-phone-status"><b>9:41</b><span>••• ◖</span></div>
          <div className="feature-phone-greeting"><div><b>Good afternoon</b><span>Here’s your day at a glance.</span></div><button aria-label="Notifications"><span /></button></div>
          <div className="feature-phone-days" role="group" aria-label="Choose a day">
            {days.map((item, index) => <button key={item} className={day === item ? "selected" : ""} onClick={() => setDay(item)}><span>{item}</span><b>{16 + index}</b></button>)}
          </div>
          <div className="feature-phone-summary">
            <div className="feature-phone-ring"><span>Today</span><small>at a glance</small></div>
            <div className="feature-phone-status-list"><span><i className="green" />Completed</span><span><i className="navy" />In progress</span><span><i className="orange" />Up next</span></div>
          </div>
          <div className="feature-phone-plan"><div className="plan-title"><div><b>{activeFeature || "Today’s Plan"}</b><span>{checked.length === 0 ? "A plan that can flex with you" : "Your plan is taking shape"}</span></div><button aria-label="Capture a task" onClick={() => setShowCapture(!showCapture)}><Plus size={18} /></button></div>
            {showCapture && <div className="capture-hint"><Mic size={13} /> Add a thought or task</div>}
            <div className="feature-phone-tasks">{tasks.map((task, index) => <button key={task} onClick={() => toggleTask(index)} className={checked.includes(index) ? "done" : ""}><span className="task-box">{checked.includes(index) && <Check size={12} />}</span><span className="task-label"><b>{task}</b><small>{index === 0 ? "Professional" : index === 1 ? "Planning" : "Personal"}</small></span><i className={"task-dot dot-" + index} /></button>)}</div>
          </div>
          <div className="feature-phone-tabs" role="tablist" aria-label="Phone preview sections">{["Home", "Plan", "Insights", "Vault"].map((item, index) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}><span>{index === 0 ? "⌂" : index === 1 ? "▦" : index === 2 ? "▥" : "♙"}</span>{item}</button>)}</div>
        </div>
      </div>
      <span className="phone-preview-note">Interactive product preview</span>
    </div>
  );
}

export default function FeaturesPage() {
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectFeature = (title: string) => setActiveFeature((current) => current === title ? null : title);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="feature-page">
      <header className="landing-header feature-header">
        <Link href="/" className="brand" aria-label="ALIBI home"><img src="/logo-site.png" alt="ALIBI" /></Link>
        <nav className={"landing-nav " + (menuOpen ? "open" : "")} aria-label="Main navigation">
          <Link href="/" onClick={closeMenu}>Home</Link>
          <Link href="/features" className="feature-active" onClick={closeMenu}>Features</Link>
          <Link href="/how-it-works" onClick={closeMenu}>How it Works</Link>
          <Link href="/why-alibi" onClick={closeMenu}>Why ALIBI</Link>
          <Link href="/docs" onClick={closeMenu}>Docs</Link>
          <div className="mobile-nav-actions"><Link href="/login" className="nav-download" onClick={closeMenu}><MonitorSmartphone size={17} /> Open ALIBI</Link><a href={ANDROID_APK_URL} className="nav-download nav-android" download="ALIBI-0.1.0.apk" onClick={closeMenu}><Download size={17} /> Download Android</a><Link href="/login" className="nav-start" onClick={closeMenu}>Get Started</Link></div>
        </nav>
        <div className="header-actions"><Link href="/login" className="nav-download"><MonitorSmartphone size={17} /> Open ALIBI</Link><a href={ANDROID_APK_URL} className="nav-download nav-android" download="ALIBI-0.1.0.apk"><Download size={17} /> Download Android</a><Link href="/login" className="nav-start">Get Started</Link></div>
        <button className="menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </header>

      <main className="feature-main">
        <section className="feature-intro"><span className="feature-pill">Features</span>
          <h1>A Complete <em>Productivity &amp; Work Intelligence</em> System</h1>
          <p>Everything you need to plan, execute, learn and grow — <b>in one private, intelligent space.</b></p>
        </section>

        <section className="feature-showcase" aria-label="ALIBI features">
          <div className="feature-column">{leftFeatures.map((feature) => <FeatureCard key={feature.title} feature={feature} active={activeFeature === feature.title} onSelect={() => selectFeature(feature.title)} />)}</div>
          <ProductPhone activeFeature={activeFeature} />
          <div className="feature-column">{rightFeatures.map((feature) => <FeatureCard key={feature.title} feature={feature} active={activeFeature === feature.title} onSelect={() => selectFeature(feature.title)} />)}</div>
        </section>

        <section className="feature-benefits" aria-label="ALIBI benefits">
          <div><WifiOff /><span><b>Offline Ready</b><small>Works without internet</small></span></div>
          <div><MonitorSmartphone /><span><b>Multi-Platform</b><small>Android and Web</small></span></div>
          <div><ShieldCheck /><span><b>Privacy First</b><small>Your data, your control</small></span></div>
          <div><Leaf /><span><b>No Paid Lock-ins</b><small>No required cloud AI</small></span></div>
        </section>
        <div className="feature-bottom-cta"><span>See how ALIBI fits your day.</span><Link href="/login">Get Started <ChevronRight size={17} /></Link></div>
      </main>
    </div>
  );
}



