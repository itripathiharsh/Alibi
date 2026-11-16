import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import {
  BarChart3,
  FileText,
  Download,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  FileSpreadsheet,
  RefreshCw,
  Share2,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { getAccessToken, ensureAuthenticated } from "../../lib/auth";
import { getServerUrl, autoDetectServer } from "../../lib/config";

interface SummaryData {
  total_time_min: number;
  tasks_completed: number;
  tasks_pending: number;
  tasks_overdue: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  efficiency: number | null;
}

interface ReportItem {
  id: string;
  report_type: string;
  period_start: string;
  period_end: string;
  scope: string[];
  facts_hash: string;
  status: string;
  generated_at?: string;
}

export default function ReportsScreen() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"weekly" | "monthly">("weekly");
  const [includePersonal, setIncludePersonal] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      await autoDetectServer();
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) return;

      // 1. Fetch live SQL analytics summary
      const sumRes = await fetch(`${baseUrl}/api/v1/analytics/summary?period=${selectedPeriod}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sumRes.ok) {
        const data = await sumRes.json();
        setSummary(data);
      }

      // 2. Fetch existing generated reports list
      const repRes = await fetch(`${baseUrl}/api/v1/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (repRes.ok) {
        const repData = await repRes.json();
        setReports(repData);
      }
    } catch {
      // Degrade gracefully
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateReport = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      await autoDetectServer();
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) {
        Alert.alert("Authentication", "Please connect to your backend in Settings.");
        setIsGenerating(false);
        return;
      }

      const today = new Date();
      const startDate = new Date();
      startDate.setDate(today.getDate() - (selectedPeriod === "weekly" ? 7 : 30));

      const payload = {
        report_type: selectedPeriod,
        period_start: startDate.toISOString().split("T")[0],
        period_end: today.toISOString().split("T")[0],
        scope: includePersonal ? ["work", "shared", "personal"] : ["work", "shared"],
      };

      let res = await fetch(`${baseUrl}/api/v1/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        token = await ensureAuthenticated(true);
        if (token) {
          res = await fetch(`${baseUrl}/api/v1/reports`, {
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
        const newReport = await res.json();
        Alert.alert(
          "Report Generated",
          `Verified ${newReport.report_type} snapshot created!\nHash: ${newReport.facts_hash.slice(0, 16)}...`
        );
        loadData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        Alert.alert("Error", errJson.detail || "Failed to generate report.");
      }
    } catch (err: unknown) {
      Alert.alert("Network Error", err instanceof Error ? err.message : "Failed to reach server.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareReport = async (report: ReportItem, format: "csv" | "xlsx") => {
    try {
      const baseUrl = getServerUrl();
      const token = await getAccessToken();
      const exportUrl = `${baseUrl}/api/v1/reports/${report.id}/export/${format}`;

      Alert.alert(
        `Export ${format.toUpperCase()}`,
        `Report export URL generated:\n${exportUrl}\n\n(Formula injection protection active).`,
        [
          { text: "Copy/Share Link", onPress: () => Share.share({ message: exportUrl }) },
          { text: "OK" },
        ]
      );
    } catch (err: unknown) {
      Alert.alert("Export Error", err instanceof Error ? err.message : "Failed to export report.");
    }
  };

  const hasData = summary && (summary.tasks_completed > 0 || summary.total_time_min > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Period Selector Tabs */}
      <View style={styles.periodTabs}>
        <Pressable
          style={[styles.periodTab, selectedPeriod === "weekly" && styles.periodTabActive]}
          onPress={() => setSelectedPeriod("weekly")}
        >
          <Text style={[styles.periodTabText, selectedPeriod === "weekly" && styles.periodTabTextActive]}>
            Weekly View
          </Text>
        </Pressable>
        <Pressable
          style={[styles.periodTab, selectedPeriod === "monthly" && styles.periodTabActive]}
          onPress={() => setSelectedPeriod("monthly")}
        >
          <Text style={[styles.periodTabText, selectedPeriod === "monthly" && styles.periodTabTextActive]}>
            Monthly View
          </Text>
        </Pressable>
      </View>

      {/* SQL Verified Analytics Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.cardHeader}>
          <BarChart3 size={18} color={theme.colors.accent.amber} />
          <Text style={styles.cardTitle}>Verified Performance Metrics</Text>
          <Pressable onPress={loadData} hitSlop={8} style={{ marginLeft: "auto" }}>
            <RefreshCw size={14} color={theme.colors.text.muted} />
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color={theme.colors.accent.amber} style={{ marginVertical: 18 }} />
        ) : hasData ? (
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{summary.tasks_completed}</Text>
              <Text style={styles.metricLabel}>Completed</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {Math.round((summary.total_time_min / 60) * 10) / 10}h
              </Text>
              <Text style={styles.metricLabel}>Time Spent</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {summary.completion_rate != null ? `${Math.round(summary.completion_rate * 100)}%` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Completion</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {summary.on_time_rate != null ? `${Math.round(summary.on_time_rate * 100)}%` : "—"}
              </Text>
              <Text style={styles.metricLabel}>On-Time</Text>
            </View>
          </View>
        ) : (
          <View style={styles.awaitingBox}>
            <Text style={styles.awaitingTitle}>Awaiting Task Activity</Text>
            <Text style={styles.awaitingSubtitle}>
              No tasks completed in this {selectedPeriod} period. Complete tasks and log time to see verified SQL metrics without fabrication.
            </Text>
          </View>
        )}
      </View>

      {/* Actionable Report Generator Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <FileText size={18} color={theme.colors.accent.amber} />
          <Text style={styles.cardTitle}>Generate Verified Report Snapshot</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          Generates a frozen, tamper-proof audit snapshot with a SHA-256 hash. Zero metric fabrication.
        </Text>

        {/* Scope selector */}
        <Pressable
          style={styles.scopeToggle}
          onPress={() => setIncludePersonal(!includePersonal)}
        >
          <View style={[styles.checkbox, includePersonal && styles.checkboxActive]}>
            {includePersonal && <CheckCircle2 size={14} color={theme.colors.background.base} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scopeTitle}>Include Personal Category</Text>
            <Text style={styles.scopeDesc}>
              {includePersonal
                ? "Warning: Personal items will be visible in the exported document."
                : "Privacy safe: Only professional and shared tasks are included."}
            </Text>
          </View>
        </Pressable>

        {/* Generate Button */}
        <Pressable
          style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
          onPress={handleGenerateReport}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color={theme.colors.background.base} />
          ) : (
            <>
              <Sparkles size={16} color={theme.colors.background.base} />
              <Text style={styles.generateBtnText}>
                Create {selectedPeriod.toUpperCase()} Report Snapshot
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Generated Reports History */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Generated Audit Snapshots</Text>
        <Text style={styles.sectionBadge}>{reports.length} Reports</Text>
      </View>

      {reports.length === 0 ? (
        <View style={styles.emptyReports}>
          <FileSpreadsheet size={24} color={theme.colors.text.muted} />
          <Text style={styles.emptyReportsText}>No audit snapshots generated yet.</Text>
          <Text style={styles.emptyReportsSub}>
            Tap "Create Report Snapshot" above to generate your first verified document.
          </Text>
        </View>
      ) : (
        reports.map((r) => (
          <View key={r.id} style={styles.reportCard}>
            <View style={styles.reportTop}>
              <View>
                <Text style={styles.reportTitle}>
                  {r.report_type.toUpperCase()} Report
                </Text>
                <Text style={styles.reportPeriod}>
                  {r.period_start} → {r.period_end}
                </Text>
              </View>
              <View style={styles.hashBadge}>
                <ShieldCheck size={12} color={theme.colors.accent.emerald} />
                <Text style={styles.hashText}>{r.facts_hash.slice(0, 8)}</Text>
              </View>
            </View>

            <View style={styles.reportActions}>
              <Pressable
                style={styles.exportBtn}
                onPress={() => handleShareReport(r, "csv")}
              >
                <Download size={14} color={theme.colors.accent.amber} />
                <Text style={styles.exportBtnText}>CSV Timesheet</Text>
              </Pressable>

              <Pressable
                style={styles.exportBtn}
                onPress={() => handleShareReport(r, "xlsx")}
              >
                <FileSpreadsheet size={14} color="#818CF8" />
                <Text style={[styles.exportBtnText, { color: "#818CF8" }]}>Excel Workbook</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
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
  periodTabs: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface.card,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  periodTabActive: {
    backgroundColor: theme.colors.surface.elevated,
  },
  periodTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text.secondary,
  },
  periodTabTextActive: {
    color: theme.colors.accent.amber,
    fontWeight: "700",
  },
  summaryCard: {
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
    marginBottom: 12,
  },
  cardTitle: {
    color: theme.colors.text.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  cardSubtitle: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  metricsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  metricItem: {
    alignItems: "center",
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text.primary,
  },
  metricLabel: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    marginTop: 4,
  },
  awaitingBox: {
    paddingVertical: 12,
  },
  awaitingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  awaitingSubtitle: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    lineHeight: 18,
  },
  card: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  scopeToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: theme.colors.accent.amber,
    borderColor: theme.colors.accent.amber,
  },
  scopeTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  scopeDesc: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    marginTop: 2,
    lineHeight: 16,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.accent.amber,
    paddingVertical: 12,
    borderRadius: 10,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.background.base,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  sectionBadge: {
    fontSize: 11,
    color: theme.colors.accent.amber,
    fontWeight: "600",
  },
  emptyReports: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  emptyReportsText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text.primary,
    marginTop: 8,
  },
  emptyReportsSub: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  reportCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 12,
  },
  reportTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  reportPeriod: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    marginTop: 2,
  },
  hashBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hashText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.accent.emerald,
    fontFamily: "monospace",
  },
  reportActions: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    paddingTop: 10,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  exportBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.accent.amber,
  },
});
