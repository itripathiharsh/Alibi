import React, { useState, useEffect, useCallback, useRef } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
} from "react-native";
import {
  CheckSquare,
  Square,
  Clock,
  Calendar,
  Plus,
  Play,
  Tag as TagIcon,
  CalendarDays,
  X,
  CheckCircle2,
  Circle,
  History,
  Pause,
  Repeat2,
  FileText,
  ChevronRight,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { BrandHeader, OfflineNoticeCard, SunriseArt } from "../../components/brand-ui";
import { ProfileAvatar } from "../../components/profile-avatar";
import { formatClock, formatShortDay } from "../../lib/time-format";
import { ensureAuthenticated, getUserProfile, setCachedIsOffline, useOfflineStatus } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";
import { syncWorkNotifications } from "../../lib/work-notifications";
import { DEFAULT_DEADLINE_REMINDER_LEAD_MIN, syncTaskDeadlineReminders } from "../../lib/task-deadline-reminders";
import { triggerHaptic, stopFocusNotification } from "../../lib/focus-session-notification";
import { currentUserId } from "../../lib/learning-signals";
import { requestSync } from "../../lib/task-intake";
import { RepeatTaskSheet, type RepeatFrequency, type RepeatRuleSummary } from "../../components/repeat-task-sheet";
import {
  cacheRunningTimers,
  cacheTaskView,
  cacheTaskTimeEntries,
  deleteTaskOffline,
  getAllLocalTasks,
  getCachedTaskView,
  getLocalTimers,
  getLocalTaskTimeEntries,
  moveTaskToTomorrowOffline,
  onLocalTasksChanged,
  setTaskDoneOffline,
  startTaskTimerOffline,
  stopTaskTimerOffline,
  syncMobileAccount,
  type LocalTask,
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

export default function TasksScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const openedTaskId = useRef<string | null>(null);
  const [activeView, setActiveView] = useState<(typeof VIEWS)[number]>("today");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [runningTimers, setRunningTimers] = useState<RunningTimer[]>([]);
  const [clockNow, setClockNow] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const { isOffline } = useOfflineStatus();
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [taskTimeEntries, setTaskTimeEntries] = useState<TaskTimeEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [repeatTask, setRepeatTask] = useState<TaskItem | null>(null);
  const [repeatRule, setRepeatRule] = useState<RepeatRuleSummary | null>(null);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [isSavingRepeat, setIsSavingRepeat] = useState(false);

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

  /** Tags are not part of the sync protocol yet, so bulk tagging needs the server. */
  const runBatch = async (operation: (task: TaskItem, token: string) => Promise<Response>) => {
    const selectedTasks = tasks.filter((task) => selectedIds.has(task.id));
    if (!selectedTasks.length || batchBusy) return;
    setBatchBusy(true);
    try {
      const token = await ensureAuthenticated().catch(() => null);
      if (!token) throw new Error("Connect to the internet and sign in to tag tasks.");
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

  /**
   * Bulk Done, Tomorrow and Trash are saved on the phone and uploaded by sync, like single
   * taps (ADR-034). Online they used to go straight to the server while offline used the
   * phone, with a different "tomorrow" time and no reschedule count.
   */
  const runLocalBatch = async (change: (taskId: string, userId: string) => Promise<unknown>) => {
    const selectedTasks = tasks.filter((task) => selectedIds.has(task.id));
    if (!selectedTasks.length || batchBusy) return;
    setBatchBusy(true);
    try {
      const userId = await currentUserId();
      for (const task of selectedTasks) await change(task.id, userId);
      triggerHaptic("complete");
      setSelectionMode(false);
      setSelectedIds(new Set());
      requestSync();
      await fetchTasks();
    } catch (error) {
      Alert.alert("Some changes were not saved", error instanceof Error ? error.message : "Try again.");
      await fetchTasks();
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchComplete = () => {
    if (runningTimers.some((timer) => selectedIds.has(timer.task_id))) void stopFocusNotification();
    return runLocalBatch((taskId, userId) => setTaskDoneOffline(userId, taskId, true));
  };

  const handleBatchRescheduleTomorrow = () => runLocalBatch((taskId, userId) => moveTaskToTomorrowOffline(userId, taskId));

  const handleBatchDelete = () => Alert.alert(
    `Move ${selectedIds.size} tasks to Trash?`,
    "You can restore them from Trash later.",
    [
      { text: "Keep tasks", style: "cancel" },
      { text: "Move to Trash", style: "destructive", onPress: () => {
        void runLocalBatch((taskId, userId) => deleteTaskOffline(userId, taskId));
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

  const fetchTasks = useCallback(async () => {
    const userId = await currentUserId();
    // What the phone already has, at once.
    try {
      const cached = await getCachedTaskView(userId, activeView);
      if (cached) {
        setTasks(cached as TaskItem[]);
        setSelectedTask((current) => current ? (cached.find((item) => item.id === current.id) as TaskItem | undefined) ?? current : current);
        setIsLoading(false);
      }
      setRunningTimers(await getLocalTimers(userId));
    } catch {
      // Continue with the server if the local database is unavailable.
    }
    if (userId === "local_user") {
      setCachedIsOffline(true);
      setIsLoading(false);
      return;
    }

    let userIsOffline = false;
    try {
      let token = await ensureAuthenticated().catch(() => null);
      if (!token) {
        userIsOffline = true;
        return;
      }
      const baseUrl = getServerUrl();
      // Upload changes made on this phone first, so the list below already has them. The
      // list used to be fetched first and replaced the cache, hiding new tasks (audit M5).
      await syncMobileAccount(userId, token, baseUrl).catch(() => undefined);
      let res = await fetch(`${baseUrl}/api/v1/tasks?view=${activeView}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        token = await ensureAuthenticated(true).catch(() => null);
        if (token) {
          res = await fetch(`${baseUrl}/api/v1/tasks?view=${activeView}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
      if (res.ok) {
        const data = await res.json() as LocalTask[];
        const shown = await cacheTaskView(userId, activeView, data) as TaskItem[];
        setTasks(shown);
        setSelectedTask((current) => current ? shown.find((item) => item.id === current.id) ?? current : current);
        const profile = await getUserProfile().catch(() => null);
        const lead = profile?.settings?.reminder_lead_min;
        void syncTaskDeadlineReminders(await getAllLocalTasks(userId), typeof lead === "number" ? lead : DEFAULT_DEADLINE_REMINDER_LEAD_MIN);
      }
      if (token) {
        const timerRes = await fetch(`${baseUrl}/api/v1/time-entries/running/all`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
        if (timerRes && timerRes.ok) {
          setRunningTimers(await cacheRunningTimers(userId, await timerRes.json()));
          void syncWorkNotifications();
        }
      }
    } catch {
      userIsOffline = true;
    } finally {
      setCachedIsOffline(userIsOffline);
      setIsLoading(false);
    }
  }, [activeView]);

  // Refresh whenever the tab is opened, not only when the view changes.
  useFocusEffect(useCallback(() => { void fetchTasks(); }, [fetchTasks]));

  // A task changed on the phone (Today, a notification button, the widget): show it.
  useEffect(() => onLocalTasksChanged(() => {
    void (async () => {
      const userId = await currentUserId();
      const cached = await getCachedTaskView(userId, activeView);
      if (cached) setTasks(cached as TaskItem[]);
      setRunningTimers(await getLocalTimers(userId));
    })();
  }), [activeView]);

  useEffect(() => {
    const interval = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Done/not done and the timer change the task on the phone first, the same way as the
  // Today page; the outbox uploads them. This screen used to call the server directly when
  // online and the phone otherwise, so the two pages could disagree (logic audit).
  const handleStatusToggle = async (task: TaskItem) => {
    const done = task.status !== "completed";
    triggerHaptic(done ? "complete" : "tap");
    const userId = await currentUserId();
    if (done && runningTimers.some((item) => item.task_id === task.id)) void stopFocusNotification();
    const updated = await setTaskDoneOffline(userId, task.id, done);
    if (updated) setTasks((previous) => previous.map((item) => item.id === task.id ? { ...item, ...updated } as TaskItem : item));
    setRunningTimers(await getLocalTimers(userId));
    void syncWorkNotifications();
    requestSync();
  };

  const handleTimerAction = async (task: TaskItem) => {
    triggerHaptic("tap");
    const userId = await currentUserId();
    const activeTimer = runningTimers.find((timer) => timer.task_id === task.id);
    try {
      if (activeTimer) {
        void stopFocusNotification();
        await stopTaskTimerOffline(userId, activeTimer.id);
      } else {
        await startTaskTimerOffline(userId, task.id); // other running tasks keep going
      }
      setRunningTimers(await getLocalTimers(userId));
      void syncWorkNotifications();
      requestSync();
      void fetchTasks();
    } catch (error: unknown) {
      Alert.alert("Timer not changed", error instanceof Error ? error.message : "Try again.");
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

  const focusSessionFromTask = async (task: TaskItem) => {
    await handleTimerAction(task);
    await loadTaskHistory(task);
  };

  return (
    <View style={styles.container}>
      <SunriseArt height={175} />
      <BrandHeader
        showOfflineBadge={isOffline}
        onOfflineBadgePress={() => router.push("/login")}
        right={<><Pressable style={styles.headerAction} onPress={() => router.push("/calendar")} accessibilityLabel="Open calendar"><CalendarDays size={21} color={theme.colors.text.primary} /></Pressable><ProfileAvatar /></>}
      />
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
        {isOffline && (
          <OfflineNoticeCard
            featureName="Tasks"
            description="Tasks and timers are stored locally in SQLite and will sync when you connect and log in."
            actionText="Sign in to sync"
            onAction={() => router.push("/login")}
          />
        )}
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

      {/* Every way of adding a task opens the one Add screen (ADR-034). */}
      <Pressable
        style={styles.fab}
        accessibilityLabel="Add a task"
        onPress={() => router.push("/capture")}
      >
        <Plus size={24} color="#090D16" />
      </Pressable>

      <Modal visible={Boolean(selectedTask)} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setSelectedTask(null)}>
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
                  const start = `${formatShortDay(entry.started_at)} ${formatClock(entry.started_at)}`;
                  const end = entry.ended_at ? formatClock(entry.ended_at) : "In progress · live";
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

      <Modal visible={tagModalVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setTagModalVisible(false)}>
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
    borderRadius: theme.radius.cardSecondary,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 10,
    shadowColor: theme.colors.brand.navy,
    shadowOpacity: 0.045,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  taskCardSelected: {
    borderColor: theme.colors.accent.primary,
    backgroundColor: "rgba(255, 116, 31, 0.08)",
  },
  batchActionBar: {
    position: "absolute",
    bottom: 88,
    left: 16,
    right: 16,
    backgroundColor: theme.colors.brand.navy,
    borderRadius: theme.radius.cardSecondary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    elevation: 9,
    shadowColor: theme.colors.brand.navy,
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
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
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
  detailContent: { backgroundColor: theme.colors.surface.card, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet, padding: 20, paddingBottom: 32, borderWidth: 1, borderColor: theme.colors.border.subtle, gap: 14, maxHeight: "86%" },
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
    fontSize: 14,
    fontWeight: "500",
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
  predictionCard: {
    backgroundColor: "rgba(255, 116, 31, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 116, 31, 0.25)",
    padding: 10,
    gap: 4,
  },
  coldStartCard: {
    backgroundColor: "rgba(11, 32, 48, 0.04)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    padding: 10,
    gap: 4,
  },
  predictionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  predictionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.brand.navy,
  },
  predictionApplyBtn: {
    backgroundColor: theme.colors.brand.orange,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  predictionApplyText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  predictionSubtext: {
    fontSize: 11,
    color: theme.colors.text.secondary,
  },
});
