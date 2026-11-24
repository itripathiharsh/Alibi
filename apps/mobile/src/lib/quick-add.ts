/**
 * Background "Say a task" from the home-screen widget (FR-PROD-012).
 *
 * Runs as a React Native headless task: the app UI never opens. One spoken task is saved
 * through the same path as the Add screen (lib/task-intake, ADR-034): on the device first,
 * its date words read when the server answers quickly. When the words hold several tasks,
 * nothing is saved automatically: a notification opens the review list instead, because a
 * split stays a proposal until the user accepts it.
 */
import * as Notifications from "expo-notifications";
import { Platform, ToastAndroid } from "react-native";
import { timeLabel } from "./diary-page";
import { refreshHomeWidgetNow } from "./home-widget";
import { addTask, readTaskText, syncNow } from "./task-intake";
import { ensureCheckInCategory, syncTaskCheckIns } from "./task-check-ins";

export const VOICE_REVIEW_KIND = "voice_dump_review";

function toast(message: string): void {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
}

async function askToReview(text: string, count: number | null): Promise<void> {
  try {
    await ensureCheckInCategory(); // creates the notification channel if the app never opened
    await Notifications.scheduleNotificationAsync({
      content: {
        title: count ? `${count} tasks heard` : "Several tasks heard",
        body: "Tap to review them before they're added.",
        data: { kind: VOICE_REVIEW_KIND, text },
      },
      trigger: Platform.OS === "android" ? { channelId: "task-accountability-v1" } : null,
    });
  } catch {
    toast("Open ALIBI to review your tasks.");
  }
}

export async function quickAddFromVoice(data: { text?: string } | undefined): Promise<void> {
  const text = (data?.text ?? "").trim();
  if (!text) return;

  // A widget press can wait a little longer for a waking server than the open app does.
  const read = await readTaskText(text, 6000);
  if (read.kind === "many") {
    await askToReview(text, read.result?.items.length ?? null);
    return;
  }

  const task = await addTask({ title: read.title, deadlineAt: read.deadlineAt, estimateMin: read.estimateMin, origin: "voice" });
  const when = task.deadline_at ? ` · ${timeLabel(new Date(task.deadline_at))}` : "";
  toast(`Added: ${task.title}${when}`);

  // A headless task can end before a delayed sync fires, so upload now.
  await Promise.allSettled([refreshHomeWidgetNow(), syncTaskCheckIns(), syncNow()]);
}
