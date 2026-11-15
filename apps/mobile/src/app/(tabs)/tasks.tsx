import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { CheckSquare, ListFilter, Plus } from "lucide-react-native";
import theme from "../../lib/theme";

const VIEWS = ["Today", "Upcoming", "Backlog", "Completed"] as const;

export default function TasksScreen() {
  const [activeView, setActiveView] = useState<(typeof VIEWS)[number]>("Today");

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
              {view}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Placeholder / Empty State for Milestone M0 */}
        <View style={styles.emptyCard}>
          <View style={styles.iconCircle}>
            <CheckSquare size={28} color={theme.colors.accent.amber} />
          </View>
          <Text style={styles.emptyTitle}>No {activeView} Tasks</Text>
          <Text style={styles.emptySubtitle}>
            Full task lifecycle management, state machine transitions (FR-TASK-001), rules-based
            capture, and timer tracking will be implemented in Milestone M2.
          </Text>

          <View style={styles.specBox}>
            <View style={styles.specRow}>
              <ListFilter size={14} color={theme.colors.text.secondary} />
              <Text style={styles.specText}>Strict IST timezone boundaries applied for day views</Text>
            </View>
            <View style={styles.specRow}>
              <CheckSquare size={14} color={theme.colors.text.secondary} />
              <Text style={styles.specText}>Client-side UUIDv7 IDs ensure offline-first task creation</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Button placeholder */}
      <Pressable style={styles.fab} accessibilityLabel="Quick capture task">
        <Plus size={24} color="#090D16" />
      </Pressable>
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
    backgroundColor: theme.colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    paddingHorizontal: 8,
  },
  viewTab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  viewTabActive: {
    borderBottomColor: theme.colors.accent.amber,
  },
  viewTabText: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    fontWeight: "600",
  },
  viewTabTextActive: {
    color: theme.colors.accent.amber,
  },
  content: {
    padding: 16,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    marginTop: 20,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySubtitle: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  specBox: {
    width: "100%",
    backgroundColor: theme.colors.background.base,
    borderRadius: 8,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  specRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  specText: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    flex: 1,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.colors.accent.amber,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
});
