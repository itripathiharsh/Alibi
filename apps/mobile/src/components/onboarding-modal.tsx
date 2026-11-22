import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Briefcase,
  Calendar,
  Check,
  Compass,
  GraduationCap,
  Rocket,
  Sliders,
  Sparkles,
  X,
} from "lucide-react-native";
import theme from "../lib/theme";
import { LocalUserPreferences, saveLocalUserPreferences } from "../lib/offline-sync";

export interface OnboardingModalProps {
  visible: boolean;
  userId: string;
  initialPreferences: LocalUserPreferences;
  onSave: (saved: LocalUserPreferences) => void;
  onClose: () => void;
}

const GOAL_OPTIONS = [
  { id: "founder", label: "Solo Founder / Startup", icon: Rocket },
  { id: "freelancer", label: "Freelancer / Consultant", icon: Briefcase },
  { id: "pro", label: "Corporate Professional", icon: Compass },
  { id: "student", label: "Student / Learner", icon: GraduationCap },
];

export function OnboardingModal({
  visible,
  userId,
  initialPreferences,
  onSave,
  onClose,
}: OnboardingModalProps) {
  const [startTime, setStartTime] = useState(initialPreferences.work_start_time || "09:00");
  const [endTime, setEndTime] = useState(initialPreferences.work_end_time || "18:00");
  const [planningStyle, setPlanningStyle] = useState<"priority" | "time_blocking">(
    initialPreferences.planning_style || "priority",
  );
  const [primaryGoal, setPrimaryGoal] = useState<string>(
    initialPreferences.primary_goal || "founder",
  );
  const [timezone, setTimezone] = useState(initialPreferences.timezone || "Asia/Kolkata");
  const [adaptiveLearning, setAdaptiveLearning] = useState(!initialPreferences.learning_paused);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const updated: LocalUserPreferences = {
      work_start_time: startTime.trim() || "09:00",
      work_end_time: endTime.trim() || "18:00",
      planning_style: planningStyle,
      learning_paused: !adaptiveLearning,
      timezone: timezone.trim() || "Asia/Kolkata",
      primary_goal: primaryGoal,
    };

    await saveLocalUserPreferences(userId, updated);
    setSaving(false);
    onSave(updated);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.header}>
            <View style={styles.badgeRow}>
              <Sparkles size={14} color={theme.colors.accent.primary} />
              <Text style={styles.badgeText}>PERSONAL OPERATING SYSTEM</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X size={20} color={theme.colors.text.secondary} />
            </Pressable>
          </View>

          <Text style={styles.title}>Personalize Your ALIBI</Text>
          <Text style={styles.subtitle}>
            Configure your work habits and scheduling preferences. You can update these anytime in Profile.
          </Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* 1. Primary Goal */}
            <Text style={styles.fieldLabel}>PRIMARY FOCUS</Text>
            <View style={styles.goalGrid}>
              {GOAL_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = primaryGoal === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.goalTile, active && styles.goalTileActive]}
                    onPress={() => setPrimaryGoal(opt.id)}
                  >
                    <Icon size={18} color={active ? theme.colors.accent.primary : theme.colors.text.secondary} />
                    <Text style={[styles.goalLabel, active && styles.goalLabelActive]}>
                      {opt.label}
                    </Text>
                    {active && <Check size={14} color={theme.colors.accent.primary} />}
                  </Pressable>
                );
              })}
            </View>

            {/* 2. Working Hours Window */}
            <Text style={styles.fieldLabel}>DAILY WORKING WINDOW</Text>
            <View style={styles.hoursRow}>
              <View style={styles.hourInputGroup}>
                <Text style={styles.hourSubLabel}>Start Time</Text>
                <TextInput
                  style={styles.timeInput}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="09:00"
                  maxLength={5}
                />
              </View>
              <Text style={styles.hoursSeparator}>to</Text>
              <View style={styles.hourInputGroup}>
                <Text style={styles.hourSubLabel}>End Time</Text>
                <TextInput
                  style={styles.timeInput}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="18:00"
                  maxLength={5}
                />
              </View>
            </View>

            {/* 3. Planning Style */}
            <Text style={styles.fieldLabel}>PREFERRED PLANNING STYLE</Text>
            <View style={styles.planningRow}>
              <Pressable
                style={[
                  styles.planningOption,
                  planningStyle === "priority" && styles.planningOptionActive,
                ]}
                onPress={() => setPlanningStyle("priority")}
              >
                <Sliders size={16} color={planningStyle === "priority" ? "#FFFFFF" : theme.colors.text.secondary} />
                <Text
                  style={[
                    styles.planningText,
                    planningStyle === "priority" && styles.planningTextActive,
                  ]}
                >
                  Priority-First
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.planningOption,
                  planningStyle === "time_blocking" && styles.planningOptionActive,
                ]}
                onPress={() => setPlanningStyle("time_blocking")}
              >
                <Calendar size={16} color={planningStyle === "time_blocking" ? "#FFFFFF" : theme.colors.text.secondary} />
                <Text
                  style={[
                    styles.planningText,
                    planningStyle === "time_blocking" && styles.planningTextActive,
                  ]}
                >
                  Time-Blocking
                </Text>
              </Pressable>
            </View>

            {/* 4. Adaptive Learning Engine Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleTitle}>Adaptive Duration Learning</Text>
                <Text style={styles.toggleSubtitle}>
                  Calibrate task time estimates from your focus sessions without human intervention.
                </Text>
              </View>
              <Switch
                value={adaptiveLearning}
                onValueChange={setAdaptiveLearning}
                trackColor={{ false: "#D1D5DB", true: theme.colors.brand.peachBorder }}
                thumbColor={adaptiveLearning ? theme.colors.accent.primary : "#F3F4F6"}
              />
            </View>
          </ScrollView>

          {/* Action Button */}
          <Pressable
            style={[styles.saveButton, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? "Saving…" : "Save Preferences"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11,32,48,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "88%",
    gap: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border.subtle,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.brand.peachLight,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: theme.radius.control,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.colors.brand.peachText,
    letterSpacing: 0.6,
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
  scroll: {
    maxHeight: 380,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.colors.text.muted,
    marginTop: 14,
    marginBottom: 8,
    letterSpacing: 0.6,
  },
  goalGrid: {
    gap: 8,
  },
  goalTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: theme.radius.cardSecondary,
    backgroundColor: theme.colors.surface.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  goalTileActive: {
    borderColor: theme.colors.accent.primary,
    backgroundColor: "#FFF8F3",
  },
  goalLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  goalLabelActive: {
    color: theme.colors.text.primary,
    fontWeight: "700",
  },
  hoursRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  hourInputGroup: {
    flex: 1,
    gap: 4,
  },
  hourSubLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text.secondary,
  },
  timeInput: {
    minHeight: 46,
    backgroundColor: theme.colors.surface.surface2,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  hoursSeparator: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text.secondary,
    marginTop: 18,
  },
  planningRow: {
    flexDirection: "row",
    gap: 10,
  },
  planningOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  planningOptionActive: {
    backgroundColor: theme.colors.brand.navy,
    borderColor: theme.colors.brand.navy,
  },
  planningText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text.secondary,
  },
  planningTextActive: {
    color: "#FFFFFF",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    marginTop: 14,
  },
  toggleTextCol: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  toggleSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.text.secondary,
  },
  saveButton: {
    minHeight: 48,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.6,
  },
});
