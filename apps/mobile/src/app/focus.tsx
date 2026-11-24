import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { stopAmbientAudio, stopFocusNotification } from "../lib/focus-session-notification";
import { currentUserId } from "../lib/learning-signals";
import { endTaskSession, getLocalTimers, setTaskDoneOffline } from "../lib/offline-sync";
import { requestSync } from "../lib/task-intake";
import theme from "../lib/theme";

/**
 * Done and Pause from the focus-timer notification. Saved on the phone and uploaded by
 * sync, the same as tapping in the app (ADR-034). It used to call the server and change
 * the phone as well, so one tap was sent twice and the second copy could conflict.
 */
export default function FocusActionScreen() {
  const router = useRouter();
  const { action, task_id: taskId } = useLocalSearchParams<{ action?: string; task_id?: string }>();
  const [message, setMessage] = useState("Updating your focus session…");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const userId = await currentUserId();
        if (taskId) {
          if (action === "done") {
            await setTaskDoneOffline(userId, taskId, true); // also ends its running clock
          } else {
            for (const timer of await getLocalTimers(userId)) {
              if (timer.task_id === taskId) await endTaskSession(userId, timer);
            }
          }
          requestSync();
        }

        stopAmbientAudio();
        await stopFocusNotification();
        if (!active) return;
        setMessage(action === "done" ? "Task completed." : "Focus timer paused.");
        router.replace(taskId ? { pathname: "/(tabs)/tasks", params: { taskId } } : "/(tabs)");
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Focus action could not be completed.");
        Alert.alert("Focus control unavailable", error instanceof Error ? error.message : "Try again in ALIBI.", [
          { text: "Open tasks", onPress: () => router.replace("/(tabs)/tasks") },
        ]);
      }
    })();
    return () => { active = false; };
  }, [action, router, taskId]);

  return <View style={styles.container}><ActivityIndicator size="large" color={theme.colors.accent.amber} /><Text style={styles.message}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background.base, padding: 28, gap: 16 },
  message: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "600", textAlign: "center" },
});
