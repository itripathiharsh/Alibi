import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Check, Clock3, Pencil, Sparkles, Timer, X } from "lucide-react-native";
import theme from "../lib/theme";
import { formatWhen } from "../lib/time-format";
import { DateChooser, FieldLabel, Sheet, TimeChooser } from "./time-pickers";
import type { BrainDumpBucket, BrainDumpResult, ReviewedItem } from "../lib/brain-dump";

const BUCKET_LABELS: Record<BrainDumpBucket, string> = {
  today: "Today",
  this_week: "This week",
  later: "Later",
  anytime: "No time yet",
};
const BUCKET_ORDER: BrainDumpBucket[] = ["today", "this_week", "later", "anytime"];

interface Row {
  key: string;
  title: string;
  originalTitle: string;
  keep: boolean;
  bucket: BrainDumpBucket;
  saidAt: string | null;
  saidPhrase: string | null;
  suggestedAt: string | null;
  keepSuggestion: boolean;
  minutes: number | null;
}

function statusLine(result: BrainDumpResult): { text: string; tone: "good" | "warn" } {
  if (result.mode === "ai") return { text: "AI fixed the spelling and grammar. Check the tasks, then add them.", tone: "good" };
  if (result.ai_status === "offline") {
    return { text: "ALIBI couldn't reach the server, so no dates were read. These are your own words, split at new lines and commas.", tone: "warn" };
  }
  if (result.ai_status === "server_disabled") {
    return { text: "AI spelling and grammar correction is off on the ALIBI server. These titles are your own words, split by basic rules.", tone: "warn" };
  }
  if (result.ai_status === "not_opted_in") {
    return { text: "AI correction is off. Turn on smart sorting to fix spelling and grammar. These titles are your own words.", tone: "warn" };
  }
  return { text: "AI correction didn't answer in time. These titles are your own words, split by basic rules.", tone: "warn" };
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
    saidAt: item.deadline_at,
    saidPhrase: item.deadline_phrase,
    suggestedAt: item.deadline_at ? null : item.suggested_at ?? null,
    keepSuggestion: true,
    minutes: item.estimate_minutes,
  })));

  const kept = rows.filter((row) => row.keep && row.title.trim());
  const grouped = useMemo(
    () => BUCKET_ORDER
      .map((bucket) => ({ bucket, rows: rows.filter((row) => (row.suggestedAt && !row.keepSuggestion && !row.saidAt ? "anytime" : row.bucket) === bucket) }))
      .filter((group) => group.rows.length > 0),
    [rows],
  );
  const status = statusLine(result);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState<Date | null>(null);
  const [draftMinutes, setDraftMinutes] = useState(18 * 60);

  const openEditor = (row: Row) => {
    const when = row.saidAt ?? (row.keepSuggestion ? row.suggestedAt : null);
    const date = when ? new Date(when) : null;
    setDraftTitle(row.title);
    setDraftDate(date);
    setDraftMinutes(date ? date.getHours() * 60 + date.getMinutes() : 18 * 60);
    setEditing(row);
  };

  const saveEditor = () => {
    if (!editing || !draftTitle.trim()) return;
    let iso: string | null = null;
    let bucket: BrainDumpBucket = "anytime";
    if (draftDate) {
      const when = new Date(draftDate);
      when.setHours(Math.floor(draftMinutes / 60), draftMinutes % 60, 0, 0);
      iso = when.toISOString();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.round((new Date(when).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
      const endOfWeek = 6 - ((today.getDay() + 6) % 7); // days until Sunday
      bucket = days <= 0 ? "today" : days <= endOfWeek ? "this_week" : "later";
    }
    // A time the user picks here counts as their own ("said"), not a suggestion.
    update(editing.key, { title: draftTitle.trim(), saidAt: iso, saidPhrase: null, suggestedAt: null, bucket });
    setEditing(null);
  };

  const update = (key: string, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const save = () => onSave(kept.map((row) => ({
    title: row.title.trim(),
    deadline_at: row.saidAt ?? (row.keepSuggestion ? row.suggestedAt : null),
    estimate_minutes: row.minutes,
    edited: row.title.trim() !== row.originalTitle,
  })));

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.heading}>{rows.length} {rows.length === 1 ? "task" : "tasks"} found</Text>
        <Text style={styles.sub}>Tap a title to fix it. Untick anything you don't want.</Text>
      </View>

      <View style={[styles.status, status.tone === "warn" ? styles.statusWarn : styles.statusGood]}>
        <Sparkles size={15} color={status.tone === "warn" ? "#B45309" : "#0F766E"} />
        <Text style={[styles.statusText, { color: status.tone === "warn" ? "#92400E" : "#115E59" }]}>{status.text}</Text>
      </View>
      {result.ai_status === "not_opted_in" && onEnableAi ? (
        <Pressable onPress={onEnableAi} disabled={enablingAi} style={styles.enableAi} accessibilityRole="button">
          {enablingAi ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
          <Text style={styles.enableAiText}>Turn on smart sorting and try again</Text>
        </Pressable>
      ) : null}

      {grouped.map((group) => (
        <View key={group.bucket} style={styles.group}>
          <Text style={styles.groupLabel}>{BUCKET_LABELS[group.bucket]}</Text>
          <View style={styles.card}>
            {group.rows.map((row, index) => (
              <View key={row.key} style={[styles.row, index > 0 && styles.rowDivider, !row.keep && styles.rowOff]}>
                <Pressable
                  onPress={() => update(row.key, { keep: !row.keep })}
                  style={[styles.check, row.keep && styles.checkOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: row.keep }}
                  accessibilityLabel={`Keep ${row.title}`}
                  hitSlop={10}
                >
                  {row.keep ? <Check size={14} color="#FFFFFF" /> : null}
                </Pressable>
                <View style={styles.body}>
                  <TextInput
                    value={row.title}
                    onChangeText={(title) => update(row.key, { title })}
                    style={styles.title}
                    editable={row.keep}
                    multiline
                    accessibilityLabel="Task title"
                  />
                  <View style={styles.chips}>
                    <Pressable onPress={() => openEditor(row)} disabled={!row.keep} style={styles.editChip} accessibilityRole="button" accessibilityLabel={`Edit ${row.title}`} hitSlop={6}>
                      <Pencil size={12} color={theme.colors.brand.navy} />
                      <Text style={styles.chipText}>Edit</Text>
                    </Pressable>
                    {row.saidAt ? (
                      <View style={styles.chip}>
                        <Clock3 size={12} color={theme.colors.brand.navy} />
                        <Text style={styles.chipText}>{formatWhen(row.saidAt)}{row.saidPhrase ? ` · "${row.saidPhrase}"` : ""}</Text>
                      </View>
                    ) : row.suggestedAt && row.keepSuggestion ? (
                      <Pressable onPress={() => update(row.key, { keepSuggestion: false })} style={[styles.chip, styles.chipSuggested]} accessibilityRole="button" accessibilityLabel={`Suggested ${formatWhen(row.suggestedAt)}. Tap to remove the time`}>
                        <Clock3 size={12} color="#B45309" />
                        <Text style={[styles.chipText, { color: "#92400E" }]}>Suggested {formatWhen(row.suggestedAt)}</Text>
                        <X size={12} color="#B45309" />
                      </Pressable>
                    ) : row.suggestedAt ? (
                      <Pressable onPress={() => update(row.key, { keepSuggestion: true })} style={styles.chipGhost} accessibilityRole="button">
                        <Text style={styles.chipGhostText}>+ Use suggested time</Text>
                      </Pressable>
                    ) : null}
                    {row.minutes ? (
                      <View style={styles.chip}>
                        <Timer size={12} color={theme.colors.brand.navy} />
                        <Text style={styles.chipText}>{row.minutes} min</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

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

      <Sheet
        visible={editing !== null}
        title="Edit task"
        primaryLabel="Save"
        onPrimary={saveEditor}
        onClose={() => setEditing(null)}
        primaryDisabled={!draftTitle.trim()}
      >
        <FieldLabel>Title</FieldLabel>
        <TextInput value={draftTitle} onChangeText={setDraftTitle} style={styles.editInput} multiline accessibilityLabel="Task title" />
        <FieldLabel>Due date</FieldLabel>
        <DateChooser value={draftDate} onChange={setDraftDate} allowNone />
        {draftDate ? (
          <>
            <FieldLabel>Due time</FieldLabel>
            <TimeChooser minutes={draftMinutes} onChange={setDraftMinutes} />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  heading: { color: theme.colors.text.primary, fontSize: 24, fontWeight: "800", letterSpacing: -0.4 },
  sub: { color: theme.colors.text.secondary, fontSize: 13, marginTop: 2 },
  status: { flexDirection: "row", gap: 9, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  statusGood: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  statusWarn: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  statusText: { flex: 1, fontSize: 13, lineHeight: 18 },
  enableAi: { minHeight: 44, borderRadius: theme.radius.control, backgroundColor: theme.colors.brand.navy, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  enableAiText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  group: { gap: 8 },
  groupLabel: { color: theme.colors.accent.amber, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border.subtle, overflow: "hidden" },
  row: { flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 14, alignItems: "flex-start" },
  rowDivider: { borderTopWidth: 1, borderTopColor: "#F1ECE6" },
  rowOff: { opacity: 0.45 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkOn: { backgroundColor: theme.colors.brand.navy, borderColor: theme.colors.brand.navy },
  body: { flex: 1, gap: 8 },
  title: { color: theme.colors.text.primary, fontSize: 16, lineHeight: 22, fontWeight: "600", padding: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: "#EEF2F6" },
  chipSuggested: { backgroundColor: "#FEF3C7" },
  chipText: { fontSize: 12, fontWeight: "600", color: theme.colors.brand.navy },
  editChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border.subtle },
  editInput: { borderWidth: 1, borderColor: theme.colors.border.subtle, borderRadius: 12, padding: 12, fontSize: 16, color: theme.colors.text.primary, minHeight: 48, textAlignVertical: "top" },
  chipGhost: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: "#E2E8F0", borderStyle: "dashed" },
  chipGhostText: { fontSize: 12, fontWeight: "600", color: theme.colors.text.secondary },
  saveButton: { minHeight: 52, borderRadius: theme.radius.control, backgroundColor: theme.colors.accent.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 4 },
  disabled: { opacity: 0.52 },
  saveLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  backLink: { alignItems: "center", paddingVertical: 6 },
  backLabel: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: "600" },
});
