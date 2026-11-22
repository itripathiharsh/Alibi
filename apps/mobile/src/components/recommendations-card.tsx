import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Lightbulb, X } from "lucide-react-native";
import { ensureAuthenticated } from "../lib/auth";
import { getServerUrl } from "../lib/config";
import { recordLearningSignal } from "../lib/learning-signals";
import theme from "../lib/theme";

interface Recommendation {
  id: string;
  kind: string;
  title: string;
  body: string;
  task_id: string | null;
  action: "open_task" | "review_today" | "make_routine" | "none";
}

interface RecommendationsPayload {
  status: "learning" | "ready";
  days_observed: number;
  days_needed: number;
  items: Recommendation[];
}

const ACTION_LABELS: Record<Recommendation["action"], string | null> = {
  open_task: "Open task",
  review_today: "Review now",
  make_routine: "Set it up",
  none: null,
};

/**
 * One recommendation at a time, counted from the user's own history (FR-LEARN-013).
 * Shows nothing while offline or when there is nothing worth saying.
 */
export function RecommendationsCard() {
  const router = useRouter();
  const [payload, setPayload] = useState<RecommendationsPayload | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const token = await ensureAuthenticated();
      if (!token) return;
      const response = await fetch(`${getServerUrl()}/api/v1/learning/recommendations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setPayload(await response.json() as RecommendationsPayload);
    } catch {
      // Offline: keep whatever was shown last.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!payload) return null;

  if (payload.status === "learning") {
    if (payload.days_observed <= 0) return null;
    return (
      <View style={styles.learning}>
        <Lightbulb size={14} color={theme.colors.text.muted} />
        <Text style={styles.learningText}>
          Learning your patterns: {Math.min(payload.days_observed, payload.days_needed)} of {payload.days_needed} active days. Tips start after that.
        </Text>
      </View>
    );
  }

  const item = payload.items.find((candidate) => !hidden.has(candidate.id));
  if (!item) return null;
  const actionLabel = ACTION_LABELS[item.action];

  const dismiss = () => {
    setHidden((current) => new Set(current).add(item.id));
    void recordLearningSignal("recommendation_dismissed", { data: { rec_id: item.id, kind: item.kind } });
  };

  const act = () => {
    void recordLearningSignal("recommendation_accepted", { taskId: item.task_id, data: { rec_id: item.id, kind: item.kind } });
    setHidden((current) => new Set(current).add(item.id));
    if (item.action === "open_task" && item.task_id) {
      router.push({ pathname: "/(tabs)/tasks", params: { taskId: item.task_id } });
    } else {
      router.push("/(tabs)/tasks");
    }
  };

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.header}>
        <Lightbulb size={16} color={theme.colors.accent.amber} />
        <Text style={styles.eyebrow}>FROM YOUR HISTORY</Text>
        <Pressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss tip" style={styles.close}>
          <X size={16} color={theme.colors.text.muted} />
        </Pressable>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
      {actionLabel ? (
        <Pressable onPress={act} style={styles.action} accessibilityRole="button">
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 6,
    borderRadius: theme.radius.cardSecondary,
    borderWidth: 1,
    borderColor: "#F4D9C2",
    backgroundColor: "#FFFAF5",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 7 },
  eyebrow: { flex: 1, color: theme.colors.accent.amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  close: { padding: 2 },
  title: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "800" },
  body: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19 },
  action: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.brand.navy,
  },
  actionLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  learning: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 4 },
  learningText: { flex: 1, color: theme.colors.text.muted, fontSize: 12 },
});
