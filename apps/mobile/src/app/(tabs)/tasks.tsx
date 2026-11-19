import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import {
  CheckSquare,
  Square,
  Clock,
  Calendar,
  Plus,
  Play,
  Sparkles,
  Tag as TagIcon,
  CalendarDays,
  UserRound,
  X,
  CheckCircle2,
  Circle,
  Mic,
  History,
  Pause,
  Repeat2,
  FileText,
  ChevronRight,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { BrandHeader, SunriseArt } from "../../components/brand-ui";
import { getAccessToken, ensureAuthenticated, getUserProfile } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";
import { startSpeechRecognition, stopSpeechRecognition } from "../../lib/speech";
import { cancelTaskTimerReminder, scheduleTaskTimerReminder, syncTaskTimerReminders } from "../../lib/timer-reminders";
import { DEFAULT_DEADLINE_REMINDER_LEAD_MIN, syncTaskDeadlineReminders } from "../../lib/task-deadline-reminders";
import { triggerHaptic, startFocusNotification, stopFocusNotification } from "../../lib/focus-session-notification";
import { loadLearnedTaskRoutines, type LearnedTaskRoutine } from "../../lib/learned-routines";
import { CaptureReviewSheet } from "../../components/capture-review-sheet";
import { decideTaskExtraction, type TaskExtractionProposal } from "../../lib/task-extraction";
import { RepeatTaskSheet, type RepeatFrequency, type RepeatRuleSummary } from "../../components/repeat-task-sheet";
import {
  cacheRunningTimers,
  cacheTaskView,
  cacheTaskTimeEntries,
  createTaskOffline,
  getCachedTaskView,
  getLocalTimers,
  getLocalTaskTimeEntries,
  removeLocalTimer,
  startTaskTimerOffline,
  stopTaskTimerOffline,
  syncMobileAccount,
  updateTaskOffline,
} from "../../lib/offline-sync";

const VIEWS = ["today", "upcoming", "backlog", "completed"] as const;

interface TaskItem {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: number | null;
  deadline_at: string | null;
  estimate_user_min: number | null;
  actual_min: number;
  reschedule_count: number;
  tags: string[];
  subtasks: { id: string; title: string; completed: boolean }[];
  linked_notes?: { id: string; title: string; source_type: string; occurred_on: string }[];
}

interface RunningTimer {
  id: string;
  task_id: string;
  started_at: string;
  source?: string;
}

/** FR-TASK-016: session-level time facts shown in the task's diary/work log. */
interface TaskTimeEntry {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  source: string;
}

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
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        target.setFullYear(year, month, day);
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  // Time
  let hours = 23;
  let minutes = 59;
  if (timeChoice === "09:00") {
    hours = 9;
    minutes = 0;
  } else if (timeChoice === "14:00") {
    hours = 14;
    minutes = 0;
  } else if (timeChoice === "18:00") {
    hours = 18;
    minutes = 0;
  } else if (timeChoice === "21:00") {
    hours = 21;
    minutes = 0;
  } else if (timeChoice === "custom" && customTime.trim()) {
    const tp = customTime.trim().split(":");
    if (tp.length >= 2) {
      hours = parseInt(tp[0], 10) || 0;
      minutes = parseInt(tp[1], 10) || 0;
    }
  }

  target.setHours(hours, minutes, 0, 0);
  return target.toISOString();
}

function formatDeadlinePreview(
  dateChoice: "today" | "tomorrow" | "next_week" | "custom" | null,
  customDate: string,
  timeChoice: string | null,
  customTime: string
): string {
  if (!dateChoice) return "";
  let dateLabel = "Today";
  if (dateChoice === "tomorrow") dateLabel = "Tomorrow";
  else if (dateChoice === "next_week") dateLabel = "Next Week";
  else if (dateChoice === "custom") dateLabel = customDate.trim() || "Custom Date";

  let timeLabel = "End of Day (23:59)";
  if (timeChoice === "09:00") timeLabel = "9:00 AM";
  else if (timeChoice === "14:00") timeLabel = "2:00 PM";
  else if (timeChoice === "18:00") timeLabel = "6:00 PM";
  else if (timeChoice === "21:00") timeLabel = "9:00 PM";
  else if (timeChoice === "custom") timeLabel = customTime.trim() || "Custom Time";

  return `${dateLabel} at ${timeLabel}`;
}

export default function TasksScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const openedTaskId = useRef<string | null>(null);
  const [activeView, setActiveView] = useState<(typeof VIEWS)[number]>("today");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [runningTimers, setRunningTimers] = useState<RunningTimer[]>([]);
  const [clockNow, setClockNow] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [taskTimeEntries, setTaskTimeEntries] = useState<TaskTimeEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [repeatTask, setRepeatTask] = useState<TaskItem | null>(null);
  const [repeatRule, setRepeatRule] = useState<RepeatRuleSummary | null>(null);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [isSavingRepeat, setIsSavingRepeat] = useState(false);

  // Capture modal
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
  const [isLoadingRoutines, setIsLoadingRoutines] = useState(false);

  // Batch selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [batchTagText, setBatchTagText] = useState("");

  const toggleTaskSelection = (id: string) => {
    triggerHaptic("tap");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBatch = async (operation: (task: TaskItem, token: string) => Promise<Response>) => {
    const selectedTasks = tasks.filter((task) => selectedIds.has(task.id));
    if (!selectedTasks.length || batchBusy) return;
    setBatchBusy(true);
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to update selected tasks.");
      const responses = await Promise.all(selectedTasks.map((task) => operation(task, token)));
      const failures = responses.filter((response) => !response.ok);
      if (failures.length) {
        const firstError = await failures[0].json().catch(() => ({})) as { detail?: string };
        throw new Error(`${failures.length} task${failures.length === 1 ? "" : "s"} could not be updated. ${firstError.detail ?? "Refresh and try again."}`);
      }
      triggerHaptic("complete");
      setSelectionMode(false);
      setSelectedIds(new Set());
      setTagModalVisible(false);
      setBatchTagText("");
      await fetchTasks();
    } catch (error) {
      Alert.alert("Some changes were not saved", error instanceof Error ? error.message : "Refresh the task list and try again.");
      await fetchTasks();
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchComplete = () => runBatch((task, token) => fetch(`${getServerUrl()}/api/v1/tasks/${task.id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "completed" }),
  }));

  const handleBatchRescheduleTomorrow = () => runBatch((task, token) => fetch(`${getServerUrl()}/api/v1/tasks/${task.id}/end-of-day-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "tomorrow" }),
  }));

  const handleBatchDelete = () => Alert.alert(
    `Move ${selectedIds.size} tasks to Trash?`,
    "You can restore them from Trash later.",
    [
      { text: "Keep tasks", style: "cancel" },
      { text: "Move to Trash", style: "destructive", onPress: () => {
        void runBatch((task, token) => fetch(`${getServerUrl()}/api/v1/tasks/${task.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }));
      } },
    ],
  );

  const handleBatchTag = () => {
    const tag = batchTagText.trim().replace(/^#/, "").toLowerCase();
    if (!tag) return Alert.alert("Add a tag", "Type a tag name first.");
    void runBatch((task, token) => fetch(`${getServerUrl()}/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tags: Array.from(new Set([...task.tags, tag])) }),
    }));
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
        if (isFinal) {
          setIsListening(false);
        }
      },
      onError: (err) => {
        setIsListening(false);
        Alert.alert("Voice Input", err);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });

    if (!ok) {
      setIsListening(false);
    }
  };

  const fetchTasks = useCallback(async () => {
    const profile = await getUserProfile();
    if (profile) {
      try {
        const cached = await getCachedTaskView(profile.id, activeView);
        if (cached) {
          setTasks(cached as TaskItem[]);
          setSelectedTask((current) => current ? (cached.find((item) => item.id === current.id) as TaskItem | undefined) ?? current : current);
          setIsLoading(false);
        }
        setRunningTimers(await getLocalTimers(profile.id));
      } catch {
        // Continue with the online request if the local database is unavailable.
      }
    }
    try {
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) return;

      let res = await fetch(`${baseUrl}/api/v1/tasks?view=${activeView}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        token = await ensureAuthenticated(true);
        if (token) {
          res = await fetch(`${baseUrl}/api/v1/tasks?view=${activeView}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
      if (res.ok) {
        const data = await res.json() as TaskItem[];
        if (profile) await cacheTaskView(profile.id, activeView, data);
        setTasks(data);
        const lead = profile?.settings?.reminder_lead_min;
        void syncTaskDeadlineReminders(data, typeof lead === "number" ? lead : DEFAULT_DEADLINE_REMINDER_LEAD_MIN);
        setSelectedTask((current) => current ? data.find((item: TaskItem) => item.id === current.id) ?? current : current);
        if (profile && token) void syncMobileAccount(profile.id, token, baseUrl).catch(() => undefined);
      }

      if (token) {
        const timerRes = await fetch(`${baseUrl}/api/v1/time-entries/running/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (timerRes.ok) {
          const timerData = await timerRes.json();
          if (profile) setRunningTimers(await cacheRunningTimers(profile.id, timerData));
          else setRunningTimers(timerData);
          void syncTaskTimerReminders(timerData);
        }
      }
    } catch {
      if (profile) {
        const cached = await getCachedTaskView(profile.id, activeView);
        if (cached) setTasks(cached as TaskItem[]);
        setRunningTimers(await getLocalTimers(profile.id));
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeView]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const interval = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCapture = async () => {
    if (!captureText.trim() || isCapturing) return;
    setIsCapturing(true);
    let queuedOffline = false;
    let offlineProfileId: string | null = null;
    const deadlineIso = computeDeadlineIso(selectedDate, customDateStr, selectedTime, customTimeStr);
    try {
      const profile = await getUserProfile();
      offlineProfileId = profile?.id ?? null;
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) {
        if (!profile) throw new Error("Sign in once while online before capturing work offline.");
        const task = await createTaskOffline(profile.id, {
          title: captureText.trim(),
          status: taskStatus,
          deadline_at: deadlineIso,
          origin: isListening ? "voice" : "manual",
        });
        setTasks((previous) => [task as TaskItem, ...previous.filter((item) => item.id !== task.id)]);
        if (!deadlineIso && taskStatus === "pending") setActiveView("backlog");
        queuedOffline = true;
        resetModal();
        setCaptureVisible(false);
        return;
      }

      const payload: Record<string, any> = {
        raw_input: captureText.trim(),
        origin: isListening ? "voice" : "manual",
        status: taskStatus,
      };
      if (deadlineIso) {
        payload.deadline_at = deadlineIso;
      }

      let res = await fetch(`${baseUrl}/api/v1/tasks/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      // If token expired, force re-authenticate and retry once
      if (res.status === 401) {
        token = await ensureAuthenticated(true);
        if (token) {
          res = await fetch(`${baseUrl}/api/v1/tasks/capture`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
        }
      }

      if (res.ok) {
        const result = await res.json();
        const capturedTask = result.task;
        if (result.extraction) setPendingExtraction(result.extraction as TaskExtractionProposal);
        if (capturedTask) {
          setTasks((prev) => [
            {
              id: capturedTask.id,
              title: capturedTask.title,
              status: capturedTask.status || "pending",
              priority: capturedTask.priority,
              deadline_at: capturedTask.deadline_at,
              estimate_user_min: capturedTask.estimate_user_min,
              actual_min: capturedTask.actual_min || 0,
              reschedule_count: capturedTask.reschedule_count || 0,
              tags: capturedTask.tags || [],
              subtasks: capturedTask.subtasks || [],
            },
            ...prev,
          ]);
          if (offlineProfileId) {
            void cacheTaskView(offlineProfileId, activeView, [capturedTask, ...tasks.filter((item) => item.id !== capturedTask.id)] as TaskItem[]);
          }
        }
        resetModal();
        setCaptureVisible(false);
        fetchTasks();
      } else {
        const errJson = await res.json().catch(() => ({})) as any;
        const paramErrors = errJson.invalid_params?.map((p: any) => `${p.name}: ${p.reason}`).join("\n");
        Alert.alert("Capture Error", paramErrors || errJson.detail || "Failed to parse and capture task.");
      }
    } catch (err: unknown) {
      const profile = offlineProfileId ? { id: offlineProfileId } : await getUserProfile();
      if (profile && !queuedOffline) {
        const task = await createTaskOffline(profile.id, {
          title: captureText.trim(),
          status: taskStatus,
          deadline_at: deadlineIso,
          origin: isListening ? "voice" : "manual",
        });
        setTasks((previous) => [task as TaskItem, ...previous.filter((item) => item.id !== task.id)]);
        if (!deadlineIso && taskStatus === "pending") setActiveView("backlog");
        resetModal();
        setCaptureVisible(false);
      } else {
        Alert.alert("Network Error", err instanceof Error ? err.message : "Failed to capture task. Check server connectivity.");
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
      await fetchTasks();
    } catch (error: unknown) {
      Alert.alert(
        "Review not saved",
        error instanceof Error ? error.message : "Please try reviewing the task again.",
      );
    } finally {
      setIsReviewingExtraction(false);
    }
  };

  const handleStatusToggle = async (task: TaskItem) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    if (nextStatus === "completed") {
      triggerHaptic("complete");
    } else {
      triggerHaptic("tap");
    }
    const profile = await getUserProfile();
    const activeTimer = runningTimers.find((item) => item.task_id === task.id);
    try {
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token || activeTimer?.source === "local") {
        if (!profile) return;
        const updated = await updateTaskOffline(profile.id, task.id, { status: nextStatus });
        if (updated) setTasks((previous) => previous.map((item) => item.id === task.id ? updated as TaskItem : item));
        if (nextStatus === "completed") {
          const timer = runningTimers.find((item) => item.task_id === task.id);
          if (timer) {
            await stopTaskTimerOffline(profile.id, timer.id);
            setRunningTimers((previous) => previous.filter((item) => item.id !== timer.id));
            await cancelTaskTimerReminder(timer.id);
            void stopFocusNotification();
          }
        }
        return;
      }

      let res = await fetch(`${baseUrl}/api/v1/tasks/${task.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.status === 401) {
        token = await ensureAuthenticated(true);
        if (token) {
          res = await fetch(`${baseUrl}/api/v1/tasks/${task.id}/status`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: nextStatus }),
          });
        }
      }

      if (res.ok) {
        if (nextStatus === "completed") {
          const timer = runningTimers.find((item) => item.task_id === task.id);
          if (timer) {
            await fetch(`${baseUrl}/api/v1/time-entries/${timer.id}/stop`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({}),
            });
            await cancelTaskTimerReminder(timer.id);
            void stopFocusNotification();
            if (profile) await removeLocalTimer(profile.id, timer.id);
          }
        }
        fetchTasks();
      }
    } catch {
      if (profile) {
        const updated = await updateTaskOffline(profile.id, task.id, { status: nextStatus });
        if (updated) setTasks((previous) => previous.map((item) => item.id === task.id ? updated as TaskItem : item));
      }
    }
  };

  const handleTimerAction = async (task: TaskItem) => {
    triggerHaptic("tap");
    const profile = await getUserProfile();
    const activeTimer = runningTimers.find((timer) => timer.task_id === task.id);
    if (activeTimer) {
      void stopFocusNotification();
    }
    const useOfflineTimer = async () => {
      if (!profile) return false;
      if (activeTimer) {
        await stopTaskTimerOffline(profile.id, activeTimer.id);
        setRunningTimers((previous) => previous.filter((timer) => timer.id !== activeTimer.id));
        await cancelTaskTimerReminder(activeTimer.id);
      } else {
        const timer = await startTaskTimerOffline(profile.id, task.id);
        setRunningTimers((previous) => [...previous.filter((item) => item.task_id !== task.id), timer]);
        void startFocusNotification(task.id, task.title, timer.started_at, task.estimate_user_min, profile.settings?.focus_show_task_name === true);
        void scheduleTaskTimerReminder({ timerId: timer.id, taskId: timer.task_id, startedAt: timer.started_at });
      }
      void fetchTasks();
      return true;
    };
    try {
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token || activeTimer?.source === "local") {
        await useOfflineTimer();
        return;
      }

      if (activeTimer) {
        // Stop timer
        let res = await fetch(`${baseUrl}/api/v1/time-entries/${activeTimer.id}/stop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });
        if (res.status === 401) {
          token = await ensureAuthenticated(true);
          if (token) {
            res = await fetch(`${baseUrl}/api/v1/time-entries/${activeTimer.id}/stop`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({}),
            });
          }
        }
        if (res.ok) {
          setRunningTimers((previous) => previous.filter((timer) => timer.id !== activeTimer.id));
          await cancelTaskTimerReminder(activeTimer.id);
          if (profile) await removeLocalTimer(profile.id, activeTimer.id);
          fetchTasks();
        }
      } else {
        // Start timer
        let res = await fetch(`${baseUrl}/api/v1/time-entries/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ task_id: task.id }),
        });
        if (res.status === 401) {
          token = await ensureAuthenticated(true);
          if (token) {
            res = await fetch(`${baseUrl}/api/v1/time-entries/start`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ task_id: task.id }),
            });
          }
        }
        if (res.ok) {
          const entry = await res.json();
          setRunningTimers((previous) => [...previous.filter((timer) => timer.task_id !== task.id), entry]);
          void startFocusNotification(task.id, task.title, entry.started_at, task.estimate_user_min, profile?.settings?.focus_show_task_name === true);
          if (profile) await cacheRunningTimers(profile.id, [...runningTimers.filter((timer) => timer.task_id !== task.id), entry]);
          void scheduleTaskTimerReminder({ timerId: entry.id, taskId: entry.task_id, startedAt: entry.started_at });
          fetchTasks();
        } else {
          const errData = await res.json().catch(() => ({}));
          Alert.alert("Timer Error", errData.detail || "Failed to start timer.");
        }
      }
    } catch (err: unknown) {
      try {
        if (!(await useOfflineTimer())) {
          Alert.alert("Error", err instanceof Error ? err.message : "Timer action failed.");
        }
      } catch (offlineError) {
        Alert.alert("Error", offlineError instanceof Error ? offlineError.message : "Timer action failed.");
      }
    }
  };

  const loadTaskRecurrence = useCallback(async (task: TaskItem) => {
    setRepeatRule(null);
    setIsLoadingRepeat(true);
    try {
      const token = await ensureAuthenticated();
      if (!token) {
        setRepeatRule(null);
        return;
      }
      const response = await fetch(`${getServerUrl()}/api/v1/recurrences?task_id=${encodeURIComponent(task.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Could not load the repeat schedule.");
      const rules = await response.json() as RepeatRuleSummary[];
      setRepeatRule(rules[0] ?? null);
    } catch {
      setRepeatRule(null);
    } finally {
      setIsLoadingRepeat(false);
    }
  }, []);

  const loadTaskHistory = useCallback(async (task: TaskItem) => {
    setSelectedTask(task);
    void loadTaskRecurrence(task);
    setTaskTimeEntries([]);
    setHistoryError(false);
    setIsLoadingHistory(true);
    const profile = await getUserProfile();
    try {
      let token = await ensureAuthenticated();
      if (!token) {
        if (profile) setTaskTimeEntries(await getLocalTaskTimeEntries(profile.id, task.id));
        return;
      }
      const baseUrl = getServerUrl();
      let response = await fetch(`${baseUrl}/api/v1/time-entries?task_id=${encodeURIComponent(task.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        token = await ensureAuthenticated(true);
        if (token) {
          response = await fetch(`${baseUrl}/api/v1/time-entries?task_id=${encodeURIComponent(task.id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
      if (response.ok) {
        const entries = await response.json() as TaskTimeEntry[];
        setTaskTimeEntries(entries);
        if (profile) await cacheTaskTimeEntries(profile.id, task.id, entries);
      }
      else setHistoryError(true);
    } catch {
      if (profile) setTaskTimeEntries(await getLocalTaskTimeEntries(profile.id, task.id));
      else setHistoryError(true);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [loadTaskRecurrence]);

  const createRepeatSchedule = async (frequency: RepeatFrequency, interval: number) => {
    if (!repeatTask || isSavingRepeat) return;
    setIsSavingRepeat(true);
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to save a repeat schedule.");
      const firstDue = repeatTask.deadline_at ? new Date(repeatTask.deadline_at) : new Date();
      const now = Date.now();
      const nextOccurrence = new Date(firstDue);
      do {
        if (frequency === "daily") nextOccurrence.setDate(nextOccurrence.getDate() + interval);
        else if (frequency === "weekly") nextOccurrence.setDate(nextOccurrence.getDate() + 7 * interval);
        else nextOccurrence.setMonth(nextOccurrence.getMonth() + interval);
      } while (nextOccurrence.getTime() <= now);

      const response = await fetch(`${getServerUrl()}/api/v1/recurrences`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: repeatTask.id, frequency, interval, starts_at: nextOccurrence.toISOString() }),
      });
      const result = await response.json() as RepeatRuleSummary & { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "Could not save the repeat schedule.");
      setRepeatRule(result);
      void fetchTasks();
    } catch (error: unknown) {
      Alert.alert("Repeat schedule not saved", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setIsSavingRepeat(false);
    }
  };

  const stopRepeatSchedule = (ruleId: string) => {
    Alert.alert("Stop future repeats?", "Tasks already created from this schedule will stay in your list.", [
      { text: "Keep schedule", style: "cancel" },
      { text: "Stop repeats", style: "destructive", onPress: () => {
        void (async () => {
          setIsSavingRepeat(true);
          try {
            const token = await ensureAuthenticated();
            if (!token) throw new Error("Sign in to update the repeat schedule.");
            const response = await fetch(`${getServerUrl()}/api/v1/recurrences/${ruleId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error("Could not stop the repeat schedule.");
            setRepeatRule(null);
            setRepeatTask(null);
          } catch (error: unknown) {
            Alert.alert("Repeat schedule unchanged", error instanceof Error ? error.message : "Please try again.");
          } finally {
            setIsSavingRepeat(false);
          }
        })();
      } },
    ]);
  };

  useEffect(() => {
    if (!taskId || isLoading || openedTaskId.current === taskId) return;
    const task = tasks.find((item) => item.id === taskId);
    if (task) {
      openedTaskId.current = taskId;
      void loadTaskHistory(task);
    }
  }, [taskId, isLoading, tasks, loadTaskHistory]);

  const openCapture = () => {
    setCaptureVisible(true);
    setIsLoadingRoutines(true);
    void (async () => {
      const token = (await getAccessToken()) || (await ensureAuthenticated());
      const routines = token ? await loadLearnedTaskRoutines(getServerUrl(), token) : [];
      setLearnedRoutines(routines);
      setIsLoadingRoutines(false);
    })();
  };

  const focusSessionFromTask = async (task: TaskItem) => {
    await handleTimerAction(task);
    await loadTaskHistory(task);
  };

  return (
    <View style={styles.container}>
      <SunriseArt height={176} />
      <BrandHeader right={<><Pressable style={styles.headerAction} onPress={() => router.push("/calendar")} accessibilityLabel="Open calendar"><CalendarDays size={21} color={theme.colors.text.primary} /></Pressable><Pressable style={styles.headerAction} onPress={() => router.push("/(tabs)/profile")} accessibilityLabel="Open profile"><UserRound size={21} color={theme.colors.text.primary} /></Pressable></>} />
      <View style={styles.screenHeading}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={styles.screenTitle}>Tasks</Text>
            <Text style={styles.screenSubtitle}>Capture, organize and get things done.</Text>
          </View>
          {tasks.length > 0 && (
            <Pressable
              style={[styles.selectToggleBtn, selectionMode && styles.selectToggleBtnActive]}
              onPress={() => {
                triggerHaptic("tap");
                setSelectionMode(!selectionMode);
                setSelectedIds(new Set());
              }}
            >
              <Text style={[styles.selectToggleText, selectionMode && styles.selectToggleTextActive]}>
                {selectionMode ? "Cancel" : "Select"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
      {/* View Selector Tabs */}
      <View style={styles.viewTabs}>
        {VIEWS.map((view) => (
          <Pressable
            key={view}
            style={[styles.viewTab, activeView === view && styles.viewTabActive]}
            onPress={() => setActiveView(view)}
          >
            <Text
              style={[
                styles.viewTabText,
                activeView === view && styles.viewTabTextActive,
              ]}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Task List */}
      <ScrollView contentContainerStyle={styles.content}>
        {isLoading && (
          <ActivityIndicator size="small" color={theme.colors.accent.amber} style={{ marginTop: 24 }} />
        )}

        {!isLoading && tasks.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.iconCircle}>
              <CheckSquare size={28} color={theme.colors.accent.amber} />
            </View>
            <Text style={styles.emptyTitle}>No {activeView} Tasks</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button below to capture a new task naturally.
            </Text>
          </View>
        )}

        {!isLoading &&
          tasks.map((task) => {
            const isDone = task.status === "completed";
            const taskTimer = runningTimers.find((timer) => timer.task_id === task.id);
            const isTimerRunning = Boolean(taskTimer);
            const elapsedSeconds = taskTimer ? Math.max(0, Math.floor((clockNow - Date.parse(taskTimer.started_at)) / 1000)) : 0;
            const elapsedLabel = `${Math.floor(elapsedSeconds / 3600)}h ${Math.floor((elapsedSeconds % 3600) / 60).toString().padStart(2, "0")}m`;

            return (
              <View key={task.id} style={[styles.taskCard, selectedIds.has(task.id) && styles.taskCardSelected]}>
                <View style={styles.taskHeader}>
                  {selectionMode ? (
                    <Pressable
                      onPress={() => toggleTaskSelection(task.id)}
                      style={styles.checkboxBtn}
                    >
                      {selectedIds.has(task.id) ? (
                        <CheckSquare size={22} color="#F97316" />
                      ) : (
                        <Square size={22} color={theme.colors.text.secondary} />
                      )}
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => handleStatusToggle(task)}
                      onLongPress={() => {
                        setSelectionMode(true);
                        toggleTaskSelection(task.id);
                      }}
                      style={({ pressed }) => [styles.checkboxBtn, pressed && { transform: [{ scale: 0.9 }] }]}
                    >
                      {isDone ? (
                        <CheckCircle2 size={22} color={theme.colors.accent.emerald} />
                      ) : (
                        <Circle size={22} color={theme.colors.text.secondary} />
                      )}
                    </Pressable>
                  )}

                  <Pressable
                    style={styles.taskTitleCol}
                    onPress={() => void loadTaskHistory(task)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open work log for ${task.title}`}
                  >
                    <Text
                      style={[
                        styles.taskTitle,
                        isDone && styles.taskTitleDone,
                      ]}
                      numberOfLines={2}
                    >
                      {task.title}
                    </Text>
                    <Text style={styles.openLogHint}>View work log  ›</Text>
                  </Pressable>

                  {/* Timer Button */}
                  {!isDone && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.timerBtn,
                        isTimerRunning && styles.timerBtnActive,
                        pressed && { transform: [{ scale: 0.92 }] },
                      ]}
                      onPress={() => handleTimerAction(task)}
                      accessibilityLabel={isTimerRunning ? `Pause timer for ${task.title}` : `Start focus on ${task.title}`}
                    >
                      {isTimerRunning ? (
                        <Pause size={16} color="#FFFFFF" />
                      ) : (
                        <Play size={16} color={theme.colors.accent.amber} />
                      )}
                      <Text style={[styles.timerBtnLabel, isTimerRunning && { color: "#FFFFFF" }]}>{isTimerRunning ? "Pause" : "Start"}</Text>
                    </Pressable>
                  )}
                </View>

                {taskTimer && <Text style={styles.timerElapsed}>●  Focus running · {elapsedLabel}</Text>}

                {/* Metadata tags */}
                <View style={styles.taskMetaRow}>
                  {task.deadline_at && (
                    <View style={styles.metaItem}>
                      <Clock size={12} color={theme.colors.text.secondary} />
                      <Text style={styles.metaText}>
                        {new Date(task.deadline_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </View>
                  )}
                  {task.actual_min > 0 && (
                    <View style={styles.metaItem}>
                      <Text style={[styles.metaText, { color: theme.colors.accent.amber }]}>
                        {task.actual_min}m tracked
                      </Text>
                    </View>
                  )}
                  {task.tags.map((t) => (
                    <View key={t} style={styles.metaItem}>
                      <TagIcon size={12} color={theme.colors.text.secondary} />
                      <Text style={styles.metaText}>#{t}</Text>
                    </View>
                  ))}
                  {task.linked_notes?.[0] && <Pressable
                    style={styles.linkedNoteChip}
                    onPress={() => router.push({ pathname: "/(tabs)/vault", params: { noteId: task.linked_notes?.[0].id } })}
                    accessibilityRole="link"
                    accessibilityLabel={`Open note ${task.linked_notes[0].title}`}
                  ><FileText size={13} color={theme.colors.accent.amber} /><Text style={styles.linkedNoteChipText}>Note</Text></Pressable>}
                </View>
              </View>
            );
          })}
      </ScrollView>

      {/* Batch Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={styles.batchActionBar}>
          <Text style={styles.batchCountText}>{batchBusy ? "Saving changes…" : `${selectedIds.size} selected`}</Text>
          <View style={styles.batchBtnsRow}>
            <Pressable disabled={batchBusy} onPress={() => { void handleBatchComplete(); }} style={[styles.batchBtn, { backgroundColor: "#10B981" }, batchBusy && { opacity: 0.5 }]}>
              <CheckCircle2 size={14} color="#fff" />
              <Text style={styles.batchBtnText}>Done</Text>
            </Pressable>
            <Pressable disabled={batchBusy} onPress={() => { void handleBatchRescheduleTomorrow(); }} style={[styles.batchBtn, { backgroundColor: "#0284C7" }, batchBusy && { opacity: 0.5 }]}>
              <Calendar size={14} color="#fff" />
              <Text style={styles.batchBtnText}>Next workday</Text>
            </Pressable>
            <Pressable disabled={batchBusy} onPress={() => setTagModalVisible(true)} style={[styles.batchBtn, { backgroundColor: "#475569" }, batchBusy && { opacity: 0.5 }]}>
              <TagIcon size={14} color="#fff" />
              <Text style={styles.batchBtnText}>Tag</Text>
            </Pressable>
            <Pressable disabled={batchBusy} onPress={handleBatchDelete} style={[styles.batchBtn, { backgroundColor: "#EF4444" }, batchBusy && { opacity: 0.5 }]}>
              <X size={14} color="#fff" />
              <Text style={styles.batchBtnText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Floating Action Button for Quick Capture */}
      <Pressable
        style={styles.fab}
        accessibilityLabel="Quick capture task"
        onPress={openCapture}
      >
        <Plus size={24} color="#090D16" />
      </Pressable>

      {/* Quick Capture Modal */}
      <Modal visible={captureVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Sparkles size={18} color={theme.colors.accent.amber} />
                <Text style={styles.modalTitle}>Quick Capture</Text>
              </View>
              <Pressable onPress={() => { stopSpeechRecognition(); setCaptureVisible(false); setIsListening(false); }}>
                <X size={20} color={theme.colors.text.secondary} />
              </Pressable>
            </View>

            {isListening && (
              <View style={styles.listeningHintRow}>
                <Mic size={14} color={theme.colors.accent.amber} />
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
                  placeholder="Type or dictate task... e.g. Finish report #work"
                  placeholderTextColor={theme.colors.text.secondary}
                  multiline
                  autoFocus
                />
                <Pressable
                  style={[styles.inputMicBtn, isListening && styles.inputMicBtnActive]}
                  onPress={handleMicPress}
                  accessibilityLabel="Activate speech dictation"
                >
                  <Mic size={18} color={isListening ? "#090D16" : theme.colors.accent.amber} />
                </Pressable>
              </View>

              {/* Status Selection (Optional, Pending / Completed) */}
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
                      color={taskStatus === "pending" ? "#F59E0B" : theme.colors.text.secondary}
                    />
                    <Text
                      style={[
                        styles.statusOptionText,
                        taskStatus === "pending" && { color: "#F59E0B", fontWeight: "600" },
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

              {/* Date Selection (Optional) */}
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
                      <Calendar
                        size={12}
                        color={selectedDate === opt.id ? "#F59E0B" : theme.colors.text.secondary}
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

              {/* Time Selection (Optional, Appears when Date is Chosen) */}
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
                          color={selectedTime === tOpt.id ? "#38BDF8" : theme.colors.text.secondary}
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

              {/* Aligned Deadline Preview */}
              {selectedDate && (
                <View style={styles.alignedDeadlineBadge}>
                  <Calendar size={13} color="#38BDF8" />
                  <Text style={styles.alignedDeadlineText}>
                    Target Deadline:{" "}
                    {formatDeadlinePreview(
                      selectedDate,
                      customDateStr,
                      selectedTime,
                      customTimeStr
                    )}
                  </Text>
                </View>
              )}

              {learnedRoutines.length > 0 && (
                <View style={styles.suggestionSection}>
                  <Text style={styles.suggestionHeader}>From your learned routines</Text>
                  <Text style={styles.routineHint}>Based on recurring tasks in your own history</Text>
                  <View style={styles.chipsRow}>
                    {learnedRoutines.map((routine) => (
                      <Pressable
                        key={routine.label}
                        style={styles.chip}
                        onPress={() => setCaptureText(routine.label)}
                      >
                        <Text style={styles.chipText}>{routine.label}</Text>
                        <Text style={styles.routineSamples}>{routine.sample_count} recorded occurrences</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              {isLoadingRoutines && <Text style={styles.routineLoading}>Checking your learned routines…</Text>}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => { stopSpeechRecognition(); resetModal(); setCaptureVisible(false); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, !captureText.trim() && { opacity: 0.5 }]}
                disabled={!captureText.trim() || isCapturing}
                onPress={() => { stopSpeechRecognition(); setIsListening(false); handleCapture(); }}
              >
                <Text style={styles.confirmBtnText}>
                  {isCapturing ? "Saving..." : taskStatus === "completed" ? "Save Completed Task" : "Save Task"}
                </Text>
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

      <Modal visible={Boolean(selectedTask)} transparent animationType="slide" onRequestClose={() => setSelectedTask(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailContent}>
            <View style={styles.modalHeader}>
              <View style={styles.detailHeading}>
                <History size={18} color={theme.colors.accent.amber} />
                <Text style={styles.modalTitle}>Task work log</Text>
              </View>
              <Pressable onPress={() => setSelectedTask(null)} accessibilityLabel="Close task work log">
                <X size={21} color={theme.colors.text.secondary} />
              </Pressable>
            </View>
      {selectedTask && <>
              <Text style={styles.detailTaskTitle}>{selectedTask.title}</Text>
              <View style={styles.detailSummaryRow}>
                <View style={styles.detailSummaryCard}>
                  <Text style={styles.detailMetric}>{selectedTask.actual_min}m</Text>
                  <Text style={styles.detailMetricLabel}>Recorded time</Text>
                </View>
                <View style={styles.detailSummaryCard}>
                  <Text style={styles.detailMetric}>{selectedTask.estimate_user_min ? `${selectedTask.estimate_user_min}m` : "—"}</Text>
                  <Text style={styles.detailMetricLabel}>Your estimate</Text>
                </View>
                <Pressable style={styles.detailAction} onPress={() => void focusSessionFromTask(selectedTask)}>
                  {runningTimers.some((timer) => timer.task_id === selectedTask.id)
                    ? <><Pause size={15} color="#FFFFFF" /><Text style={styles.detailActionText}>Pause</Text></>
                    : <><Play size={15} color="#FFFFFF" /><Text style={styles.detailActionText}>Start focus</Text></>}
                </Pressable>
              </View>
              <Pressable style={styles.repeatScheduleButton} onPress={() => { setRepeatTask(selectedTask); void loadTaskRecurrence(selectedTask); }} accessibilityRole="button">
                <Repeat2 size={17} color={theme.colors.accent.amber} />
                <Text style={styles.repeatScheduleLabel}>Repeat this task</Text>
                <Text style={styles.repeatScheduleHint}>{isLoadingRepeat ? "Loading…" : repeatRule ? `Every ${repeatRule.interval > 1 ? `${repeatRule.interval} ` : ""}${repeatRule.frequency}` : "Set a schedule"}</Text>
              </Pressable>
              {!!selectedTask.linked_notes?.length && <View style={styles.linkedNotesSection}>
                <Text style={styles.historyTitle}>Related Vault notes</Text>
                {selectedTask.linked_notes.map((note) => <Pressable key={note.id} style={styles.linkedNoteRow} onPress={() => {
                  setSelectedTask(null);
                  router.push({ pathname: "/(tabs)/vault", params: { noteId: note.id } });
                }} accessibilityRole="link">
                  <FileText size={15} color={theme.colors.accent.amber} />
                  <View style={{ flex: 1 }}><Text style={styles.linkedNoteTitle} numberOfLines={1}>{note.title}</Text><Text style={styles.linkedNoteMeta}>{note.source_type.replaceAll("_", " ")} · {note.occurred_on}</Text></View>
                  <ChevronRight size={16} color={theme.colors.text.secondary} />
                </Pressable>)}
              </View>}
              <Text style={styles.historyTitle}>Sessions</Text>
              {isLoadingHistory ? <ActivityIndicator size="small" color={theme.colors.accent.amber} /> : historyError ? (
                <View style={styles.historyEmpty}>
                  <Text style={styles.historyErrorText}>Could not load recorded sessions.</Text>
                  <Pressable onPress={() => void loadTaskHistory(selectedTask)}><Text style={styles.historyRetry}>Try again</Text></Pressable>
                </View>
              ) : taskTimeEntries.length === 0 ? (
                <Text style={styles.historyEmpty}>Start working on this task, then pause or finish a session. Your real work history will show here.</Text>
              ) : <ScrollView style={styles.historyList} contentContainerStyle={{ gap: 10 }}>
                {taskTimeEntries.map((entry) => {
                  const active = entry.ended_at == null;
                  const minutes = entry.duration_min ?? (active ? Math.max(0, Math.floor((clockNow - Date.parse(entry.started_at)) / 60000)) : 0);
                  const maxMinutes = Math.max(1, ...taskTimeEntries.map((item) => item.duration_min ?? 0));
                  const start = new Date(entry.started_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                  const end = entry.ended_at ? new Date(entry.ended_at).toLocaleString([], { hour: "numeric", minute: "2-digit" }) : "In progress · live";
                  return <View key={entry.id} style={styles.sessionCard}>
                    <View style={styles.sessionHeader}>
                      <View><Text style={styles.sessionDate}>Started {start}</Text><Text style={styles.sessionRange}>Ended {end}</Text></View>
                      <Text style={[styles.sessionDuration, active && { color: theme.colors.accent.amber }]}>{minutes}m{active ? " · live" : ""}</Text>
                    </View>
                    <View style={styles.barTrack}><View style={[styles.sessionBar, { width: `${Math.max(3, Math.min(100, (minutes / maxMinutes) * 100))}%` }, active && styles.sessionBarLive]} /></View>
                  </View>;
                })}
              </ScrollView>}
              <Text style={styles.historyFootnote}>Each bar reflects time recorded by ALIBI. Running sessions update live.</Text>
            </>}
          </View>
        </View>
      </Modal>

      <RepeatTaskSheet
        taskTitle={repeatTask?.title ?? ""}
        rule={repeatRule}
        visible={Boolean(repeatTask)}
        busy={isSavingRepeat}
        loading={isLoadingRepeat}
        onClose={() => setRepeatTask(null)}
        onCreate={(frequency, interval) => { void createRepeatSchedule(frequency, interval); }}
        onStop={stopRepeatSchedule}
      />

      <Modal visible={tagModalVisible} transparent animationType="fade" onRequestClose={() => setTagModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add a tag to selected tasks</Text>
              <Pressable onPress={() => setTagModalVisible(false)} accessibilityLabel="Close tag dialog"><X size={20} color={theme.colors.text.secondary} /></Pressable>
            </View>
            <TextInput
              value={batchTagText}
              onChangeText={setBatchTagText}
              placeholder="Tag name"
              placeholderTextColor={theme.colors.text.muted}
              autoCapitalize="none"
              style={styles.batchTagInput}
              editable={!batchBusy}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setTagModalVisible(false)} disabled={batchBusy}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={[styles.confirmBtn, batchBusy && { opacity: 0.55 }]} onPress={handleBatchTag} disabled={batchBusy || !batchTagText.trim()}>
                <Text style={styles.confirmBtnText}>{batchBusy ? "Saving…" : "Add tag"}</Text>
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
    backgroundColor: theme.colors.background.base,
  },
  headerAction: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.84)", borderWidth: 1, borderColor: theme.colors.border.subtle },
  screenHeading: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 },
  screenTitle: { fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.6, color: theme.colors.text.primary },
  screenSubtitle: { fontSize: 14, lineHeight: 20, color: theme.colors.text.secondary, marginTop: 1 },
  viewTabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.surface.card,
    gap: 8,
  },
  viewTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  viewTabActive: {
    backgroundColor: theme.colors.accent.amber,
  },
  viewTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.text.secondary,
  },
  viewTabTextActive: {
    color: "#090D16",
    fontWeight: "700",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  selectToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  selectToggleBtnActive: {
    backgroundColor: "#F97316",
    borderColor: "#EA580C",
  },
  selectToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text.secondary,
  },
  selectToggleTextActive: {
    color: "#FFFFFF",
  },
  taskCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 19,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 10,
    shadowColor: "#19354A",
    shadowOpacity: 0.045,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  taskCardSelected: {
    borderColor: "#F97316",
    backgroundColor: "rgba(249, 115, 22, 0.08)",
  },
  batchActionBar: {
    position: "absolute",
    bottom: 88,
    left: 16,
    right: 16,
    backgroundColor: "#0D1929",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    elevation: 9,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  batchCountText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#F1F5F9",
  },
  batchBtnsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  batchBtn: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  batchBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  batchTagInput: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.background.base,
    paddingHorizontal: 14,
    color: theme.colors.text.primary,
    fontSize: 15,
  },
  taskHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkboxBtn: {
    marginTop: 2,
  },
  taskTitleCol: {
    flex: 1,
  },
  openLogHint: { color: theme.colors.text.secondary, fontSize: 11, marginTop: 4 },
  taskTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  taskTitleDone: {
    textDecorationLine: "line-through",
    color: theme.colors.text.secondary,
  },
  timerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    padding: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.background.base,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  timerBtnActive: {
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.danger,
  },
  timerBtnLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.accent.amber },
  timerElapsed: { marginLeft: 32, marginTop: -4, fontSize: 12, fontWeight: "700", color: theme.colors.accent.emerald },
  taskMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginTop: 32,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.background.base,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    textAlign: "center",
    marginTop: 6,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.accent.amber,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(8,23,35,0.42)",
    justifyContent: "flex-end",
    paddingHorizontal: 0,
    paddingTop: 24,
  },
  modalContent: {
    backgroundColor: theme.colors.surface.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 20,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  detailContent: { backgroundColor: theme.colors.surface.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 32, borderWidth: 1, borderColor: theme.colors.border.subtle, gap: 14, maxHeight: "86%" },
  detailHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailTaskTitle: { fontSize: 20, lineHeight: 27, color: theme.colors.text.primary, fontWeight: "700" },
  detailSummaryRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  detailSummaryCard: { flex: 1, padding: 11, borderRadius: 12, backgroundColor: theme.colors.background.base, borderWidth: 1, borderColor: theme.colors.border.subtle, justifyContent: "center" },
  detailMetric: { fontSize: 18, fontWeight: "800", color: theme.colors.text.primary },
  detailMetricLabel: { marginTop: 2, fontSize: 10, color: theme.colors.text.secondary },
  detailAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: theme.colors.accent.amber, borderRadius: 12, paddingHorizontal: 12 },
  detailActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  repeatScheduleButton: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, borderWidth: 1, borderColor: theme.colors.border.subtle, borderRadius: 14, backgroundColor: theme.colors.surface.card },
  repeatScheduleLabel: { color: theme.colors.text.primary, fontSize: 12, fontWeight: "800", flex: 1 },
  repeatScheduleHint: { color: theme.colors.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  linkedNotesSection: { gap: 8 },
  linkedNoteRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.background.base },
  linkedNoteTitle: { color: theme.colors.text.primary, fontSize: 12, fontWeight: "700" },
  linkedNoteMeta: { color: theme.colors.text.secondary, fontSize: 10, marginTop: 2, textTransform: "capitalize" },
  linkedNoteChip: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderRadius: 10, backgroundColor: "#FFF7ED" },
  linkedNoteChipText: { color: "#B45309", fontSize: 10, fontWeight: "700" },
  historyTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text.primary, marginTop: 2 },
  historyList: { maxHeight: 300 },
  historyEmpty: { padding: 16, borderRadius: 12, backgroundColor: theme.colors.background.base, color: theme.colors.text.secondary, lineHeight: 20, fontSize: 13 },
  historyErrorText: { color: theme.colors.text.secondary, fontSize: 13 },
  historyRetry: { color: theme.colors.accent.amber, fontWeight: "700", marginTop: 8 },
  sessionCard: { padding: 12, backgroundColor: theme.colors.background.base, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border.subtle, gap: 10 },
  sessionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  sessionDate: { color: theme.colors.text.primary, fontWeight: "600", fontSize: 12 },
  sessionRange: { color: theme.colors.text.secondary, fontSize: 11, marginTop: 3 },
  sessionDuration: { color: theme.colors.text.primary, fontWeight: "800", fontSize: 14 },
  barTrack: { height: 7, borderRadius: 5, backgroundColor: theme.colors.border.subtle, overflow: "hidden" },
  sessionBar: { height: "100%", borderRadius: 5, backgroundColor: theme.colors.accent.emerald },
  sessionBarLive: { backgroundColor: theme.colors.accent.amber },
  historyFootnote: { color: theme.colors.text.secondary, fontSize: 10, lineHeight: 14 },
  listeningHintRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 8,
  },
  listeningHintText: {
    fontSize: 12,
    color: theme.colors.accent.amber,
    fontWeight: "600",
  },
  inputContainer: {
    position: "relative",
  },
  captureInput: {
    backgroundColor: theme.colors.background.base,
    borderRadius: 10,
    padding: 12,
    paddingRight: 44,
    color: theme.colors.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    minHeight: 80,
    textAlignVertical: "top",
  },
  inputMicBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  inputMicBtnActive: {
    backgroundColor: theme.colors.accent.amber,
  },
  suggestionSection: {
    gap: 6,
  },
  suggestionHeader: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipsRow: {
    gap: 6,
  },
  chip: {
    backgroundColor: theme.colors.background.base,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  chipText: {
    color: theme.colors.text.primary,
    fontSize: 12,
  },
  routineHint: { color: theme.colors.text.secondary, fontSize: 11 },
  routineSamples: { color: theme.colors.text.secondary, fontSize: 10, marginTop: 3 },
  routineLoading: { color: theme.colors.text.secondary, fontSize: 11 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.background.base,
  },
  cancelBtnText: {
    color: theme.colors.text.secondary,
    fontSize: 14,
    fontWeight: "500",
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: theme.colors.accent.amber,
  },
  confirmBtnText: {
    color: "#090D16",
    fontSize: 14,
    fontWeight: "700",
  },
  optionSection: {
    gap: 8,
  },
  optionSectionHeader: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text.secondary,
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
    backgroundColor: theme.colors.background.base,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  statusOptionPillActivePending: {
    borderColor: theme.colors.accent.amber,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  statusOptionPillActiveCompleted: {
    borderColor: theme.colors.accent.emerald,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  statusOptionText: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    fontWeight: "500",
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: theme.colors.background.base,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  datePillActive: {
    borderColor: theme.colors.accent.amber,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  datePillText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    fontWeight: "500",
  },
  datePillTextActive: {
    color: theme.colors.accent.amber,
    fontWeight: "600",
  },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: theme.colors.background.base,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  timePillActive: {
    borderColor: "#38BDF8",
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  timePillText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    fontWeight: "500",
  },
  timePillTextActive: {
    color: "#38BDF8",
    fontWeight: "600",
  },
  customInputSmall: {
    backgroundColor: theme.colors.background.base,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    color: theme.colors.text.primary,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  alignedDeadlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
  },
  alignedDeadlineText: {
    fontSize: 12,
    color: "#38BDF8",
    fontWeight: "500",
  },
  clearOptionText: {
    fontSize: 11,
    color: theme.colors.accent.amber,
    fontWeight: "500",
  },
});
