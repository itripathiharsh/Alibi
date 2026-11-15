import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BarChart3, FileText, ShieldAlert, Award } from "lucide-react-native";
import theme from "../../lib/theme";

export default function ReportsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Report Summary Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <BarChart3 size={18} color={theme.colors.accent.amber} />
          <Text style={styles.cardTitle}>Weekly Summary</Text>
        </View>
        <Text style={styles.summaryHighlight}>84% Average Productivity</Text>
        <Text style={styles.cardText}>
          Completed 28 tasks across 14.5 recorded hours. Consistent habit score achieved.
        </Text>
      </View>

      {/* PDF Export Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <FileText size={18} color="#818CF8" />
          <Text style={styles.cardTitle}>ReportLab PDF Generation</Text>
        </View>
        <Text style={styles.cardText}>
          Deterministic PDF report generation powered by Python ReportLab (ADR-012) ensures zero
          native dependency issues and pure cross-platform portability.
        </Text>
      </View>

      {/* Sharing Safeguard Notice */}
      <View style={styles.warningCard}>
        <View style={styles.cardHeader}>
          <ShieldAlert size={18} color={theme.colors.accent.amber} />
          <Text style={styles.warningTitle}>Sharing Safeguards (ADR-015)</Text>
        </View>
        <Text style={styles.warningText}>
          Uncategorised tasks are strictly treated as Personal. Personal items are automatically
          excluded from professional client reports and team exports.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Award size={18} color={theme.colors.accent.emerald} />
          <Text style={styles.cardTitle}>Audit & Access Logging</Text>
        </View>
        <Text style={styles.cardText}>
          All shared report downloads and external link accesses are tracked in the immutable audit
          log (ADR-016) with IP hash and timestamp.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.base,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    color: theme.colors.text.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  summaryHighlight: {
    color: theme.colors.accent.amber,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  cardText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  warningCard: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
  },
  warningTitle: {
    color: theme.colors.accent.amber,
    fontSize: 14,
    fontWeight: "700",
  },
  warningText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
});

