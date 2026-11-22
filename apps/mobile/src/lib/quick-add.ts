/**
 * Background "Say a task" from the home-screen widget (FR-PROD-012).
 *
 * Runs as a React Native headless task: the app UI never opens. One spoken task is saved
 * straight to the on-device store (it is the user's own words, like writing a line in the
 * diary). When the words clearly hold several tasks, nothing is saved automatically: a
 * notification opens the brain-dump review instead, because AI splits stay proposals.
 */
import * as Notifications from "expo-notifications";
import { Platform, ToastAndroid } from "react-native";
import { getAccessToken } from "./auth";
import { getServerUrl } from "./config";
import { createTaskOffline, syncMobileAccount } from "./offline-sync";
import { currentUserId } from "./learning-signals";
import { looksLikeManyTasks, timeLabel } from "./diary-page";
import { splitBrainDump } from "./brain-dump";
import { refreshHomeWidgetNow } from "./home-widget";
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

  if (looksLikeManyTasks(text)) {
    await askToReview(text, null);
    return;
  }

  let title = text;
  let deadline: string | null = null;
  try {
    // The server's rules parser turns "shaam ko" into a due time; a slow or offline
    // server never blocks saving the words.
    const parsed = await Promise.race([
      splitBrainDump(text),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    if (parsed && parsed.items.length > 1) {
      await askToReview(text, parsed.items.length);
      return;
    }
    const item = parsed?.items[0];
    if (item) {
      title = item.title || text;
      deadline = item.deadline_at;
    }
  } catch {
    // Offline or signed out: keep the words exactly as spoken.
  }

  const userId = await currentUserId();
  await createTaskOffline(userId, { title, status: "pending", origin: "voice", deadline_at: deadline });
  const when = deadline ? ` · ${timeLabel(new Date(deadline))}` : "";
  toast(`Added: ${title}${when}`);

  await Promise.allSettled([
    refreshHomeWidgetNow(),
    syncTaskCheckIns(),
    (async () => {
      const token = await getAccessToken();
      if (token && userId !== "local_user") await syncMobileAccount(userId, token, getServerUrl());
    })(),
  ]);
}
