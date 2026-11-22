import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  FolderPlus,
  Plus,
  Sliders,
  Trash2,
  X,
} from "lucide-react-native";
import theme from "../lib/theme";
import {
  LocalProjectRecord,
  deleteLocalProject,
  saveLocalProject,
} from "../lib/offline-sync";

export interface ProjectManagerSheetProps {
  visible: boolean;
  userId: string;
  projects: LocalProjectRecord[];
  onSelectProject?: (project: LocalProjectRecord | null) => void;
  onRefreshProjects: () => void;
  onClose: () => void;
}

const PROJECT_COLORS = [
  "#FF741F", // Brand orange
  "#2563EB", // Blue
  "#10B981", // Emerald
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#0B2030", // Brand navy
];

export function ProjectManagerSheet({
  visible,
  userId,
  projects,
  onSelectProject,
  onRefreshProjects,
  onClose,
}: ProjectManagerSheetProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [color, setColor] = useState("#FF741F");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    await saveLocalProject(userId, {
      name: name.trim(),
      description: description.trim() || undefined,
      objective: objective.trim() || undefined,
      color,
      target_date: targetDate.trim() || null,
      status: "active",
    });
    setSaving(false);
    setName("");
    setDescription("");
    setObjective("");
    setTargetDate("");
    setCreating(false);
    onRefreshProjects();
  };

  const handleDelete = (proj: LocalProjectRecord) => {
    Alert.alert(
      "Delete Project",
      `Are you sure you want to delete "${proj.name}"? Tasks associated with this project will remain in your task list.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteLocalProject(userId, proj.id);
            onRefreshProjects();
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Project Intelligence</Text>
              <Text style={styles.subtitle}>
                Track objectives, milestones and project health without duplicate data.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={theme.colors.text.secondary} />
            </Pressable>
          </View>

          {!creating ? (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              <Pressable
                style={styles.newProjectButton}
                onPress={() => setCreating(true)}
              >
                <Plus size={16} color={theme.colors.accent.primary} />
                <Text style={styles.newProjectButtonText}>Create New Project</Text>
              </Pressable>

              {projects.length === 0 ? (
                <View style={styles.emptyCard}>
                  <FolderPlus size={36} color={theme.colors.text.muted} />
                  <Text style={styles.emptyTitle}>No Projects Yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Organize your tasks and knowledge vault notes into structured projects with real-time health indicators.
                  </Text>
                </View>
              ) : (
                projects.map((p) => {
                  const total = p.tasks_count || 0;
                  const completed = p.completed_tasks_count || 0;
                  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

                  return (
                    <View key={p.id} style={styles.projectCard}>
                      <View style={styles.projectHeaderRow}>
                        <View style={[styles.colorBar, { backgroundColor: p.color }]} />
                        <View style={styles.projectTitleCol}>
                          <Text style={styles.projectName}>{p.name}</Text>
                          {p.objective ? (
                            <Text style={styles.projectObjective} numberOfLines={1}>
                              Target: {p.objective}
                            </Text>
                          ) : null}
                        </View>

                        {/* Health Badge */}
                        <View
                          style={[
                            styles.healthBadge,
                            p.health_status === "completed" && styles.healthCompleted,
                            p.health_status === "needs_attention" && styles.healthWarning,
                            p.health_status === "at_risk" && styles.healthDanger,
                          ]}
                        >
                          <Text
                            style={[
                              styles.healthText,
                              p.health_status === "completed" && styles.healthTextCompleted,
                              p.health_status === "needs_attention" && styles.healthTextWarning,
                              p.health_status === "at_risk" && styles.healthTextDanger,
                            ]}
                          >
                            {p.health_status === "completed"
                              ? "DONE"
                              : p.health_status === "needs_attention"
                                ? "ATTENTION"
                                : p.health_status === "at_risk"
                                  ? "AT RISK"
                                  : "ON TRACK"}
                          </Text>
                        </View>

                        <Pressable
                          onPress={() => handleDelete(p)}
                          hitSlop={8}
                          style={styles.deleteBtn}
                        >
                          <Trash2 size={16} color="#DC2626" />
                        </Pressable>
                      </View>

                      {/* Progress Bar */}
                      <View style={styles.progressRow}>
                        <View style={styles.progressBarTrack}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { width: `${percent}%`, backgroundColor: p.color },
                            ]}
                          />
                        </View>
                        <Text style={styles.progressPct}>{percent}%</Text>
                      </View>

                      {/* Stats footer */}
                      <View style={styles.projectFooter}>
                        <Text style={styles.footerMeta}>
                          {completed} / {total} {total === 1 ? "task" : "tasks"} completed
                        </Text>
                        {p.target_date ? (
                          <View style={styles.targetDateBadge}>
                            <Calendar size={12} color={theme.colors.text.secondary} />
                            <Text style={styles.targetDateText}>Due {p.target_date}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          ) : (
            <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
              <Text style={styles.formHeader}>NEW PROJECT</Text>

              <Text style={styles.inputLabel}>Project Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Q4 Client Deliverable, Mobile App v2"
                placeholderTextColor={theme.colors.text.muted}
                autoFocus
              />

              <Text style={styles.inputLabel}>Strategic Objective</Text>
              <TextInput
                style={styles.input}
                value={objective}
                onChangeText={setObjective}
                placeholder="e.g. Launch beta to 100 paying customers"
                placeholderTextColor={theme.colors.text.muted}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={description}
                onChangeText={setDescription}
                placeholder="Context, scope, milestones and deliverables"
                placeholderTextColor={theme.colors.text.muted}
                multiline
              />

              <Text style={styles.inputLabel}>Target Completion Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={targetDate}
                onChangeText={setTargetDate}
                placeholder="2026-12-31"
                placeholderTextColor={theme.colors.text.muted}
                maxLength={10}
              />

              <Text style={styles.inputLabel}>Accent Color</Text>
              <View style={styles.colorPalette}>
                {PROJECT_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      color === c && styles.colorCircleActive,
                    ]}
                    onPress={() => setColor(c)}
                  />
                ))}
              </View>

              <View style={styles.formActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setCreating(false)}
                >
                  <Text style={styles.cancelBtnText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.saveBtn,
                    (!name.trim() || saving) && styles.disabled,
                  ]}
                  onPress={handleCreate}
                  disabled={!name.trim() || saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Project</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11,32,48,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "90%",
    gap: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border.subtle,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.text.secondary,
    marginTop: 2,
    maxWidth: 300,
  },
  list: {
    maxHeight: 460,
  },
  newProjectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.brand.peachLight,
    borderWidth: 1,
    borderColor: theme.colors.brand.peachBorder,
    marginBottom: 12,
  },
  newProjectButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.brand.peachText,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.surface.surface2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.text.primary,
  },
  emptySubtitle: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    textAlign: "center",
    lineHeight: 18,
  },
  projectCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.cardSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  projectHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  colorBar: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  projectTitleCol: {
    flex: 1,
    gap: 2,
  },
  projectName: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  projectObjective: {
    fontSize: 11,
    color: theme.colors.text.secondary,
  },
  healthBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.control,
    backgroundColor: "#EFF6FF",
  },
  healthCompleted: { backgroundColor: "#ECFDF5" },
  healthWarning: { backgroundColor: "#FEF3C7" },
  healthDanger: { backgroundColor: "#FEF2F2" },
  healthText: { fontSize: 10, fontWeight: "800", color: "#1D4ED8" },
  healthTextCompleted: { color: "#059669" },
  healthTextWarning: { color: "#D97706" },
  healthTextDanger: { color: "#DC2626" },
  deleteBtn: {
    padding: 4,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.surface.surface2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.text.secondary,
    minWidth: 32,
    textAlign: "right",
  },
  projectFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    paddingTop: 8,
  },
  footerMeta: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontWeight: "500",
  },
  targetDateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  targetDateText: {
    fontSize: 11,
    color: theme.colors.text.secondary,
  },
  form: {
    maxHeight: 460,
  },
  formHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.colors.text.muted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text.primary,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    minHeight: 46,
    backgroundColor: theme.colors.surface.surface2,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    paddingHorizontal: 12,
    color: theme.colors.text.primary,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 70,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  colorPalette: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    marginBottom: 16,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: "#0B2030",
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text.secondary,
  },
  saveBtn: {
    flex: 1.5,
    minHeight: 48,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.5,
  },
});
