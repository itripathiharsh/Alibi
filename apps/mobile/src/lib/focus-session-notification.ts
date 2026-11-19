import * as Notifications from "expo-notifications";
import { NativeModules, Platform, Vibration } from "react-native";

const CHANNEL_ID = "alibi-focus-session";
const NOTIFICATION_ID = "alibi-active-focus";

type FocusSessionBridge = {
  start(taskId: string, title: string, startedAtMillis: number, durationMinutes: number, showTaskTitle: boolean): void;
  stop(): void;
  startAmbient(style: string): void;
  stopAmbient(): void;
};

const focusBridge = NativeModules.FocusSession as FocusSessionBridge | undefined;

/** Provide instant tactile feedback using the device vibration motor. */
export function triggerHaptic(type: "tap" | "complete" | "alert" = "tap"): void {
  try {
    if (type === "tap") Vibration.vibrate(20);
    else if (type === "complete") Vibration.vibrate([0, 35, 60, 45]);
    else Vibration.vibrate([0, 50, 80, 70]);
  } catch {
    // Vibration is optional on devices without a haptic motor.
  }
}

/** Start the Android foreground timer, with an elapsed timer when no estimate exists. */
export async function startFocusNotification(
  taskId: string,
  title: string,
  startedAt: string,
  durationMin: number | null | undefined,
  showTaskTitle: boolean,
): Promise<void> {
  const startMs = Date.parse(startedAt);
  const duration = typeof durationMin === "number" && Number.isFinite(durationMin)
    ? Math.max(0, Math.floor(durationMin))
    : 0;
  if (Platform.OS === "android" && focusBridge) {
    focusBridge.start(taskId, title, Number.isFinite(startMs) ? startMs : Date.now(), duration, showTaskTitle);
    return;
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Active Focus Session",
        importance: Notifications.AndroidImportance.LOW,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") return;
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: "Focus session active",
        body: showTaskTitle ? `Working on: ${title}` : "Your focus timer is running.",
        data: { kind: "active_focus_session", task_id: taskId },
        sound: false,
        sticky: true,
      },
      trigger: null,
    });
  } catch {
    // Timer tracking must continue if the optional notification cannot be shown.
  }
}

export async function stopFocusNotification(): Promise<void> {
  try {
    focusBridge?.stop();
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => undefined);
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => undefined);
  } catch {
    // Notification cleanup must not block task or timer actions.
  }
}

export function startAmbientAudio(style: "rain" | "white" | "brown"): boolean {
  if (Platform.OS !== "android" || !focusBridge) return false;
  focusBridge.startAmbient(style);
  return true;
}

export function stopAmbientAudio(): void {
  focusBridge?.stopAmbient();
}
