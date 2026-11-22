/**
 * Accountability check-ins (FR-NOTIF-004, ADR-028).
 *
 * Shortly after an open task's deadline passes, ALIBI asks "Did it get done?" with three
 * buttons: Done, +1 hour, Tomorrow. Every answer is an explicit user tap (no silent
 * schedule changes) and is recorded as a learning signal. Everything runs on the device
 * from the local task cache, so check-ins work offline and cost nothing.
 *
 * Buttons open the app briefly: Android only guarantees that the JavaScript handler runs
 * when the app process starts, and this avoids adding a background task dependency.
 */
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ensureNotificationChannels } from "./notification-witty-engine";
import { getAllLocalTasks, updateTaskOffline, type LocalTask } from "./offline-sync";
import { currentUserId, recordLearningSignal } from "./learning-signals";

export const CHECKIN_CATEGORY_ID = "alibi_task_checkin";
// Own channel so the task name is hidden on a lock screen set to hide sensitive content.
const ACCOUNTABILITY_CHANNEL_ID = "task-accountability-v1";
export const CHECKIN_KIND = "task_checkin";
const ENABLED_KEY = "alibi_task_checkins_enabled";
const LAST_HANDLED_KEY = "alibi_last_notification_response";

const DELAY_AFTER_DEADLINE_MIN = 15;
const LOOKAHEAD_HOURS = 36;
const MAX_PER_DAY = 6;
const QUIET_START_MIN = 22 * 60 + 30; // 22:30
const QUIET_END_MIN = 7 * 60 + 30; // 07:30
const MORNING_SLOT = { hour: 8, minute: 30 };

export async function areTaskCheckInsEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) !== "false";
  } catch {
    return true;
  }
}

export async function setTaskCheckInsEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_KEY, String(enabled));
  if (!enabled) await cancelCheckIns(() => true);
  else void syncTaskCheckIns();
}

let categoryReady = false;

/** Register the channel and the Done / +1 hour / Tomorrow buttons once per app start. */
export async function ensureCheckInCategory(): Promise<void> {
  if (categoryReady) return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ACCOUNTABILITY_CHANNEL_ID, {
        name: "Did-it-get-done check-ins",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 200, 150, 200],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        showBadge: true,
      });
    }
    await Notifications.setNotificationCategoryAsync(CHECKIN_CATEGORY_ID, [
      { identifier: "done", buttonTitle: "Done", options: { opensAppToForeground: true } },
      { identifier: "snooze", buttonTitle: "+1 hour", options: { opensAppToForeground: true } },
      { identifier: "tomorrow", buttonTitle: "Tomorrow", options: { opensAppToForeground: true } },
    ]);
    categoryReady = true;
  } catch {
    // Without buttons the notification still opens the app.
  }
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Move a time out of quiet hours to the next 08:30. */
function outOfQuietHours(date: Date): Date {
  const minutes = minutesOfDay(date);
  if (minutes < QUIET_START_MIN && minutes >= QUIET_END_MIN) return date;
  const next = new Date(date);
  if (minutes >= QUIET_START_MIN) next.setDate(next.getDate() + 1);
  next.setHours(MORNING_SLOT.hour, MORNING_SLOT.minute, 0, 0);
  return next;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

async function cancelCheckIns(predicate: (request: Notifications.NotificationRequest) => boolean): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    scheduled
      .filter((request) => request.content.data?.kind === CHECKIN_KIND && predicate(request))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined)),
  );
}

async function scheduleCheckIn(task: Pick<LocalTask, "id" | "title">, fireAt: Date, snoozed: boolean): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: snoozed ? "Checking again" : "Did it get done?",
      body: task.title,
      data: { kind: CHECKIN_KIND, taskId: task.id, fireAt: fireAt.getTime(), snoozed },
      categoryIdentifier: CHECKIN_CATEGORY_ID,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      ...(Platform.OS === "android" ? { channelId: ACCOUNTABILITY_CHANNEL_ID } : {}),
    },
  });
}

let syncing: Promise<void> | null = null;

/** Align scheduled check-ins with the open tasks in the on-device cache. */
export function syncTaskCheckIns(): Promise<void> {
  if (!syncing) {
    syncing = doSync().finally(() => { syncing = null; });
  }
  return syncing;
}

async function doSync(): Promise<void> {
  try {
    if (!(await areTaskCheckInsEnabled()) || (await Notifications.getPermissionsAsync()).status !== "granted") {
      await cancelCheckIns(() => true);
      return;
    }
    await ensureNotificationChannels();
    await ensureCheckInCategory();

    const userId = await currentUserId();
    const tasks = await getAllLocalTasks(userId);
    const now = Date.now();
    const horizon = now + LOOKAHEAD_HOURS * 3_600_000;

    const wanted = new Map<string, { task: LocalTask; fireAt: Date }>();
    const perDay = new Map<string, number>();
    const candidates = tasks
      .filter((task) => (task.status === "pending" || task.status === "in_progress") && task.deadline_at)
      .map((task) => ({ task, deadline: Date.parse(task.deadline_at as string) }))
      .filter(({ deadline }) => Number.isFinite(deadline))
      .sort((a, b) => a.deadline - b.deadline);
    for (const { task, deadline } of candidates) {
      const fireAt = outOfQuietHours(new Date(deadline + DELAY_AFTER_DEADLINE_MIN * 60_000));
      if (fireAt.getTime() <= now || fireAt.getTime() > horizon) continue;
      const key = dayKey(fireAt);
      const count = perDay.get(key) ?? 0;
      if (count >= MAX_PER_DAY) continue;
      perDay.set(key, count + 1);
      wanted.set(task.id, { task, fireAt });
    }

    const openIds = new Set(candidates.map(({ task }) => task.id));
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync().catch(() => []))
      .filter((request) => request.content.data?.kind === CHECKIN_KIND);
    const keep = new Set<string>();
    for (const request of scheduled) {
      const taskId = String(request.content.data?.taskId ?? "");
      const plan = wanted.get(taskId);
      const isSnoozed = request.content.data?.snoozed === true;
      const matches = plan && Number(request.content.data?.fireAt) === plan.fireAt.getTime();
      if ((isSnoozed && openIds.has(taskId)) || matches) {
        keep.add(taskId);
        continue;
      }
      await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined);
    }
    for (const [taskId, plan] of wanted) {
      if (!keep.has(taskId)) await scheduleCheckIn(plan.task, plan.fireAt, false);
    }
  } catch {
    // A missed check-in never changes a task.
  }
}

type Navigate = (path: string) => void;

/** Handle a tap on any ALIBI notification. Returns true when it was handled. */
export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  navigate: Navigate,
): Promise<boolean> {
  const handledKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
  try {
    if ((await SecureStore.getItemAsync(LAST_HANDLED_KEY)) === handledKey) return false;
    await SecureStore.setItemAsync(LAST_HANDLED_KEY, handledKey);
  } catch {
    // Continue; a duplicate tap at worst repeats an idempotent action.
  }

  const data = response.notification.request.content.data ?? {};
  const kind = typeof data.kind === "string" ? data.kind : "";

  if (kind === CHECKIN_KIND && typeof data.taskId === "string") {
    const taskId = data.taskId;
    const title = response.notification.request.content.body ?? "Task";
    await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
    const userId = await currentUserId();

    if (response.actionIdentifier === "done") {
      await updateTaskOffline(userId, taskId, { status: "completed" });
      void recordLearningSignal("checkin_done", { taskId, data: { hour: new Date().getHours() } });
      navigate("/(tabs)");
      return true;
    }
    if (response.actionIdentifier === "snooze") {
      await scheduleCheckIn({ id: taskId, title }, new Date(Date.now() + 60 * 60_000), true);
      void recordLearningSignal("checkin_snoozed", { taskId, data: { minutes: 60 } });
      navigate("/(tabs)");
      return true;
    }
    if (response.actionIdentifier === "tomorrow") {
      const tasks = await getAllLocalTasks(userId);
      const task = tasks.find((item) => item.id === taskId);
      const base = task?.deadline_at ? new Date(task.deadline_at) : new Date();
      const next = new Date(Math.max(base.getTime(), Date.now()));
      next.setDate(next.getDate() + 1);
      if (!task?.deadline_at) next.setHours(18, 0, 0, 0);
      await updateTaskOffline(userId, taskId, {
        deadline_at: next.toISOString(),
        reschedule_count: (task?.reschedule_count ?? 0) + 1,
      });
      void recordLearningSignal("checkin_moved", { taskId, data: { days: 1 } });
      navigate("/(tabs)");
      return true;
    }
    void recordLearningSignal("checkin_opened", { taskId });
    navigate("/(tabs)/tasks");
    return true;
  }

  if (kind === "voice_dump_review" && typeof data.text === "string") {
    // Several tasks were spoken from the widget: review them in Brain dump.
    navigate(`/capture?mode=dump&prefill=${encodeURIComponent(data.text)}`);
    return true;
  }
  if (kind === "daily_evening_sweep" || kind === "task_deadline") {
    navigate("/(tabs)/tasks");
    return true;
  }
  if (kind === "daily_morning_kickoff") {
    navigate("/(tabs)");
    return true;
  }
  return false;
}
