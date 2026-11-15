import React, { useState, useEffect, useCallback } from "react";
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
  Clock,
  Calendar,
  Plus,
  Play,
  Square,
  Sparkles,
  Tag as TagIcon,
  X,
  CheckCircle2,
  Circle,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { getAccessToken } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";

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

export default function TasksScreen() {
  const [activeView, setActiveView] = useState<(typeof VIEWS)[number]>("today");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [runningTimer, setRunningTimer] = useState<RunningTimer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Capture modal
  const [captureVisible, setCaptureVisible] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const baseUrl = getServerUrl();
      if (!token) return;

      const res = await fetch(`${baseUrl}/api/v1/tasks?view=${activeView}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }

      // Check running timer
      const timerRes = await fetch(`${baseUrl}/api/v1/time-entries/running`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (timerRes.ok) {
        const timerData = await timerRes.json();
        setRunningTimer(timerData);
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
      const token = await getAccessToken();
      const baseUrl = getServerUrl();
      const res = await fetch(`${baseUrl}/api/v1/tasks/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ raw_input: captureText.trim(), origin: "manual" }),
      });
      if (res.ok) {
        setCaptureText("");
        setCaptureVisible(false);
        fetchTasks();
      } else {
        Alert.alert("Capture Error", "Failed to parse and capture task.");
      }
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to capture task.");
    } finally {
      setIsCapturing(false);
    }
  };

  const handleStatusToggle = async (task: TaskItem) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    try {
      const token = await getAccessToken();
      const baseUrl = getServerUrl();
      const res = await fetch(`${baseUrl}/api/v1/tasks/${task.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchTasks();
      }
    } catch {
      // Degrade
    }
  };

  const handleTimerAction = async (task: TaskItem) => {
    try {
      const token = await getAccessToken();
      const baseUrl = getServerUrl();

      if (runningTimer && runningTimer.task_id === task.id) {
        // Stop timer
        const res = await fetch(`${baseUrl}/api/v1/time-entries/${runningTimer.id}/stop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          setRunningTimer(null);
          fetchTasks();
        }
      } else {
        // Start timer
        const res = await fetch(`${baseUrl}/api/v1/time-entries/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ task_id: task.id }),
        });
        if (res.ok) {
          const entry = await res.json();
          setRunningTimer(entry);
          fetchTasks();
        } else {
          const errData = await res.json();
          Alert.alert("Timer Error", errData.detail || "Failed to start timer.");
        }
      }
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Timer action failed.");
    }
  };

  return (
    <View style={styles.container}>
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
                  <Pressable onPress={() => handleStatusToggle(task)} style={styles.checkboxBtn}>
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
                      style={[
                        styles.timerBtn,
                        isTimerRunning && styles.timerBtnActive,
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
              <Pressable onPress={() => setCaptureVisible(false)}>
                <X size={20} color={theme.colors.text.secondary} />
              </Pressable>
            </View>

            <TextInput
              style={styles.captureInput}
              value={captureText}
              onChangeText={setCaptureText}
              placeholder="e.g. Finish report by tomorrow 5pm #work @alibi"
              placeholderTextColor={theme.colors.text.secondary}
              multiline
              autoFocus
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setCaptureVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, !captureText.trim() && { opacity: 0.5 }]}
                disabled={!captureText.trim() || isCapturing}
                onPress={handleCapture}
              >
                <Text style={styles.confirmBtnText}>
                  {isCapturing ? "Capturing..." : "Save Task"}
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
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 10,
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
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 16,
    padding: 20,
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
  captureInput: {
    backgroundColor: theme.colors.background.base,
    borderRadius: 10,
    padding: 12,
    color: theme.colors.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    minHeight: 80,
    textAlignVertical: "top",
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
});
