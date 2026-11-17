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
} from "lucide-react-native";
import theme from "../../lib/theme";
import { getAccessToken, ensureAuthenticated } from "../../lib/auth";
import { getServerUrl, autoDetectServer } from "../../lib/config";
import { startSpeechRecognition, stopSpeechRecognition } from "../../lib/speech";

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
}

interface RunningTimer {
  id: string;
  task_id?: string;
  started_at: string;
}

export default function DashboardScreen() {
  const router = useRouter();

  // State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [todayTasks, setTodayTasks] = useState<TaskItem[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [learningTip, setLearningTip] = useState<string>(
    "ALIBI will surface a pattern after it has enough recorded work."
  );
  const [runningTimer, setRunningTimer] = useState<RunningTimer | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [isTimerActive, setIsTimerActive] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Quick Capture Modal State
  const [captureVisible, setCaptureVisible] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [taskStatus, setTaskStatus] = useState<"pending" | "completed">("pending");
  const [selectedDate, setSelectedDate] = useState<"today" | "tomorrow" | "next_week" | "custom" | null>(null);
  const [customDateStr, setCustomDateStr] = useState("");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customTimeStr, setCustomTimeStr] = useState("");

  // Dynamic greeting based on current local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning,";
    if (hour < 17) return "Good Afternoon,";
    return "Good Evening,";
  }, []);

  const displayName = user?.display_name || "there";
  const userInitial = (displayName[0] || "H").toUpperCase();

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
    try {
      await autoDetectServer();
      const token = (await getAccessToken()) || (await ensureAuthenticated());
      const baseUrl = getServerUrl();
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [userRes, tasksRes, sumRes, scoreRes, timerRes, learnRes] = await Promise.all([
        fetch(`${baseUrl}/api/v1/auth/me`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/tasks?view=today`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/analytics/summary?period=daily`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/analytics/productivity-score?period=daily`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/time-entries/running`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/v1/learning/profile`, { headers }).catch(() => null),
      ]);

      if (userRes && userRes.ok) {
        setUser(await userRes.json());
      }
      if (tasksRes && tasksRes.ok) {
        setTodayTasks(await tasksRes.json());
      }
      if (sumRes && sumRes.ok) {
        setSummary(await sumRes.json());
      }
      if (scoreRes && scoreRes.ok) {
        setScore(await scoreRes.json());
      }
      if (timerRes && timerRes.ok) {
        const timerData = await timerRes.json();
        setRunningTimer(timerData);
        if (timerData) setIsTimerActive(true);
      }
      if (learnRes && learnRes.ok) {
        const profile = await learnRes.json();
        if (profile?.peak_window) {
          setLearningTip(`You tend to be most productive between ${profile.peak_window}.`);
        }
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Pomodoro focus timer countdown
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerActive && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerActive, timerSeconds]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  // Toggle task status
  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    setTodayTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      const baseUrl = getServerUrl();
      const token = await ensureAuthenticated();
      await fetch(`${baseUrl}/api/v1/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchDashboardData();
    } catch {}
  };

  // Toggle focus timer
  const handleToggleTimer = async () => {
    const baseUrl = getServerUrl();
    const token = await ensureAuthenticated();
    if (isTimerActive) {
      setIsTimerActive(false);
      if (runningTimer) {
        await fetch(`${baseUrl}/api/v1/time-entries/${runningTimer.id}/stop`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
        setRunningTimer(null);
      }
    } else {
      setIsTimerActive(true);
      if (timerSeconds === 0) setTimerSeconds(25 * 60);
      try {
        const firstTaskId = todayTasks[0]?.id;
        const res = await fetch(`${baseUrl}/api/v1/time-entries/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            task_id: firstTaskId,
            source: "manual",
            note: "Deep Work Session",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setRunningTimer(data);
        }
      } catch {}
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
    try {
      const baseUrl = getServerUrl();
      const token = await ensureAuthenticated();
      if (!token) {
        setIsCapturing(false);
        return;
      }

      // Compute ISO deadline
      let deadlineIso: string | null = null;
      if (selectedDate) {
        const target = new Date();
        if (selectedDate === "tomorrow") target.setDate(target.getDate() + 1);
        else if (selectedDate === "next_week") target.setDate(target.getDate() + 7);
        else if (selectedDate === "custom" && customDateStr.trim()) {
          const parts = customDateStr.trim().split("-");
          if (parts.length === 3) {
            target.setFullYear(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          }
        }
        let hours = 23;
        let mins = 59;
        if (selectedTime === "09:00") { hours = 9; mins = 0; }
        else if (selectedTime === "14:00") { hours = 14; mins = 0; }
        else if (selectedTime === "18:00") { hours = 18; mins = 0; }
        else if (selectedTime === "21:00") { hours = 21; mins = 0; }
        else if (selectedTime === "custom" && customTimeStr.trim()) {
          const tp = customTimeStr.trim().split(":");
          if (tp.length >= 2) {
            hours = parseInt(tp[0], 10) || 0;
            mins = parseInt(tp[1], 10) || 0;
          }
        }
        target.setHours(hours, mins, 0, 0);
        deadlineIso = target.toISOString();
      }

      const payload: Record<string, any> = {
        raw_input: captureText.trim(),
        origin: isListening ? "voice" : "manual",
        status: taskStatus,
      };
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
        resetModal();
        setCaptureVisible(false);
        fetchDashboardData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        Alert.alert("Capture Error", errJson.detail || "Failed to parse task.");
      }
    } catch (err: any) {
      Alert.alert("Network Error", err?.message || "Failed to capture task.");
    } finally {
      setIsCapturing(false);
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

  // Format timer minutes and seconds
  const timerMin = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
  const timerSec = String(timerSeconds % 60).padStart(2, "0");

  return (
    <View style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.logoRow}>
          <Image source={require("../../../assets/logo_full_light.png")} style={styles.homeLogo} resizeMode="contain" accessibilityLabel="ALIBI" />
        </View>

        <View style={styles.topRightActions}>
          <Pressable style={styles.bellBtn} accessibilityLabel="Notifications">
            <Bell size={20} color={theme.colors.text.primary} />
            <View style={styles.notificationDot} />
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
          onPress={() => setCaptureVisible(true)}
          accessibilityLabel="Open quick capture"
        >
          <PlusCircle size={20} color={theme.colors.text.secondary} />
          <Text style={styles.quickCapturePlaceholder} numberOfLines={1}>
            Capture a task... (e.g. "Finish report by 6 PM")
          </Text>
          <Pressable
            style={styles.pillMicBtn}
            onPress={() => {
              setCaptureVisible(true);
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
            onPress={() => setCaptureVisible(true)}
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
                todayTasks.slice(0, 4).map((task) => {
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
                        <Text
                          style={[
                            styles.taskItemTitle,
                            isCompleted && styles.taskTitleDone,
                          ]}
                          numberOfLines={1}
                        >
                          {task.title}
                        </Text>
                        <View style={styles.taskItemMeta}>
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
            {/* Focus Pomodoro Card */}
            <View style={styles.focusCard}>
              <View style={styles.focusHeaderRow}>
                <Text style={styles.focusTitle}>Focus</Text>
                <Pressable
                  style={styles.playBtn}
                  onPress={handleToggleTimer}
                  accessibilityLabel="Start focus timer"
                >
                  {isTimerActive ? (
                    <Pause size={14} color="#FFFFFF" />
                  ) : (
                    <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
                  )}
                </Pressable>
              </View>

              <Text style={styles.focusTimerText}>
                {timerMin}:{timerSec}
              </Text>
              <Text style={styles.focusSubtitle}>Deep Work</Text>

              {/* Progress bar */}
              <View style={styles.focusProgressBarTrack}>
                <View
                  style={[
                    styles.focusProgressBarFill,
                    { width: `${((25 * 60 - timerSeconds) / (25 * 60)) * 100}%` },
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
                const hasTask = idx === 1 || idx === 4 || idx === 6; // Activity indicators
                return (
                  <View key={idx} style={styles.miniCalNumCol}>
                    <View
                      style={[
                        styles.miniCalNumBox,
                        isToday && styles.miniCalNumBoxToday,
                      ]}
                    >
                      <Text
                        style={[
                          styles.miniCalNumText,
                          isToday && styles.miniCalNumTextToday,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </View>
                    {hasTask && (
                      <View
                        style={[
                          styles.miniCalDot,
                          {
                            backgroundColor:
                              idx === 1
                                ? "#F97316"
                                : idx === 4
                                ? "#10B981"
                                : "#F97316",
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

              {/* Quick Suggestions */}
              <View style={styles.suggestionSection}>
                <Text style={styles.suggestionHeader}>Quick Templates (Tap to fill):</Text>
                <View style={styles.chipsRow}>
                  {[
                    "Finish product homepage by 6pm #work",
                    "EMP - quiz preparation tonight #academic",
                    "Gym workout session #personal",
                    "Marketing review at 5:30pm #work",
                  ].map((preset) => (
                    <Pressable
                      key={preset}
                      style={styles.chip}
                      onPress={() => setCaptureText(preset)}
                    >
                      <Text style={styles.chipText}>{preset}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
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
});
