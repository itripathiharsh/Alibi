import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarDays, Check, Minus, Plus, Repeat2, X } from "lucide-react-native";
import theme from "../lib/theme";

export type RepeatFrequency = "daily" | "weekly" | "monthly";
export interface RepeatRuleSummary {
  id: string;
  frequency: RepeatFrequency;
  interval: number;
  starts_at: string;
}

const FREQUENCIES: { value: RepeatFrequency; label: string; detail: string }[] = [
  { value: "daily", label: "Daily", detail: "Each day" },
  { value: "weekly", label: "Weekly", detail: "Each week" },
  { value: "monthly", label: "Monthly", detail: "Each month" },
];
export function RepeatTaskSheet({
  taskTitle,
  rule,
  visible,
  busy = false,
  loading = false,
  onClose,
  onCreate,
  onStop,
}: {
  taskTitle: string;
  rule: RepeatRuleSummary | null;
  visible: boolean;
  busy?: boolean;
  loading?: boolean;
  onClose: () => void;
  onCreate: (frequency: RepeatFrequency, interval: number) => void;
  onStop: (ruleId: string) => void;
}) {
  const [frequency, setFrequency] = useState<RepeatFrequency>("weekly");
  const [interval, setInterval] = useState(1);
  const cadenceUnits: Record<RepeatFrequency, string> = { daily: "day", weekly: "week", monthly: "month" };
  const cadence = rule
    ? `Every ${rule.interval > 1 ? `${rule.interval} ` : ""}${cadenceUnits[rule.frequency]}${rule.interval > 1 ? "s" : ""}`
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View style={styles.icon}><Repeat2 size={19} color={theme.colors.accent.amber} /></View>
            <View style={styles.headingCopy}><Text style={styles.eyebrow}>Recurring task</Text><Text style={styles.title}>{rule ? "Repeat schedule" : "Set a repeat schedule"}</Text></View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close repeat schedule"><X size={21} color={theme.colors.text.secondary} /></Pressable>
          </View>
          <Text style={styles.description} numberOfLines={3}>{taskTitle}</Text>
          {loading ? <ActivityIndicator color={theme.colors.accent.amber} style={styles.loading} /> : rule ? (
            <View style={styles.activeCard}>
              <View style={styles.activeIcon}><CalendarDays size={18} color={theme.colors.accent.emerald} /></View>
              <View style={styles.activeCopy}><Text style={styles.activeTitle}>{cadence}</Text><Text style={styles.activeSubtitle}>New tasks are generated ahead from this saved task. Existing instances stay in your list if you stop.</Text></View>
            </View>
          ) : (
            <ScrollView style={styles.options} contentContainerStyle={styles.optionContent}>
              <Text style={styles.sectionLabel}>Repeat</Text>
              <View style={styles.frequencyOptions}>{FREQUENCIES.map((item) => {
                const selected = frequency === item.value;
                return <Pressable key={item.value} onPress={() => setFrequency(item.value)} style={[styles.frequencyCard, selected && styles.frequencyCardSelected]} accessibilityRole="radio" accessibilityState={{ selected }}><Text style={[styles.frequencyLabel, selected && styles.frequencyLabelSelected]}>{item.label}</Text><Text style={styles.frequencyDetail}>{item.detail}</Text></Pressable>;
              })}</View>
              <Text style={styles.sectionLabel}>Every</Text>
              <View style={styles.intervalOptions}>
                <Pressable onPress={() => setInterval((value) => Math.max(1, value - 1))} disabled={interval <= 1} style={[styles.intervalStep, interval <= 1 && styles.disabled]} accessibilityRole="button" accessibilityLabel="Decrease repeat interval"><Minus size={17} color={theme.colors.text.secondary} /></Pressable>
                <Text style={styles.intervalValue}>Every {interval} {cadenceUnits[frequency]}{interval > 1 ? "s" : ""}</Text>
                <Pressable onPress={() => setInterval((value) => Math.min(52, value + 1))} disabled={interval >= 52} style={[styles.intervalStep, interval >= 52 && styles.disabled]} accessibilityRole="button" accessibilityLabel="Increase repeat interval"><Plus size={17} color={theme.colors.text.secondary} /></Pressable>
              </View>
              <Text style={styles.note}>ALIBI will create future tasks from this saved task. It will not change this task or add calendar blocks.</Text>
            </ScrollView>
          )}
          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} disabled={busy} onPress={onClose}><Text style={styles.secondaryLabel}>Close</Text></Pressable>
            {rule ? <Pressable style={[styles.stopButton, busy && styles.disabled]} disabled={busy} onPress={() => onStop(rule.id)}><Text style={styles.stopLabel}>{busy ? "Stopping…" : "Stop future repeats"}</Text></Pressable> : <Pressable style={[styles.primaryButton, (busy || loading) && styles.disabled]} disabled={busy || loading} onPress={() => onCreate(frequency, interval)}><Text style={styles.primaryLabel}>{busy ? "Saving…" : "Save repeat"}</Text>{!busy && <Check size={16} color={theme.colors.surface.card} />}</Pressable>}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(8,24,37,.46)" },
  sheet: { maxHeight: "84%", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 27, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: theme.colors.background.base },
  handle: { alignSelf: "center", width: 42, height: 4, borderRadius: 99, backgroundColor: theme.colors.border.subtle, marginBottom: 17 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1E7" },
  headingCopy: { flex: 1, gap: 2 },
  eyebrow: { color: theme.colors.accent.amber, fontSize: 10, fontWeight: "800", letterSpacing: .9, textTransform: "uppercase" },
  title: { color: theme.colors.text.primary, fontSize: 19, fontWeight: "800" },
  description: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 18, marginTop: 12 },
  loading: { marginVertical: 28 },
  activeCard: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 14, marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card },
  activeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#ECF8F1" },
  activeCopy: { flex: 1, gap: 4 },
  activeTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: "800", textTransform: "capitalize" },
  activeSubtitle: { color: theme.colors.text.secondary, fontSize: 11, lineHeight: 16 },
  options: { marginTop: 19, flexGrow: 0 },
  optionContent: { gap: 9, paddingBottom: 5 },
  sectionLabel: { color: theme.colors.text.secondary, fontSize: 10, fontWeight: "800", letterSpacing: .8, textTransform: "uppercase", marginTop: 4 },
  frequencyOptions: { flexDirection: "row", gap: 8 },
  frequencyCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border.subtle, borderRadius: 15, backgroundColor: theme.colors.surface.card },
  frequencyCardSelected: { borderColor: theme.colors.accent.amber, backgroundColor: "#FFFAF6" },
  frequencyLabel: { color: theme.colors.text.primary, fontSize: 12, fontWeight: "800" },
  frequencyLabelSelected: { color: theme.colors.accent.amber },
  frequencyDetail: { color: theme.colors.text.muted, fontSize: 10, marginTop: 3 },
  intervalOptions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  intervalStep: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border.subtle, borderRadius: 13, backgroundColor: theme.colors.surface.card },
  intervalValue: { color: theme.colors.text.primary, fontSize: 13, fontWeight: "800" },
  note: { color: theme.colors.text.muted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  actions: { flexDirection: "row", gap: 10, marginTop: 17 },
  secondaryButton: { flex: 1, minHeight: 49, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card },
  secondaryLabel: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: "700" },
  primaryButton: { flex: 1.25, minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 15, backgroundColor: theme.colors.text.primary },
  primaryLabel: { color: theme.colors.surface.card, fontSize: 13, fontWeight: "800" },
  stopButton: { flex: 1.25, minHeight: 49, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: "#E8B8B8", backgroundColor: theme.colors.surface.card },
  stopLabel: { color: "#B42318", fontSize: 12, fontWeight: "800" },
  disabled: { opacity: .55 },
});
