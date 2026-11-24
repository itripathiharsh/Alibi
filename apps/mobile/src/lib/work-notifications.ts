/**
 * Notifications you can act on, per task (ADR-033).
 *
 * - Working on: one ongoing notification per running task, kept in the shade until the
 *   task is paused or done, with Pause and Done buttons. Several tasks can run at once.
 * - Time check: when a running task reaches its planned time (its estimate minus time
 *   already spent), or after 60 minutes when it has no estimate: Done / +15 min / Pause.
 *   "Keep going" moves the next check 30 minutes on.
 * - Up next (lib/task-deadline-reminders.ts): before a task's due time, with Start now and
 *   Snooze 10 min.
 *
 * Everything is scheduled on the phone from the local task store, so it works offline and
 * costs nothing. Buttons open ALIBI briefly so the action always runs (KI-033).
 */
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { endTaskSession, getAllLocalTasks, getLocalTimers, setTaskDoneOffline, startTaskTimerOffline } from "./offline-sync";
import { currentUserId, recordLearningSignal } from "./learning-signals";
import { requestSync } from "./task-intake";
import { formatClock, formatMinutes } from "./time-format";

export const RUNNING_KIND = "running_task";
export const TIME_CHECK_KIND = "time_check";
export const UP_NEXT_KIND = "task_deadline"; // existing reminder kind, now with buttons

const RUNNING_CATEGORY = "alibi_running_task";
const TIME_CHECK_CATEGORY = "alibi_time_check";
export const UP_NEXT_CATEGORY = "alibi_up_next";
const RUNNING_CHANNEL = "task-running-v1";
const WORK_CHANNEL = "task-work-v1";
const ENABLED_KEY = "alibi_running_task_reminders_enabled";
const DEFAULT_CHECK_MIN = 60;
const KEEP_GOING_MIN = 30;
const EXTEND_MIN = 15;
const SNOOZE_MIN = 10;

export async function areWorkNotificationsEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) !== "false";
  } catch {
    return true;
  }
}

export async function setWorkNotificationsEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_KEY, String(enabled));
  void syncWorkNotifications();
}

let prepared = false;

export async function ensureWorkNotificationSetup(): Promise<void> {
  if (prepared) return;
  try {
    if (Platform.OS === "android") {
      // Quiet, ongoing "working on" notices; no sound each time one is shown.
      await Notifications.setNotificationChannelAsync(RUNNING_CHANNEL, {
        name: "Tasks in progress",
        importance: Notifications.AndroidImportance.LOW,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        showBadge: false,
      });
      await Notifications.setNotificationChannelAsync(WORK_CHANNEL, {
        name: "Time checks and up next",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 200, 150, 200],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
    await Notifications.setNotificationCategoryAsync(RUNNING_CATEGORY, [
      { identifier: "pause", buttonTitle: "Pause", options: { opensAppToForeground: true } },
      { identifier: "done", buttonTitle: "Done", options: { opensAppToForeground: true } },
    ]);
    await Notifications.setNotificationCategoryAsync(TIME_CHECK_CATEGORY, [
      { identifier: "done", buttonTitle: "Done", options: { opensAppToForeground: true } },
      { identifier: "extend", buttonTitle: `+${EXTEND_MIN} min`, options: { opensAppToForeground: true } },
      { identifier: "pause", buttonTitle: "Pause", options: { opensAppToForeground: true } },
    ]);
    await Notifications.setNotificationCategoryAsync(UP_NEXT_CATEGORY, [
      { identifier: "start_now", buttonTitle: "Start now", options: { opensAppToForeground: true } },
      { identifier: "snooze", buttonTitle: `Snooze ${SNOOZE_MIN} min`, options: { opensAppToForeground: true } },
    ]);
    prepared = true;
  } catch {
    // Without categories the notifications still open the app.
  }
}

async function scheduleTimeCheck(taskId: string, timerId: string, title: string, at: Date, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time check",
      body,
      data: { kind: TIME_CHECK_KIND, taskId, timerId, fireAt: at.getTime(), title },
      categoryIdentifier: TIME_CHECK_CATEGORY,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      ...(Platform.OS === "android" ? { channelId: WORK_CHANNEL } : {}),
    },
  });
}

let syncing: Promise<void> | null = null;
let again = false;

/** Align "working on" notices and time checks with the timers running on this phone. */
export function syncWorkNotifications(): Promise<void> {
  if (syncing) {
    again = true; // a change arrived mid-sync: run once more with fresh data
    return syncing;
  }
  syncing = (async () => {
    do {
      again = false;
      await doSync();
    } while (again);
  })().finally(() => { syncing = null; });
  return syncing;
}

async function doSync(): Promise<void> {
  try {
    const enabled = await areWorkNotificationsEnabled();
    const granted = (await Notifications.getPermissionsAsync()).status === "granted";
    const userId = await currentUserId();
    const [timers, tasks] = await Promise.all([getLocalTimers(userId), getAllLocalTasks(userId)]);
    const active = enabled && granted ? timers : [];
    const activeIds = new Set(active.map((t) => t.id));
    const byId = new Map(tasks.map((t) => [t.id, t]));

    // Remove notices and checks for timers that are no longer running.
    const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
    for (const item of presented) {
      const data = item.request.content.data ?? {};
      const stale = (data.kind === RUNNING_KIND || data.kind === TIME_CHECK_KIND) && !activeIds.has(String(data.timerId ?? ""));
      if (stale) {
        await Notifications.dismissNotificationAsync(item.request.identifier).catch(() => undefined);
      }
    }
    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    const checkedTimers = new Set<string>();
    for (const request of scheduled) {
      const data = request.content.data ?? {};
      if (data.kind !== TIME_CHECK_KIND) continue;
      const timerId = String(data.timerId ?? "");
      if (activeIds.has(timerId)) checkedTimers.add(timerId);
      else await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined);
    }
    if (active.length === 0) return;

    await ensureWorkNotificationSetup();
    const shown = new Set(presented.filter((p) => p.request.content.data?.kind === RUNNING_KIND).map((p) => String(p.request.content.data?.timerId ?? "")));
    for (const timer of active) {
      const task = byId.get(timer.task_id);
      const title = task?.title ?? "Task";
      const startedAt = Date.parse(timer.started_at);
      if (!shown.has(timer.id)) {
        await Notifications.scheduleNotificationAsync({
          identifier: `running-${timer.id}`,
          content: {
            title: `Working on: ${title}`,
            body: `Started ${formatClock(startedAt)}`,
            data: { kind: RUNNING_KIND, taskId: timer.task_id, timerId: timer.id },
            categoryIdentifier: RUNNING_CATEGORY,
            sticky: true,
            autoDismiss: false,
            sound: false,
            priority: Notifications.AndroidNotificationPriority.LOW,
          },
          trigger: Platform.OS === "android" ? { channelId: RUNNING_CHANNEL } : null,
        }).catch(() => undefined);
      }
      if (!checkedTimers.has(timer.id) && Number.isFinite(startedAt)) {
        // Planned time left = estimate minus what earlier sessions already used.
        const estimate = task?.estimate_final_min ?? task?.estimate_user_min ?? null;
        const before = task?.actual_min ?? 0;
        const remaining = estimate ? Math.max(5, estimate - before) : DEFAULT_CHECK_MIN;
        let at = new Date(startedAt + remaining * 60_000);
        if (at.getTime() <= Date.now() + 30_000) at = new Date(Date.now() + KEEP_GOING_MIN * 60_000);
        const body = estimate
          ? `${title}: you planned ${formatMinutes(estimate)}. Done, or need more time?`
          : `${title}: ${formatMinutes(remaining)} in. Still on it?`;
        await scheduleTimeCheck(timer.task_id, timer.id, title, at, body).catch(() => undefined);
      }
    }
  } catch {
    // Notifications never block tracking.
  }
}

type Navigate = (path: string) => void;

/** Handle buttons on running, time-check and up-next notifications. */
export async function handleWorkNotification(
  response: Notifications.NotificationResponse,
  navigate: Navigate,
): Promise<boolean> {
  const data = response.notification.request.content.data ?? {};
  const kind = String(data.kind ?? "");
  if (kind !== RUNNING_KIND && kind !== TIME_CHECK_KIND && kind !== UP_NEXT_KIND) return false;
  const taskId = typeof data.taskId === "string" ? data.taskId : null;
  const action = response.actionIdentifier;
  if (!taskId) return false;
  const userId = await currentUserId();
  const timers = await getLocalTimers(userId);
  const timer = timers.find((t) => t.task_id === taskId) ?? null;
  await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);

  // Buttons change tasks the same way taps in the app do (lib/offline-sync), then upload.
  if (action === "pause") {
    if (timer) await endTaskSession(userId, timer);
    requestSync();
    void recordLearningSignal("checkin_snoozed", { taskId, data: { via: kind, action: "pause" } });
  } else if (action === "done") {
    await setTaskDoneOffline(userId, taskId, true); // also ends its running clock
    requestSync();
    void recordLearningSignal("checkin_done", { taskId, data: { via: kind } });
  } else if (action === "extend" && timer) {
    const title = typeof data.title === "string" ? data.title : "Task";
    await scheduleTimeCheck(taskId, timer.id, title, new Date(Date.now() + EXTEND_MIN * 60_000), `${title}: ${EXTEND_MIN} more minutes are up. Done?`);
  } else if (action === "start_now") {
    await startTaskTimerOffline(userId, taskId);
    requestSync();
    void recordLearningSignal("checkin_opened", { taskId, data: { via: "up_next", action: "start" } });
  } else if (action === "snooze") {
    const content = response.notification.request.content;
    await Notifications.scheduleNotificationAsync({
      content: { title: content.title ?? "Up next", body: content.body ?? "", data: { ...data, snoozed: true }, categoryIdentifier: UP_NEXT_CATEGORY, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.now() + SNOOZE_MIN * 60_000),
        ...(Platform.OS === "android" ? { channelId: WORK_CHANNEL } : {}),
      },
    }).catch(() => undefined);
  } else if (kind === TIME_CHECK_KIND && timer) {
    // Tapped the notification itself: treat as "keep going".
    const title = typeof data.title === "string" ? data.title : "Task";
    await scheduleTimeCheck(taskId, timer.id, title, new Date(Date.now() + KEEP_GOING_MIN * 60_000), `${title}: still on it?`);
  }
  void syncWorkNotifications();
  navigate("/(tabs)");
  return true;
}
