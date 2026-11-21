import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react-native";
import theme from "../lib/theme";
import { LocalUserPreferences } from "../lib/offline-sync";

export interface ChiefOfStaffProps {
  todayTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority?: string | number | null;
    deadline_at?: string | null;
    estimate_user_min?: number | null;
  }>;
  overdueTasks: Array<{
    id: string;
    title: string;
    deadline_at?: string | null;
  }>;
  preferences: LocalUserPreferences;
  calendarBusyMinutes: number;
  onStartFocus: (taskId: string, title: string) => void;
  onRescheduleOverdue: (taskIds: string[]) => void;
  onOpenTask?: (taskId: string) => void;
}

export function ChiefOfStaffCard({
  todayTasks,
  overdueTasks,
  preferences,
  calendarBusyMinutes,
  onStartFocus,
  onRescheduleOverdue,
  onOpenTask,
}: ChiefOfStaffProps) {
  const [explainVisible, setExplainVisible] = useState(false);

  // 1. Pending tasks for today
  const pendingTasks = todayTasks.filter((t) => t.status !== "completed");
  const completedTasks = todayTasks.filter((t) => t.status === "completed");

  // 2. Compute available working minutes
  const [startHour, startMin] = (preferences.work_start_time || "09:00").split(":").map(Number);
  const [endHour, endMin] = (preferences.work_end_time || "18:00").split(":").map(Number);
  const totalWorkMin = Math.max(0, (endHour * 60 + (endMin || 0)) - (startHour * 60 + (startMin || 0)));
  const availableMin = Math.max(0, totalWorkMin - calendarBusyMinutes);

  // 3. Compute total estimated pending workload
  const estimatedMin = pendingTasks.reduce((acc, t) => acc + (t.estimate_user_min || 30), 0);
  const isWorkloadOverloaded = estimatedMin > availableMin && availableMin > 0;

  // 4. Determine Recommended Next Action
  // Priority order: Urgent/High priority with deadline today, then first pending
  const recommendedTask =
    pendingTasks.find((t) => t.priority === "urgent" || t.priority === "high") ||
    pendingTasks[0] ||
    null;

  return (
    <View style={styles.card}>
      {/* Briefing Header */}
      <View style={styles.headerRow}>
        <View style={styles.briefingBadge}>
          <Sparkles size={14} color={theme.colors.accent.primary} />
          <Text style={styles.briefingBadgeText}>AI CHIEF OF STAFF</Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => setExplainVisible(true)}
          style={styles.helpButton}
          accessibilityLabel="How Chief of Staff works"
        >
          <HelpCircle size={16} color={theme.colors.text.secondary} />
        </Pressable>
      </View>

      {/* Daily Pulse Summary */}
      <Text style={styles.headline}>
        {pendingTasks.length === 0 && completedTasks.length > 0
          ? "You've cleared your plan for today! 🎉"
          : pendingTasks.length === 0
            ? "Your schedule is clear. Plan ahead or capture an idea."
            : `${pendingTasks.length} ${pendingTasks.length === 1 ? "priority task" : "priority tasks"} need your attention.`}
      </Text>

      {/* Metrics Row: Available Time & Commitment */}
      <View style={styles.statsStrip}>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Available Work</Text>
          <Text style={styles.statVal}>{Math.round(availableMin / 60)}h {availableMin % 60}m</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Planned Time</Text>
          <Text style={styles.statVal}>{Math.round(estimatedMin / 60)}h {estimatedMin % 60}m</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Calendar Busy</Text>
          <Text style={styles.statVal}>{calendarBusyMinutes}m</Text>
        </View>
      </View>

      {/* Workload Warning if Overloaded */}
      {isWorkloadOverloaded && (
        <View style={styles.warningBox}>
          <AlertTriangle size={15} color="#D97706" />
          <Text style={styles.warningText}>
            Workload warning: Estimated work ({Math.round(estimatedMin / 60)}h) exceeds remaining working window ({Math.round(availableMin / 60)}h). Consider moving low priority tasks to backlog.
          </Text>
        </View>
      )}

      {/* Overdue Task Banner */}
      {overdueTasks.length > 0 && (
        <View style={styles.overdueBox}>
          <View style={styles.overdueCopy}>
            <Text style={styles.overdueTitle}>
              {overdueTasks.length} {overdueTasks.length === 1 ? "task is overdue" : "tasks are overdue"}
            </Text>
            <Text style={styles.overdueSubtitle}>
              {overdueTasks.map((t) => t.title).slice(0, 2).join(", ")}
              {overdueTasks.length > 2 ? ` +${overdueTasks.length - 2} more` : ""}
            </Text>
          </View>
          <Pressable
            style={styles.rescheduleBtn}
            onPress={() => onRescheduleOverdue(overdueTasks.map((t) => t.id))}
            accessibilityRole="button"
          >
            <RotateCcw size={12} color="#FFFFFF" />
            <Text style={styles.rescheduleBtnText}>Push to Today</Text>
          </Pressable>
        </View>
      )}

      {/* Recommended Next Action */}
      {recommendedTask && (
        <View style={styles.recommendationContainer}>
          <Text style={styles.sectionHeader}>RECOMMENDED NEXT ACTION</Text>
          <View style={styles.recommendationCard}>
            <View style={styles.recIconWrap}>
              <Clock size={16} color={theme.colors.accent.primary} />
            </View>
            <Pressable
              style={styles.recCopy}
              onPress={() => onOpenTask?.(recommendedTask.id)}
            >
              <Text style={styles.recTitle} numberOfLines={1}>
                {recommendedTask.title}
              </Text>
              <Text style={styles.recMeta}>
                {recommendedTask.estimate_user_min ? `${recommendedTask.estimate_user_min} min` : "Est. 30 min"} · {recommendedTask.priority ? `${String(recommendedTask.priority).toUpperCase()} priority` : "Normal priority"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.startFocusBtn}
              onPress={() => onStartFocus(recommendedTask.id, recommendedTask.title)}
              accessibilityRole="button"
              accessibilityLabel={`Start focus timer on ${recommendedTask.title}`}
            >
              <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.startFocusBtnText}>Focus</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Explainability Modal */}
      <Modal
        visible={explainVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setExplainVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Brain size={18} color={theme.colors.accent.primary} />
                <Text style={styles.modalTitle}>Chief of Staff Intelligence</Text>
              </View>
              <Pressable onPress={() => setExplainVisible(false)} hitSlop={10}>
                <X size={20} color={theme.colors.text.secondary} />
              </Pressable>
            </View>

            <Text style={styles.modalBody}>
              ALIBI analyzes your fixed calendar commitments, task deadlines, priority tags, and duration estimates to calculate realistic work blocks without human bias.
            </Text>

            <View style={styles.ruleList}>
              <View style={styles.ruleItem}>
                <CheckCircle2 size={15} color={theme.colors.accent.emerald} />
                <Text style={styles.ruleText}>
                  <Text style={styles.bold}>Zero Fabricated Data:</Text> All time windows and priorities are derived from your actual database records.
                </Text>
              </View>
              <View style={styles.ruleItem}>
                <CheckCircle2 size={15} color={theme.colors.accent.emerald} />
                <Text style={styles.ruleText}>
                  <Text style={styles.bold}>Working Window:</Text> Configured from {preferences.work_start_time} to {preferences.work_end_time} ({preferences.timezone}).
                </Text>
              </View>
              <View style={styles.ruleItem}>
                <CheckCircle2 size={15} color={theme.colors.accent.emerald} />
                <Text style={styles.ruleText}>
                  <Text style={styles.bold}>Adaptive Learning:</Text> Task duration estimates calibrate automatically as your focus sessions are completed.
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => setExplainVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Understood</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 12,
    shadowColor: theme.colors.brand.navy,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  briefingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.brand.peachLight,
    borderWidth: 1,
    borderColor: theme.colors.brand.peachBorder,
  },
  briefingBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.colors.brand.peachText,
    letterSpacing: 0.6,
  },
  helpButton: {
    padding: 4,
  },
  headline: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    color: theme.colors.text.primary,
    letterSpacing: -0.3,
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface.surface2,
    borderRadius: theme.radius.cardSecondary,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.text.secondary,
    textTransform: "uppercase",
  },
  statVal: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.text.primary,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.border.subtle,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    padding: 10,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#92400E",
    fontWeight: "600",
  },
  overdueBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FEF2F2",
    borderRadius: theme.radius.cardSecondary,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: 8,
  },
  overdueCopy: {
    flex: 1,
  },
  overdueTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#991B1B",
  },
  overdueSubtitle: {
    fontSize: 10.5,
    color: "#B91C1C",
    marginTop: 2,
  },
  rescheduleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DC2626",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.control,
    minHeight: 36,
  },
  rescheduleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  recommendationContainer: {
    gap: 6,
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.text.muted,
    letterSpacing: 0.8,
  },
  recommendationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.background.base,
    borderRadius: theme.radius.cardSecondary,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  recIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.brand.peach,
    alignItems: "center",
    justifyContent: "center",
  },
  recCopy: {
    flex: 1,
  },
  recTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  recMeta: {
    fontSize: 10.5,
    color: theme.colors.text.secondary,
    marginTop: 1,
  },
  startFocusBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.colors.accent.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.control,
    minHeight: 36,
  },
  startFocusBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11,32,48,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: theme.radius.card,
    padding: 22,
    width: "100%",
    maxWidth: 420,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.colors.text.primary,
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text.secondary,
  },
  ruleList: {
    gap: 10,
    backgroundColor: theme.colors.surface.surface2,
    padding: 12,
    borderRadius: theme.radius.cardSecondary,
  },
  ruleItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  ruleText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: theme.colors.text.primary,
  },
  bold: {
    fontWeight: "700",
  },
  modalCloseBtn: {
    backgroundColor: theme.colors.brand.navy,
    borderRadius: theme.radius.control,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
