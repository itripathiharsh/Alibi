"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BarChart3, CalendarDays, Check, ChevronRight, CirclePlay, Download, Folder, Layers3, LockKeyhole, Menu, Mic, Monitor, Shield, Smartphone, Sparkles, WifiOff, X, Zap } from "lucide-react";

const ANDROID_APK_URL = "https://github.com/itripathiharsh/Alibi/raw/refs/heads/main/apk/ALIBI-0.1.0.apk";

const workflow = [
  { icon: Mic, title: "Capture", detail: "Tasks by text or voice" },
  { icon: Folder, title: "Organize", detail: "Auto-tag, prioritize & plan" },
  { icon: CalendarDays, title: "Schedule", detail: "AI-assisted, your control" },
  { icon: CirclePlay, title: "Execute", detail: "Stay on track, do more" },
  { icon: Sparkles, title: "Learn", detail: "Adapts to your patterns" },
  { icon: BarChart3, title: "Analyze", detail: "Insights from your work" },
];
const previewTasks = [
  { title: "Review today’s priorities", meta: "Professional", color: "orange" },
  { title: "Make room for focused work", meta: "Planning", color: "green" },
  { title: "Reflect on the week", meta: "Personal", color: "blue" },
];

function ProductPhones() {
  const [selectedDay, setSelectedDay] = useState("Tue");
  const [checked, setChecked] = useState<number[]>([]);
  const [period, setPeriod] = useState("Week");
  const toggleTask = (index: number) => setChecked((current) =>
    current.includes(index) ? current.filter((task) => task !== index) : [...current, index],
  );
  return (
    <div className="phone-stage" aria-label="Interactive preview of ALIBI on mobile">
      <div className="phone-glow phone-glow-one" /><div className="phone-glow phone-glow-two" />
      <div className="phone-device phone-insights" aria-label="Insights preview">
        <div className="phone-island" /><div className="phone-screen">
          <div className="phone-status"><span>9:41</span><span>••• ◖</span></div>
          <p className="phone-kicker">YOUR PATTERNS</p><h3 className="phone-title italic">Insights</h3>
          <div className="period-switch" role="group" aria-label="Choose insight period">
            {["Week", "Month", "Year"].map((item) => <button key={item} onClick={() => setPeriod(item)} className={period === item ? "selected" : ""}>{item}</button>)}
          </div>
          <div className="chart-card"><div className="chart-bars" aria-hidden="true"><i className="bar b1" /><i className="bar b2" /><i className="bar b3" /><i className="bar b4" /><i className="bar b5" /><i className="bar b6" /><i className="bar b7" /></div>
            <div className="chart-caption"><span>Focus rhythm</span><span className="trend-pill">At a glance</span></div></div>
          <div className="insight-card"><span className="phone-muted">A pattern to explore</span><strong>Make space for deep work</strong><span className="insight-line"><i />Your week, seen clearly</span></div>
          <div className="insight-card small"><span className="phone-muted">Your data</span><strong>Private by default</strong><LockKeyhole size={15} /></div>
          <div className="phone-tabbar"><span>Today</span><span>Tasks</span><b>Insights</b></div>
        </div>
      </div>
      <div className="phone-device phone-main" aria-label="Interactive preview of an ALIBI daily plan">
        <div className="phone-island" /><div className="phone-screen">
          <div className="phone-status"><span>9:41</span><span>••• ◖</span></div>
          <div className="phone-greeting"><div><span className="phone-muted">YOUR DAY, IN VIEW</span><h3>Good afternoon <span>✦</span></h3></div><button aria-label="Notifications"><span className="notification-dot" /></button></div>
          <p className="phone-subtitle">A little clarity goes a long way.</p>
          <div className="day-picker" role="group" aria-label="Select a day">
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, index) => <button key={day} onClick={() => setSelectedDay(day)} className={selectedDay === day ? "selected" : ""}><span>{day}</span><b>{16 + index}</b></button>)}
          </div>
          <div className="progress-card"><div className="progress-ring"><div><strong>{checked.length === 0 ? "Today" : "In flow"}</strong><span>your pace</span></div></div><div className="progress-list"><span><i className="dot green" />Completed</span><span><i className="dot navy" />In progress</span><span><i className="dot orange" />Up next</span></div></div>
          <div className="focus-heading"><div><b>Today’s focus</b><span>A plan that can flex with you</span></div><button aria-label="View all tasks"><ChevronRight size={18} /></button></div>
          <div className="task-list">{previewTasks.map((task, index) => <button key={task.title} onClick={() => toggleTask(index)} className={"preview-task " + (checked.includes(index) ? "is-checked" : "")}><span className="task-check">{checked.includes(index) && <Check size={12} />}</span><span className="task-copy"><b>{task.title}</b><small>{task.meta}</small></span><i className={"task-indicator " + task.color} /></button>)}</div>
          <div className="phone-tabbar"><b>Today</b><span>Tasks</span><span>Insights</span></div>
        </div>
      </div>
      <div className="preview-label"><span className="preview-pulse" /> Interactive product preview</div>
    </div>
  );
}

function AndroidDownload() {
  const [selectedDay, setSelectedDay] = useState("Tue");
  const [done, setDone] = useState<number[]>([]);
  const toggleTask = (index: number) => setDone((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  const tasks = ["Review today’s priorities", "Make room for focused work", "Reflect on the week"];
  return <section className="android-download-section" id="android-download" aria-labelledby="android-download-title">
    <div className="android-download-copy">
      <span className="android-download-eyebrow"><Smartphone size={15} /> ALIBI FOR ANDROID</span>
      <h2 id="android-download-title">A clearer day,<br /><em>wherever you are.</em></h2>
      <p>Capture thoughts, shape your plan and keep moving—even when you’re offline. Your work stays yours, with every important choice in your hands.</p>
      <div className="android-download-actions">
        <a href={ANDROID_APK_URL} className="android-download-button" download="ALIBI-0.1.0.apk"><Download size={18} /> Download Android APK <ArrowRight size={17} /></a>
        <Link href="/login" className="android-open-link"><Monitor size={17} /> Open ALIBI on desktop</Link>
      </div>
      <div className="android-download-notes"><span><WifiOff size={15} /> Works offline</span><i /><span><LockKeyhole size={15} /> Private by default</span></div>
    </div>
    <div className="android-download-art" aria-label="Interactive 3D preview of the ALIBI Android app">
      <div className="android-art-orbit orbit-one" /><div className="android-art-orbit orbit-two" />
      <div className="android-float-card"><span className="android-card-dot" />YOUR DAY, IN VIEW <b>Make room for focus</b></div>
      <div className="android-render-phone"><div className="android-render-buttons" /><div className="android-render-frame"><div className="android-render-island" /><div className="android-render-screen">
        <div className="android-render-status"><span>9:41</span><span>••• ◖</span></div>
        <small className="android-render-overline">YOUR DAY, IN VIEW</small><h3>Good afternoon <i>✦</i></h3><p>A little clarity goes a long way.</p>
        <div className="android-render-days" role="group" aria-label="Preview day selector">{["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, index) => <button key={day} className={selectedDay === day ? "selected" : ""} onClick={() => setSelectedDay(day)}><span>{day}</span><b>{16 + index}</b></button>)}</div>
        <div className="android-render-plan"><div className="android-render-plan-head"><b>Today’s focus</b><span>Take it one step at a time</span></div>{tasks.map((task, index) => <button key={task} className={done.includes(index) ? "checked" : ""} onClick={() => toggleTask(index)}><i>{done.includes(index) ? <Check size={11} /> : null}</i><span><b>{task}</b><small>{["Professional", "Planning", "Personal"][index]}</small></span><em className={"task-dot dot-" + index} /></button>)}</div>
        <div className="android-render-tabbar"><b>Today</b><span>Plan</span><span>Insights</span></div>
      </div></div></div>
      <span className="android-art-caption"><span /> A small preview of your day</span>
    </div>
  </section>;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <div className="landing">
      <header className="landing-header">
        <Link href="/" className="brand" aria-label="ALIBI home"><img src="/logo-site.png" alt="ALIBI" /></Link>
        <nav className={"landing-nav " + (menuOpen ? "open" : "")} aria-label="Main navigation">
          <Link href="/features" onClick={closeMenu}>Features</Link><Link href="/how-it-works" onClick={closeMenu}>How it Works</Link><Link href="/why-alibi" onClick={closeMenu}>Why ALIBI</Link><Link href="/docs" onClick={closeMenu}>Docs</Link>
          <div className="mobile-nav-actions"><Link href="/login" className="nav-download" onClick={closeMenu}><Monitor size={17} /> Open ALIBI</Link><a href={ANDROID_APK_URL} className="nav-download nav-android" download="ALIBI-0.1.0.apk" onClick={closeMenu}><Download size={17} /> Download Android</a><Link href="/login" className="nav-start" onClick={closeMenu}>Get Started</Link></div>
        </nav>
        <div className="header-actions"><Link href="/login" className="nav-download"><Monitor size={17} /> Open ALIBI</Link><a href={ANDROID_APK_URL} className="nav-download nav-android" download="ALIBI-0.1.0.apk"><Download size={17} /> Download Android</a><Link href="/login" className="nav-start">Get Started</Link></div>
        <button className="menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </header>
      <main id="top">
        <section className="hero-section">
          <div className="hero-copy"><span className="eyebrow">PERSONAL PRODUCTIVITY, WITH PERSPECTIVE</span>
            <h1>Your Life. Your Work.<br />Your <em>Intelligence.</em></h1>
            <p className="hero-description">A personal productivity and adaptive planning system that helps you capture, organize, schedule, execute, learn and grow — all in one place.</p>
            <div className="benefit-row"><span><Zap />Plan smarter</span><span><BarChart3 />Track progress</span><span><Layers3 />Learn & adapt</span><span><LockKeyhole />Private by default</span></div>
            <div className="hero-actions"><Link href="/login" className="button-primary">Get Started Free <ArrowRight size={20} /></Link><Link href="/how-it-works" className="button-secondary"><CirclePlay size={21} /> See How it Works</Link></div>
            <div className="platform-row"><span><span className="android-mark">A</span> Android</span><span><Monitor /> Web</span><span><WifiOff /> Works offline</span><span><Shield /> Local & private</span></div>
          </div>
          <ProductPhones />
        </section>
        <section id="how-it-works" className="workflow-strip" aria-label="The ALIBI workflow">
          {workflow.map(({ icon: Icon, title, detail }) => <a href="#features" className="workflow-step" key={title}><Icon className="workflow-icon" strokeWidth={1.8} /><b>{title}</b><span>{detail}</span></a>)}
        </section>
        <AndroidDownload />
        <section id="features" className="below-fold-section"><div className="section-heading"><span className="eyebrow">A calmer way to move forward</span><h2>Everything connected.<br /><em>Nothing made up.</em></h2><p>ALIBI brings your tasks, time, plans and patterns together, while keeping every important decision in your hands.</p></div>
          <div className="feature-grid">
            <article className="feature-card"><div className="feature-icon orange"><Mic /></div><h3>Capture what matters</h3><p>Start with a thought, a task or a voice note. Review what ALIBI understood before it updates your plan.</p><a href="#how-it-works">Explore task capture <ArrowRight size={16} /></a></article>
            <article className="feature-card"><div className="feature-icon blue"><CalendarDays /></div><h3>Plan around real life</h3><p>See your commitments and get schedule proposals you can review and accept on your terms.</p><a href="#how-it-works">Explore adaptive planning <ArrowRight size={16} /></a></article>
            <article className="feature-card"><div className="feature-icon green"><BarChart3 /></div><h3>Learn from your work</h3><p>Understand your own history with transparent insights based on the records you create.</p><a href="#why-alibi">Explore work insights <ArrowRight size={16} /></a></article>
          </div>
        </section>
        <section id="why-alibi" className="privacy-band"><div className="privacy-icon"><LockKeyhole /></div><div><span className="eyebrow">Your life stays yours</span><h2>Private by design.<br /><em>Useful by understanding.</em></h2><p>ALIBI is built around personal control. Your plans remain proposals until you choose what to accept, and your data stays private by default.</p></div><Link href="/login" className="button-secondary">Get started <ArrowRight size={18} /></Link></section>
        <section id="docs" className="closing-section"><div><span className="eyebrow">Make space for what matters</span><h2>Bring your day<br />into focus.</h2></div><Link href="/login" className="button-primary">Get Started Free <ArrowRight size={20} /></Link></section>
      </main>
      <footer id="site-footer" className="landing-footer">
        <div className="footer-inner">
          <div className="footer-main">
            <Link href="/" className="footer-brand" aria-label="ALIBI by HVT home"><img src="/logo-footer.png" alt="ALIBI by HVT" /></Link>
            <p>Personal productivity, adaptive planning and work intelligence — in one private space.</p>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <div><b>Explore</b><Link href="/features">Features</Link><Link href="/how-it-works">How it Works</Link></div>
            <div><b>About ALIBI</b><Link href="/why-alibi">Why ALIBI</Link><Link href="/docs">Documentation</Link></div>
            <div><b>Your workspace</b><Link href="/login">Get Started</Link><Link href="/login">Sign in</Link></div>
          </nav>
          <div className="footer-bottom"><span>ALIBI · Personal productivity, with perspective.</span><span>Local-first · Private by default</span></div>
        </div>
      </footer>
    </div>
  );
}




