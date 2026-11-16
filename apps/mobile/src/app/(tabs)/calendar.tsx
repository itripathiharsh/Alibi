import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Tag as TagIcon,
  Plus,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { getAccessToken, ensureAuthenticated } from "../../lib/auth";
import { getServerUrl, autoDetectServer } from "../../lib/config";

interface ScheduledTask {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  deadline_at: string | null;
  estimate_user_min: number | null;
  tags: string[];
}

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCalendarTasks = useCallback(async () => {
    try {
      await autoDetectServer();
      const token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) return;

      const res = await fetch(`${baseUrl}/api/v1/tasks?view=upcoming`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendarTasks();
  }, [fetchCalendarTasks]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchCalendarTasks();
  };

  // Generate current week dates
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selectedDate);
    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) + i;
    return new Date(d.setDate(diff));
  });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const currentMonthYear = `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const changeWeek = (direction: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + direction * 7);
    setSelectedDate(next);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <CalendarIcon size={22} color={theme.colors.accent.amber} />
          <Text style={styles.title}>Schedule</Text>
        </View>
        <View style={styles.monthSelector}>
          <Pressable onPress={() => changeWeek(-1)} style={styles.navArrow}>
            <ChevronLeft size={18} color={theme.colors.text.secondary} />
          </Pressable>
          <Text style={styles.monthLabel}>{currentMonthYear}</Text>
          <Pressable onPress={() => changeWeek(1)} style={styles.navArrow}>
            <ChevronRight size={18} color={theme.colors.text.secondary} />
          </Pressable>
        </View>
      </View>

      {/* Week Strip */}
      <View style={styles.weekStrip}>
        {weekDates.map((date, idx) => {
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, new Date());
          return (
            <Pressable
              key={idx}
              style={[
                styles.dayCell,
                isSelected && styles.dayCellSelected,
                isToday && !isSelected && styles.dayCellToday,
              ]}
              onPress={() => setSelectedDate(date)}
            >
              <Text
                style={[
                  styles.dayOfWeekText,
                  isSelected && styles.dayTextSelected,
                ]}
              >
                {dayNames[idx]}
              </Text>
              <Text
                style={[
                  styles.dayNumText,
                  isSelected && styles.dayNumSelected,
                ]}
              >
                {date.getDate()}
              </Text>
              {isToday && (
                <View
                  style={[
                    styles.todayDot,
                    isSelected && { backgroundColor: "#FFFFFF" },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Content List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent.amber}
          />
        }
      >
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {isSameDay(selectedDate, new Date())
              ? "Today's Schedule"
              : `Events for ${selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </Text>
          <Text style={styles.taskCountBadge}>{tasks.length} items</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={theme.colors.accent.amber}
            style={{ marginTop: 40 }}
          />
        ) : tasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <CalendarIcon size={40} color={theme.colors.text.muted} />
            <Text style={styles.emptyTitle}>No scheduled events</Text>
            <Text style={styles.emptySubtitle}>
              You have a clear schedule for this day. Plan a new task or enjoy deep work!
            </Text>
          </View>
        ) : (
          tasks.map((task) => (
            <View key={task.id} style={styles.taskCard}>
              <View style={styles.taskHeaderRow}>
                {task.status === "completed" ? (
                  <CheckCircle2 size={18} color={theme.colors.accent.emerald} />
                ) : (
                  <Circle size={18} color={theme.colors.accent.amber} />
                )}
                <Text
                  style={[
                    styles.taskTitle,
                    task.status === "completed" && styles.taskTitleCompleted,
                  ]}
                >
                  {task.title}
                </Text>
              </View>

              <View style={styles.taskMetaRow}>
                {task.deadline_at && (
                  <View style={styles.metaBadge}>
                    <Clock size={12} color={theme.colors.accent.amber} />
                    <Text style={styles.metaBadgeText}>
                      {new Date(task.deadline_at).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                )}
                {task.estimate_user_min && (
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaBadgeText}>
                      ~{task.estimate_user_min} min
                    </Text>
                  </View>
                )}
                {task.tags?.map((tag) => (
                  <View key={tag} style={styles.metaBadge}>
                    <TagIcon size={11} color={theme.colors.text.secondary} />
                    <Text style={styles.metaBadgeText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.base,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 16,
    backgroundColor: theme.colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text.primary,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navArrow: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.surface.surface2,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  weekStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: theme.colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  dayCell: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    minWidth: 44,
  },
  dayCellSelected: {
    backgroundColor: "#0F172A",
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: theme.colors.accent.amber,
  },
  dayOfWeekText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text.secondary,
    marginBottom: 4,
  },
  dayNumText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  dayTextSelected: {
    color: "#94A3B8",
  },
  dayNumSelected: {
    color: "#FFFFFF",
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.accent.amber,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  taskCountBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.text.secondary,
    backgroundColor: theme.colors.surface.surface2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taskCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  taskHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text.primary,
    flex: 1,
  },
  taskTitleCompleted: {
    textDecorationLine: "line-through",
    color: theme.colors.text.muted,
  },
  taskMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 28,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.surface.surface2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaBadgeText: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontWeight: "500",
  },
  emptyCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginTop: 24,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text.primary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    textAlign: "center",
    lineHeight: 18,
  },
});

