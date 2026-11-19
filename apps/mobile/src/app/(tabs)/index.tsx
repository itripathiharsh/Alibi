import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Image,
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
  Circle,
  Clock,
  Flag,
  Play,
  Pause,
  BarChart2,
  TrendingUp,
  Brain,
  Sparkles,
  X,
  Tag as TagIcon,
  Sun,
  Sunset,
  Shield,
  Star,
  Award,
} from "lucide-react-native";
import * as SecureStore from "expo-secure-store";
import theme from "../../lib/theme";
import { getAccessToken, ensureAuthenticated, getUserProfile, saveUserProfile } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";
import { startSpeechRecognition, stopSpeechRecognition } from "../../lib/speech";
import { cancelTaskTimerReminder, scheduleTaskTimerReminder } from "../../lib/timer-reminders";
import { DEFAULT_DEADLINE_REMINDER_LEAD_MIN, syncTaskDeadlineReminders } from "../../lib/task-deadline-reminders";
import { triggerHaptic, startFocusNotification, stopFocusNotification, startAmbientAudio, stopAmbientAudio } from "../../lib/focus-session-notification";
import { filterLearnedTaskRoutines, type LearnedTaskRoutine } from "../../lib/learned-routines";
import { CaptureReviewSheet } from "../../components/capture-review-sheet";
import { decideTaskExtraction, type TaskExtractionProposal } from "../../lib/task-extraction";
import { cacheRunningTimers, cacheTaskView, createTaskOffline, getCachedTaskView, getLocalTimers, makeOfflineId, removeLocalTimer, startTaskTimerOffline, stopTaskTimerOffline, syncMobileAccount, updateTaskOffline } from "../../lib/offline-sync";

interface TaskItem {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: number | null;
  deadline_at: string | null;
  estimate_user_min: number | null;
  actual_min: number;
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

interface KickoffSuggestion { id: string; title: string; reasons: string[] }
interface EndOfDayTask { id: string; title: string; status: string }
interface EndOfDayReview { completed_count: number; unfinished: EndOfDayTask[] }

function computeDeadlineIso(
  dateChoice: "today" | "tomorrow" | "next_week" | "custom" | null,
  customDate: string,
  timeChoice: string | null,
  customTime: string
): string | null {
  if (!dateChoice) return null;
  const target = new Date();
  if (dateChoice === "tomorrow") {
    target.setDate(target.getDate() + 1);
  } else if (dateChoice === "next_week") {
    target.setDate(target.getDate() + 7);
  } else if (dateChoice === "custom") {
    if (!customDate.trim()) return null;
    const parts = customDate.trim().split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
      target.setFullYear(year, month, day);
    } else {
      return null;
    }
  }

  let hours = 23;
  let mins = 59;
  if (timeChoice === "09:00") {
    hours = 9;
    mins = 0;
  } else if (timeChoice === "14:00") {
    hours = 14;
    mins = 0;
  } else if (timeChoice === "18:00") {
    hours = 18;
    mins = 0;
  } else if (timeChoice === "21:00") {
    hours = 21;
    mins = 0;
  } else if (timeChoice === "custom" && customTime.trim()) {
    const parts = customTime.trim().split(":");
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(m)) {
        hours = h;
        mins = m;
      }
    }
  }

  target.setHours(hours, mins, 0, 0);
  return target.toISOString();
}

export default function DashboardScreen() {
  const router = useRouter();

  // State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [todayTasks, setTodayTasks] = useState<TaskItem[]>([]);
  const [openTasks, setOpenTasks] = useState<TaskItem[]>([]);
  const [kickoffSuggestions, setKickoffSuggestions] = useState<KickoffSuggestion[]>([]);
  const [endOfDayReview, setEndOfDayReview] = useState<EndOfDayReview>({ completed_count: 0, unfinished: [] });
  const [upcomingTasks, setUpcomingTasks] = useState<TaskItem[]>([]);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [learningTip, setLearningTip] = useState<string>(
    "ALIBI will surface a pattern after it has enough recorded work."
  );
  const [runningTimers, setRunningTimers] = useState<RunningTimer[]>([]);
  const [timerNow, setTimerNow] = useState(Date.now());
  const [preferredFocusHours, setPreferredFocusHours] = useState<number[]>([]);
  const [focusSessionCount, setFocusSessionCount] = useState(0);
  const [ambientStyle, setAmbientStyle] = useState<"rain" | "white" | "brown" | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Quick Capture Modal State
  const [captureVisible, setCaptureVisible] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState<TaskExtractionProposal | null>(null);
  const [isReviewingExtraction, setIsReviewingExtraction] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [taskStatus, setTaskStatus] = useState<"pending" | "completed">("pending");
  const [selectedDate, setSelectedDate] = useState<"today" | "tomorrow" | "next_week" | "custom" | null>(null);
  const [customDateStr, setCustomDateStr] = useState("");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customTimeStr, setCustomTimeStr] = useState("");
  const [learnedRoutines, setLearnedRoutines] = useState<LearnedTaskRoutine[]>([]);

  // Top 3 Daily Kickoff & Evening Sunset Sweep State
  const [top3TaskIds, setTop3TaskIds] = useState<string[]>([]);
  const [kickoffDraftTaskIds, setKickoffDraftTaskIds] = useState<string[]>([]);
  const [kickoffLocalDate, setKickoffLocalDate] = useState("");
  const [kickoffVisible, setKickoffVisible] = useState(false);
  const [sweepVisible, setSweepVisible] = useState(false);

  const todayDateKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  }, []);

  const isAfterConfiguredWorkday = useMemo(() => {
    const settings = user?.settings ?? {};
    const workingHours = settings.working_hours as Record<string, { enabled?: boolean; end?: string }> | undefined;
    const dayName = new Date(timerNow).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    const todaySchedule = workingHours?.[dayName];
    if (!todaySchedule?.enabled || !todaySchedule.end) return false;
    const [hours, minutes] = todaySchedule.end.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
    const end = new Date(timerNow);
    end.setHours(hours, minutes, 0, 0);
    return timerNow >= end.getTime();
  }, [timerNow, user]);

  useEffect(() => {
    if (!user?.id) return;
    SecureStore.getItemAsync(`alibi_top3_${user.id}_${kickoffLocalDate || todayDateKey}`).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            const accepted = parsed.filter((id) => typeof id === "string").slice(0, 3);
            setTop3TaskIds(accepted);
            setKickoffDraftTaskIds(accepted);
          }
        } catch {}
      }
    });
  }, [kickoffLocalDate, todayDateKey, user?.id]);

  const toggleTop3Selection = (taskId: string) => {
    triggerHaptic("tap");
    setKickoffDraftTaskIds((prev) => {
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
      return next;
    });
  };

  const handleEndOfDayAction = async (task: EndOfDayTask, action: "tomorrow" | "backlog" | "cancel") => {
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to update this task.");
      const response = await fetch(`${getServerUrl()}/api/v1/tasks/${task.id}/end-of-day-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => ({})) as { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "This task could not be updated.");
      triggerHaptic(action === "cancel" ? "alert" : "complete");
      await fetchDashboardData();
    } catch (error) {
      Alert.alert("Review not saved", error instanceof Error ? error.message : "Try again.");
    }
  };

  const handleMarkReviewedTaskDone = async (taskId: string) => {
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to complete this task.");
      const response = await fetch(`${getServerUrl()}/api/v1/tasks/${taskId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!response.ok) throw new Error("This task could not be marked complete.");
      triggerHaptic("complete");
      await fetchDashboardData();
    } catch (error) {
      Alert.alert("Task not completed", error instanceof Error ? error.message : "Try again.");
    }
  };

  const handleSweepAllTomorrow = () => {
    if (!endOfDayReview.unfinished.length) return;
    Alert.alert(
      "Move all unfinished tasks?",
      "Each open task will move to the start of your next configured workday. ALIBI will keep existing calendar events unchanged.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Move tasks", onPress: () => {
          void (async () => {
            const token = await ensureAuthenticated();
            if (!token) return Alert.alert("Sign in required", "Sign in to move these tasks.");
            const results = await Promise.all(endOfDayReview.unfinished.map(async (task) => {
              const response = await fetch(`${getServerUrl()}/api/v1/tasks/${task.id}/end-of-day-action`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: "tomorrow" }),
              });
              return response.ok;
            }));
            const failed = results.filter((ok) => !ok).length;
            if (failed) Alert.alert("Some tasks were not moved", `${failed} task${failed === 1 ? "" : "s"} need another review.`);
            else setSweepVisible(false);
            await fetchDashboardData();
          })();
        } },
      ],
    );
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
    return openTasks.filter((t) => top3TaskIds.includes(t.id) && t.status === "completed").length;
  }, [openTasks, top3TaskIds]);

  // Dynamic greeting based on current local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning,";
    if (hour < 17) return "Good Afternoon,";
    return "Good Evening,";
  }, []);

  const displayName = user?.display_name || (user?.email ? user.email.split("@")[0] : "") || "there";
  const userInitial = (user?.display_name?.[0] || (user?.email ? user.email[0] : "") || "A").toUpperCase();

  const openCapture = () => {
    setCaptureVisible(true);
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
    const profile = await getUserProfile();
    if (profile) {
      try {
        const [cachedTasks, cachedTimers] = await Promise.all([
          getCachedTaskView(profile.id, "today"),
          getLocalTimers(profile.id),
        ]);
        if (cachedTasks) setTodayTasks(cachedTasks as TaskItem[]);
        setRunningTimers(cachedTimers);
        if (cachedTasks) setIsLoading(false);
      } catch {
        // Render the remote result if the local cache cannot be read.
      }
    }
    try {
      const token = (await getAccessToken()) || (await ensureAuthenticated());
      const baseUrl = getServerUrl();
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [userRes, tasksRes, upcomingRes, allTasksRes, kickoffRes, endOfDayRes, sumRes, scoreRes, timerRes, learnRes, notifsRes] = await Promise.all([
        fetch(`${baseUrl}/api/v1/auth/me`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/tasks?view=today`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/tasks?view=upcoming`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/tasks?view=all&limit=200`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/tasks/daily-kickoff`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/tasks/end-of-day`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/analytics/summary?period=daily`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/analytics/productivity-score?period=daily`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/time-entries/running/all`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/learning/profile`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/notifications`, { headers }).catch(() => null),
      ]);

      let reminderLeadMin = DEFAULT_DEADLINE_REMINDER_LEAD_MIN;
      let accountId = profile?.id;
      let accountTimezone = profile?.timezone;
      if (userRes && userRes.ok) {
        const userData = await userRes.json() as UserProfile;
        setUser(userData);
        accountId = userData.id ?? accountId;
        accountTimezone = userData.timezone ?? accountTimezone;
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
        const taskData = await tasksRes.json() as TaskItem[];
        setTodayTasks(taskData);
        reminderTasks.push(...taskData);
        if (profile) await cacheTaskView(profile.id, "today", taskData);
      }
      if (upcomingRes && upcomingRes.ok) {
        const upData = await upcomingRes.json() as TaskItem[];
        setUpcomingTasks(upData);
        reminderTasks.push(...upData);
      }
      if (allTasksRes && allTasksRes.ok) {
        const allTaskData = await allTasksRes.json() as TaskItem[];
        setOpenTasks(allTaskData.filter((task) => task.status !== "cancelled"));
      }
      if (kickoffRes && kickoffRes.ok) {
        const kickoff = await kickoffRes.json() as { suggestions?: KickoffSuggestion[]; local_date?: string };
        const suggestions = Array.isArray(kickoff.suggestions) ? kickoff.suggestions : [];
        const localDate = kickoff.local_date ?? todayDateKey;
        setKickoffLocalDate(localDate);
        setKickoffSuggestions(suggestions);
        if (accountId) {
          const storageKey = `alibi_top3_${accountId}_${localDate}`;
          const promptKey = `alibi_kickoff_prompted_${accountId}_${localDate}`;
          const [saved, prompted] = await Promise.all([
            SecureStore.getItemAsync(storageKey),
            SecureStore.getItemAsync(promptKey),
          ]);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) {
                const accepted = parsed.filter((id) => typeof id === "string").slice(0, 3);
                setTop3TaskIds(accepted);
                setKickoffDraftTaskIds(accepted);
              }
            } catch {
              setKickoffDraftTaskIds(suggestions.map((item) => item.id).slice(0, 3));
            }
          } else {
            const suggestedIds = suggestions.map((item) => item.id).slice(0, 3);
            setKickoffDraftTaskIds(suggestedIds);
            const morningHour = Number(new Intl.DateTimeFormat("en-US", {
              hour: "2-digit",
              hourCycle: "h23",
              ...(accountTimezone ? { timeZone: accountTimezone } : {}),
            }).format(new Date()));
            if (!prompted && suggestedIds.length > 0 && morningHour >= 6 && morningHour <= 10) {
              await SecureStore.setItemAsync(promptKey, "1");
              setKickoffVisible(true);
            }
          }
        }
      }
      if (endOfDayRes && endOfDayRes.ok) setEndOfDayReview(await endOfDayRes.json() as EndOfDayReview);
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
        if (profile) setRunningTimers(await cacheRunningTimers(profile.id, timerData));
        else setRunningTimers(timerData);
      }
      if (learnRes && learnRes.ok) {
        const learningProfile = await learnRes.json();
        setLearnedRoutines(filterLearnedTaskRoutines(learningProfile?.routines));
        const preference = Array.isArray(learningProfile?.preferences)
          ? learningProfile.preferences.find((item: { preferred_hours?: unknown }) => Array.isArray(item.preferred_hours) && item.preferred_hours.length > 0)
          : null;
        const learnedHours = Array.isArray(preference?.preferred_hours)
          ? preference.preferred_hours.filter((hour: unknown): hour is number => Number.isInteger(hour) && Number(hour) >= 0 && Number(hour) < 24)
          : [];
        setPreferredFocusHours(learnedHours);
        const samples = typeof preference?.session_count === "number" ? preference.session_count : 0;
        setFocusSessionCount(samples);
        if (learnedHours.length > 0 && samples > 0) {
          const peak = new Date();
          peak.setHours(learnedHours[0], 0, 0, 0);
          setLearningTip(`Most recorded work starts around ${peak.toLocaleTimeString([], { hour: "numeric" })} (${samples} timed sessions).`);
        } else {
          setLearningTip("ALIBI will surface a focus pattern after you record more work sessions.");
        }
      }
      if (profile && token) void syncMobileAccount(profile.id, token, baseUrl).catch(() => undefined);
    } catch {
      if (profile) {
        const cachedTasks = await getCachedTaskView(profile.id, "today");
        if (cachedTasks) setTodayTasks(cachedTasks as TaskItem[]);
        setRunningTimers(await getLocalTimers(profile.id));
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [todayDateKey]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const interval = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => { stopAmbientAudio(); }, []);


  const onRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  // Toggle task status
  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    if (newStatus === "completed") {
      triggerHaptic("complete");
    } else {
      triggerHaptic("tap");
    }
    const profile = await getUserProfile();
    const activeTimer = runningTimers.find((item) => item.task_id === taskId);
    setTodayTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      const baseUrl = getServerUrl();
      const token = await ensureAuthenticated();
      if (!token || activeTimer?.source === "local") {
        if (profile) {
          await updateTaskOffline(profile.id, taskId, { status: newStatus as TaskItem["status"] });
          if (newStatus === "completed" && activeTimer) {
            await stopTaskTimerOffline(profile.id, activeTimer.id);
            await removeLocalTimer(profile.id, activeTimer.id);
            setRunningTimers((current) => current.filter((item) => item.id !== activeTimer.id));
            await cancelTaskTimerReminder(activeTimer.id);
            void stopFocusNotification();
          }
        }
        return;
      }
      const res = await fetch(`${baseUrl}/api/v1/tasks/${taskId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Task status could not be updated.");
      if (newStatus === "completed") {
        if (activeTimer) {
          const stopResponse = await fetch(`${baseUrl}/api/v1/time-entries/${activeTimer.id}/stop`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!stopResponse.ok) throw new Error("Timer could not be stopped.");
          await cancelTaskTimerReminder(activeTimer.id);
          void stopFocusNotification();
          if (profile) await removeLocalTimer(profile.id, activeTimer.id);
          setRunningTimers((current) => current.filter((item) => item.id !== activeTimer.id));
        }
      }
      fetchDashboardData();
    } catch {
      if (profile) {
        await updateTaskOffline(profile.id, taskId, { status: newStatus as TaskItem["status"] });
        if (newStatus === "completed" && activeTimer) {
          await stopTaskTimerOffline(profile.id, activeTimer.id);
          await removeLocalTimer(profile.id, activeTimer.id);
          setRunningTimers((current) => current.filter((item) => item.id !== activeTimer.id));
          await cancelTaskTimerReminder(activeTimer.id);
          void stopFocusNotification();
        }
      } else {
        setTodayTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: currentStatus as TaskItem["status"] } : t)));
      }
    }
  };

  // Live database-backed focus timer actions
  const handleStartFocusTimer = async (taskId?: string) => {
    triggerHaptic("tap");
    const targetTaskId = taskId || todayTasks.find((t) => t.status !== "completed")?.id;
    if (!targetTaskId) {
      openCapture();
      return;
    }
    const targetTask = todayTasks.find((t) => t.id === targetTaskId);
    const profile = await getUserProfile();
    const shallowTags = (targetTask?.tags ?? []).map((tag) => tag.trim().toLowerCase().replace(/^#/, ""));
    const isShallowTask = shallowTags.some((tag) => tag === "admin" || tag === "routine");
    if (isShallowTask && preferredFocusHours.includes(new Date().getHours())) {
      const continueNow = await new Promise<boolean>((resolve) => Alert.alert(
        "Your learned focus hour",
        `${learningTip} This task is tagged for routine or admin work. You can review the calendar or continue now.`,
        [
          { text: "Not now", style: "cancel", onPress: () => resolve(false) },
          { text: "Review calendar", onPress: () => { resolve(false); router.push("/calendar"); } },
          { text: "Start anyway", onPress: () => resolve(true) },
        ],
      ));
      if (!continueNow) return;
    }
    try {
      const baseUrl = getServerUrl();
      const token = await ensureAuthenticated();
      if (!token) {
        if (profile) {
          const localTimer = await startTaskTimerOffline(profile.id, targetTaskId);
          setRunningTimers((prev) => [localTimer, ...prev]);
          void startFocusNotification(
            targetTaskId,
            targetTask?.title ?? "Focus session",
            localTimer.started_at,
            targetTask?.estimate_user_min,
            profile.settings?.focus_show_task_name === true,
          );
          await scheduleTaskTimerReminder({
            timerId: localTimer.id,
            taskId: targetTaskId,
            startedAt: localTimer.started_at,
          });
        }
        return;
      }

      const res = await fetch(`${baseUrl}/api/v1/time-entries/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          task_id: targetTaskId,
          started_at: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        const timerData = await res.json();
        setRunningTimers((prev) => [timerData, ...prev]);
        void startFocusNotification(
          targetTaskId,
          targetTask?.title ?? "Focus session",
          timerData.started_at,
          targetTask?.estimate_user_min,
          profile?.settings?.focus_show_task_name === true,
        );
        if (profile) await cacheRunningTimers(profile.id, [timerData, ...runningTimers]);
        await scheduleTaskTimerReminder({
          timerId: timerData.id,
          taskId: targetTaskId,
          startedAt: timerData.started_at,
        });
        setTodayTasks((prev) =>
          prev.map((t) => (t.id === targetTaskId ? { ...t, status: "in_progress" } : t))
        );
      } else {
        const errJson = await res.json().catch(() => ({}));
        Alert.alert("Timer Error", errJson.detail || "Failed to start focus timer.");
      }
    } catch {
      if (profile) {
        const localTimer = await startTaskTimerOffline(profile.id, targetTaskId);
        setRunningTimers((prev) => [localTimer, ...prev]);
        void startFocusNotification(
          targetTaskId,
          targetTask?.title ?? "Focus session",
          localTimer.started_at,
          targetTask?.estimate_user_min,
          profile.settings?.focus_show_task_name === true,
        );
        await scheduleTaskTimerReminder({
          timerId: localTimer.id,
          taskId: targetTaskId,
          startedAt: localTimer.started_at,
        });
      }
    }
  };

  const handleStopActiveTimer = async (timer: RunningTimer) => {
    triggerHaptic("tap");
    void stopFocusNotification();
    const profile = await getUserProfile();
    try {
      const baseUrl = getServerUrl();
      const token = await ensureAuthenticated();
      if (!token || timer.source === "local") {
        if (profile) {
          await stopTaskTimerOffline(profile.id, timer.id);
          await removeLocalTimer(profile.id, timer.id);
          setRunningTimers((prev) => prev.filter((t) => t.id !== timer.id));
          await cancelTaskTimerReminder(timer.id);
        }
        return;
      }

      const res = await fetch(`${baseUrl}/api/v1/time-entries/${timer.id}/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ended_at: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        if (profile) await removeLocalTimer(profile.id, timer.id);
        setRunningTimers((prev) => prev.filter((t) => t.id !== timer.id));
        await cancelTaskTimerReminder(timer.id);
        fetchDashboardData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        Alert.alert("Timer Error", errJson.detail || "Failed to stop timer.");
      }
    } catch {
      if (profile) {
        await stopTaskTimerOffline(profile.id, timer.id);
        await removeLocalTimer(profile.id, timer.id);
        setRunningTimers((prev) => prev.filter((t) => t.id !== timer.id));
        await cancelTaskTimerReminder(timer.id);
      }
    }
  };

  // Speech Recognition for Quick Capture
  const handleMicPress = async () => {
    if (isListening) {
      await stopSpeechRecognition();
      setIsListening(false);
      return;
    }
    const baseText = captureText.trim();
    setIsListening(true);
    const ok = await startSpeechRecognition({
      onStart: () => setIsListening(true),
      onResults: (text, isFinal) => {
        const combined = baseText ? `${baseText} ${text}` : text;
        setCaptureText(combined);
        if (isFinal) setIsListening(false);
      },
      onError: (err) => {
        setIsListening(false);
        Alert.alert("Voice Input", err);
      },
      onEnd: () => setIsListening(false),
    });
    if (!ok) setIsListening(false);
  };

  const resetModal = () => {
    setCaptureText("");
    setTaskStatus("pending");
    setSelectedDate(null);
    setCustomDateStr("");
    setSelectedTime(null);
    setCustomTimeStr("");
    setIsListening(false);
  };

  const handleCaptureSubmit = async () => {
    if (!captureText.trim() || isCapturing) return;
    setIsCapturing(true);
    let profile: Awaited<ReturnType<typeof getUserProfile>> = null;
    let taskId: string | null = null;
    let deadlineIso: string | null = null;
    try {
      profile = await getUserProfile();
      taskId = makeOfflineId();
      deadlineIso = computeDeadlineIso(selectedDate, customDateStr, selectedTime, customTimeStr);
      const baseUrl = getServerUrl();
      const token = await ensureAuthenticated();
      if (!token) {
        if (!profile?.id) return;
        const task = await createTaskOffline(profile.id, {
          id: taskId,
          title: captureText.trim(),
          deadline_at: deadlineIso,
          origin: isListening ? "voice" : "manual",
        });
        setTodayTasks((previous) => [task as TaskItem, ...previous]);
        resetModal();
        setCaptureVisible(false);
        return;
      }

      const payload: Record<string, any> = {
        raw_input: captureText.trim(),
        origin: isListening ? "voice" : "manual",
        status: taskStatus || "pending",
      };
      if (taskId) payload.id = taskId;
      if (deadlineIso) payload.deadline_at = deadlineIso;

      const res = await fetch(`${baseUrl}/api/v1/tasks/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json() as { extraction?: TaskExtractionProposal | null };
        if (result.extraction) setPendingExtraction(result.extraction);
        resetModal();
        setCaptureVisible(false);
        fetchDashboardData();
      } else {
        const errJson = await res.json().catch(() => ({})) as any;
        const paramErrors = errJson.invalid_params?.map((p: any) => `${p.name}: ${p.reason}`).join("\n");
        Alert.alert("Capture Error", paramErrors || errJson.detail || "Failed to parse task.");
      }
    } catch (err: any) {
      if (profile?.id) {
        const task = await createTaskOffline(profile.id, {
          id: taskId || makeOfflineId(),
          title: captureText.trim(),
          deadline_at: deadlineIso,
          origin: "manual",
        });
        setTodayTasks((previous) => [task as TaskItem, ...previous]);
        resetModal();
        setCaptureVisible(false);
      } else {
        Alert.alert("Network Error", err?.message || "Failed to capture task.");
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const submitExtractionDecision = async (
    acceptedFields: Record<string, unknown>,
    rejectedFields: string[],
  ) => {
    if (!pendingExtraction || isReviewingExtraction) return;
    setIsReviewingExtraction(true);
    try {
      await decideTaskExtraction({
        taskId: pendingExtraction.task_id,
        acceptedFields,
        rejectedFields,
      });
      setPendingExtraction(null);
      await fetchDashboardData();
    } catch (error: unknown) {
      Alert.alert(
        "Review not saved",
        error instanceof Error ? error.message : "Please try reviewing the task again.",
      );
    } finally {
      setIsReviewingExtraction(false);
    }
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
        const timeStr = new Date(t.deadline_at!).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
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
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.logoRow}>
          <Image source={require("../../../assets/logo_full_light.png")} style={styles.homeLogo} resizeMode="contain" accessibilityLabel="ALIBI" />
        </View>

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
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent.amber}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Greeting Section with warm peach banner */}
        <View style={styles.heroSection}>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroGreetingText}>{greeting}</Text>
            <Text style={styles.heroNameText}>{displayName} 👋</Text>
            <Text style={styles.heroSubtitleText}>
              Plan, focus and get more done today.
            </Text>
          </View>
          {/* Subtle warm sunset art element */}
          <View style={styles.heroArtDune} />
          <View style={styles.heroArtSun} />
        </View>

        {/* Elevated Quick Capture Pill */}
        <Pressable
          style={styles.quickCapturePill}
          onPress={openCapture}
          accessibilityLabel="Open quick capture"
        >
          <PlusCircle size={20} color={theme.colors.text.secondary} />
          <Text style={styles.quickCapturePlaceholder} numberOfLines={1}>
            Capture a task... (e.g. "Finish report by 6 PM")
          </Text>
          <Pressable
            style={styles.pillMicBtn}
            onPress={() => {
              openCapture();
              handleMicPress();
            }}
          >
            <Mic size={18} color={theme.colors.accent.amber} />
          </Pressable>
        </Pressable>

        {/* 4 Action Shortcut Cards */}
        <View style={styles.actionGrid}>
          <Pressable
            style={styles.actionTile}
            onPress={openCapture}
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
            onPress={() => router.push("/vault")}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#FAF5FF" }]}>
              <Layers size={20} color="#8B5CF6" />
            </View>
            <Text style={styles.actionTileLabel}>Notes</Text>
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
              <Text style={styles.kickoffBannerTitle}>Today's Big Rocks ({top3CompletedCount}/{top3TaskIds.length} completed)</Text>
              <Text style={styles.kickoffBannerSubtitle}>
                {top3TaskIds.length > 0 && top3CompletedCount === top3TaskIds.length ? "Your selected priorities are complete." : "Stay with the priorities you chose."}
              </Text>
            </View>
            <View style={styles.kickoffBannerBadgeEdit}>
              <Text style={styles.kickoffBannerBadgeEditText}>Edit</Text>
            </View>
          </Pressable>
        )}

        {/* Evening Sunset Sweep Banner */}
        {user?.settings?.eod_sweep_enabled === true && isAfterConfiguredWorkday && endOfDayReview.unfinished.length > 0 && (
          <Pressable style={styles.sunsetBanner} onPress={() => { triggerHaptic("tap"); setSweepVisible(true); }}>
            <View style={styles.sunsetBannerIcon}>
              <Sunset size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sunsetBannerTitle}>Evening Sunset Sweep</Text>
              <Text style={styles.sunsetBannerSubtitle}>
                {endOfDayReview.completed_count} completed · {endOfDayReview.unfinished.length} unfinished. Choose what happens next.
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

              <View style={styles.ambientControls}>
                <Text style={styles.ambientCaption}>Offline sound</Text>
                {([
                  ["rain", "Rain"],
                  ["white", "White"],
                  ["brown", "Brown"],
                ] as const).map(([style, label]) => (
                  <Pressable
                    key={style}
                    disabled={!activeTimer}
                    onPress={() => {
                      if (!activeTimer) return;
                      if (ambientStyle === style) {
                        stopAmbientAudio();
                        setAmbientStyle(null);
                      } else if (startAmbientAudio(style)) {
                        setAmbientStyle(style);
                      }
                    }}
                    style={[styles.ambientChip, ambientStyle === style && styles.ambientChipActive, !activeTimer && styles.ambientChipDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={`${ambientStyle === style ? "Stop" : "Play"} ${label.toLowerCase()} focus sound`}
                  >
                    <Text style={[styles.ambientChipText, ambientStyle === style && styles.ambientChipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
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

              {preferredFocusHours.length > 0 && focusSessionCount > 0 && (() => {
                const localHour = new Date();
                localHour.setHours(preferredFocusHours[0], 0, 0, 0);
                return <View style={styles.energyShieldBanner}>
                  <Shield size={12} color="#10B981" />
                  <Text style={styles.energyShieldBannerText}>Learned start: {localHour.toLocaleTimeString([], { hour: "numeric" })} · {focusSessionCount} sessions</Text>
                </View>;
              })()}

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

      {/* Quick Capture Modal (with Real-time Voice, Status & Aligned Date/Time) */}
      <Modal visible={captureVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Sparkles size={18} color="#F97316" />
                <Text style={styles.modalTitle}>Quick Capture</Text>
              </View>
              <Pressable
                onPress={() => {
                  stopSpeechRecognition();
                  resetModal();
                  setCaptureVisible(false);
                }}
              >
                <X size={20} color={theme.colors.text.secondary} />
              </Pressable>
            </View>

            {isListening && (
              <View style={styles.listeningHintRow}>
                <Mic size={14} color="#F97316" />
                <Text style={styles.listeningHintText}>
                  Listening in real-time: Speak now... 🎙️
                </Text>
              </View>
            )}

            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ gap: 14, paddingBottom: 6 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.captureInput}
                  value={captureText}
                  onChangeText={setCaptureText}
                  placeholder="Type or dictate task... e.g. Finish report by 6 PM #work"
                  placeholderTextColor={theme.colors.text.secondary}
                  multiline
                  autoFocus
                />
                <Pressable
                  style={[styles.inputMicBtn, isListening && styles.inputMicBtnActive]}
                  onPress={handleMicPress}
                  accessibilityLabel="Activate speech dictation"
                >
                  <Mic size={18} color={isListening ? "#090D16" : "#F97316"} />
                </Pressable>
              </View>

              {/* Status Option */}
              <View style={styles.optionSection}>
                <Text style={styles.optionSectionHeader}>Status (Optional):</Text>
                <View style={styles.optionRow}>
                  <Pressable
                    style={[
                      styles.statusOptionPill,
                      taskStatus === "pending" && styles.statusOptionPillActivePending,
                    ]}
                    onPress={() => setTaskStatus("pending")}
                  >
                    <Circle
                      size={13}
                      color={taskStatus === "pending" ? "#F97316" : theme.colors.text.secondary}
                    />
                    <Text
                      style={[
                        styles.statusOptionText,
                        taskStatus === "pending" && { color: "#F97316", fontWeight: "600" },
                      ]}
                    >
                      Pending
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.statusOptionPill,
                      taskStatus === "completed" && styles.statusOptionPillActiveCompleted,
                    ]}
                    onPress={() => setTaskStatus("completed")}
                  >
                    <CheckCircle2
                      size={13}
                      color={taskStatus === "completed" ? "#10B981" : theme.colors.text.secondary}
                    />
                    <Text
                      style={[
                        styles.statusOptionText,
                        taskStatus === "completed" && { color: "#10B981", fontWeight: "600" },
                      ]}
                    >
                      Completed
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Date Option */}
              <View style={styles.optionSection}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.optionSectionHeader}>Due Date (Optional):</Text>
                  {selectedDate && (
                    <Pressable
                      onPress={() => {
                        setSelectedDate(null);
                        setSelectedTime(null);
                        setCustomDateStr("");
                        setCustomTimeStr("");
                      }}
                    >
                      <Text style={styles.clearOptionText}>Clear Date</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.optionRow}>
                  {[
                    { id: "today", label: "Today" },
                    { id: "tomorrow", label: "Tomorrow" },
                    { id: "next_week", label: "Next Week" },
                    { id: "custom", label: "Custom Date..." },
                  ].map((opt) => (
                    <Pressable
                      key={opt.id}
                      style={[styles.datePill, selectedDate === opt.id && styles.datePillActive]}
                      onPress={() =>
                        setSelectedDate(selectedDate === opt.id ? null : (opt.id as any))
                      }
                    >
                      <CalendarIcon
                        size={12}
                        color={selectedDate === opt.id ? "#F97316" : theme.colors.text.secondary}
                      />
                      <Text
                        style={[
                          styles.datePillText,
                          selectedDate === opt.id && styles.datePillTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {selectedDate === "custom" && (
                  <TextInput
                    style={styles.customInputSmall}
                    value={customDateStr}
                    onChangeText={setCustomDateStr}
                    placeholder="YYYY-MM-DD (e.g. 2026-11-20)"
                    placeholderTextColor={theme.colors.text.secondary}
                  />
                )}
              </View>

              {/* Time Option (Appears when Date is Chosen) */}
              {selectedDate && (
                <View style={styles.optionSection}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={styles.optionSectionHeader}>Due Time (Optional):</Text>
                    {selectedTime && (
                      <Pressable
                        onPress={() => {
                          setSelectedTime(null);
                          setCustomTimeStr("");
                        }}
                      >
                        <Text style={styles.clearOptionText}>Clear Time</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.optionRow}>
                    {[
                      { id: "09:00", label: "Morning 9 AM" },
                      { id: "14:00", label: "Afternoon 2 PM" },
                      { id: "18:00", label: "Evening 6 PM" },
                      { id: "21:00", label: "Night 9 PM" },
                      { id: "custom", label: "Custom Time..." },
                    ].map((tOpt) => (
                      <Pressable
                        key={tOpt.id}
                        style={[styles.timePill, selectedTime === tOpt.id && styles.timePillActive]}
                        onPress={() =>
                          setSelectedTime(selectedTime === tOpt.id ? null : tOpt.id)
                        }
                      >
                        <Clock
                          size={12}
                          color={selectedTime === tOpt.id ? "#0EA5E9" : theme.colors.text.secondary}
                        />
                        <Text
                          style={[
                            styles.timePillText,
                            selectedTime === tOpt.id && styles.timePillTextActive,
                          ]}
                        >
                          {tOpt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {selectedTime === "custom" && (
                    <TextInput
                      style={styles.customInputSmall}
                      value={customTimeStr}
                      onChangeText={setCustomTimeStr}
                      placeholder="HH:MM (24h, e.g. 17:30)"
                      placeholderTextColor={theme.colors.text.secondary}
                    />
                  )}
                </View>
              )}

              {learnedRoutines.length > 0 && (
                <View style={styles.suggestionSection}>
                  <Text style={styles.suggestionHeader}>From your learned routines</Text>
                  <Text style={styles.routineHint}>Based on recurring tasks in your own history</Text>
                  <View style={styles.chipsRow}>
                    {learnedRoutines.map((routine) => (
                      <Pressable key={routine.label} style={styles.chip} onPress={() => setCaptureText(routine.label)}>
                        <Text style={styles.chipText}>{routine.label}</Text>
                        <Text style={styles.routineSamples}>{routine.sample_count} recorded occurrences</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => {
                  stopSpeechRecognition();
                  resetModal();
                  setCaptureVisible(false);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, !captureText.trim() && { opacity: 0.5 }]}
                disabled={!captureText.trim() || isCapturing}
                onPress={handleCaptureSubmit}
              >
                <Text style={styles.confirmBtnText}>
                  {isCapturing ? "Saving..." : taskStatus === "completed" ? "Save Completed Task" : "Save Task"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Morning Kickoff Modal */}
      <Modal visible={kickoffVisible} transparent animationType="fade">
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
              {openTasks.filter((task) => task.status === "pending" || task.status === "in_progress").length === 0 ? (
                <Text style={{ textAlign: "center", color: theme.colors.text.secondary, marginVertical: 20 }}>
                  No open tasks are available. Capture a task to get started.
                </Text>
              ) : (
                openTasks.filter((task) => task.status === "pending" || task.status === "in_progress").map((t) => {
                  const isSelected = kickoffDraftTaskIds.includes(t.id);
                  const suggestion = kickoffSuggestions.find((item) => item.id === t.id);
                  return (
                    <Pressable
                      key={t.id}
                      style={[styles.kickoffItemRow, isSelected && styles.kickoffItemRowActive]}
                      onPress={() => toggleTop3Selection(t.id)}
                    >
                      <View style={[styles.kickoffItemStar, isSelected && styles.kickoffItemStarActive]}>
                        <Star size={16} color={isSelected ? "#D97706" : theme.colors.text.muted} fill={isSelected ? "#D97706" : "transparent"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.kickoffItemTitle, isSelected && styles.kickoffItemTitleActive]} numberOfLines={1}>{t.title}</Text>
                        <Text style={styles.kickoffItemReason} numberOfLines={1}>
                          {suggestion?.reasons?.length ? `Suggested · ${suggestion.reasons.join(" · ")}` : t.deadline_at ? `Due ${new Date(t.deadline_at).toLocaleDateString()}` : "Open task"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.confirmBtn} onPress={() => {
                triggerHaptic("complete");
                setTop3TaskIds(kickoffDraftTaskIds);
                if (user?.id) void SecureStore.setItemAsync(
                  `alibi_top3_${user.id}_${kickoffLocalDate || todayDateKey}`,
                  JSON.stringify(kickoffDraftTaskIds),
                );
                setKickoffVisible(false);
              }}>
                <Text style={styles.confirmBtnText}>Lock In Top 3 ({kickoffDraftTaskIds.length}/3)</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Evening Sunset Sweep Modal */}
      <Modal visible={sweepVisible} transparent animationType="fade">
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
              {endOfDayReview.completed_count} tasks completed today. Choose an action for each unfinished task; ALIBI updates only the tasks you select.
            </Text>

            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              {endOfDayReview.unfinished.map((t) => (
                <View key={t.id} style={styles.sweepTaskItem}>
                  <Text style={styles.sweepTaskTitle} numberOfLines={1}>{t.title}</Text>
                  <View style={styles.sweepActions}>
                    <Pressable style={styles.sweepTaskTomorrowBtn} onPress={() => { void handleEndOfDayAction(t, "tomorrow"); }}>
                      <Text style={styles.sweepTaskBtnText}>Next workday</Text>
                    </Pressable>
                    <Pressable style={styles.sweepTaskBacklogBtn} onPress={() => { void handleEndOfDayAction(t, "backlog"); }}>
                      <Text style={styles.sweepTaskBtnText}>Backlog</Text>
                    </Pressable>
                    <Pressable style={styles.sweepTaskDropBtn} onPress={() => Alert.alert("Cancel this task?", t.title, [
                      { text: "Keep task", style: "cancel" },
                      { text: "Cancel task", style: "destructive", onPress: () => { void handleEndOfDayAction(t, "cancel"); } },
                    ])}>
                      <Text style={styles.sweepTaskBtnText}>Drop</Text>
                    </Pressable>
                    <Pressable
                      style={styles.sweepTaskDoneBtn}
                      onPress={() => { void handleMarkReviewedTaskDone(t.id); }}
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
                <Text style={styles.confirmBtnText}>Move All to Next Workday</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <CaptureReviewSheet
        extraction={pendingExtraction}
        visible={Boolean(pendingExtraction)}
        busy={isReviewingExtraction}
        onApply={(fields, rejectedFields) => { void submitExtractionDecision(fields, rejectedFields); }}
        onKeepOriginal={(rejectedFields) => { void submitExtractionDecision({}, rejectedFields); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 52,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  homeLogo: { width: 136, height: 36 },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.5,
  },
  topRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    padding: 16,
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
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    overflow: "hidden",
    shadowColor: "#000",
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
    color: "#0F172A",
  },
  playBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  focusTimerText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 6,
  },
  focusSubtitle: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    marginBottom: 8,
  },
  focusProgressBarTrack: {
    height: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 2,
    overflow: "hidden",
  },
  focusProgressBarFill: {
    height: "100%",
    backgroundColor: "#F97316",
    borderRadius: 2,
  },
  ambientControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 9,
  },
  ambientCaption: {
    color: "#64748B",
    fontSize: 9.5,
    fontWeight: "600",
    marginRight: 2,
  },
  ambientChip: {
    minHeight: 48,
    minWidth: 43,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  ambientChipActive: { backgroundColor: "#102E42" },
  ambientChipDisabled: { opacity: 0.45 },
  ambientChipText: { fontSize: 10, fontWeight: "700", color: "#475569" },
  ambientChipTextActive: { color: "#FFFFFF" },
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
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
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
    color: "#0F172A",
  },
  progressSubtitle: {
    fontSize: 10,
    color: "#64748B",
  },
  progressBadgePill: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#10B981",
  },
  progressTrack: {
    height: 5,
    backgroundColor: "#F1F5F9",
    borderRadius: 2.5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#F97316",
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
    color: "#0F172A",
  },
  statLbl: {
    fontSize: 9.5,
    color: "#64748B",
    fontWeight: "500",
  },
  miniCalendarCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
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
    color: "#0F172A",
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
    color: "#94A3B8",
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
    backgroundColor: "#0F172A",
  },
  miniCalNumText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0F172A",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EDE9FE",
    gap: 12,
    shadowColor: "#8B5CF6",
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
    color: "#0F172A",
  },
  pleSubtitle: {
    fontSize: 11.5,
    color: "#64748B",
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
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
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    paddingRight: 44,
    color: "#0F172A",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  cancelBtnText: {
    color: "#64748B",
    fontSize: 13.5,
    fontWeight: "600",
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#F97316",
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
  kickoffItemReason: {
    fontSize: 10.5,
    color: "#64748B",
    marginTop: 2,
  },
  sweepTaskItem: {
    flexDirection: "column",
    alignItems: "stretch",
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
    marginBottom: 8,
  },
  sweepActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sweepTaskTomorrowBtn: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: "#E0F2FE",
  },
  sweepTaskBacklogBtn: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: "#E2E8F0",
  },
  sweepTaskDropBtn: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: "#FEE2E2",
  },
  sweepTaskDoneBtn: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: "#ECFDF5",
  },
  sweepTaskBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
});
