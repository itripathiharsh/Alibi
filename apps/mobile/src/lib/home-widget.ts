/**
 * Home-screen "Today" ring widget bridge (FR-PROD-010, ADR-028).
 *
 * The Android widget cannot run JavaScript, so the app writes a small snapshot of
 * today's real counts into SharedPreferences through the native AlibiWidget module and
 * asks the widget to redraw. Counts come only from the on-device task cache:
 *   total = tasks due today (not cancelled) plus tasks completed today
 *   done  = the completed ones among them
 * The snapshot carries its date, so a stale snapshot is never shown as today's numbers.
 */
import { NativeModules, Platform } from "react-native";
import { getAllLocalTasks, getLocalTimers, type LocalTask } from "./offline-sync";
import { currentUserId } from "./learning-signals";

interface AlibiWidgetNative {
  updateSnapshot(json: string): Promise<boolean>;
}

const nativeWidget: AlibiWidgetNative | undefined =
  Platform.OS === "android" ? (NativeModules.AlibiWidget as AlibiWidgetNative | undefined) : undefined;

export interface WidgetSnapshot {
  date: string;
  done: number;
  total: number;
  current_title: string | null;
  current_kind: "running" | "next" | null;
  current_started_at: number | null;
  current_due_at: number | null;
  updated_at: number;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isToday(iso: string | null | undefined, start: number, end: number): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && time >= start && time < end;
}

export function buildWidgetSnapshot(
  tasks: LocalTask[],
  timers: { task_id: string; started_at: string }[],
  now: Date = new Date(),
): WidgetSnapshot {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const todays = new Map<string, LocalTask>();
  for (const task of tasks) {
    if (task.status === "cancelled") continue;
    const dueToday = isToday(task.deadline_at, startMs, endMs);
    const doneToday = task.status === "completed" && isToday(task.completed_at, startMs, endMs);
    if (dueToday || doneToday) todays.set(task.id, task);
  }
  const done = [...todays.values()].filter((task) => task.status === "completed").length;

  let currentTitle: string | null = null;
  let currentKind: WidgetSnapshot["current_kind"] = null;
  let currentStartedAt: number | null = null;
  let currentDueAt: number | null = null;

  const running = timers
    .map((timer) => ({ timer, task: tasks.find((task) => task.id === timer.task_id) }))
    .find((entry) => entry.task);
  if (running?.task) {
    currentTitle = running.task.title;
    currentKind = "running";
    const started = Date.parse(running.timer.started_at);
    currentStartedAt = Number.isFinite(started) ? started : null;
  } else {
    const next = tasks
      .filter((task) => (task.status === "pending" || task.status === "in_progress") && task.deadline_at)
      .map((task) => ({ task, due: Date.parse(task.deadline_at as string) }))
      .filter(({ due }) => Number.isFinite(due) && due < endMs)
      .sort((a, b) => a.due - b.due)[0];
    if (next) {
      currentTitle = next.task.title;
      currentKind = "next";
      currentDueAt = next.due;
    }
  }

  return {
    date: localDateKey(now),
    done,
    total: todays.size,
    current_title: currentTitle,
    current_kind: currentKind,
    current_started_at: currentStartedAt,
    current_due_at: currentDueAt,
    updated_at: now.getTime(),
  };
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Recompute and push the widget snapshot (debounced; safe to call on every change). */
export function refreshHomeWidget(): void {
  if (!nativeWidget) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushSnapshot();
  }, 700);
}

async function pushSnapshot(): Promise<void> {
  if (!nativeWidget) return;
  try {
    const userId = await currentUserId();
    const [tasks, timers] = await Promise.all([getAllLocalTasks(userId), getLocalTimers(userId)]);
    await nativeWidget.updateSnapshot(JSON.stringify(buildWidgetSnapshot(tasks, timers)));
  } catch {
    // The widget keeps its last snapshot; it shows "open ALIBI" when that is not today's.
  }
}
