import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ensureAuthenticated, getUserProfile } from "../lib/auth";
import { getServerUrl } from "../lib/config";
import { stopAmbientAudio, stopFocusNotification } from "../lib/focus-session-notification";
import { getLocalTimers, stopTaskTimerOffline, updateTaskOffline } from "../lib/offline-sync";
import theme from "../lib/theme";

type RunningEntry = { id: string; task_id: string };

export default function FocusActionScreen() {
  const router = useRouter();
  const { action, task_id: taskId } = useLocalSearchParams<{ action?: string; task_id?: string }>();
  const [message, setMessage] = useState("Updating your focus session…");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let token: string | null = null;
        let profile: Awaited<ReturnType<typeof getUserProfile>> = null;
        try {
          token = await ensureAuthenticated();
          profile = await getUserProfile();
        } catch {
          // offline
        }
        const userId = profile?.id ?? "local_user";

        if (token) {
          try {
            const baseUrl = getServerUrl();
            const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
            const runningResponse = await fetch(`${baseUrl}/api/v1/time-entries/running/all`, { headers });
            if (runningResponse.ok) {
              const running = (await runningResponse.json()) as RunningEntry[];
              const entry = running.find((item) => item.task_id === taskId);

              if (action === "done" && taskId) {
                await fetch(`${baseUrl}/api/v1/tasks/${taskId}/status`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ status: "completed" }),
                }).catch(() => undefined);
              }

              if (entry) {
                await fetch(`${baseUrl}/api/v1/time-entries/${entry.id}/stop`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({}),
                }).catch(() => undefined);
              }
            }
          } catch {
            // Fall through to offline local timer stop
          }
        }

        // Always update local SQLite state as well
        if (action === "done" && taskId) {
          await updateTaskOffline(userId, taskId, { status: "completed" }).catch(() => undefined);
        }
        const localTimers = await getLocalTimers(userId).catch(() => []);
        const matchingTimer = localTimers.find((t) => t.task_id === taskId);
        if (matchingTimer) {
          await stopTaskTimerOffline(userId, matchingTimer.id).catch(() => undefined);
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
