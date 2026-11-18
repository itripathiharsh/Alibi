import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Calendar as CalendarIcon, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Sparkles, UserRound, X } from "lucide-react-native";
import theme from "../../lib/theme";
import { BrandHeader, SunriseArt } from "../../components/brand-ui";
import { ensureAuthenticated, getUserProfile } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";
import { DEFAULT_DEADLINE_REMINDER_LEAD_MIN, syncTaskDeadlineReminders } from "../../lib/task-deadline-reminders";

interface ScheduledTask {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  deadline_at: string | null;
  estimate_user_min: number | null;
  tags: string[];
}

interface CalendarEvent {
  id: string;
  title: string;
  kind: string;
  source: string;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  task_id: string | null;
}

interface ScheduleBlock {
  task_id: string;
  title: string;
  start_at: string;
  end_at: string;
  duration_min: number;
  reasons: string[];
}

interface ScheduleRecommendation {
  id: string;
  status: string;
  proposals: ScheduleBlock[];
  unscheduled: { task_id: string; title: string; needed_min: number | null; reason: string }[];
  explanation_text: string | null;
}

type CalendarItem =
  | { type: "task"; id: string; title: string; start_at: string; task: ScheduledTask }
  | { type: "event"; id: string; title: string; start_at: string; event: CalendarEvent };

function weekRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function CalendarScreen() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<ScheduleRecommendation | null>(null);
  const [planHorizonDays, setPlanHorizonDays] = useState(1);
  const [selectedBlocks, setSelectedBlocks] = useState<number[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  const range = useMemo(() => weekRange(selectedDate), [selectedDate]);
  const fetchCalendarData = useCallback(async () => {
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to load your calendar.");
      const cachedUser = await getUserProfile();
      const reminderLeadMin = typeof cachedUser?.settings?.reminder_lead_min === "number"
        ? cachedUser.settings.reminder_lead_min
        : DEFAULT_DEADLINE_REMINDER_LEAD_MIN;
      const baseUrl = getServerUrl();
      const from = encodeURIComponent(range.start.toISOString());
      const to = encodeURIComponent(range.end.toISOString());
      const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
      const [taskResponse, eventResponse] = await Promise.all([
        fetch(`${baseUrl}/api/v1/tasks?view=all&limit=200&from=${from}&to=${to}`, { headers }),
        fetch(`${baseUrl}/api/v1/scheduling/events?start_at=${from}&end_at=${to}`, { headers }),
      ]);
      if (!taskResponse.ok || !eventResponse.ok) {
        throw new Error("Your calendar could not be refreshed. Try again.");
      }
      const [taskData, eventData] = await Promise.all([taskResponse.json(), eventResponse.json()]);
      setTasks(Array.isArray(taskData) ? taskData : []);
      if (Array.isArray(taskData)) void syncTaskDeadlineReminders(taskData, reminderLeadMin);
      setEvents(Array.isArray(eventData) ? eventData : []);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "Your calendar could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [range]);

  useEffect(() => { void fetchCalendarData(); }, [fetchCalendarData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    void fetchCalendarData();
  };

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(range.start);
    date.setDate(date.getDate() + index);
    return date;
  }), [range]);

  const dayItems = useMemo<CalendarItem[]>(() => {
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dueTasks: CalendarItem[] = tasks
      .filter((task) => task.deadline_at && sameDay(new Date(task.deadline_at), selectedDate))
      .map((task) => ({ type: "task", id: task.id, title: task.title, start_at: task.deadline_at!, task }));
    const calendarEvents: CalendarItem[] = events
      .filter((event) => new Date(event.start_at) < dayEnd && new Date(event.end_at) >= dayStart)
      .map((event) => ({ type: "event", id: event.id, title: event.title, start_at: event.start_at, event }));
    return [...dueTasks, ...calendarEvents].sort((left, right) => left.start_at.localeCompare(right.start_at));
  }, [events, selectedDate, tasks]);

  const changeWeek = (direction: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + direction * 7);
    setSelectedDate(next);
  };

  const generatePlan = async (horizonDays: number) => {
    if (isGeneratingPlan) return;
    setIsGeneratingPlan(true);
    setPlanHorizonDays(horizonDays);
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to create a day plan.");
      const response = await fetch(`${getServerUrl()}/api/v1/scheduling/proposals/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ scope: horizonDays === 1 ? "day" : "horizon", horizon_days: horizonDays }),
      });
      const result = await response.json() as ScheduleRecommendation & { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "ALIBI could not prepare a plan.");
      setRecommendation(result);
      setSelectedBlocks(result.proposals.map((_, index) => index));
    } catch (error: unknown) {
      Alert.alert("Plan unavailable", error instanceof Error ? error.message : "Try again when you are online.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const decidePlan = async (acceptSelected: boolean) => {
    if (!recommendation || isSavingPlan) return;
    setIsSavingPlan(true);
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to save your plan.");
      const chosen = acceptSelected ? selectedBlocks : [];
      const allSelected = chosen.length === recommendation.proposals.length;
      const action = chosen.length === 0 ? "reject" : allSelected ? "accept" : "partially_accept";
      const response = await fetch(`${getServerUrl()}/api/v1/scheduling/proposals/${recommendation.id}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, accepted_indices: action === "partially_accept" ? chosen : null }),
      });
      const result = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "Your plan could not be saved.");
      setRecommendation(null);
      await fetchCalendarData();
    } catch (error: unknown) {
      Alert.alert("Plan not saved", error instanceof Error ? error.message : "Try refreshing and creating a new plan.");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const monthLabel = selectedDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selectedLabel = sameDay(selectedDate, new Date())
    ? "Today's schedule"
    : selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <View style={styles.container}>
      <SunriseArt height={180} />
      <BrandHeader right={<Pressable style={styles.headerAction} onPress={() => router.push("/(tabs)/profile")} accessibilityLabel="Open profile"><UserRound size={21} color={theme.colors.text.primary} /></Pressable>} />
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subtitle}>Your tasks and planned work, together.</Text>
        </View>
        <View style={styles.monthSelector}>
          <Pressable onPress={() => changeWeek(-1)} style={styles.navArrow} accessibilityLabel="Previous week"><ChevronLeft size={18} color={theme.colors.text.secondary} /></Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable onPress={() => changeWeek(1)} style={styles.navArrow} accessibilityLabel="Next week"><ChevronRight size={18} color={theme.colors.text.secondary} /></Pressable>
        </View>
      </View>

      <View style={styles.weekStrip}>
        {weekDates.map((date) => {
          const isSelected = sameDay(date, selectedDate);
          const isToday = sameDay(date, new Date());
          return (
            <Pressable key={date.toISOString()} style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && !isSelected && styles.dayCellToday]} onPress={() => setSelectedDate(date)} accessibilityRole="button" accessibilityState={{ selected: isSelected }}>
              <Text style={[styles.dayOfWeekText, isSelected && styles.dayTextSelected]}>{date.toLocaleDateString(undefined, { weekday: "short" })}</Text>
              <Text style={[styles.dayNumText, isSelected && styles.dayNumSelected]}>{date.getDate()}</Text>
              {isToday && <View style={[styles.todayDot, isSelected && styles.todayDotSelected]} />}
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.colors.accent.amber} />}>
        <View style={styles.planCard}>
          <View style={styles.planIntro}><View style={styles.planIcon}><Sparkles size={19} color={theme.colors.accent.amber} /></View><View style={styles.planCopy}><Text style={styles.planTitle}>{isGeneratingPlan ? "Building your plan…" : "Plan around your real workload"}</Text><Text style={styles.planSubtitle}>Fit estimated tasks around your calendar. Review every block before it is scheduled.</Text></View>{isGeneratingPlan && <ActivityIndicator color={theme.colors.accent.amber} />}</View>
          <View style={styles.planActions}><Pressable style={styles.planAction} onPress={() => { void generatePlan(1); }} disabled={isGeneratingPlan}><Text style={styles.planActionLabel}>Plan today</Text></Pressable><Pressable style={styles.planActionSecondary} onPress={() => { void generatePlan(7); }} disabled={isGeneratingPlan}><Text style={styles.planActionSecondaryLabel}>Plan 7 days</Text></Pressable></View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{selectedLabel}</Text>
          <Text style={styles.taskCountBadge}>{dayItems.length}</Text>
        </View>

        {isLoading ? <ActivityIndicator size="large" color={theme.colors.accent.amber} style={styles.loading} /> : loadError ? (
          <View style={styles.emptyCard}><CalendarIcon size={32} color={theme.colors.text.muted} /><Text style={styles.emptyTitle}>Calendar unavailable</Text><Text style={styles.emptySubtitle}>{loadError}</Text><Pressable style={styles.retryButton} onPress={onRefresh}><Text style={styles.retryLabel}>Try again</Text></Pressable></View>
        ) : dayItems.length === 0 ? (
          <View style={styles.emptyCard}><CalendarIcon size={32} color={theme.colors.text.muted} /><Text style={styles.emptyTitle}>Nothing scheduled for this day</Text><Text style={styles.emptySubtitle}>Deadlines and calendar blocks will show here when you add them.</Text></View>
        ) : dayItems.map((item) => {
          const isTask = item.type === "task";
          const event = isTask ? null : item.event;
          const complete = isTask && item.task.status === "completed";
          return (
            <View key={`${item.type}-${item.id}`} style={[styles.itemCard, complete && styles.itemCardComplete]}>
              <View style={[styles.itemMarker, !isTask && styles.eventMarker]}>{complete ? <CheckCircle2 size={18} color={theme.colors.accent.emerald} /> : isTask ? <Circle size={18} color={theme.colors.accent.amber} /> : <CalendarIcon size={17} color={theme.colors.accent.blue} />}</View>
              <View style={styles.itemCopy}>
                <Text style={[styles.itemTitle, complete && styles.itemTitleComplete]}>{item.title}</Text>
                <Text style={styles.itemMeta}>{isTask ? `Deadline · ${formatTime(item.start_at)}` : `${event?.kind.replaceAll("_", " ")} · ${event?.is_all_day ? "All day" : `${formatTime(event!.start_at)} – ${formatTime(event!.end_at)}`}`}</Text>
                {isTask && item.task.estimate_user_min ? <Text style={styles.itemMeta}>Estimate · {item.task.estimate_user_min} min</Text> : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={Boolean(recommendation)} transparent animationType="slide" onRequestClose={() => setRecommendation(null)}>
        <View style={styles.backdrop}><View style={styles.reviewSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeading}><View style={styles.planIcon}><Sparkles size={18} color={theme.colors.accent.amber} /></View><View style={styles.headingCopy}><Text style={styles.planTitle}>Your day plan</Text><Text style={styles.planSubtitle}>Choose which work blocks to add to your calendar.</Text></View><Pressable onPress={() => setRecommendation(null)} accessibilityLabel="Close plan"><X size={21} color={theme.colors.text.secondary} /></Pressable></View>
          <ScrollView style={styles.proposalList} contentContainerStyle={styles.proposalContent}>
            {recommendation?.proposals.map((block, index) => {
              const chosen = selectedBlocks.includes(index);
              return <Pressable key={`${block.task_id}-${block.start_at}`} onPress={() => setSelectedBlocks((current) => chosen ? current.filter((item) => item !== index) : [...current, index])} style={[styles.proposalRow, chosen && styles.proposalRowSelected]} accessibilityRole="checkbox" accessibilityState={{ checked: chosen }}>
                <View style={[styles.checkbox, chosen && styles.checkboxSelected]}>{chosen && <Check size={13} color="#FFFFFF" />}</View>
                <View style={styles.proposalCopy}><Text style={styles.proposalTitle}>{block.title}</Text><Text style={styles.proposalMeta}>{planHorizonDays > 1 ? `${new Date(block.start_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ` : ""}{formatTime(block.start_at)} – {formatTime(block.end_at)} · {block.duration_min} min</Text><Text style={styles.reasonText}>{block.reasons.join(" · ")}</Text></View>
              </Pressable>;
            })}
            {recommendation?.proposals.length === 0 && <View style={styles.noProposal}><Text style={styles.emptyTitle}>No work blocks to propose</Text><Text style={styles.emptySubtitle}>Add tasks with estimates or free up time in your calendar, then try again.</Text></View>}
            {!!recommendation?.unscheduled.length && <View style={styles.unscheduledCard}><Text style={styles.unscheduledTitle}>Could not fit {recommendation.unscheduled.length} {recommendation.unscheduled.length === 1 ? "task" : "tasks"}</Text>{recommendation.unscheduled.map((task) => <Text key={task.task_id} style={styles.unscheduledText}>{task.title} · {task.reason.replaceAll("_", " ").toLowerCase()}</Text>)}</View>}
          </ScrollView>
          <View style={styles.sheetActions}><Pressable style={styles.secondaryButton} disabled={isSavingPlan} onPress={() => { void decidePlan(false); }}><Text style={styles.secondaryLabel}>Reject plan</Text></Pressable><Pressable style={[styles.primaryButton, isSavingPlan && styles.buttonDisabled]} disabled={isSavingPlan || selectedBlocks.length === 0} onPress={() => { void decidePlan(true); }}><Text style={styles.primaryLabel}>{isSavingPlan ? "Saving…" : `Add ${selectedBlocks.length} ${selectedBlocks.length === 1 ? "block" : "blocks"}`}</Text></Pressable></View>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.base },
  headerAction: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface.card, borderWidth: 1, borderColor: theme.colors.border.subtle },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16, gap: 8 },
  headingCopy: { flex: 1, gap: 2 },
  title: { fontSize: 23, fontWeight: "800", color: theme.colors.text.primary },
  subtitle: { color: theme.colors.text.secondary, fontSize: 12 },
  monthSelector: { flexDirection: "row", alignItems: "center", gap: 5 },
  navArrow: { padding: 6, borderRadius: 10, backgroundColor: theme.colors.surface.surface2 },
  monthLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.text.primary },
  weekStrip: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12, backgroundColor: theme.colors.surface.card, borderBottomWidth: 1, borderBottomColor: theme.colors.border.subtle },
  dayCell: { alignItems: "center", justifyContent: "center", paddingVertical: 9, width: 42, borderRadius: 14 },
  dayCellSelected: { backgroundColor: theme.colors.text.primary },
  dayCellToday: { borderWidth: 1, borderColor: theme.colors.accent.amber },
  dayOfWeekText: { fontSize: 10, fontWeight: "600", color: theme.colors.text.secondary, marginBottom: 4 },
  dayTextSelected: { color: theme.colors.text.muted },
  dayNumText: { fontSize: 15, fontWeight: "700", color: theme.colors.text.primary },
  dayNumSelected: { color: theme.colors.surface.card },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.accent.amber, marginTop: 4 },
  todayDotSelected: { backgroundColor: theme.colors.surface.card },
  content: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 28, gap: 12 },
  planCard: { gap: 12, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card },
  planIntro: { flexDirection: "row", alignItems: "center", gap: 12 },
  planActions: { flexDirection: "row", gap: 8 },
  planAction: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: theme.colors.text.primary },
  planActionLabel: { color: theme.colors.surface.card, fontSize: 12, fontWeight: "800" },
  planActionSecondary: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card },
  planActionSecondaryLabel: { color: theme.colors.text.primary, fontSize: 12, fontWeight: "800" },
  planIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1E7" },
  planCopy: { flex: 1 },
  planTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "800" },
  planSubtitle: { color: theme.colors.text.secondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text.primary },
  taskCountBadge: { fontSize: 11, fontWeight: "700", color: theme.colors.text.secondary, backgroundColor: theme.colors.surface.surface2, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9 },
  loading: { marginTop: 40 },
  itemCard: { flexDirection: "row", alignItems: "flex-start", gap: 11, backgroundColor: theme.colors.surface.card, borderRadius: 17, padding: 14, borderWidth: 1, borderColor: theme.colors.border.subtle },
  itemCardComplete: { backgroundColor: theme.colors.surface.surface2 },
  itemMarker: { paddingTop: 1 },
  eventMarker: { paddingTop: 1 },
  itemCopy: { flex: 1, gap: 5 },
  itemTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: "700" },
  itemTitleComplete: { color: theme.colors.text.muted, textDecorationLine: "line-through" },
  itemMeta: { color: theme.colors.text.secondary, fontSize: 11, textTransform: "capitalize" },
  emptyCard: { backgroundColor: theme.colors.surface.card, borderRadius: 18, padding: 28, alignItems: "center", marginTop: 14, borderWidth: 1, borderColor: theme.colors.border.subtle, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text.primary, marginTop: 6, textAlign: "center" },
  emptySubtitle: { fontSize: 12, color: theme.colors.text.secondary, textAlign: "center", lineHeight: 18 },
  retryButton: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.text.primary, marginTop: 4 },
  retryLabel: { color: theme.colors.surface.card, fontSize: 12, fontWeight: "800" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(8,24,37,.46)" },
  reviewSheet: { maxHeight: "90%", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 26, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: theme.colors.background.base },
  sheetHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 99, backgroundColor: theme.colors.border.subtle, marginBottom: 16 },
  sheetHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  proposalList: { marginTop: 15, flexGrow: 0 },
  proposalContent: { gap: 9, paddingBottom: 5 },
  proposalRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card },
  proposalRowSelected: { borderColor: theme.colors.accent.amber, backgroundColor: "#FFFAF6" },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: theme.colors.border.subtle, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { borderColor: theme.colors.accent.amber, backgroundColor: theme.colors.accent.amber },
  proposalCopy: { flex: 1, gap: 3 },
  proposalTitle: { color: theme.colors.text.primary, fontSize: 13, fontWeight: "800" },
  proposalMeta: { color: theme.colors.text.secondary, fontSize: 11, fontWeight: "600" },
  reasonText: { color: theme.colors.text.muted, fontSize: 10, textTransform: "capitalize" },
  noProposal: { padding: 18, alignItems: "center", gap: 5 },
  unscheduledCard: { padding: 14, borderRadius: 15, backgroundColor: theme.colors.surface.surface2, gap: 6 },
  unscheduledTitle: { color: theme.colors.text.primary, fontSize: 12, fontWeight: "800" },
  unscheduledText: { color: theme.colors.text.secondary, fontSize: 11, lineHeight: 16 },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  secondaryButton: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card },
  secondaryLabel: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: "700" },
  primaryButton: { flex: 1.2, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: theme.colors.text.primary },
  primaryLabel: { color: theme.colors.surface.card, fontSize: 13, fontWeight: "800" },
  buttonDisabled: { opacity: .55 },
});
