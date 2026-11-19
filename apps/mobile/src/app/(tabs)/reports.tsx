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
  TextInput,
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
import { BrandHeader, SunriseArt } from "../../components/brand-ui";
import { getAccessToken, ensureAuthenticated } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";

interface SummaryData {
  total_time_min: number;
  tasks_completed: number;
  tasks_pending: number;
  tasks_overdue: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  efficiency: number | null;
}
interface ScoreData { score: number | null; insufficient_data: boolean }
interface TimeDistribution { category_name: string; category_color: string; total_min: number; percentage: number }
interface TrendPoint { date: string; completed_count: number }
interface HeatmapDay { date: string; completed_count: number; minutes_logged: number }
interface TaskActivity { task_id: string; title: string; status: string; period_actual_min: number; actual_min: number; estimate_min: number | null; task_score: number | null; score_basis: string[] }
interface LearningData { peak_window?: string | null }

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
  const [score, setScore] = useState<ScoreData | null>(null);
  const [distribution, setDistribution] = useState<TimeDistribution[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([]);
  const [learning, setLearning] = useState<LearningData | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [includePersonal, setIncludePersonal] = useState(false);
  const [reviewWorked, setReviewWorked] = useState("");
  const [reviewBlocked, setReviewBlocked] = useState("");
  const [reviewNext, setReviewNext] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };
      const endpoints = [
        `${baseUrl}/api/v1/analytics/summary?period=${selectedPeriod}`,
        `${baseUrl}/api/v1/reports`,
        `${baseUrl}/api/v1/analytics/productivity-score?period=${selectedPeriod}`,
        `${baseUrl}/api/v1/analytics/charts/time-distribution?period=${selectedPeriod}`,
        `${baseUrl}/api/v1/analytics/charts/completion-trend?period=${selectedPeriod}`,
        `${baseUrl}/api/v1/analytics/charts/consistency-heatmap?days=365`,
        `${baseUrl}/api/v1/learning/profile`,
        `${baseUrl}/api/v1/analytics/task-activity?period=${selectedPeriod}&limit=12`,
      ];
      const responses = await Promise.all(endpoints.map((url) => fetch(url, { headers }).catch(() => null)));
      if (responses[0]?.ok) setSummary(await responses[0].json());
      if (responses[1]?.ok) setReports(await responses[1].json());
      if (responses[2]?.ok) setScore(await responses[2].json());
      if (responses[3]?.ok) setDistribution(await responses[3].json());
      if (responses[4]?.ok) setTrend(await responses[4].json());
      if (responses[5]?.ok) setHeatmap(await responses[5].json());
      if (responses[6]?.ok) setLearning(await responses[6].json());
      if (responses[7]?.ok) setTaskActivity(await responses[7].json());
    } catch {
      // Degrade gracefully
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveWeeklyRetrospective = async () => {
    if (savingReview || ![reviewWorked, reviewBlocked, reviewNext].some((value) => value.trim())) return;
    setSavingReview(true);
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to save your private weekly review.");
      const today = new Date();
      const occurredOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const lines = [
        "Weekly retrospective",
        "",
        summary ? `Recorded this week: ${summary.tasks_completed} completed, ${summary.total_time_min} minutes logged, ${summary.tasks_pending} pending, ${summary.tasks_overdue} overdue.` : "Weekly activity summary was unavailable when this review was saved.",
        "",
        `What worked: ${reviewWorked.trim() || "Not recorded"}`,
        `What got stuck: ${reviewBlocked.trim() || "Not recorded"}`,
        `Next week priorities: ${reviewNext.trim() || "Not recorded"}`,
      ];
      const response = await fetch(`${getServerUrl()}/api/v1/vault/notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Weekly review · ${occurredOn}`,
          body: lines.join("\n"),
          source_type: "manual",
          privacy_class: "personal",
          occurred_on: occurredOn,
        }),
      });
      if (!response.ok) throw new Error("Could not save the weekly review. Try again.");
      setReviewWorked("");
      setReviewBlocked("");
      setReviewNext("");
      Alert.alert("Review saved", "Your weekly retrospective is in your private Vault.");
    } catch (error) {
      Alert.alert("Weekly review", error instanceof Error ? error.message : "Could not save the review.");
    } finally {
      setSavingReview(false);
    }
  };

  const handleGenerateReport = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      let token = await ensureAuthenticated();
      const baseUrl = getServerUrl();
      if (!token) {
        Alert.alert("Authentication", "Please sign in to create a report.");
        setIsGenerating(false);
        return;
      }

      const today = new Date();
      const startDate = new Date();
      startDate.setDate(today.getDate() - (selectedPeriod === "daily" ? 0 : selectedPeriod === "weekly" ? 7 : 30));

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
  const trendMaximum = Math.max(1, ...trend.map((point) => point.completed_count));
  const heatmapDays = heatmap;
  const heatmapOffset = heatmap.length ? (new Date(`${heatmap[0].date}T00:00:00`).getDay() + 6) % 7 : 0;
  const heatmapCells: (HeatmapDay | null)[] = [...Array(heatmapOffset).fill(null), ...heatmapDays];
  const heatmapWeeks = Array.from({ length: Math.ceil(heatmapCells.length / 7) }, (_, week) => heatmapCells.slice(week * 7, week * 7 + 7));
  const periodLabel = selectedPeriod === "daily" ? "today" : selectedPeriod === "weekly" ? "this week" : "this month";

  return (
    <View style={styles.screen}>
    <SunriseArt height={190} />
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandHeader />
      <View style={styles.screenHeading}><Text style={styles.screenTitle}>Insights</Text><Text style={styles.screenSubtitle}>Understand your productivity, time and working patterns.</Text></View>
      {/* Period Selector Tabs */}
      <View style={styles.periodTabs}>
        <Pressable style={[styles.periodTab, selectedPeriod === "daily" && styles.periodTabActive]} onPress={() => setSelectedPeriod("daily")}><Text style={[styles.periodTabText, selectedPeriod === "daily" && styles.periodTabTextActive]}>Today</Text></Pressable>
        <Pressable style={[styles.periodTab, selectedPeriod === "weekly" && styles.periodTabActive]} onPress={() => setSelectedPeriod("weekly")}><Text style={[styles.periodTabText, selectedPeriod === "weekly" && styles.periodTabTextActive]}>This Week</Text></Pressable>
        <Pressable
          style={[styles.periodTab, selectedPeriod === "monthly" && styles.periodTabActive]}
          onPress={() => setSelectedPeriod("monthly")}
        >
          <Text style={[styles.periodTabText, selectedPeriod === "monthly" && styles.periodTabTextActive]}>
            This Month
          </Text>
        </Pressable>
      </View>

      {/* SQL Verified Analytics Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.cardHeader}>
          <BarChart3 size={18} color={theme.colors.accent.amber} />
          <Text style={styles.summaryTitle}>Your progress</Text>
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
                {summary.efficiency != null ? `${Math.round(summary.efficiency * 100)}%` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Efficiency</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {score?.score != null ? `${score.score}%` : "—"}
              </Text>
              <Text style={styles.metricLabel}>Productivity score</Text>
            </View>
          </View>
        ) : (
          <View style={styles.awaitingBox}>
            <Text style={styles.awaitingTitle}>Awaiting Task Activity</Text>
            <Text style={styles.awaitingSubtitle}>
              No recorded activity for {periodLabel}. Complete tasks and log time to see your verified metrics.
            </Text>
          </View>
        )}
      </View>

      {selectedPeriod === "weekly" && (
        <View style={styles.retrospectiveCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Weekly retrospective</Text>
              <Text style={styles.chartSubtitle}>Reflect on your week and keep the next steps in your private Vault.</Text>
            </View>
            <Sparkles size={20} color="#8B5CF6" />
          </View>
          {summary ? (
            <View style={styles.reviewFacts}>
              <Text style={styles.reviewFact}>{summary.tasks_completed} completed</Text>
              <Text style={styles.reviewFact}>{summary.total_time_min} minutes logged</Text>
              <Text style={styles.reviewFact}>{summary.tasks_pending} pending</Text>
              <Text style={styles.reviewFact}>{summary.tasks_overdue} overdue</Text>
            </View>
          ) : (
            <Text style={styles.chartEmpty}>Weekly counts will appear when the report data loads.</Text>
          )}
          <TextInput value={reviewWorked} onChangeText={setReviewWorked} placeholder="What worked well?" placeholderTextColor={theme.colors.text.muted} multiline style={styles.reviewInput} />
          <TextInput value={reviewBlocked} onChangeText={setReviewBlocked} placeholder="What got stuck?" placeholderTextColor={theme.colors.text.muted} multiline style={styles.reviewInput} />
          <TextInput value={reviewNext} onChangeText={setReviewNext} placeholder="What are your priorities for next week?" placeholderTextColor={theme.colors.text.muted} multiline style={styles.reviewInput} />
          <Pressable disabled={savingReview || ![reviewWorked, reviewBlocked, reviewNext].some((value) => value.trim())} onPress={() => void saveWeeklyRetrospective()} style={[styles.reviewSave, (savingReview || ![reviewWorked, reviewBlocked, reviewNext].some((value) => value.trim())) && { opacity: 0.55 }]}>
            <Text style={styles.reviewSaveText}>{savingReview ? "Saving review…" : "Save private review"}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.insightPanel}>
        <View style={styles.chartHeader}><View><Text style={styles.chartTitle}>Time Distribution</Text><Text style={styles.chartSubtitle}>Logged time by category · {periodLabel}</Text></View><Clock size={19} color="#F47B25" /></View>
        {isLoading ? <ActivityIndicator color={theme.colors.accent.amber} /> : distribution.length === 0 ? <Text style={styles.chartEmpty}>Log time to see your category breakdown.</Text> : <View style={styles.distributionList}>{distribution.slice(0, 5).map((item) => <View key={item.category_name} style={styles.distributionRow}><View style={styles.distributionMeta}><View style={[styles.legendDot, { backgroundColor: item.category_color }]} /><Text style={styles.distributionName} numberOfLines={1}>{item.category_name}</Text><Text style={styles.distributionValue}>{Math.round(item.percentage)}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, item.percentage))}%`, backgroundColor: item.category_color }]} /></View></View>)}</View>}
        <View style={styles.panelDivider} />
        <View style={styles.chartHeader}><View><Text style={styles.chartTitle}>Task focus & scores</Text><Text style={styles.chartSubtitle}>Time recorded per task · completed task score</Text></View><Clock size={19} color="#F47B25" /></View>
        {isLoading ? <ActivityIndicator color={theme.colors.accent.amber} /> : taskActivity.length === 0 ? <Text style={styles.chartEmpty}>Start a task timer to see your work history here.</Text> : <View style={styles.distributionList}>{taskActivity.map((task) => <View key={task.task_id} style={styles.distributionRow}><View style={styles.distributionMeta}><Text style={styles.distributionName} numberOfLines={1}>{task.title}</Text><Text style={styles.distributionValue}>{task.task_score == null ? "—" : `${task.task_score} score`}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, task.estimate_min ? Math.round(task.actual_min / task.estimate_min * 100) : task.status === "completed" ? 100 : 0)}%`, backgroundColor: "#F47B25" }]} /></View><Text style={styles.chartSubtitle}>{task.period_actual_min}m this period · {task.actual_min}m total</Text></View>)}</View>}
      </View>

      <View style={styles.insightPanel}>
        <View style={styles.chartHeader}><View><Text style={styles.chartTitle}>Task Progress</Text><Text style={styles.chartSubtitle}>Completed tasks · {periodLabel}</Text></View><BarChart3 size={19} color="#F47B25" /></View>
        {isLoading ? <ActivityIndicator color={theme.colors.accent.amber} /> : trend.length === 0 || trend.every((point) => point.completed_count === 0) ? <Text style={styles.chartEmpty}>Completed task history will appear here.</Text> : <View style={styles.trendChart}>{trend.slice(-10).map((point) => <View key={point.date} style={styles.trendColumn}><Text style={styles.trendCount}>{point.completed_count || ""}</Text><View style={[styles.trendBar, { height: Math.max(6, (point.completed_count / trendMaximum) * 94), backgroundColor: point.completed_count ? "#F47B25" : "#FCE2D1" }]} /><Text style={styles.trendDay}>{new Date(point.date).toLocaleDateString(undefined, { weekday: "short" })}</Text></View>)}</View>}
        <View style={styles.panelDivider} />
        <View style={styles.chartHeader}><View><Text style={styles.chartTitle}>Focus Pattern</Text><Text style={styles.chartSubtitle}>Days with recorded activity</Text></View><Calendar size={19} color="#F47B25" /></View>
        {isLoading ? <ActivityIndicator color={theme.colors.accent.amber} /> : heatmapDays.length === 0 || heatmapDays.every((day) => day.minutes_logged === 0 && day.completed_count === 0) ? <Text style={styles.chartEmpty}>Your activity pattern appears as you record work.</Text> : <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={styles.heatmap}>{heatmapWeeks.map((week, weekIndex) => <View key={weekIndex} style={styles.heatWeek}>{week.map((day, dayIndex) => day ? <View key={day.date} accessibilityLabel={`${day.date}: ${day.completed_count} completed, ${day.minutes_logged} minutes`} style={[styles.heatCell, { backgroundColor: day.minutes_logged > 0 || day.completed_count > 0 ? "#F47B25" : "#F7E6DB", opacity: day.minutes_logged > 0 || day.completed_count > 0 ? .42 + Math.min(.58, day.minutes_logged / 240) : .55 }]} /> : <View key={`empty-${weekIndex}-${dayIndex}`} style={styles.heatCell} />)}</View>)}</View></ScrollView>}
      </View>

      <View style={[styles.insightPanel, styles.learningCard]}><View style={styles.chartHeader}><View><Text style={styles.chartTitle}>Your Learning Engine</Text><Text style={styles.chartSubtitle}>{learning?.peak_window ? `Recorded focus window: ${learning.peak_window}` : "Patterns build from your recorded work."}</Text></View><Sparkles size={20} color="#8B5CF6" /></View></View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background.base },
  container: { flex: 1, backgroundColor: "transparent" },
  content: {
    paddingHorizontal: 18,
    paddingTop: 7,
    paddingBottom: 26,
    gap: 14,
  },
  screenHeading: { paddingTop: 6, paddingBottom: 4 },
  screenTitle: { fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.6, color: theme.colors.text.primary },
  screenSubtitle: { fontSize: 14, lineHeight: 20, color: theme.colors.text.secondary, marginTop: 1 },
  insightPanel: { padding: 16, borderRadius: 21, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle, gap: 14, shadowColor: "#19354A", shadowOpacity: .04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  retrospectiveCard: { padding: 16, borderRadius: 21, backgroundColor: "#FAF7FF", borderWidth: 1, borderColor: "#ECE5FF", gap: 12 },
  reviewFacts: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  reviewFact: { color: "#4C3F72", backgroundColor: "#F0EAFE", borderRadius: 11, paddingHorizontal: 10, paddingVertical: 7, fontSize: 11, fontWeight: "700" },
  reviewInput: { minHeight: 72, borderRadius: 13, borderWidth: 1, borderColor: "#E4DDF3", backgroundColor: "#FFFFFF", padding: 12, color: theme.colors.text.primary, textAlignVertical: "top", fontSize: 13 },
  reviewSave: { minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: "#6045A1", borderRadius: 14 },
  reviewSaveText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  panelDivider: { height: 1, backgroundColor: "#E8EDF1", marginVertical: 3 },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  chartTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.text.primary },
  chartSubtitle: { color: theme.colors.text.secondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  chartEmpty: { color: theme.colors.text.secondary, fontSize: 13, paddingVertical: 12, lineHeight: 19 },
  distributionList: { gap: 13 },
  distributionRow: { gap: 7 },
  distributionMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  distributionName: { color: theme.colors.text.primary, flex: 1, fontSize: 13, fontWeight: "600" },
  distributionValue: { color: theme.colors.text.secondary, fontSize: 12, fontWeight: "700" },
  track: { height: 8, borderRadius: 8, backgroundColor: "#F0F1F3", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 8 },
  trendChart: { height: 145, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", paddingTop: 12 },
  trendColumn: { alignItems: "center", justifyContent: "flex-end", gap: 5, flex: 1, height: "100%" },
  trendCount: { color: theme.colors.text.secondary, fontSize: 9, height: 12 },
  trendBar: { width: 17, borderRadius: 7, minHeight: 6 },
  trendDay: { color: theme.colors.text.secondary, fontSize: 9 },
  heatmap: { flexDirection: "row", gap: 4 },
  heatWeek: { gap: 4 },
  heatCell: { width: 8, height: 8, borderRadius: 2 },
  learningCard: { backgroundColor: "#F7F3FF", borderColor: "#ECE5FF" },
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
    backgroundColor: "#102E42",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E435A",
    shadowColor: "#0B2030",
    shadowOpacity: .14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
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
  summaryTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  cardSubtitle: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 2,
  },
  metricItem: {
    width: "48%",
    flexGrow: 1,
    alignItems: "flex-start",
    padding: 11,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,.08)",
  },
  metricValue: {
    fontSize: 23,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  metricLabel: {
    fontSize: 11,
    color: "#C6D5DF",
    marginTop: 4,
  },
  awaitingBox: {
    paddingVertical: 12,
  },
  awaitingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  awaitingSubtitle: {
    fontSize: 12,
    color: "#C6D5DF",
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
