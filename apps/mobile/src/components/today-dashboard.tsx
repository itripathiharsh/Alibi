import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  RefreshControl,
  Modal,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Bell,
  PlusCircle,
  Mic,
  CheckSquare,
  Calendar as CalendarIcon,
  Layers,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Flag,
  Play,
  Pause,
  BarChart2,
  TrendingUp,
  Brain,
  X,
  Sun,
  Sunset,
  Shield,
  Star,
  Award,
} from "lucide-react-native";
import * as SecureStore from "expo-secure-store";
import theme from "../lib/theme";
import { BrandHeader, OfflineNoticeCard, SunriseArt } from "./brand-ui";
import { ensureAuthenticated, getUserProfile, saveUserProfile, setCachedIsOffline, useOfflineStatus } from "../lib/auth";
import { getServerUrl } from "../lib/config";
import { syncWorkNotifications } from "../lib/work-notifications";
import { requestSync } from "../lib/task-intake";
import { currentUserId } from "../lib/learning-signals";
import { DEFAULT_DEADLINE_REMINDER_LEAD_MIN, syncTaskDeadlineReminders } from "../lib/task-deadline-reminders";
import { triggerHaptic, startFocusNotification, stopFocusNotification } from "../lib/focus-session-notification";
import { ChiefOfStaffCard } from "./chief-of-staff-card";
import { RecommendationsCard } from "./recommendations-card";
import { formatClock } from "../lib/time-format";
import { OnboardingModal } from "./onboarding-modal";
import { ProjectManagerSheet } from "./project-manager-sheet";
import {
  cacheRunningTimers,
  cacheTaskView,
  getCachedTaskView,
  getLocalAnalyticsSummary,
  getLocalCalendarData,
  getLocalProjects,
  getLocalTimers,
  getLocalUserPreferences,
  LocalProjectRecord,
  LocalUserPreferences,
  moveTaskToTomorrowOffline,
  setTaskDoneOffline,
  startTaskTimerOffline,
  stopTaskTimerOffline,
  syncMobileAccount,
  updateTaskOffline,
  type LocalTask,
} from "../lib/offline-sync";

interface TaskItem {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: number | null;
  deadline_at: string | null;
  estimate_user_min: number | null;
  actual_min: number;
  reschedule_count?: number;
  tags: string[];
}

interface SummaryData {
  total_time_min: number;
  tasks_completed: number;
  tasks_pending: number;
  tasks_overdue: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  efficiency: number | null;
}

interface ScoreData {
  score: number | null;
  completion_component: number | null;
  on_time_component: number | null;
  accuracy_component: number | null;
  insufficient_data: boolean;
}

interface UserProfile {
  id?: string;
  email?: string;
  display_name?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
}

interface RunningTimer {
  id: string;
  task_id: string;
  started_at: string;
  source?: string;
}

/**
 * The former Home dashboard (focus score, Chief of Staff, kickoff, focus timer, plan).
 * Since the diary-style Today page (2026-11-22, owner request) it lives inside Insights;
 * `embedded` drops the screen chrome so Insights can host it under its own header.
 */
export function TodayDashboard({ embedded = false, header }: { embedded?: boolean; header?: React.ReactNode } = {}) {
  const router = useRouter();

  // State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [todayTasks, setTodayTasks] = useState<TaskItem[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<TaskItem[]>([]);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [learningTip, setLearningTip] = useState<string>(
    "ALIBI will surface a pattern after it has enough recorded work."
  );
  const [runningTimers, setRunningTimers] = useState<RunningTimer[]>([]);
  const [timerNow, setTimerNow] = useState(Date.now());

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isOffline } = useOfflineStatus();

  // Top 3 Daily Kickoff & Evening Sunset Sweep State
  const [top3TaskIds, setTop3TaskIds] = useState<string[]>([]);
  const [kickoffVisible, setKickoffVisible] = useState(false);
  const [sweepVisible, setSweepVisible] = useState(false);

  // Chief of Staff & Onboarding Preferences & Projects State
  const [preferences, setPreferences] = useState<LocalUserPreferences>({
    work_start_time: "09:00",
    work_end_time: "18:00",
    planning_style: "priority",
    learning_paused: false,
    timezone: "Asia/Kolkata",
    primary_goal: null,
  });
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [projects, setProjects] = useState<LocalProjectRecord[]>([]);
  const [projectsVisible, setProjectsVisible] = useState(false);

  const todayDateKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  }, []);

  const isEvening = useMemo(() => {
    return new Date().getHours() >= 17;
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(`alibi_top3_${todayDateKey}`).then((val) => {
      if (val) {
        try {
          setTop3TaskIds(JSON.parse(val));
        } catch { }
      }
    });
  }, [todayDateKey]);

  const toggleTop3Selection = (taskId: string) => {
    triggerHaptic("tap");
    setTop3TaskIds((prev) => {
      let next: string[];
      if (prev.includes(taskId)) {
        next = prev.filter((id) => id !== taskId);
      } else {
        if (prev.length >= 3) {
          Alert.alert("Top 3 Priorities", "You can pick up to 3 big rocks for maximum focus.");
          return prev;
        }
        next = [...prev, taskId];
      }
      void SecureStore.setItemAsync(`alibi_top3_${todayDateKey}`, JSON.stringify(next));
      return next;
    });
  };

  const handleSweepAllTomorrow = async () => {
    triggerHaptic("alert");
    const uncompleted = todayTasks.filter((t) => t.status !== "completed");
    setSweepVisible(false);
    // Saved on the phone and counted as a move, like every other reschedule. It used to
    // call the server only, so offline nothing moved while the list looked emptied. Each
    // task keeps its time of day (the same "Tomorrow" as check-ins and the Tasks list).
    const userId = await currentUserId();
    for (const task of uncompleted) {
      await moveTaskToTomorrowOffline(userId, task.id);
    }
    requestSync();
    void fetchDashboardData();
  };

  const overdueTasks = useMemo(() => {
    const now = Date.now();
    return todayTasks.filter((t) => t.status !== "completed" && t.deadline_at && Date.parse(t.deadline_at) < now);
  }, [todayTasks]);

  // Minutes of today's working window taken by calendar events on this phone. This used
  // to be 30 minutes per running timer, a made-up number (logic audit M6).
  const [calendarBusyMinutes, setCalendarBusyMinutes] = useState(0);
  useEffect(() => {
    void (async () => {
      try {
        const userId = await currentUserId();
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const { events } = await getLocalCalendarData(userId, dayStart.toISOString(), dayEnd.toISOString());
        const [sh, sm] = (preferences.work_start_time || "09:00").split(":").map(Number);
        const [eh, em] = (preferences.work_end_time || "18:00").split(":").map(Number);
        const windowStart = new Date(dayStart).setHours(sh || 0, sm || 0, 0, 0);
        const windowEnd = new Date(dayStart).setHours(eh || 0, em || 0, 0, 0);
        const spans = events
          .filter((event) => !event.is_all_day)
          .map((event) => [Math.max(Date.parse(event.start_at), windowStart), Math.min(Date.parse(event.end_at), windowEnd)] as const)
          .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
          .sort((a, b) => a[0] - b[0]);
        let busyMs = 0;
        let coveredUntil = windowStart;
        for (const [start, end] of spans) {
          const from = Math.max(start, coveredUntil);
          if (end > from) busyMs += end - from;
          coveredUntil = Math.max(coveredUntil, end);
        }
        setCalendarBusyMinutes(Math.round(busyMs / 60_000));
      } catch {
        setCalendarBusyMinutes(0);
      }
    })();
  }, [preferences.work_start_time, preferences.work_end_time, todayTasks]);

  const handleRescheduleOverdue = async (taskIds: string[]) => {
    triggerHaptic("tap");
    // Due by the end of the working day while that is still ahead, else by the end of
    // today. It was always 18:00, so after 6 PM the tasks were overdue again at once.
    const [eh, em] = (preferences.work_end_time || "18:00").split(":").map(Number);
    const due = new Date();
    due.setHours(eh || 18, em || 0, 0, 0);
    if (due.getTime() < Date.now() + 15 * 60_000) due.setHours(23, 59, 0, 0);
    const deadlineIso = due.toISOString();
    setTodayTasks((prev) =>
      prev.map((t) => (taskIds.includes(t.id) ? { ...t, deadline_at: deadlineIso } : t)),
    );
    const userId = await currentUserId();
    for (const id of taskIds) {
      const task = todayTasks.find((t) => t.id === id);
      await updateTaskOffline(userId, id, {
        deadline_at: deadlineIso,
        reschedule_count: (task?.reschedule_count ?? 0) + 1,
      });
    }
    requestSync();
    Alert.alert("Moved to today", `${taskIds.length} ${taskIds.length === 1 ? "task is" : "tasks are"} now due by ${formatClock(due)}.`);
  };

  const sortedTodayTasks = useMemo(() => {
    return [...todayTasks].sort((a, b) => {
      const aTop = top3TaskIds.includes(a.id);
      const bTop = top3TaskIds.includes(b.id);
      if (aTop && !bTop) return -1;
      if (!aTop && bTop) return 1;
      return 0;
    });
  }, [todayTasks, top3TaskIds]);

  const top3CompletedCount = useMemo(() => {
    return todayTasks.filter((t) => top3TaskIds.includes(t.id) && t.status === "completed").length;
  }, [todayTasks, top3TaskIds]);

  // Dynamic greeting based on current local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning,";
    if (hour < 17) return "Good Afternoon,";
    return "Good Evening,";
  }, []);

  const displayName = user?.display_name || (user?.email ? user.email.split("@")[0] : "") || "there";
  const userInitial = (user?.display_name?.[0] || (user?.email ? user.email[0] : "") || "A").toUpperCase();

  const openCapture = (voice = false) => {
    router.push(voice ? { pathname: "/capture", params: { voice: "1" } } : "/capture");
  };

  // Calculate today's tasks stats
  const { totalEstimatedMinutes, completedCount, totalCount, completionPercentage } = useMemo(() => {
    const totalEst = todayTasks.reduce((acc, t) => acc + (t.estimate_user_min || 0), 0);
    const completed = todayTasks.filter((t) => t.status === "completed").length;
    const total = todayTasks.length || 1;
    const pct = Math.round((completed / total) * 100);
    return {
      totalEstimatedMinutes: totalEst,
      completedCount: completed,
      totalCount: todayTasks.length,
      completionPercentage: pct,
    };
  }, [todayTasks]);

  const totalEstHours = Math.floor(totalEstimatedMinutes / 60);
  const totalEstMins = totalEstimatedMinutes % 60;

  // Mini Calendar current week dates
  const weekDates = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startDiff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(startDiff + i);
      return d;
    });
  }, []);

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const currentMonthYear = `${monthNames[new Date().getMonth()]} ${new Date().getFullYear()}`;

  // Fetch all live dashboard data
  const fetchDashboardData = useCallback(async () => {
    let resolvedProfile = await getUserProfile();
    const effectiveUserId = resolvedProfile?.id ?? "local_user";
    let offlineMode = !resolvedProfile || resolvedProfile.id === "local_user";

    try {
      const [cachedTasks, cachedTimers] = await Promise.all([
        getCachedTaskView(effectiveUserId, "today"),
        getLocalTimers(effectiveUserId),
      ]);
      if (cachedTasks) setTodayTasks(cachedTasks as TaskItem[]);
      setRunningTimers(cachedTimers);
      if (cachedTasks) setIsLoading(false);
    } catch {
      // Render the remote result if the local cache cannot be read.
    }

    try {
      const token = await ensureAuthenticated().catch(() => null); // refreshes an expired token
      if (!token) {
        offlineMode = true;
      } else {
        const baseUrl = getServerUrl();
        const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` };
        // Upload changes made on this phone first, so the lists below already have them.
        await syncMobileAccount(effectiveUserId, token, baseUrl).catch(() => undefined);

        const [userRes, tasksRes, upcomingRes, sumRes, scoreRes, timerRes, learnRes, notifsRes] = await Promise.all([
          fetch(`${baseUrl}/api/v1/auth/me`, { headers }).catch(() => null),
          fetch(`${baseUrl}/api/v1/tasks?view=today`, { headers }).catch(() => null),
          fetch(`${baseUrl}/api/v1/tasks?view=upcoming`, { headers }).catch(() => null),
          fetch(`${baseUrl}/api/v1/analytics/summary?period=daily`, { headers }).catch(() => null),
          fetch(`${baseUrl}/api/v1/analytics/productivity-score?period=daily`, { headers }).catch(() => null),
          fetch(`${baseUrl}/api/v1/time-entries/running/all`, { headers }).catch(() => null),
          fetch(`${baseUrl}/api/v1/learning/profile`, { headers }).catch(() => null),
          fetch(`${baseUrl}/api/v1/notifications`, { headers }).catch(() => null),
        ]);

        let reminderLeadMin = DEFAULT_DEADLINE_REMINDER_LEAD_MIN;
        if (userRes && userRes.ok) {
          const userData = await userRes.json() as UserProfile;
          setUser(userData);
          offlineMode = false;
          if (userData.id && userData.email && userData.timezone) {
            await saveUserProfile({
              id: userData.id,
              email: userData.email,
              display_name: userData.display_name ?? null,
              timezone: userData.timezone,
              settings: userData.settings,
            });
          }
          const configuredLead = userData.settings?.reminder_lead_min;
          if (typeof configuredLead === "number" && Number.isFinite(configuredLead)) reminderLeadMin = configuredLead;
        }
        const reminderTasks: TaskItem[] = [];
        if (tasksRes && tasksRes.ok) {
          const taskData = await tasksRes.json() as LocalTask[];
          const shown = await cacheTaskView(effectiveUserId, "today", taskData) as TaskItem[];
          setTodayTasks(shown);
          reminderTasks.push(...shown);
        }
        if (upcomingRes && upcomingRes.ok) {
          const upData = await upcomingRes.json() as TaskItem[];
          setUpcomingTasks(upData);
          reminderTasks.push(...upData);
        }
        void syncTaskDeadlineReminders(reminderTasks, reminderLeadMin);
        if (notifsRes && notifsRes.ok) {
          const notifs = await notifsRes.json();
          setHasUnreadNotifications(Array.isArray(notifs) && notifs.some((n: any) => n.status !== "dismissed"));
        }
        if (sumRes && sumRes.ok) {
          setSummary(await sumRes.json());
        }
        if (scoreRes && scoreRes.ok) {
          setScore(await scoreRes.json());
        }
        if (timerRes && timerRes.ok) {
          const timerData = await timerRes.json();
          setRunningTimers(await cacheRunningTimers(effectiveUserId, timerData));
          void syncWorkNotifications();
        }
        if (learnRes && learnRes.ok) {
          const profileData = await learnRes.json();
          if (profileData?.peak_window) {
            setLearningTip(`You tend to be most productive between ${profileData.peak_window}.`);
          }
        }
      }
    } catch {
      offlineMode = true;
    } finally {
      setCachedIsOffline(offlineMode);
      try {
        const prefs = await getLocalUserPreferences(effectiveUserId);
        setPreferences(prefs);
        const projs = await getLocalProjects(effectiveUserId);
        setProjects(projs);
      } catch {}
      if (offlineMode) {
        try {
          const cachedTasks = await getCachedTaskView(effectiveUserId, "today");
          if (cachedTasks) setTodayTasks(cachedTasks as TaskItem[]);
          setRunningTimers(await getLocalTimers(effectiveUserId));
          const localSummary = await getLocalAnalyticsSummary(effectiveUserId);
          setSummary(localSummary);
          setScore({ score: null, completion_component: null, on_time_component: null, accuracy_component: null, insufficient_data: true });
        } catch {}
      }
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const interval = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);


  const onRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  // Done / not done and the focus timer change the task on the phone first, the same way
  // as Today and Tasks; the outbox uploads them (logic audit).
  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const done = currentStatus !== "completed";
    triggerHaptic(done ? "complete" : "tap");
    setTodayTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: done ? "completed" : "pending" } : t)));
    const userId = await currentUserId();
    if (done && runningTimers.some((item) => item.task_id === taskId)) void stopFocusNotification();
    await setTaskDoneOffline(userId, taskId, done);
    setRunningTimers(await getLocalTimers(userId));
    void syncWorkNotifications();
    requestSync();
  };

  const handleStartFocusTimer = async (taskId?: string) => {
    triggerHaptic("tap");
    const targetTaskId = taskId || todayTasks.find((t) => t.status !== "completed")?.id;
    if (!targetTaskId) {
      openCapture();
      return;
    }
    const targetTask = todayTasks.find((t) => t.id === targetTaskId);
    const userId = await currentUserId();
    const timer = await startTaskTimerOffline(userId, targetTaskId);
    void startFocusNotification(
      targetTaskId,
      targetTask?.title || "Focus Session",
      timer.started_at,
      targetTask?.estimate_user_min || 25,
      true
    );
    setRunningTimers(await getLocalTimers(userId));
    setTodayTasks((prev) => prev.map((t) => (t.id === targetTaskId ? { ...t, status: "in_progress" } : t)));
    void syncWorkNotifications();
    requestSync();
  };

  const handleStopActiveTimer = async (timer: RunningTimer) => {
    triggerHaptic("tap");
    void stopFocusNotification();
    const userId = await currentUserId();
    await stopTaskTimerOffline(userId, timer.id);
    setRunningTimers(await getLocalTimers(userId));
    void syncWorkNotifications();
    requestSync();
  };

  // Helper for category badge styling
  const getCategoryStyle = (tags: string[]) => {
    const lower = tags.map((t) => t.toLowerCase());
    if (lower.some((t) => t.includes("work") || t.includes("dev") || t.includes("job"))) {
      return { label: "Work", color: "#F97316", bg: "#FFF7ED" };
    }
    if (lower.some((t) => t.includes("study") || t.includes("academic") || t.includes("quiz") || t.includes("exam"))) {
      return { label: "Academic", color: "#2563EB", bg: "#EFF6FF" };
    }
    if (lower.some((t) => t.includes("personal") || t.includes("health") || t.includes("gym") || t.includes("fit"))) {
      return { label: "Personal", color: "#16A34A", bg: "#F0FDF4" };
    }
    return { label: tags[0] ? `#${tags[0]}` : "General", color: "#64748B", bg: "#F8FAFC" };
  };

  // Filter tasks with deadlines for Today's Plan
  const planTasks = useMemo(() => {
    return todayTasks
      .filter((t) => t.deadline_at)
      .slice(0, 4)
      .map((t, idx) => {
        const timeStr = formatClock(t.deadline_at!);
        const colors = ["#F97316", "#0EA5E9", "#10B981", "#8B5CF6"];
        return {
          id: t.id,
          time: timeStr,
          title: t.title,
          color: colors[idx % colors.length],
        };
      });
  }, [todayTasks]);

  const activeTimer = runningTimers[0] || null;
  const activeTimerTask = useMemo(() => {
    if (!activeTimer) return null;
    return (
      todayTasks.find((t) => t.id === activeTimer.task_id) ||
      upcomingTasks.find((t) => t.id === activeTimer.task_id) ||
      null
    );
  }, [activeTimer, todayTasks, upcomingTasks]);

  const nextPendingTask = useMemo(() => {
    return todayTasks.find((t) => t.status !== "completed") || null;
  }, [todayTasks]);

  const allWeekTasks = useMemo(() => {
    return [...todayTasks, ...upcomingTasks];
  }, [todayTasks, upcomingTasks]);

  const { focusDisplayTimer, focusDisplaySubtitle, focusProgressPct } = useMemo(() => {
    if (activeTimer) {
      const elapsedSec = Math.max(0, Math.floor((timerNow - Date.parse(activeTimer.started_at)) / 1000));
      const hrs = Math.floor(elapsedSec / 3600);
      const mins = Math.floor((elapsedSec % 3600) / 60);
      const secs = elapsedSec % 60;
      const formatted = hrs > 0
        ? `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
        : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      const targetMin = activeTimerTask?.estimate_user_min || 25;
      const targetSec = targetMin * 60;
      const pct = Math.min(100, Math.round((elapsedSec / targetSec) * 100));
      const title = activeTimerTask?.title || "Deep Work";
      const extraCount = runningTimers.length > 1 ? ` (+${runningTimers.length - 1} more)` : "";
      return {
        focusDisplayTimer: formatted,
        focusDisplaySubtitle: `${title}${extraCount}`,
        focusProgressPct: pct,
      };
    }

    if (nextPendingTask) {
      const targetMin = nextPendingTask.estimate_user_min || 25;
      return {
        focusDisplayTimer: `${String(targetMin).padStart(2, "0")}:00`,
        focusDisplaySubtitle: nextPendingTask.title,
        focusProgressPct: 0,
      };
    }

    return {
      focusDisplayTimer: "00:00",
      focusDisplaySubtitle: "All caught up today! 🎉",
      focusProgressPct: 100,
    };
  }, [activeTimer, activeTimerTask, nextPendingTask, timerNow, runningTimers.length]);

  return (
    <View style={styles.container}>
      {embedded ? null : <SunriseArt height={175} />}
      {embedded ? null : <BrandHeader
        showOfflineBadge={isOffline}
        onOfflineBadgePress={() => router.push("/login")}
        right={
          <View style={styles.topRightActions}>
            <Pressable
              style={styles.bellBtn}
              onPress={() => router.push("/(tabs)/profile")}
              accessibilityLabel="Notifications"
            >
              <Bell size={20} color={theme.colors.text.primary} />
              {hasUnreadNotifications && <View style={styles.notificationDot} />}
            </Pressable>

            <Pressable
              style={styles.avatarBtn}
              onPress={() => router.push("/(tabs)/profile")}
              accessibilityLabel="Open profile"
            >
              <Text style={styles.avatarText}>{userInitial}</Text>
            </Pressable>
          </View>
        }
      />}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        overScrollMode="never"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent.amber}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {header}
        {isOffline && !embedded && (
          <OfflineNoticeCard
            featureName="Home"
            description="Working in local mode. Your tasks, active timers and today's schedule are saved to SQLite."
            actionText="Sign in to sync"
            onAction={() => router.push("/login")}
          />
        )}
        {/* Hero Greeting Section with warm peach banner */}
        {embedded ? null : <View style={styles.heroSection}>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroGreetingText}>{greeting}</Text>
            <Text style={styles.heroNameText}>{displayName} 👋</Text>
            <Text style={styles.heroSubtitleText}>
              Plan, focus and get more done today.
            </Text>
            <Pressable
              style={styles.heroHabitsChip}
              onPress={() => setOnboardingVisible(true)}
              accessibilityLabel="Work window and habits"
            >
              <Clock size={12} color="#C2410C" />
              <Text style={styles.heroHabitsText}>
                Work: {preferences.work_start_time || "09:00"}–{preferences.work_end_time || "18:00"} · {preferences.planning_style === "time_blocking" ? "Time-Blocked" : "Priorities"}
              </Text>
              <ChevronRight size={12} color="#C2410C" />
            </Pressable>
          </View>
          {/* Subtle warm sunset art element */}
          <View style={styles.heroArtDune} />
          <View style={styles.heroArtSun} />
        </View>}

        {/* AI Chief of Staff Briefing */}
        <ChiefOfStaffCard
          todayTasks={todayTasks}
          overdueTasks={overdueTasks}
          preferences={preferences}
          calendarBusyMinutes={calendarBusyMinutes}
          onStartFocus={(taskId) => {
            const active = runningTimers.find((t) => t.task_id === taskId);
            if (!active) {
              void handleStartFocusTimer(taskId);
            }
          }}
          onRescheduleOverdue={(taskIds) => {
            void handleRescheduleOverdue(taskIds);
          }}
        />

        {/* One tip counted from the user's own history (FR-LEARN-013) */}
        <RecommendationsCard />

        {/* Elevated Quick Capture Pill */}
        <Pressable
          style={styles.quickCapturePill}
          onPress={() => openCapture()}
          accessibilityLabel="Add a task"
        >
          <PlusCircle size={20} color={theme.colors.text.secondary} />
          <Text style={styles.quickCapturePlaceholder} numberOfLines={1}>
            Capture a task... (e.g. "Finish report by 6 PM")
          </Text>
          <Pressable
            style={styles.pillMicBtn}
            onPress={() => openCapture(true)}
            accessibilityLabel="Say a task"
          >
            <Mic size={18} color={theme.colors.accent.amber} />
          </Pressable>
        </Pressable>

        {/* 4 Action Shortcut Cards */}
        <View style={styles.actionGrid}>
          <Pressable
            style={styles.actionTile}
            onPress={() => openCapture()}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#FFF7ED" }]}>
              <CheckSquare size={20} color="#F97316" />
            </View>
            <Text style={styles.actionTileLabel}>New Task</Text>
          </Pressable>

          <Pressable
            style={styles.actionTile}
            onPress={() => router.push("/calendar")}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#EFF6FF" }]}>
              <CalendarIcon size={20} color="#2563EB" />
            </View>
            <Text style={styles.actionTileLabel}>Schedule</Text>
          </Pressable>

          <Pressable
            style={styles.actionTile}
            onPress={() => setProjectsVisible(true)}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#FAF5FF" }]}>
              <Layers size={20} color="#8B5CF6" />
            </View>
            <Text style={styles.actionTileLabel}>Projects</Text>
          </Pressable>

          <Pressable
            style={styles.actionTile}
            onPress={() => router.push("/vault")}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#F0FDF4" }]}>
              <BookOpen size={20} color="#16A34A" />
            </View>
            <Text style={styles.actionTileLabel}>Knowledge Vault</Text>
          </Pressable>
        </View>

        {/* Morning Kickoff Priority Banner */}
        {top3TaskIds.length === 0 ? (
          <Pressable style={styles.kickoffBanner} onPress={() => { triggerHaptic("tap"); setKickoffVisible(true); }}>
            <View style={styles.kickoffBannerIcon}>
              <Sun size={20} color="#EA580C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kickoffBannerTitle}>Morning Kickoff</Text>
              <Text style={styles.kickoffBannerSubtitle}>Pick your 3 Big Rocks to guard today's focus.</Text>
            </View>
            <View style={styles.kickoffBannerBadge}>
              <Text style={styles.kickoffBannerBadgeText}>Start</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable style={styles.kickoffBannerActive} onPress={() => { triggerHaptic("tap"); setKickoffVisible(true); }}>
            <View style={styles.kickoffBannerIconActive}>
              <Award size={20} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kickoffBannerTitle}>Today's Big Rocks ({top3CompletedCount}/3 completed)</Text>
              <Text style={styles.kickoffBannerSubtitle}>
                {top3CompletedCount === 3 ? "All 3 big rocks finished! Outstanding work!" : "Stay locked into your primary objectives."}
              </Text>
            </View>
            <View style={styles.kickoffBannerBadgeEdit}>
              <Text style={styles.kickoffBannerBadgeEditText}>Edit</Text>
            </View>
          </Pressable>
        )}

        {/* Evening Sunset Sweep Banner */}
        {isEvening && todayTasks.some((t) => t.status !== "completed") && (
          <Pressable style={styles.sunsetBanner} onPress={() => { triggerHaptic("tap"); setSweepVisible(true); }}>
            <View style={styles.sunsetBannerIcon}>
              <Sunset size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sunsetBannerTitle}>Evening Sunset Sweep</Text>
              <Text style={styles.sunsetBannerSubtitle}>
                {todayTasks.filter((t) => t.status !== "completed").length} tasks left. Clear your plate with zero guilt.
              </Text>
            </View>
            <View style={styles.sunsetBannerBadge}>
              <Text style={styles.sunsetBannerBadgeText}>Sweep</Text>
            </View>
          </Pressable>
        )}

        {/* 2-Column Content Grid: Left (Today) vs Right (Focus + Today's Plan) */}
        <View style={styles.twoColumnGrid}>
          {/* Left Column: Today Tasks Card */}
          <View style={styles.todayCard}>
            <View style={styles.todayHeaderRow}>
              <View>
                <Text style={styles.todayTitle}>Today</Text>
                <Text style={styles.todaySubheader}>
                  {totalCount} tasks • {totalEstimatedMinutes > 0 ? `~ ${totalEstHours}h ${totalEstMins}m estimated` : "No estimates yet"}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push("/tasks")}
                style={styles.headerChevron}
              >
                <ChevronRight size={18} color={theme.colors.text.secondary} />
              </Pressable>
            </View>

            <View style={styles.taskListContainer}>
              {todayTasks.length === 0 ? (
                <View style={styles.emptyTaskState}>
                  <CheckCircle2 size={24} color={theme.colors.accent.emerald} />
                  <Text style={styles.emptyTaskText}>No pending tasks for today! 🎉</Text>
                </View>
              ) : (
                sortedTodayTasks.slice(0, 5).map((task) => {
                  const cat = getCategoryStyle(task.tags || []);
                  const isCompleted = task.status === "completed";
                  return (
                    <View key={task.id} style={styles.taskListItem}>
                      <Pressable
                        onPress={() => handleToggleTask(task.id, task.status)}
                        style={styles.checkboxTouch}
                      >
                        {isCompleted ? (
                          <CheckCircle2 size={18} color={theme.colors.accent.emerald} />
                        ) : (
                          <View style={styles.squareCheckbox} />
                        )}
                      </Pressable>

                      <View style={styles.taskItemContent}>
                        <Pressable onPress={() => router.push({ pathname: "/(tabs)/tasks", params: { taskId: task.id } })} accessibilityRole="button" accessibilityLabel={`Open work log for ${task.title}`}>
                          <Text
                            style={[
                              styles.taskItemTitle,
                              isCompleted && styles.taskTitleDone,
                            ]}
                            numberOfLines={1}
                          >
                            {task.title}
                          </Text>
                        </Pressable>
                        <View style={styles.taskItemMeta}>
                          {top3TaskIds.includes(task.id) && (
                            <View style={styles.topPriorityPill}>
                              <Star size={9} color="#D97706" fill="#D97706" />
                              <Text style={styles.topPriorityText}>TOP 3</Text>
                            </View>
                          )}
                          <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
                            <Text style={[styles.catBadgeText, { color: cat.color }]}>
                              {cat.label}
                            </Text>
                          </View>
                          {task.estimate_user_min && (
                            <Text style={styles.metaEstimateText}>
                              • {task.estimate_user_min >= 60
                                ? `${Math.floor(task.estimate_user_min / 60)}h ${task.estimate_user_min % 60 ? `${task.estimate_user_min % 60}m` : ""}`
                                : `${task.estimate_user_min}m`}
                            </Text>
                          )}
                        </View>
                      </View>

                      {task.priority && task.priority <= 2 ? (
                        <Flag size={14} color="#F97316" fill="#F97316" />
                      ) : (
                        <Clock size={14} color={theme.colors.text.muted} />
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </View>

          {/* Right Column: Focus Card + Today's Plan */}
          <View style={styles.rightColumn}>
            {/* Unified Focus Card (Live active timer or next-up task starter) */}
            <View style={styles.focusCard}>
              <View style={styles.focusHeaderRow}>
                <Text style={styles.focusTitle}>Focus</Text>
                <Pressable
                  style={styles.playBtn}
                  onPress={() => {
                    if (activeTimer) {
                      handleStopActiveTimer(activeTimer);
                    } else {
                      handleStartFocusTimer();
                    }
                  }}
                  accessibilityLabel={activeTimer ? "Pause active timer" : "Start focus timer"}
                >
                  {activeTimer ? (
                    <Pause size={14} color="#FFFFFF" />
                  ) : (
                    <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
                  )}
                </Pressable>
              </View>

              <Text style={styles.focusTimerText}>
                {focusDisplayTimer}
              </Text>
              <Text style={styles.focusSubtitle} numberOfLines={1}>
                {focusDisplaySubtitle}
              </Text>

              {/* Progress bar */}
              <View style={styles.focusProgressBarTrack}>
                <View
                  style={[
                    styles.focusProgressBarFill,
                    { width: `${focusProgressPct}%` },
                  ]}
                />
              </View>

              {/* Soft decorative bottom peach accent */}
              <View style={styles.focusCardWave} />
            </View>

            {/* Today's Plan Card */}
            <View style={styles.planCard}>
              <View style={styles.planHeaderRow}>
                <CalendarIcon size={14} color="#F97316" />
                <Text style={styles.planTitle}>Today's Plan</Text>
              </View>

              {/* PLE Peak Energy Shield Indicator */}
              <View style={styles.energyShieldBanner}>
                <Shield size={12} color="#10B981" />
                <Text style={styles.energyShieldBannerText}>Peak Focus: 9:30 AM – 11:30 AM</Text>
              </View>

              <View style={styles.planList}>
                {planTasks.length === 0 ? (
                  <Text style={styles.emptyPlanText}>No events scheduled today.</Text>
                ) : (
                  planTasks.map((item) => (
                    <View key={item.id} style={styles.planItemRow}>
                      <View
                        style={[styles.planDot, { backgroundColor: item.color }]}
                      />
                      <Text style={styles.planTimeText}>{item.time}</Text>
                      <Text style={styles.planTitleText} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Middle Row Grid: Left (Progress) + Right (Mini Calendar Strip) */}
        <View style={styles.middleGridRow}>
          {/* Progress Card (Today vs Goal) */}
          <View style={styles.progressCard}>
            <View style={styles.progressHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <BarChart2 size={16} color="#F97316" />
                <View>
                  <Text style={styles.progressTitle}>Progress</Text>
                  <Text style={styles.progressSubtitle}>Today vs Goal</Text>
                </View>
              </View>
              <View style={styles.progressBadgePill}>
                <Text style={styles.progressBadgeText}>
                  {completionPercentage}%
                </Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(completionPercentage, 100)}%` },
                ]}
              />
            </View>

            {/* 3 Metric Columns */}
            <View style={styles.progressStatsRow}>
              <View style={styles.statCol}>
                <CheckCircle2 size={13} color="#F97316" />
                <Text style={styles.statVal}>
                  {completedCount} / {totalCount}
                </Text>
                <Text style={styles.statLbl}>Tasks</Text>
              </View>

              <View style={styles.statCol}>
                <Clock size={13} color="#F97316" />
                <Text style={styles.statVal}>
                  {Math.floor((summary?.total_time_min || 0) / 60)}h {(summary?.total_time_min || 0) % 60}m
                </Text>
                <Text style={styles.statLbl}>Focus Time</Text>
              </View>

              <View style={styles.statCol}>
                <TrendingUp size={13} color="#F97316" />
                <Text style={styles.statVal}>
                  {score?.score !== null && score?.score !== undefined ? `${score.score}%` : "—"}
                </Text>
                <Text style={styles.statLbl}>Efficiency</Text>
              </View>
            </View>
          </View>

          {/* Mini Calendar Widget */}
          <View style={styles.miniCalendarCard}>
            <View style={styles.miniCalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <CalendarIcon size={14} color="#0F172A" />
                <Text style={styles.miniCalTitle}>{currentMonthYear}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 4 }}>
                <Pressable
                  style={styles.calNavArrow}
                  onPress={() => router.push("/calendar")}
                >
                  <ChevronLeft size={14} color={theme.colors.text.secondary} />
                </Pressable>
                <Pressable
                  style={styles.calNavArrow}
                  onPress={() => router.push("/calendar")}
                >
                  <ChevronRight size={14} color={theme.colors.text.secondary} />
                </Pressable>
              </View>
            </View>

            {/* Days of Week Row */}
            <View style={styles.miniCalDaysRow}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <Text key={d} style={styles.miniCalDayLabel}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Day Numbers Row */}
            <View style={styles.miniCalNumsRow}>
              {weekDates.map((date, idx) => {
                const isToday = date.toDateString() === new Date().toDateString();
                const tasksForDate = allWeekTasks.filter((t) => {
                  if (!t.deadline_at) {
                    return isToday;
                  }
                  const d = new Date(t.deadline_at);
                  return (
                    d.getFullYear() === date.getFullYear() &&
                    d.getMonth() === date.getMonth() &&
                    d.getDate() === date.getDate()
                  );
                });
                const hasTask = tasksForDate.length > 0;
                const allDone = hasTask && tasksForDate.every((t) => t.status === "completed");
                return (
                  <View key={idx} style={styles.miniCalNumCol}>
                    <Pressable
                      style={[
                        styles.miniCalNumBox,
                        isToday && styles.miniCalNumBoxToday,
                      ]}
                      onPress={() => router.push("/calendar")}
                    >
                      <Text
                        style={[
                          styles.miniCalNumText,
                          isToday && styles.miniCalNumTextToday,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </Pressable>
                    {hasTask && (
                      <View
                        style={[
                          styles.miniCalDot,
                          {
                            backgroundColor: allDone ? "#10B981" : "#F97316",
                          },
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Bottom Card: Personal Learning Engine (PLE) */}
        <Pressable
          style={styles.pleCard}
          onPress={() => router.push("/reports")}
        >
          <View style={styles.pleIconBox}>
            <Brain size={20} color="#8B5CF6" />
          </View>
          <View style={styles.pleContent}>
            <Text style={styles.pleTitle}>Your Learning Engine</Text>
            <Text style={styles.pleSubtitle}>{learningTip}</Text>
          </View>
          <ChevronRight size={18} color="#94A3B8" />
        </Pressable>
      </ScrollView>


      {/* Morning Kickoff Modal */}
      <Modal visible={kickoffVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setKickoffVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Sun size={20} color="#EA580C" />
                <Text style={styles.modalTitle}>Morning Kickoff</Text>
              </View>
              <Pressable onPress={() => setKickoffVisible(false)} hitSlop={8}>
                <X size={20} color={theme.colors.text.secondary} />
              </Pressable>
            </View>
            <Text style={styles.modalSubheading}>
              Pick your 3 Big Rocks for today. They will be pinned at the top to protect your focus.
            </Text>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {todayTasks.length === 0 ? (
                <Text style={{ textAlign: "center", color: theme.colors.text.secondary, marginVertical: 20 }}>
                  No tasks created for today yet. Add tasks to select your top priorities!
                </Text>
              ) : (
                todayTasks.map((t) => {
                  const isSelected = top3TaskIds.includes(t.id);
                  return (
                    <Pressable
                      key={t.id}
                      style={[styles.kickoffItemRow, isSelected && styles.kickoffItemRowActive]}
                      onPress={() => toggleTop3Selection(t.id)}
                    >
                      <View style={[styles.kickoffItemStar, isSelected && styles.kickoffItemStarActive]}>
                        <Star size={16} color={isSelected ? "#D97706" : theme.colors.text.muted} fill={isSelected ? "#D97706" : "transparent"} />
                      </View>
                      <Text style={[styles.kickoffItemTitle, isSelected && styles.kickoffItemTitleActive]} numberOfLines={1}>
                        {t.title}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.confirmBtn} onPress={() => { triggerHaptic("complete"); setKickoffVisible(false); }}>
                <Text style={styles.confirmBtnText}>Lock In Top 3 ({top3TaskIds.length}/3)</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Evening Sunset Sweep Modal */}
      <Modal visible={sweepVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSweepVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Sunset size={20} color="#D97706" />
                <Text style={styles.modalTitle}>Evening Sunset Sweep</Text>
              </View>
              <Pressable onPress={() => setSweepVisible(false)} hitSlop={8}>
                <X size={20} color={theme.colors.text.secondary} />
              </Pressable>
            </View>
            <Text style={styles.modalSubheading}>
              Unfinished tasks left today? Sweep them to tomorrow with zero guilt, or complete them now.
            </Text>

            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              {todayTasks.filter((t) => t.status !== "completed").map((t) => (
                <View key={t.id} style={styles.sweepTaskItem}>
                  <Text style={styles.sweepTaskTitle} numberOfLines={1}>{t.title}</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Pressable
                      style={styles.sweepTaskDoneBtn}
                      onPress={() => {
                        handleToggleTask(t.id, t.status);
                      }}
                    >
                      <CheckCircle2 size={13} color="#10B981" />
                      <Text style={styles.sweepTaskBtnText}>Done</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={[styles.confirmBtn, { backgroundColor: "#0284C7" }]} onPress={handleSweepAllTomorrow}>
                <Text style={styles.confirmBtnText}>Move All Remaining to Tomorrow</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <OnboardingModal
        visible={onboardingVisible}
        userId={user?.id || "local_user"}
        initialPreferences={preferences}
        onClose={() => setOnboardingVisible(false)}
        onSave={(newPrefs: LocalUserPreferences) => {
          setPreferences(newPrefs);
        }}
      />
      <ProjectManagerSheet
        visible={projectsVisible}
        userId={user?.id || "local_user"}
        projects={projects}
        onClose={() => setProjectsVisible(false)}
        onRefreshProjects={() => {
          void fetchDashboardData();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.base,
  },
  topRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bellBtn: {
    position: "relative",
    padding: 6,
    borderRadius: 20,
  },
  notificationDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F97316",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 14,
    paddingBottom: 24,
  },
  heroSection: {
    position: "relative",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  heroTextContainer: {
    zIndex: 2,
    gap: 2,
  },
  heroGreetingText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  heroNameText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
    marginTop: 2,
    marginBottom: 4,
  },
  heroSubtitleText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "400",
  },
  heroHabitsChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FFEDD5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
    marginTop: 8,
  },
  heroHabitsText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#C2410C",
  },
  heroArtDune: {
    position: "absolute",
    right: -20,
    bottom: -30,
    width: 140,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FFEDD5",
    opacity: 0.6,
    transform: [{ rotate: "-15deg" }],
  },
  heroArtSun: {
    position: "absolute",
    right: 30,
    top: -15,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#FDBA74",
    opacity: 0.4,
  },
  quickCapturePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  quickCapturePlaceholder: {
    flex: 1,
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  pillMicBtn: {
    padding: 4,
  },
  actionGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  actionTile: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTileLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0F172A",
    textAlign: "center",
  },
  twoColumnGrid: {
    flexDirection: "row",
    gap: 12,
  },
  todayCard: {
    flex: 1.1,
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    shadowColor: theme.colors.brand.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  todayHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  todayTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  todaySubheader: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  headerChevron: {
    padding: 2,
  },
  taskListContainer: {
    gap: 10,
  },
  emptyTaskState: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
  },
  emptyTaskText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    textAlign: "center",
  },
  taskListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  checkboxTouch: {
    padding: 2,
  },
  squareCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
  },
  taskItemContent: {
    flex: 1,
    gap: 2,
  },
  taskItemTitle: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#0F172A",
  },
  taskTitleDone: {
    textDecorationLine: "line-through",
    color: "#94A3B8",
  },
  taskItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  metaEstimateText: {
    fontSize: 10,
    color: "#64748B",
  },
  rightColumn: {
    flex: 0.9,
    gap: 12,
  },
  focusCard: {
    position: "relative",
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    overflow: "hidden",
    shadowColor: theme.colors.brand.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  focusHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  focusTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  focusTimerText: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text.primary,
    marginTop: 6,
  },
  focusSubtitle: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontWeight: "500",
    marginBottom: 8,
  },
  focusProgressBarTrack: {
    height: 4,
    backgroundColor: theme.colors.surface.surface2,
    borderRadius: 2,
    overflow: "hidden",
  },
  focusProgressBarFill: {
    height: "100%",
    backgroundColor: theme.colors.accent.primary,
    borderRadius: 2,
  },
  focusCardWave: {
    position: "absolute",
    right: -10,
    bottom: -15,
    width: 60,
    height: 35,
    borderRadius: 20,
    backgroundColor: "#FFEDD5",
    opacity: 0.4,
  },
  planCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.card,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    shadowColor: theme.colors.brand.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  planHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  planTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  planList: {
    gap: 6,
  },
  emptyPlanText: {
    fontSize: 10.5,
    color: "#64748B",
    paddingVertical: 4,
  },
  planItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  planDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  planTimeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
    minWidth: 46,
  },
  planTitleText: {
    fontSize: 11,
    color: "#0F172A",
    fontWeight: "500",
    flex: 1,
  },
  middleGridRow: {
    flexDirection: "row",
    gap: 12,
  },
  progressCard: {
    flex: 1,
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    shadowColor: theme.colors.brand.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
    gap: 10,
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  progressSubtitle: {
    fontSize: 10,
    color: theme.colors.text.secondary,
  },
  progressBadgePill: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: theme.radius.control,
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#10B981",
  },
  progressTrack: {
    height: 5,
    backgroundColor: theme.colors.surface.surface2,
    borderRadius: 2.5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: theme.colors.accent.primary,
    borderRadius: 2.5,
  },
  progressStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  statCol: {
    alignItems: "center",
    gap: 2,
  },
  statVal: {
    fontSize: 11.5,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  statLbl: {
    fontSize: 9.5,
    color: theme.colors.text.secondary,
    fontWeight: "500",
  },
  miniCalendarCard: {
    flex: 1,
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.card,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    shadowColor: theme.colors.brand.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
    gap: 8,
  },
  miniCalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  miniCalTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  calNavArrow: {
    padding: 2,
  },
  miniCalDaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  miniCalDayLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: theme.colors.text.muted,
    width: 22,
    textAlign: "center",
  },
  miniCalNumsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  miniCalNumCol: {
    alignItems: "center",
    width: 22,
  },
  miniCalNumBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  miniCalNumBoxToday: {
    backgroundColor: theme.colors.brand.navy,
  },
  miniCalNumText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  miniCalNumTextToday: {
    color: "#FFFFFF",
  },
  miniCalDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  pleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EDE9FE",
    gap: 12,
    shadowColor: theme.colors.brand.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  pleIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  pleContent: {
    flex: 1,
    gap: 2,
  },
  pleTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  pleSubtitle: {
    fontSize: 11.5,
    color: theme.colors.text.secondary,
    lineHeight: 16,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(8,23,35,0.42)",
    justifyContent: "flex-end",
    paddingHorizontal: 0,
    paddingTop: 22,
  },
  modalContent: {
    backgroundColor: theme.colors.surface.card,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 20,
    paddingBottom: 30,
    gap: 14,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  listeningHintRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 8,
  },
  listeningHintText: {
    fontSize: 12,
    color: "#F97316",
    fontWeight: "600",
  },
  inputContainer: {
    position: "relative",
  },
  captureInput: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.cardSecondary,
    padding: 12,
    paddingRight: 44,
    color: theme.colors.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    minHeight: 74,
    textAlignVertical: "top",
  },
  inputMicBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  inputMicBtnActive: {
    backgroundColor: "#F97316",
  },
  optionSection: {
    gap: 6,
  },
  optionSectionHeader: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusOptionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statusOptionPillActivePending: {
    borderColor: "#F97316",
    backgroundColor: "#FFF7ED",
  },
  statusOptionPillActiveCompleted: {
    borderColor: "#10B981",
    backgroundColor: "#ECFDF5",
  },
  statusOptionText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  datePillActive: {
    borderColor: "#F97316",
    backgroundColor: "#FFF7ED",
  },
  datePillText: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "500",
  },
  datePillTextActive: {
    color: "#F97316",
    fontWeight: "600",
  },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  timePillActive: {
    borderColor: "#0EA5E9",
    backgroundColor: "#F0F9FF",
  },
  timePillText: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "500",
  },
  timePillTextActive: {
    color: "#0EA5E9",
    fontWeight: "600",
  },
  customInputSmall: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    color: "#0F172A",
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  clearOptionText: {
    fontSize: 11,
    color: "#F97316",
    fontWeight: "500",
  },
  suggestionSection: {
    gap: 6,
  },
  suggestionHeader: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipsRow: {
    gap: 6,
  },
  chip: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipText: {
    color: "#0F172A",
    fontSize: 11.5,
  },
  routineHint: { color: "#64748B", fontSize: 11 },
  routineSamples: { color: "#64748B", fontSize: 10, marginTop: 3 },
  routineLoading: { color: "#64748B", fontSize: 11 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: theme.colors.text.secondary,
    fontSize: 13.5,
    fontWeight: "600",
  },
  confirmBtn: {
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  kickoffBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  kickoffBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  kickoffBannerTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#92400E",
  },
  kickoffBannerSubtitle: {
    fontSize: 11.5,
    color: "#B45309",
    marginTop: 1,
  },
  kickoffBannerBadge: {
    backgroundColor: "#EA580C",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  kickoffBannerBadgeText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "700",
  },
  kickoffBannerActive: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#FEFCE8",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FEF08A",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  kickoffBannerIconActive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FEF08A",
    alignItems: "center",
    justifyContent: "center",
  },
  kickoffBannerBadgeEdit: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  kickoffBannerBadgeEditText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "700",
  },
  sunsetBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#FFF7ED",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FFEDD5",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sunsetBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  sunsetBannerTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#9A3412",
  },
  sunsetBannerSubtitle: {
    fontSize: 11.5,
    color: "#C2410C",
    marginTop: 1,
  },
  sunsetBannerBadge: {
    backgroundColor: "#D97706",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  sunsetBannerBadgeText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "700",
  },
  topPriorityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  topPriorityText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#B45309",
  },
  energyShieldBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  energyShieldBannerText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#059669",
  },
  modalSubheading: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  kickoffItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  kickoffItemRowActive: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  kickoffItemStar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  kickoffItemStarActive: {
    backgroundColor: "#FEF3C7",
  },
  kickoffItemTitle: {
    fontSize: 13.5,
    fontWeight: "500",
    color: theme.colors.text.primary,
    flex: 1,
  },
  kickoffItemTitleActive: {
    fontWeight: "700",
    color: "#92400E",
  },
  sweepTaskItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    marginBottom: 6,
  },
  sweepTaskTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.text.primary,
    flex: 1,
    marginRight: 8,
  },
  sweepTaskDoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#ECFDF5",
  },
  sweepTaskBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
});
