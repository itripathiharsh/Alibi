/**
 * What one diary page shows (owner request 2026-11-22, diary-style Today page).
 *
 * A page is one local calendar day:
 *   - timed: tasks due that day, in time order
 *   - anytime: tasks finished that day without a due time that day, plus (today only)
 *     open tasks with no due date
 *   - carried (today only): open tasks whose due time passed on an earlier day. These are
 *     overdue: they keep their original due date and stay overdue until completed or
 *     explicitly rescheduled (ADR-032). On a past day's page, its unfinished tasks are
 *     overdue too. Completed tasks are never overdue.
 * Finished tasks stay on the page, struck out, like a written diary.
 */
import type { LocalTask } from "./offline-sync";
import { formatClock } from "./time-format";

export interface DiaryEntry {
  task: LocalTask;
  dueAt: Date | null;
  done: boolean;
  overdue: boolean;
  /** The first due date that was missed (kept after rescheduling), when there is one. */
  originalDueAt: Date | null;
}

export interface DiaryPage {
  carried: DiaryEntry[];
  timed: DiaryEntry[];
  anytime: DiaryEntry[];
  done: number;
  total: number;
}

export function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time) : null;
}

export function buildDiaryPage(tasks: LocalTask[], day: Date, now: Date = new Date()): DiaryPage {
  const start = startOfDay(day);
  const end = addDays(start, 1);
  const isToday = start.getTime() === startOfDay(now).getTime();
  const todayStart = startOfDay(now);
  const inDay = (date: Date | null) => date !== null && date >= start && date < end;

  const carried: DiaryEntry[] = [];
  const timed: DiaryEntry[] = [];
  const anytime: DiaryEntry[] = [];

  for (const task of tasks) {
    if (task.status === "cancelled") continue;
    const dueAt = parse(task.deadline_at);
    const completedAt = parse(task.completed_at);
    const done = task.status === "completed";
    const missed = parse(task.original_deadline_at);
    const overdue = !done && dueAt !== null && dueAt < todayStart;
    const entry: DiaryEntry = { task, dueAt, done, overdue, originalDueAt: missed ?? (overdue ? dueAt : null) };

    if (inDay(dueAt)) {
      timed.push(entry);
    } else if (done && inDay(completedAt)) {
      anytime.push(entry);
    } else if (isToday && !done) {
      if (dueAt === null) anytime.push(entry);
      else if (dueAt < start) carried.push(entry);
    }
  }

  timed.sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  carried.sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  anytime.sort((a, b) => Number(a.done) - Number(b.done) || (a.task.created_at ?? "").localeCompare(b.task.created_at ?? ""));

  const all = [...carried, ...timed, ...anytime];
  return { carried, timed, anytime, done: all.filter((entry) => entry.done).length, total: all.length };
}

/** "06:00 PM"-style label; a due time at the very end of the day reads as "by night". */
export function timeLabel(date: Date | null): string {
  if (!date) return "";
  if (date.getHours() === 23 && date.getMinutes() === 59) return "by night";
  return formatClock(date);
}

/** Text that clearly lists several things goes to brain dump instead of one line. */
export function looksLikeManyTasks(text: string): boolean {
  return /[,;\n]|\s(aur|phir|fir|then|also)\s/i.test(text.trim());
}
