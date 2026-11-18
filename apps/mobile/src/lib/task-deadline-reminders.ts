import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ENABLED_KEY = "alibi_deadline_reminders_enabled";
const REMINDER_KIND = "task_deadline";
const ANDROID_CHANNEL_ID = "task-deadlines";
export const DEFAULT_DEADLINE_REMINDER_LEAD_MIN = 15;

export async function areTaskDeadlineRemindersEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) === "true";
  } catch {
    return true;
  }
}

export async function setTaskDeadlineRemindersEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_KEY, String(enabled));
  if (!enabled) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    const matching = scheduled.filter((request) => request.content.data?.kind === REMINDER_KIND);
    await Promise.all(matching.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined)));
  }
}

/** Keep private, on-device deadline reminders aligned with the user's saved tasks. */
export async function syncTaskDeadlineReminders(
  tasks: { id: string; status: string; deadline_at: string | null }[],
  leadMinutes: number,
): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Task deadlines",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0],
      });
    }
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const deadlineNotices = scheduled.filter((request) => request.content.data?.kind === REMINDER_KIND);
    if (!(await areTaskDeadlineRemindersEnabled()) || (await Notifications.getPermissionsAsync()).status !== "granted") {
      await Promise.all(deadlineNotices.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined)));
      return;
    }

    for (const task of tasks) {
      const notices = deadlineNotices.filter((request) => request.content.data?.taskId === task.id);
      if (!task.deadline_at || task.status === "completed" || task.status === "cancelled") {
        await Promise.all(notices.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined)));
        continue;
      }
      const deadline = Date.parse(task.deadline_at);
      const fireAt = deadline - Math.max(0, leadMinutes) * 60_000;
      const existing = notices.find((request) => request.content.data?.fireAt === fireAt);
      await Promise.all(notices.filter((request) => request !== existing).map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined)));
      if (existing || !Number.isFinite(fireAt) || fireAt <= Date.now()) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Task deadline coming up",
          body: "Open ALIBI to review your next deadline.",
          data: { kind: REMINDER_KIND, taskId: task.id, fireAt },
          sound: false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAt),
          ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
      });
    }
  } catch {
    // A missed OS notification never changes the task or its deadline.
  }
}
