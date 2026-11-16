"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Activity, ArrowRight, BarChart3, Brain, CalendarDays, Check,
  ChevronRight, CirclePlay, Home, Layers3, Leaf, LockKeyhole, Menu,
  Mic, Monitor, Shield, Sparkles, WifiOff, X,
} from "lucide-react";

const steps = [
  { icon: Mic, title: "Capture", text: "Add tasks by text or voice. ALIBI helps extract key details for you to review.", color: "orange" },
  { icon: Layers3, title: "Organize", text: "Auto-tag, prioritize and structure your work and life in one place.", color: "blue" },
  { icon: CalendarDays, title: "Schedule", text: "Get a proposed plan around your events, available time and priorities.", color: "orange" },
  { icon: CirclePlay, title: "Execute", text: "Focus, track time and keep your tasks moving at your own pace.", color: "purple" },
  { icon: Brain, title: "Learn", text: "ALIBI learns from your recorded patterns, durations and preferences.", color: "green" },
  { icon: BarChart3, title: "Analyze", text: "See grounded insights, reports and real progress over time.", color: "blue" },
];

const stories = [
  { title: "Start with what’s on your mind", body: "Capture a task in plain language or by voice. ALIBI keeps your original words and shows the details it understood for you to review.", points: ["Text or voice capture", "Review before details are applied", "Deadlines stay grounded in what you said"] },
  { title: "A clearer place for all your work", body: "Keep personal, academic and professional tasks organized with categories, projects and priorities that make sense to you.", points: ["One view across your responsibilities", "Find tasks with search and filters", "Keep sharing classes distinct"] },
  { title: "Plans that respect your day", body: "ALIBI can propose work blocks around fixed events and available time. You decide which suggestions to accept.", points: ["Fixed events stay fixed", "See why a block was suggested", "Nothing changes until you approve it"] },
  { title: "Make progress, one task at a time", body: "Move through your day with task lists, time tracking and a history that reflects the work you actually record.", points: ["Track time when you choose", "See what’s next at a glance", "Your task history stays factual"] },
  { title: "A system that learns and adapts", body: "Over time, ALIBI understands how you work — your focus hours, task durations and routines — and can offer more relevant plans and estimates.", points: ["Learns from your recorded work", "Shows confidence with patterns", "You can review and manage what it learns"] },
  { title: "Progress you can understand", body: "Explore dashboards and reports built from your records, with clear formulas and real data behind every metric.", points: ["Insights calculated from your records", "Choose a period to explore", "Share professional reports with control"] },
];

const previewTasks = ["Review today’s priorities", "Make room for focused work", "Reflect on the week"];

function PhonePreview() {
  const [day, setDay] = useState("Tue");
  const [checked, setChecked] = useState<number[]>([]);
  const [period, setPeriod] = useState("Week");
  const toggleTask = (index: number) => setChecked((current) =>
    current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
  );

  return (
    <div className="how-phone-art" aria-label="Interactive ALIBI phone preview">
      <div className="how-phone-glow" />
      <div className="how-phone how-phone-back">
        <div className="how-phone-island" /><div className="how-screen">
          <div className="how-status"><b>9:41</b><span>••• ◖</span></div>
          <p className="how-phone-overline">YOUR PATTERNS</p><h3 className="how-insight-title">Insights</h3>
          <div className="how-period" role="group" aria-label="Select insight period">{["Week", "Month", "Year"].map((value) => <button key={value} onClick={() => setPeriod(value)} className={period === value ? "selected" : ""}>{value}</button>)}</div>
          <div className="how-chart" aria-label="Illustrative activity preview"><span /><span /><span /><span /><span /><span /><span /></div>
          <div className="how-phone-card"><small>A pattern to explore</small><b>Make space for deep work</b><span>Based on your records</span></div>
          <div className="how-phone-tabs"><span>Today</span><span>Tasks</span><b>Insights</b></div>
        </div>
      </div>
      <div className="how-phone how-phone-front">
        <div className="how-phone-island" /><div className="how-screen">
          <div className="how-status"><b>9:41</b><span>••• ◖</span></div>
          <div className="how-greeting"><div><small>YOUR DAY, IN VIEW</small><b>Good afternoon <i>✦</i></b><span>Here’s your day at a glance.</span></div><button aria-label="Notifications"><span /></button></div>
          <div className="how-days" role="group" aria-label="Select a day">{["Mon", "Tue", "Wed", "Thu", "Fri"].map((value, index) => <button key={value} onClick={() => setDay(value)} className={day === value ? "selected" : ""}><span>{value}</span><b>{16 + index}</b></button>)}</div>
          <div className="how-summary"><div className="how-ring"><b>Your day</b><small>at a glance</small></div><div><span><i className="green" />Completed</span><span><i className="navy" />In progress</span><span><i className="orange" />Up next</span></div></div>
          <div className="how-plan"><div className="how-plan-title"><b>Today’s plan</b><span>{checked.length === 0 ? "A plan that can flex" : "You’re making progress"}</span></div>
            {previewTasks.map((task, index) => <button key={task} onClick={() => toggleTask(index)} className={checked.includes(index) ? "done" : ""}><i>{checked.includes(index) && <Check size={10} />}</i><span><b>{task}</b><small>{index === 0 ? "Professional" : index === 1 ? "Planning" : "Personal"}</small></span><em className={"mark mark-" + index} /></button>)}
          </div>
          <div className="how-phone-tabs"><b><Home size={13} />Home</b><span><CalendarDays size={13} />Plan</span><span><BarChart3 size={13} />Insights</span><span><LockKeyhole size={13} />Vault</span></div>
        </div>
      </div>
      <span className="how-phone-label"><Activity size={13} /> Interactive product preview</span>
    </div>
  );
}

export default function HowItWorksPage() {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const storyIndex = activeStep ?? 4;
  const story = stories[storyIndex];
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="how-page">
      <header className="landing-header how-header">
        <Link href="/" className="brand" aria-label="ALIBI home"><img src="/logo-site.png" alt="ALIBI" /></Link>
        <nav className={"landing-nav " + (menuOpen ? "open" : "")} aria-label="Main navigation">
          <Link href="/" onClick={closeMenu}>Home</Link>
          <Link href="/features" onClick={closeMenu}>Features</Link>
          <Link href="/how-it-works" className="how-active" onClick={closeMenu}>How it Works</Link>
          <Link href="/#why-alibi" onClick={closeMenu}>Why ALIBI</Link>
          <Link href="/#docs" onClick={closeMenu}>Docs</Link>
          <div className="mobile-nav-actions"><Link href="/login" className="nav-download" onClick={closeMenu}><Monitor size={17} /> Open ALIBI</Link><Link href="/login" className="nav-start" onClick={closeMenu}>Get Started</Link></div>
        </nav>
        <div className="header-actions"><Link href="/login" className="nav-download"><Monitor size={17} /> Open ALIBI</Link><Link href="/login" className="nav-start">Get Started</Link></div>
        <button className="menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </header>

      <main className="how-main">
        <section className="how-intro"><span className="how-pill">How it Works</span><h1>From an Idea to <em>Real Progress</em></h1><p>A simple, intelligent workflow that turns your thoughts into a planned, productive and<br className="desktop-break" /> measurable day — with your full <b>control.</b></p></section>

        <section className="how-steps" aria-label="ALIBI workflow">
          {steps.map(({ icon: Icon, title, text, color }, index) => (
            <button key={title} className={"how-step " + color + (activeStep === index ? " is-active" : "")} onClick={() => setActiveStep(index)} aria-pressed={activeStep === index}>
              <span className="how-step-number">{index + 1}</span><span className="how-step-icon"><Icon size={35} strokeWidth={1.8} /></span><b>{title}</b><span className="how-step-text">{text}</span>
            </button>
          ))}
        </section>

        <section className="how-story">
          <PhonePreview />
          <div className="how-story-copy" key={storyIndex}>
            <div className="story-eyebrow"><span><Brain size={22} /></span><small>The intelligence behind ALIBI</small></div>
            <h2>{story.title}</h2><p>{story.body}</p>
            <div className="story-points">{story.points.map((point, index) => <div key={point}><span>{index === 0 ? <ZapIcon /> : index === 1 ? <CirclePlay size={23} /> : <Shield size={23} />}</span><b>{index === 0 ? "Learns Your Pattern" : index === 1 ? "Plans Smarter" : "Stays Private"}</b><small>{point}</small></div>)}</div>
          </div>
        </section>

        <section className="how-summary-bar"><div className="how-short"><Sparkles size={25} /><b>In Short</b></div><p>You <em>capture</em> what you want to do.</p><p>ALIBI <em>organizes</em> and plans it.</p><p>You <em>execute</em> and track.</p><p>It <em>learns</em> from you.</p><p>And you get clear <em>insights.</em></p></section>
      </main>
    </div>
  );
}

function ZapIcon() {
  return <Activity size={23} />;
}
