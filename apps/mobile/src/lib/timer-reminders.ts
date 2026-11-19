import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { CHECKIN_CHANNEL_ID, ensureNotificationChannels, getNotificationCopy } from "./notification-witty-engine";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const REMINDER_KIND = "active_task_check_in";
const ANDROID_CHANNEL_ID = CHECKIN_CHANNEL_ID;
const REMINDERS_ENABLED_KEY = "alibi_task_checkins_enabled";

export async function areTaskTimerRemindersEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(REMINDERS_ENABLED_KEY)) !== "false";
  } catch {
    return true;
  }
}

export async function setTaskTimerRemindersEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(REMINDERS_ENABLED_KEY, String(enabled));
  if (!enabled) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    const reminders = scheduled.filter((request) => request.content.data?.kind === REMINDER_KIND);
    await Promise.all(reminders.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined)));
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Schedules a private, on-device check-in two hours after an individual timer starts. */
export async function scheduleTaskTimerReminder(input: {
  timerId: string;
  taskId: string;
  startedAt: string;
}): Promise<boolean> {
  try {
    if (!(await areTaskTimerRemindersEnabled())) return false;
    await ensureNotificationChannels();

    let permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
    if (permission.status !== "granted") return false;

    const at = new Date(Date.parse(input.startedAt) + TWO_HOURS_MS);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return false;

    const copy = await getNotificationCopy("TIMER_RUNAWAY");

    await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        data: { kind: REMINDER_KIND, timerId: input.timerId, taskId: input.taskId },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    });
    return true;
  } catch {
    // Timer persistence is independent of notification permission or OS scheduling.
    return false;
  }
}

/** Cancels only the reminder attached to this timer, leaving other task reminders intact. */
export async function cancelTaskTimerReminder(timerId: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const matching = scheduled.filter((request) => {
      const data = request.content.data;
      return data?.kind === REMINDER_KIND && data?.timerId === timerId;
    });
    await Promise.all(matching.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
  } catch {
    // Timer stop/completion remains successful if OS notification cleanup fails.
  }
}

/** Restore timers' outstanding reminders after app relaunch without prompting for permission. */
export async function syncTaskTimerReminders(
  timers: { id: string; task_id: string; started_at: string }[],
): Promise<void> {
  try {
    if (!(await areTaskTimerRemindersEnabled())) return;
    if ((await Notifications.getPermissionsAsync()).status !== "granted") return;
    const activeIds = new Set(timers.map((timer) => timer.id));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const activeScheduled = new Set<string>();
    for (const request of scheduled) {
      const data = request.content.data;
      if (data?.kind !== REMINDER_KIND) continue;
      const id = typeof data.timerId === "string" ? data.timerId : "";
      if (activeIds.has(id)) activeScheduled.add(id);
      else await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
    await Promise.all(
      timers.filter((timer) => !activeScheduled.has(timer.id)).map((timer) =>
        scheduleTaskTimerReminder({ timerId: timer.id, taskId: timer.task_id, startedAt: timer.started_at }),
      ),
    );
  } catch {
    // Timer loading and tracking remain available if reminders cannot be reconciled.
  }
}
