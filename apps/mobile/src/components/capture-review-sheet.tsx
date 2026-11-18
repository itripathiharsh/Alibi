import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, ChevronDown, Sparkles } from "lucide-react-native";
import theme from "../lib/theme";

export interface CaptureExtraction {
  id: string;
  task_id: string;
  input_text: string;
  final_proposal: Record<string, unknown>;
}

type ReviewField = { key: string; label: string; value: unknown };

const FIELD_LABELS: Record<string, string> = {
  title: "Task title",
  deadline_at: "Deadline",
  priority: "Priority",
  estimate_user_min: "Time estimate",
  tags: "Tags",
  subtasks: "Suggested steps",
};

const DECISION_FIELD_KEYS: Record<string, string[]> = {
  deadline_at: ["deadline_at", "deadline_kind"],
};

function hasReviewableValue(key: string, value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (key === "tags" || key === "subtasks") return Array.isArray(value) && value.length > 0;
  return true;
}

function formatValue(key: string, value: unknown): string {
  if (key === "deadline_at" && typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (key === "priority" && typeof value === "number") return `Priority ${value}`;
  if (key === "estimate_user_min" && typeof value === "number") {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : ""].filter(Boolean).join(" ") || `${value}m`;
  }
  if (Array.isArray(value)) return value.map(String).join(" · ");
  return String(value);
}

export function CaptureReviewSheet({
  extraction,
  visible,
  busy = false,
  onApply,
  onKeepOriginal,
}: {
  extraction: CaptureExtraction | null;
  visible: boolean;
  busy?: boolean;
  onApply: (fields: Record<string, unknown>, rejectedFields: string[]) => void;
  onKeepOriginal: (rejectedFields: string[]) => void;
}) {
  const fields = useMemo<ReviewField[]>(() => {
    if (!extraction) return [];
    return Object.entries(extraction.final_proposal)
      .filter(([key, value]) => FIELD_LABELS[key] && hasReviewableValue(key, value))
      .map(([key, value]) => ({ key, label: FIELD_LABELS[key], value }));
  }, [extraction]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(fields.map((field) => field.key));
  }, [fields]);

  if (!extraction) return null;

  const toggle = (key: string) => {
    setSelected((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  };

  const apply = () => {
    const accepted = Object.fromEntries(
      fields.filter((field) => selected.includes(field.key)).map((field) => [field.key, field.value]),
    );
    if (selected.includes("deadline_at") && extraction.final_proposal.deadline_kind) {
      accepted.deadline_kind = extraction.final_proposal.deadline_kind;
    }
    onApply(
      accepted,
      fields
        .filter((field) => !selected.includes(field.key))
        .flatMap((field) => DECISION_FIELD_KEYS[field.key] ?? [field.key]),
    );
  };

  const rejectAll = () => onKeepOriginal(
    fields.flatMap((field) => DECISION_FIELD_KEYS[field.key] ?? [field.key]),
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={rejectAll}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View style={styles.icon}><Sparkles size={18} color={theme.colors.accent.amber} /></View>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>Capture review</Text>
              <Text style={styles.title}>Check the suggestions</Text>
            </View>
            <Pressable onPress={rejectAll} hitSlop={10} accessibilityLabel="Keep original task text">
              <ChevronDown size={22} color={theme.colors.text.secondary} />
            </Pressable>
          </View>

          <Text style={styles.description}>Your task is already saved. Select the details you want ALIBI to apply.</Text>
          <View style={styles.originalCard}>
            <Text style={styles.originalLabel}>Captured text</Text>
            <Text style={styles.originalText}>{extraction.input_text}</Text>
          </View>

          <ScrollView style={styles.fields} contentContainerStyle={styles.fieldsContent} showsVerticalScrollIndicator={false}>
            {fields.map((field) => {
              const active = selected.includes(field.key);
              return (
                <Pressable
                  key={field.key}
                  onPress={() => toggle(field.key)}
                  style={[styles.field, active && styles.fieldActive]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`${field.label}: ${formatValue(field.key, field.value)}`}
                >
                  <View style={[styles.checkbox, active && styles.checkboxActive]}>{active && <Check size={14} color="#FFFFFF" />}</View>
                  <View style={styles.fieldCopy}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <Text style={styles.fieldValue}>{formatValue(field.key, field.value)}</Text>
                  </View>
                </Pressable>
              );
            })}
            {fields.length === 0 && <Text style={styles.noSuggestions}>No extra details were found. Your original task is ready in Tasks.</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} disabled={busy} onPress={rejectAll}>
              <Text style={styles.secondaryLabel}>Keep original</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, busy && styles.disabled]} disabled={busy || selected.length === 0} onPress={apply}>
              <Text style={styles.primaryLabel}>{busy ? "Saving…" : selected.length ? "Apply selected" : "Choose details"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(8, 24, 37, .46)" },
  sheet: { maxHeight: "88%", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: theme.colors.background.base },
  handle: { alignSelf: "center", width: 42, height: 4, borderRadius: 99, backgroundColor: theme.colors.border.subtle, marginBottom: 18 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0E4" },
  headingCopy: { flex: 1 },
  eyebrow: { color: theme.colors.accent.amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
  title: { color: theme.colors.text.primary, fontSize: 20, fontWeight: "800", marginTop: 2 },
  description: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19, marginTop: 14 },
  originalCard: { padding: 13, marginTop: 14, borderRadius: 16, backgroundColor: theme.colors.surface.surface2 },
  originalLabel: { color: theme.colors.text.muted, fontSize: 10, fontWeight: "800", letterSpacing: .7, textTransform: "uppercase" },
  originalText: { color: theme.colors.text.primary, fontSize: 13, lineHeight: 19, marginTop: 5 },
  fields: { marginTop: 12, flexGrow: 0 },
  fieldsContent: { gap: 8, paddingBottom: 4 },
  field: { flexDirection: "row", alignItems: "center", gap: 11, padding: 12, minHeight: 58, borderWidth: 1, borderColor: theme.colors.border.subtle, borderRadius: 15, backgroundColor: theme.colors.surface.card },
  fieldActive: { borderColor: "#F4B27C", backgroundColor: "#FFFAF6" },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: "#C4CBD3", alignItems: "center", justifyContent: "center" },
  checkboxActive: { borderColor: theme.colors.accent.amber, backgroundColor: theme.colors.accent.amber },
  fieldCopy: { flex: 1, gap: 2 },
  fieldLabel: { color: theme.colors.text.muted, fontSize: 10, fontWeight: "700" },
  fieldValue: { color: theme.colors.text.primary, fontSize: 13, fontWeight: "700" },
  noSuggestions: { padding: 16, color: theme.colors.text.secondary, lineHeight: 20, textAlign: "center" },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  secondaryButton: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card },
  secondaryLabel: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: "700" },
  primaryButton: { flex: 1.2, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: theme.colors.text.primary },
  primaryLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: .55 },
});
