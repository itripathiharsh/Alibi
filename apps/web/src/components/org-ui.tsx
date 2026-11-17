"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, CalendarDays, Clock3, UsersRound } from "lucide-react";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-orange-600">{eyebrow}</p><h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">{description}</p></div>{action}</div>;
}

export function OrgEmpty({ title, body, href, label }: { title: string; body: string; href: string; label: string }) {
  return <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-[0_12px_36px_-28px_rgba(15,35,55,.3)]"><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-orange-600"><Building2 /></div><h2 className="text-xl font-semibold text-slate-900">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{body}</p><Link href={href} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#092638] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#143b52]">{label}<ArrowUpRight size={16}/></Link></div>;
}

export function MetricCard({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof UsersRound }) {
  return <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_-26px_rgba(15,35,55,.45)] transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-orange-600"><Icon size={18}/></span></div><div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{value}</div><p className="mt-1 text-xs text-slate-400">{note}</p></article>;
}

export function PeriodControl({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Report period">{[7, 30, 90].map((days) => <button key={days} onClick={() => onChange(days)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${value === days ? "bg-[#092638] text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{days === 7 ? "7 days" : days === 30 ? "30 days" : "90 days"}</button>)}</div>;
}

export function OrganizationTag({ name }: { name: string }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600"><Building2 size={14}/>{name}</span>;
}

export function periodParams(days: number) {
  const end = new Date();
  const start = new Date(end); start.setDate(end.getDate() - days + 1);
  return `start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}`;
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

export const calendarIcon = CalendarDays;
export const clockIcon = Clock3;
