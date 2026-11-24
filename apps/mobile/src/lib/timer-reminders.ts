/**
 * Running-timer reminders, now handled by lib/work-notifications.ts (ADR-033).
 *
 * The old fixed two-hour "is this still running?" notice is replaced by a per-task time
 * check (at the task's planned time, or 60 minutes) with Done / +15 min / Pause buttons.
 * These functions keep their names for existing callers; scheduling now follows the
 * timers stored on the phone. The on/off switch used to share its stored key with the
 * "Did it get done?" check-ins, so turning one off turned both off; it now has its own.
 */
import * as Notifications from "expo-notifications";
import { areWorkNotificationsEnabled, setWorkNotificationsEnabled, syncWorkNotifications } from "./work-notifications";

const LEGACY_KIND = "active_task_check_in";

// No notification handler here: the app registers one in _layout.tsx. This module used to
// set a second, silent one on import, so opening Settings muted in-app notification
// sounds (logic audit 2026-11-24).

async function cancelLegacyReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    scheduled
      .filter((request) => request.content.data?.kind === LEGACY_KIND)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined)),
  );
}

export function areTaskTimerRemindersEnabled(): Promise<boolean> {
  return areWorkNotificationsEnabled();
}

export async function setTaskTimerRemindersEnabled(enabled: boolean): Promise<void> {
  await setWorkNotificationsEnabled(enabled);
}

export async function scheduleTaskTimerReminder(_input: { timerId: string; taskId: string; startedAt: string }): Promise<boolean> {
  await syncWorkNotifications();
  return true;
}

export async function cancelTaskTimerReminder(_timerId: string): Promise<void> {
  await syncWorkNotifications();
}

export async function syncTaskTimerReminders(_timers: { id: string; task_id: string; started_at: string }[]): Promise<void> {
  await cancelLegacyReminders();
  await syncWorkNotifications();
}
