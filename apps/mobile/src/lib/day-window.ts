/**
 * The user's day, from Start Day / End Day in Settings (ADR-032/033).
 *
 * Reminders that are not tied to something the user is doing right now (check-ins after a
 * missed due time) wait until Start Day instead of arriving at night. Before the user sets
 * their day, the earlier fixed quiet hours apply (awake 07:30-22:30).
 */
import { getUserProfile } from "./auth";

const FALLBACK = { start: 7 * 60 + 30, end: 22 * 60 + 30 };

function parseHm(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : null;
}

/** Start and end of the user's day in minutes after midnight. */
export async function getDayWindow(): Promise<{ start: number; end: number }> {
  const profile = await getUserProfile().catch(() => null);
  const start = parseHm(profile?.settings?.day_start);
  const end = parseHm(profile?.settings?.day_end);
  if (start === null || end === null || end <= start) return FALLBACK;
  return { start, end };
}

/** Move a time outside the user's day to the next Start Day. */
export function intoDay(date: Date, window: { start: number; end: number }): Date {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= window.start && minutes < window.end) return date;
  const next = new Date(date);
  if (minutes >= window.end) next.setDate(next.getDate() + 1);
  next.setHours(Math.floor(window.start / 60), window.start % 60, 0, 0);
  return next;
}
