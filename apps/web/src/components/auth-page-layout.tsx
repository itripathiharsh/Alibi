"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, Check, CircleCheck, Pause, Play, Sparkles, Zap } from "lucide-react";

interface AuthPageLayoutProps {
  mode: "login" | "signup";
  eyebrow: string;
  title: string;
  description: string;
  footer: React.ReactNode;
  notice?: React.ReactNode;
  children: React.ReactNode;
}

export function AuthPageLayout({ mode, eyebrow, title, description, footer, notice, children }: AuthPageLayoutProps) {
  const [motionPaused, setMotionPaused] = useState(false);
  const [workflowStep, setWorkflowStep] = useState(0);
  const workflow = [
    { label: "TASK CAPTURED", status: "Captured", plan: "Sorting the details…", reminder: "Your task is in ALIBI" },
    { label: "PLAN READY", status: "Planned", plan: "Today · 3:00 PM focus block", reminder: "A focus block is ready" },
    { label: "TIME TO FOCUS", status: "Up next", plan: "A gentle reminder is set", reminder: "Time to begin your focus block" },
  ];

  useEffect(() => {
    if (motionPaused) return;
    const timer = window.setInterval(() => setWorkflowStep((step) => (step + 1) % workflow.length), 2500);
    return () => window.clearInterval(timer);
  }, [motionPaused, workflow.length]);

  return (
    <main className="auth-page">
      <div className="auth-page-top">
        <Link href="/" className="auth-brand" aria-label="ALIBI home">
          <img src="/logo.png" alt="ALIBI" />
        </Link>
        <span className="auth-security"><span /> Private by default</span>
      </div>

      <div className="auth-layout">
        <section className="auth-story" aria-labelledby="auth-story-title">
          <div className="auth-story-copy">
            <div className="auth-kicker"><Sparkles size={14} /> Personal focus, team clarity</div>
            <h1 id="auth-story-title">Make room for <span>what matters.</span></h1>
            <p>Capture a task, shape a realistic plan, and get a gentle nudge when it is time to focus. Your personal workspace stays yours.</p>
            <div className="auth-audience"><span>ALIBI app</span><i /> Android for personal work <i /> Web for teams</div>
          </div>

          <div className={`auth-motion ${motionPaused ? "auth-motion-paused" : ""}`} data-step={workflowStep}>
            <div className="auth-motion-heading"><span>WHAT ALIBI DOES FOR YOUR DAY</span><span className="auth-demo-label">LIVE PREVIEW</span></div>
            <div className="auth-step-track" aria-hidden="true">{workflow.map((step, index) => <span key={step.label} className={index === workflowStep ? "is-active" : index < workflowStep ? "is-done" : ""}>{step.label}</span>)}</div>
            <div className="auth-scene" aria-label="Animated illustration: ALIBI captures a task, plans a focus block, and sends a reminder">
              <div className="auth-scene-glow" />
              <div className="auth-orbit auth-orbit-one" />
              <div className="auth-orbit auth-orbit-two" />
              <span className="auth-scene-spark auth-spark-one"><Sparkles size={17}/></span>
              <span className="auth-scene-spark auth-spark-two"><Zap size={17}/></span>

              <article className="auth-task-card">
                <div className="auth-task-card-head"><span className="auth-task-check"><Check size={14}/></span><span>{workflow[workflowStep].status}</span><span className="auth-live-dot" /></div>
                <h2>Prepare the project update</h2>
                <div className="auth-task-tags"><span>Professional</span><span>Today · 3:00 PM</span></div>
                <div className="auth-task-progress"><span /></div>
                <div className="auth-plan-row"><span className="auth-plan-icon"><CalendarDays size={17}/></span><span><small>YOUR PLAN</small><b key={workflowStep} className="auth-step-copy">{workflow[workflowStep].plan}</b></span><CircleCheck size={18} className="auth-plan-done"/></div>
              </article>

              <div className="auth-notification-card" key={workflowStep}><span className="auth-bell-icon"><Bell size={18}/><i /></span><span><small>{workflow[workflowStep].label}</small><b>{workflow[workflowStep].reminder}</b></span><span className="auth-notification-arrow">↗</span></div>
              <div className="auth-flow-line"><span /><span /><span /></div>
            </div>
            <div className="auth-motion-foot"><span>Capture <b>→</b> plan <b>→</b> focus. Watch the steps change.</span><button type="button" onClick={() => setMotionPaused((paused) => !paused)} aria-label={motionPaused ? "Play animation" : "Pause animation"} aria-pressed={motionPaused}>{motionPaused ? <Play size={14}/> : <Pause size={14}/>}<span>{motionPaused ? "Play motion" : "Pause motion"}</span></button></div>
          </div>

          <div className="auth-trust-note"><span className="auth-trust-icon"><CircleCheck size={17}/></span><span><b>Built around your choice</b><small>Organization reporting is limited to professional work you choose to share.</small></span></div>
        </section>

        <section className="auth-form-wrap" aria-label={mode === "login" ? "Sign in" : "Create account"}>
          <div className="auth-form-card">
            <div className="auth-form-heading"><div className="auth-form-mark"><img src="/icon.png" alt="" /></div><p className="auth-form-eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>
            {notice}
            {children}
            <div className="auth-form-footer">{footer}</div>
            <p className="auth-privacy-note"><CircleCheck size={14}/> Your records belong to your account.</p>
          </div>
          <p className="auth-mobile-note">Personal ALIBI features are available in the Android app.</p>
        </section>
      </div>
      <footer className="auth-page-footer"><span>ALIBI · A clearer way to move forward</span><Link href="/">Back to ALIBI</Link></footer>
    </main>
  );
}
