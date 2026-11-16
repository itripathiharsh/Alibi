"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Brain, Check, Code2, Download, Layers3, Leaf, LockKeyhole, Menu, Monitor, Shield, Sparkles, WifiOff, X, Zap } from "lucide-react";

const ANDROID_APK_URL = "https://github.com/itripathiharsh/Alibi/raw/refs/heads/main/apk/ALIBI-0.1.0.apk";

const reasons = [
  { icon: Zap, color: "orange", title: "All-in-One Productivity", text: "Tasks, schedules, notes, insights and reports — in one connected system." },
  { icon: Brain, color: "purple", title: "Learns and Adapts", text: "Understands patterns from your recorded work and can offer more relevant plans." },
  { icon: LockKeyhole, color: "green", title: "Private by Default", text: "Your workspace is for you. External AI is optional and off by default." },
  { icon: WifiOff, color: "blue", title: "Works Offline", text: "Keep working on Android when you’re offline, then sync when you reconnect." },
  { icon: Leaf, color: "orange", title: "Free-First", text: "Run locally with no paid dependencies or required cloud AI." },
  { icon: Shield, color: "purple", title: "You Stay in Control", text: "Suggestions are proposals. Your schedule only changes when you approve them." },
];
const previewTasks = ["Review today’s priorities", "Make room for focused work", "Reflect on the week"];

function WhyPhone() {
  const [day, setDay] = useState("Tue");
  const [checked, setChecked] = useState<number[]>([]);
  const toggle = (index: number) => setChecked((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  return (
    <div className="why-phone-stage" aria-label="Interactive product preview">
      <div className="why-phone-glow" />
      <div className="why-phone"><div className="why-phone-island" /><div className="why-phone-screen">
        <div className="why-phone-status"><b>9:41</b><span>••• ◖</span></div>
        <div className="why-phone-greeting"><small>YOUR DAY, IN VIEW</small><b>Good afternoon <i>✦</i></b><span>Here’s your day at a glance.</span></div>
        <div className="why-phone-days" role="group" aria-label="Select a day">{["Mon", "Tue", "Wed", "Thu", "Fri"].map((value, index) => <button key={value} onClick={() => setDay(value)} className={day === value ? "selected" : ""}><span>{value}</span><b>{16 + index}</b></button>)}</div>
        <div className="why-phone-summary"><div className="why-phone-ring"><b>Your day</b><small>at a glance</small></div><div><span><i className="green" />Completed</span><span><i className="navy" />In progress</span><span><i className="orange" />Up next</span></div></div>
        <div className="why-phone-plan"><b>Today’s focus</b>{previewTasks.map((task, index) => <button key={task} onClick={() => toggle(index)} className={checked.includes(index) ? "done" : ""}><i>{checked.includes(index) && <Check size={10} />}</i><span><strong>{task}</strong><small>{index === 0 ? "Professional" : index === 1 ? "Planning" : "Personal"}</small></span><em className={"mark m" + index} /></button>)}</div>
      </div></div>
      <span className="why-preview-label"><Sparkles size={13} /> Interactive preview</span>
    </div>
  );
}

export default function WhyAlibiPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return <div className="why-page">
    <header className="landing-header why-header">
      <Link href="/" className="brand" aria-label="ALIBI home"><img src="/logo-site.png" alt="ALIBI" /></Link>
      <nav className={"landing-nav " + (menuOpen ? "open" : "")} aria-label="Main navigation">
        <Link href="/" onClick={closeMenu}>Home</Link><Link href="/features" onClick={closeMenu}>Features</Link><Link href="/how-it-works" onClick={closeMenu}>How it Works</Link><Link href="/why-alibi" className="why-active" onClick={closeMenu}>Why ALIBI</Link><Link href="/docs" onClick={closeMenu}>Docs</Link>
        <div className="mobile-nav-actions"><Link href="/login" className="nav-download" onClick={closeMenu}><Monitor size={17} /> Open ALIBI</Link><a href={ANDROID_APK_URL} className="nav-download nav-android" download="ALIBI-0.1.0.apk" onClick={closeMenu}><Download size={17} /> Download Android</a><Link href="/login" className="nav-start" onClick={closeMenu}>Get Started</Link></div>
      </nav>
      <div className="header-actions"><Link href="/login" className="nav-download"><Monitor size={17} /> Open ALIBI</Link><a href={ANDROID_APK_URL} className="nav-download nav-android" download="ALIBI-0.1.0.apk"><Download size={17} /> Download Android</a><Link href="/login" className="nav-start">Get Started</Link></div>
      <button className="menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
    </header>
    <main className="why-main">
      <section className="why-intro"><span className="why-pill">Why ALIBI</span><h1>More Than a Task Manager<br /><em>A Personal Work Intelligence System</em></h1><p>ALIBI brings together planning, execution, learning and insights — in a private, free-first<br className="why-desktop-break" /> workspace built around you.</p></section>
      <section className="why-content">
        <div className="why-left"><span className="why-accent" /><h2>Why Choose ALIBI?</h2><p>Because your work, study and personal life deserve a system that understands you, adapts to you and keeps you in control.</p><WhyPhone /></div>
        <div className="why-grid">{reasons.map(({ icon: Icon, color, title, text }) => <article className="why-card" key={title}><span className={"why-card-icon " + color}><Icon size={29} strokeWidth={1.9} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>
      <section className="why-values"><div><span className="value-icon"><Layers3 /></span><span><b>Built for Real Life</b><small>Keep personal, academic and professional work organized.</small></span></div><div><span className="value-icon"><Code2 /></span><span><b>Local-First by Design</b><small>Run on your own setup, with optional online sync.</small></span></div><div><span className="value-icon"><Leaf /></span><span><b>Grows With You</b><small>Learn from your work, with your choices in control.</small></span></div></section>
      <div className="why-cta"><span>Make your work easier to understand.</span><Link href="/login">Get Started <ArrowRight size={17} /></Link></div>
    </main>
  </div>;
}
