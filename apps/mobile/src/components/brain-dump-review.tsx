import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Check, Sparkles } from "lucide-react-native";
import theme from "../lib/theme";
import type { BrainDumpBucket, BrainDumpResult, ReviewedItem } from "../lib/brain-dump";

const BUCKET_LABELS: Record<BrainDumpBucket, string> = {
  today: "Today",
  this_week: "This week",
  later: "Later",
  anytime: "No date",
};
const BUCKET_ORDER: BrainDumpBucket[] = ["today", "this_week", "later", "anytime"];

interface Row {
  key: string;
  title: string;
  originalTitle: string;
  keep: boolean;
  bucket: BrainDumpBucket;
  deadlineAt: string | null;
  deadlinePhrase: string | null;
  estimateMinutes: number | null;
}

function formatDeadline(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `Today ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

export default function BrainDumpReview({
  result,
  saving,
  onSave,
  onBack,
  onEnableAi,
  enablingAi,
}: {
  result: BrainDumpResult;
  saving: boolean;
  onSave: (items: ReviewedItem[]) => void;
  onBack: () => void;
  onEnableAi?: () => void;
  enablingAi?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => result.items.map((item, index) => ({
    key: `${index}-${item.title}`,
    title: item.title,
    originalTitle: item.title,
    keep: true,
    bucket: item.bucket,
    deadlineAt: item.deadline_at,
    deadlinePhrase: item.deadline_phrase,
    estimateMinutes: item.estimate_minutes,
  })));

  const kept = rows.filter((row) => row.keep && row.title.trim());
  const grouped = useMemo(
    () => BUCKET_ORDER
      .map((bucket) => ({ bucket, rows: rows.filter((row) => row.bucket === bucket) }))
      .filter((group) => group.rows.length > 0),
    [rows],
  );

  const update = (key: string, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const save = () => onSave(kept.map((row) => ({
    title: row.title.trim(),
    deadline_at: row.deadlineAt,
    estimate_minutes: row.estimateMinutes,
    edited: row.title.trim() !== row.originalTitle,
  })));

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>
        Found {rows.length} {rows.length === 1 ? "thing" : "things"}
      </Text>
      <Text style={styles.sub}>Untick anything you don't want. Tap a title to fix it.</Text>

      {result.ai_status === "not_opted_in" && onEnableAi ? (
        <Pressable onPress={onEnableAi} disabled={enablingAi} style={styles.aiBanner} accessibilityRole="button">
          {enablingAi ? <ActivityIndicator size="small" color={theme.colors.accent.amber} /> : <Sparkles size={16} color={theme.colors.accent.amber} />}
          <Text style={styles.aiBannerText}>
            Split with basic rules. Turn on smart sorting for better Hinglish splitting (your text goes to Gemini/Groq).
          </Text>
        </Pressable>
      ) : null}
      {result.mode === "rules" && result.ai_status !== "not_opted_in" ? (
        <Text style={styles.note}>Split with basic rules because smart sorting isn't available right now.</Text>
      ) : null}

      <ScrollView style={styles.list} contentContainerStyle={{ gap: 14, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        {grouped.map((group) => (
          <View key={group.bucket} style={{ gap: 6 }}>
            <Text style={styles.groupLabel}>{BUCKET_LABELS[group.bucket].toUpperCase()}</Text>
            {group.rows.map((row) => (
              <View key={row.key} style={[styles.row, !row.keep && styles.rowOff]}>
                <Pressable
                  onPress={() => update(row.key, { keep: !row.keep })}
                  style={[styles.check, row.keep && styles.checkOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: row.keep }}
                  accessibilityLabel={`Keep ${row.title}`}
                  hitSlop={8}
                >
                  {row.keep ? <Check size={14} color="#FFFFFF" /> : null}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={row.title}
                    onChangeText={(title) => update(row.key, { title })}
                    style={styles.title}
                    editable={row.keep}
                    accessibilityLabel="Task title"
                  />
                  {row.deadlineAt ? (
                    <Text style={styles.when}>
                      {formatDeadline(row.deadlineAt)}
                      {row.deadlinePhrase ? ` · “${row.deadlinePhrase}”` : ""}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <Pressable
        onPress={save}
        disabled={!kept.length || saving}
        style={[styles.saveButton, (!kept.length || saving) && styles.disabled]}
        accessibilityRole="button"
      >
        {saving ? <ActivityIndicator color="#FFFFFF" /> : null}
        <Text style={styles.saveLabel}>
          {saving ? "Saving…" : `Add ${kept.length} ${kept.length === 1 ? "task" : "tasks"}`}
        </Text>
      </Pressable>
      <Pressable onPress={onBack} style={styles.backLink} accessibilityRole="button">
        <Text style={styles.backLabel}>Back to edit text</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  heading: { color: theme.colors.text.primary, fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  sub: { color: theme.colors.text.secondary, fontSize: 13 },
  note: { color: theme.colors.text.muted, fontSize: 12 },
  aiBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 11,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: "#F4C7A8",
    backgroundColor: "#FFF7F1",
  },
  aiBannerText: { flex: 1, color: "#8A3B08", fontSize: 12, lineHeight: 17 },
  list: { flexGrow: 0, maxHeight: 420 },
  groupLabel: { color: theme.colors.accent.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.cardSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: "#FFFFFF",
  },
  rowOff: { opacity: 0.45 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: theme.colors.brand.navy, borderColor: theme.colors.brand.navy },
  title: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "600", paddingVertical: 2 },
  when: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 1 },
  saveButton: {
    minHeight: 50,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.accent.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  disabled: { opacity: 0.52 },
  saveLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  backLink: { alignItems: "center", paddingVertical: 6 },
  backLabel: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: "600" },
});
