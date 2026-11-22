import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react-native";
import theme from "../lib/theme";
import { formatShortDay } from "../lib/time-format";

/**
 * Small date and time pickers built from plain controls (no extra native dependency),
 * used by the brain dump edit sheet, overdue rescheduling and Start Day / End Day settings.
 */

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function DateChooser({
  value,
  onChange,
  allowNone = false,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
  allowNone?: boolean;
}) {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const selected = value ? startOfDay(value) : null;
  const is = (d: Date) => selected !== null && selected.getTime() === d.getTime();
  const step = (days: number) => {
    const base = selected ?? today;
    const next = new Date(base);
    next.setDate(base.getDate() + days);
    onChange(next);
  };

  return (
    <View style={styles.block}>
      <View style={styles.chips}>
        <Chip label="Today" active={is(today)} onPress={() => onChange(today)} />
        <Chip label="Tomorrow" active={is(tomorrow)} onPress={() => onChange(tomorrow)} />
        {allowNone ? <Chip label="No date" active={selected === null} onPress={() => onChange(null)} /> : null}
      </View>
      <View style={styles.stepper}>
        <Pressable onPress={() => step(-1)} style={styles.stepButton} accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={8}>
          <ChevronLeft size={18} color={theme.colors.text.primary} />
        </Pressable>
        <Text style={styles.stepValue}>{selected ? formatShortDay(selected) : "No date"}</Text>
        <Pressable onPress={() => step(1)} style={styles.stepButton} accessibilityRole="button" accessibilityLabel="Next day" hitSlop={8}>
          <ChevronRight size={18} color={theme.colors.text.primary} />
        </Pressable>
      </View>
    </View>
  );
}

/** Minutes after midnight in, minutes after midnight out. */
export function TimeChooser({
  minutes,
  onChange,
  stepMinutes = 15,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  stepMinutes?: number;
}) {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const pm = hours24 >= 12;
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const wrap = (value: number) => ((value % 1440) + 1440) % 1440;

  return (
    <View style={styles.timeRow}>
      <Stepper
        label={String(hour12).padStart(2, "0")}
        onMinus={() => onChange(wrap(minutes - 60))}
        onPlus={() => onChange(wrap(minutes + 60))}
        name="hour"
      />
      <Text style={styles.colon}>:</Text>
      <Stepper
        label={String(mins).padStart(2, "0")}
        onMinus={() => onChange(wrap(minutes - stepMinutes))}
        onPlus={() => onChange(wrap(minutes + stepMinutes))}
        name="minutes"
      />
      <View style={styles.ampm}>
        <Chip label="AM" active={!pm} onPress={() => { if (pm) onChange(minutes - 720); }} />
        <Chip label="PM" active={pm} onPress={() => { if (!pm) onChange(minutes + 720); }} />
      </View>
    </View>
  );
}

function Stepper({ label, onMinus, onPlus, name }: { label: string; onMinus: () => void; onPlus: () => void; name: string }) {
  return (
    <View style={styles.stepperSmall}>
      <Pressable onPress={onMinus} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={`Earlier ${name}`} hitSlop={6}>
        <Minus size={16} color={theme.colors.text.primary} />
      </Pressable>
      <Text style={styles.stepValueSmall}>{label}</Text>
      <Pressable onPress={onPlus} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={`Later ${name}`} hitSlop={6}>
        <Plus size={16} color={theme.colors.text.primary} />
      </Pressable>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Bottom sheet shell with Cancel / primary action. */
export function Sheet({
  visible,
  title,
  primaryLabel,
  onPrimary,
  onClose,
  primaryDisabled,
  children,
}: {
  visible: boolean;
  title: string;
  primaryLabel: string;
  onPrimary: () => void;
  onClose: () => void;
  primaryDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button"><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable onPress={onPrimary} disabled={primaryDisabled} style={[styles.primary, primaryDisabled && { opacity: 0.5 }]} accessibilityRole="button">
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#F1F3F5" },
  chipActive: { backgroundColor: theme.colors.brand.navy },
  chipText: { fontSize: 13, fontWeight: "700", color: theme.colors.text.secondary },
  chipTextActive: { color: "#FFFFFF" },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: theme.colors.border.subtle, borderRadius: 12, padding: 6 },
  stepButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F2EE" },
  stepValue: { fontSize: 15, fontWeight: "700", color: theme.colors.text.primary },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepperSmall: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: theme.colors.border.subtle, borderRadius: 12, padding: 4 },
  stepValueSmall: { minWidth: 28, textAlign: "center", fontSize: 18, fontWeight: "800", color: theme.colors.text.primary },
  colon: { fontSize: 18, fontWeight: "800", color: theme.colors.text.primary },
  ampm: { flexDirection: "row", gap: 6, marginLeft: 6 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,21,34,0.4)" },
  sheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28, gap: 16, maxHeight: "85%" },
  sheetTitle: { fontSize: 19, fontWeight: "800", color: theme.colors.text.primary },
  label: { fontSize: 13, fontWeight: "700", color: theme.colors.text.secondary },
  actions: { flexDirection: "row", gap: 10 },
  cancel: { flex: 1, minHeight: 48, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border.subtle, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 15, fontWeight: "700", color: theme.colors.text.secondary },
  primary: { flex: 1, minHeight: 48, borderRadius: theme.radius.control, backgroundColor: theme.colors.accent.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
});
