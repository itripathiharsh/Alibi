/**
 * Home-screen "Today" ring widget bridge (FR-PROD-010, ADR-028).
 *
 * The Android widget cannot run JavaScript, so the app writes a small snapshot of
 * today's real counts into SharedPreferences through the native AlibiWidget module and
 * asks the widget to redraw. Counts come from the on-device task cache and use the same
 * rule as the Today page (lib/diary-page.ts), so the widget and the page always agree.
 * The snapshot carries its date, so a stale snapshot is never shown as today's numbers.
 */
import { NativeModules, Platform } from "react-native";
import { getAllLocalTasks, getLocalTimers, type LocalTask } from "./offline-sync";
import { currentUserId } from "./learning-signals";
import { buildDiaryPage } from "./diary-page";

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

export function buildWidgetSnapshot(
  tasks: LocalTask[],
  timers: { task_id: string; started_at: string }[],
  now: Date = new Date(),
): WidgetSnapshot {
  // Count exactly what the Today page shows (due today, done today, open tasks with no
  // date, and unfinished tasks from earlier days), so the widget and the page always agree.
  const page = buildDiaryPage(tasks, now, now);

  let currentTitle: string | null = null;
  let currentKind: WidgetSnapshot["current_kind"] = null;
  let currentStartedAt: number | null = null;
  let currentDueAt: number | null = null;

  const runningAll = timers
    .map((timer) => ({ timer, task: tasks.find((task) => task.id === timer.task_id) }))
    .filter((entry) => entry.task);
  const running = runningAll[0];
  if (running?.task) {
    // Several tasks can run at once (ADR-033): the widget names the first and counts the rest.
    const others = runningAll.length - 1;
    currentTitle = others > 0 ? `${running.task.title} (+${others} more)` : running.task.title;
    currentKind = "running";
    const started = Date.parse(running.timer.started_at);
    currentStartedAt = Number.isFinite(started) ? started : null;
  } else {
    // Next = the first unfinished line on the Today page: timed tasks in time order,
    // then tasks carried over from earlier days, then anytime tasks.
    const next = [...page.timed, ...page.carried, ...page.anytime].find((entry) => !entry.done);
    if (next) {
      currentTitle = next.task.title;
      currentKind = "next";
      currentDueAt = next.dueAt ? next.dueAt.getTime() : null;
    }
  }

  return {
    date: localDateKey(now),
    done: page.done,
    total: page.total,
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

/** Push the snapshot right away (for background work that may end before a debounce). */
export async function refreshHomeWidgetNow(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  await pushSnapshot();
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
