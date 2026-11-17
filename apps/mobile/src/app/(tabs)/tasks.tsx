import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "expo-router";
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
  Clock,
  Calendar,
  Plus,
  Play,
  Square,
  Sparkles,
  Tag as TagIcon,
  CalendarDays,
  UserRound,
  X,
  CheckCircle2,
  Circle,
  Mic,
  MicOff,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { BrandHeader, SunriseArt } from "../../components/brand-ui";
import { getAccessToken, ensureAuthenticated } from "../../lib/auth";
import { getServerUrl, autoDetectServer } from "../../lib/config";
import { startSpeechRecognition, stopSpeechRecognition } from "../../lib/speech";

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
}

interface RunningTimer {
  id: string;
  task_id: string;
  started_at: string;
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
  const [activeView, setActiveView] = useState<(typeof VIEWS)[number]>("today");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [runningTimer, setRunningTimer] = useState<RunningTimer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Capture modal
  const [captureVisible, setCaptureVisible] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [taskStatus, setTaskStatus] = useState<"pending" | "completed">("pending");
  const [selectedDate, setSelectedDate] = useState<"today" | "tomorrow" | "next_week" | "custom" | null>(null);
  const [customDateStr, setCustomDateStr] = useState("");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customTimeStr, setCustomTimeStr] = useState("");

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
    try {
      await autoDetectServer();
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
        const data = await res.json();
        setTasks(data);
      }

      // Check running timer
      if (token) {
        const timerRes = await fetch(`${baseUrl}/api/v1/time-entries/running`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (timerRes.ok) {
          const timerData = await timerRes.json();
          setRunningTimer(timerData);
        }
      }
    } catch {
      // Degrade gracefully
    } finally {
      setIsLoading(false);
    }
  }, [activeView]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCapture = async () => {
    if (!captureText.trim() || isCapturing) return;
    setIsCapturing(true);
    try {
      await autoDetectServer();
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) {
        Alert.alert("Authentication", "Connecting to your ALIBI account...");
        setIsCapturing(false);
        return;
      }

      const deadlineIso = computeDeadlineIso(selectedDate, customDateStr, selectedTime, customTimeStr);
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
        }
        resetModal();
        setCaptureVisible(false);
        fetchTasks();
      } else {
        const errJson = await res.json().catch(() => ({}));
        Alert.alert("Capture Error", errJson.detail || "Failed to parse and capture task.");
      }
    } catch (err: unknown) {
      Alert.alert("Network Error", err instanceof Error ? err.message : "Failed to capture task. Check server connectivity.");
    } finally {
      setIsCapturing(false);
    }
  };

  const handleStatusToggle = async (task: TaskItem) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    try {
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) return;

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
        fetchTasks();
      }
    } catch {
      // Degrade
    }
  };

  const handleTimerAction = async (task: TaskItem) => {
    try {
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) return;

      if (runningTimer && runningTimer.task_id === task.id) {
        // Stop timer
        let res = await fetch(`${baseUrl}/api/v1/time-entries/${runningTimer.id}/stop`, {
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
            res = await fetch(`${baseUrl}/api/v1/time-entries/${runningTimer.id}/stop`, {
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
          setRunningTimer(null);
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
          setRunningTimer(entry);
          fetchTasks();
        } else {
          const errData = await res.json().catch(() => ({}));
          Alert.alert("Timer Error", errData.detail || "Failed to start timer.");
        }
      }
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Timer action failed.");
    }
  };

  return (
    <View style={styles.container}>
      <SunriseArt height={176} />
      <BrandHeader right={<><Pressable style={styles.headerAction} onPress={() => router.push("/calendar")} accessibilityLabel="Open calendar"><CalendarDays size={21} color={theme.colors.text.primary} /></Pressable><Pressable style={styles.headerAction} onPress={() => router.push("/(tabs)/profile")} accessibilityLabel="Open profile"><UserRound size={21} color={theme.colors.text.primary} /></Pressable></>} />
      <View style={styles.screenHeading}><Text style={styles.screenTitle}>Tasks</Text><Text style={styles.screenSubtitle}>Capture, organize and get things done.</Text></View>
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
            const isTimerRunning = runningTimer?.task_id === task.id;

            return (
              <View key={task.id} style={styles.taskCard}>
                <View style={styles.taskHeader}>
                  <Pressable
                    onPress={() => handleStatusToggle(task)}
                    style={({ pressed }) => [styles.checkboxBtn, pressed && { transform: [{ scale: 0.9 }] }]}
                  >
                    {isDone ? (
                      <CheckCircle2 size={22} color={theme.colors.accent.emerald} />
                    ) : (
                      <Circle size={22} color={theme.colors.text.secondary} />
                    )}
                  </Pressable>

                  <View style={styles.taskTitleCol}>
                    <Text
                      style={[
                        styles.taskTitle,
                        isDone && styles.taskTitleDone,
                      ]}
                      numberOfLines={2}
                    >
                      {task.title}
                    </Text>
                  </View>

                  {/* Timer Button */}
                  {!isDone && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.timerBtn,
                        isTimerRunning && styles.timerBtnActive,
                        pressed && { transform: [{ scale: 0.92 }] },
                      ]}
                      onPress={() => handleTimerAction(task)}
                    >
                      {isTimerRunning ? (
                        <Square size={16} color="#FFFFFF" />
                      ) : (
                        <Play size={16} color={theme.colors.accent.amber} />
                      )}
                    </Pressable>
                  )}
                </View>

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
                </View>
              </View>
            );
          })}
      </ScrollView>

      {/* Floating Action Button for Quick Capture */}
      <Pressable
        style={styles.fab}
        accessibilityLabel="Quick capture task"
        onPress={() => setCaptureVisible(true)}
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

              {/* Quick Suggestions */}
              <View style={styles.suggestionSection}>
                <Text style={styles.suggestionHeader}>Quick Templates (Tap to fill):</Text>
                <View style={styles.chipsRow}>
                  {[
                    "Finish client report by tomorrow 5pm #work",
                    "Call doctor at 2pm #urgent",
                    "Review code changes tonight #dev",
                    "Buy groceries today at 6pm #personal",
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
