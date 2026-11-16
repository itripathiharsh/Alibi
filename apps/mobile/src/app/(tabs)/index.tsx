import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Activity,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  Target,
  Layers,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Award,
  TrendingUp,
  BarChart2,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { getAccessToken, ensureAuthenticated } from "../../lib/auth";
import { getServerUrl, pingServer, autoDetectServer, type ServerMeta } from "../../lib/config";

type Period = "daily" | "weekly" | "monthly";

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

interface TrendPoint {
  date: string;
  completed_count: number;
}

interface TimeDistItem {
  category_name: string;
  category_color: string;
  total_min: number;
  percentage: number;
}

interface EstVsActualItem {
  task_id: string;
  title: string;
  category_name: string;
  estimate_min: number;
  actual_min: number;
  ratio: number;
}

export default function DashboardScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("weekly");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [timeDist, setTimeDist] = useState<TimeDistItem[]>([]);
  const [estVsActual, setEstVsActual] = useState<EstVsActualItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());
  const [pingResult, setPingResult] = useState<{
    success: boolean;
    data?: ServerMeta;
    error?: string;
  } | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      const token = (await getAccessToken()) || (await ensureAuthenticated());
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const baseUrl = getServerUrl();
      const [sumRes, scoreRes, trendRes, distRes, evaRes] = await Promise.all([
        fetch(`${baseUrl}/api/v1/analytics/summary?period=${period}`, { headers }),
        fetch(`${baseUrl}/api/v1/analytics/productivity-score?period=${period}`, { headers }),
        fetch(`${baseUrl}/api/v1/analytics/charts/completion-trend?period=${period}`, { headers }),
        fetch(`${baseUrl}/api/v1/analytics/charts/time-distribution?period=${period}`, { headers }),
        fetch(`${baseUrl}/api/v1/analytics/charts/est-vs-actual?period=${period}`, { headers }),
      ]);

      if (sumRes.ok) setSummary(await sumRes.json());
      if (scoreRes.ok) setScore(await scoreRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
      if (distRes.ok) setTimeDist(await distRes.json());
      if (evaRes.ok) setEstVsActual(await evaRes.json());
    } catch {
      // Fallback gracefully on network error
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [period]);

  const checkConnection = async () => {
    const detectedUrl = await autoDetectServer();
    setServerUrlState(detectedUrl);
    const res = await pingServer(detectedUrl);
    setPingResult(res);
  };

  useEffect(() => {
    setServerUrlState(getServerUrl());
    checkConnection();
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    checkConnection();
    fetchDashboardData();
  };

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Period Switcher */}
      <View style={styles.periodRow}>
        {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
          <Pressable
            key={p}
            style={[styles.periodTab, period === p && styles.periodTabActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
              {p === "daily" ? "Today" : p === "weekly" ? "This Week" : "This Month"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Productivity Score Banner */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreHeader}>
          <View style={styles.scoreTitleGroup}>
            <View style={styles.scoreBadgeRow}>
              <Award size={16} color={theme.colors.accent.emerald} />
              <Text style={styles.scoreSubtitle}>Productivity Score</Text>
            </View>
            <Text style={styles.scoreTitle}>
              {score && score.score !== null && score.score !== undefined
                ? score.score >= 80
                  ? "Outstanding Focus"
                  : score.score >= 60
                  ? "Steady Progress"
                  : "Needs Pacing"
                : "Awaiting Data"}
            </Text>
          </View>
          <View style={styles.scoreCircle}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : !score || score.insufficient_data || score.score === null ? (
              <Text style={styles.scoreNone}>—</Text>
            ) : (
              <>
                <Text style={styles.scoreValue}>{score.score}</Text>
                <Text style={styles.scoreMax}>/ 100</Text>
              </>
            )}
          </View>
        </View>

        {/* Breakdown chips */}
        <View style={styles.componentRow}>
          <View style={styles.componentItem}>
            <Text style={styles.componentLabel}>Completion</Text>
            <Text style={styles.componentValue}>
              {score?.completion_component !== null && score?.completion_component !== undefined
                ? `${Math.round(score.completion_component * 100)}%`
                : "—"}
            </Text>
          </View>
          <View style={styles.componentItem}>
            <Text style={styles.componentLabel}>On-Time</Text>
            <Text style={styles.componentValue}>
              {score?.on_time_component !== null && score?.on_time_component !== undefined
                ? `${Math.round(score.on_time_component * 100)}%`
                : "—"}
            </Text>
          </View>
          <View style={styles.componentItem}>
            <Text style={styles.componentLabel}>Accuracy</Text>
            <Text style={styles.componentValue}>
              {score?.accuracy_component !== null && score?.accuracy_component !== undefined
                ? `${Math.round(score.accuracy_component * 100)}%`
                : "—"}
            </Text>
          </View>
        </View>
      </View>

      {/* 4 Core Quick Metrics Grid */}
      <View style={styles.metricsGrid}>
        <Pressable
          style={({ pressed }) => [styles.metricCard, pressed && styles.metricCardPressed]}
        >
          <View style={styles.metricIconRow}>
            <Clock size={16} color={theme.colors.accent.emerald} />
            <Text style={styles.metricLabel}>Time Spent</Text>
          </View>
          <Text style={styles.metricValue}>
            {isLoading ? "..." : formatHours(summary?.total_time_min || 0)}
          </Text>
          <Text style={styles.metricSubtext}>Logged in period</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.metricCard, pressed && styles.metricCardPressed]}
        >
          <View style={styles.metricIconRow}>
            <CheckCircle2 size={16} color={theme.colors.accent.emerald} />
            <Text style={styles.metricLabel}>Completed</Text>
          </View>
          <Text style={styles.metricValue}>
            {isLoading ? "..." : summary?.tasks_completed ?? 0}
          </Text>
          <Text style={styles.metricSubtext}>Finished tasks</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.metricCard, pressed && styles.metricCardPressed]}
        >
          <View style={styles.metricIconRow}>
            <Layers size={16} color="#818CF8" />
            <Text style={styles.metricLabel}>Pending</Text>
          </View>
          <Text style={styles.metricValue}>
            {isLoading ? "..." : summary?.tasks_pending ?? 0}
          </Text>
          <Text style={styles.metricSubtext}>Open items</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.metricCard, pressed && styles.metricCardPressed]}
        >
          <View style={styles.metricIconRow}>
            <AlertTriangle size={16} color={theme.colors.danger} />
            <Text style={styles.metricLabel}>Overdue</Text>
          </View>
          <Text
            style={[
              styles.metricValue,
              (summary?.tasks_overdue || 0) > 0 && { color: theme.colors.danger },
            ]}
          >
            {isLoading ? "..." : summary?.tasks_overdue ?? 0}
          </Text>
          <Text style={styles.metricSubtext}>Past deadline</Text>
        </Pressable>
      </View>

      {/* Visual Chart Section: Completion Trend */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <BarChart2 size={16} color={theme.colors.accent.emerald} />
          <Text style={styles.sectionTitle}>Daily Completion Trend</Text>
        </View>
        {trend.length === 0 ? (
          <Text style={styles.emptyText}>No completions in this period</Text>
        ) : (
          <View style={styles.trendList}>
            {trend.map((pt) => (
              <View key={pt.date} style={styles.trendRow}>
                <Text style={styles.trendDate}>{pt.date}</Text>
                <View style={styles.trendBarContainer}>
                  <View
                    style={[
                      styles.trendBar,
                      { width: `${Math.min(100, Math.max(8, pt.completed_count * 25))}%` },
                    ]}
                  />
                </View>
                <Text style={styles.trendCount}>{pt.completed_count}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Visual Chart Section: Estimated vs Actual Ratio */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Target size={16} color={theme.colors.accent.amber} />
          <Text style={styles.sectionTitle}>Estimated vs. Actual</Text>
        </View>
        {estVsActual.length === 0 ? (
          <Text style={styles.emptyText}>No completed tasks with estimates</Text>
        ) : (
          <View style={styles.evaList}>
            {estVsActual.slice(0, 5).map((item) => (
              <View key={item.task_id} style={styles.evaRow}>
                <View style={styles.evaInfo}>
                  <Text style={styles.evaTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.evaSub}>
                    Est: {formatHours(item.estimate_min)} · Act: {formatHours(item.actual_min)}
                  </Text>
                </View>
                <View style={styles.evaBadge}>
                  <Text style={styles.evaRatio}>{item.ratio}×</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Backend LAN Connectivity Card */}
      <View style={styles.lanCard}>
        <View style={styles.lanHeader}>
          <View style={styles.lanTitleRow}>
            {pingResult?.success ? (
              <Wifi size={18} color={theme.colors.accent.emerald} />
            ) : (
              <WifiOff size={18} color={theme.colors.accent.amber} />
            )}
            <Text style={styles.lanTitle}>Backend Health</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              pingResult?.success ? styles.statusPillSuccess : styles.statusPillIdle,
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                pingResult?.success ? styles.statusTextSuccess : styles.statusTextIdle,
              ]}
            >
              {pingResult?.success ? "Connected" : "Disconnected"}
            </Text>
          </View>
        </View>
        <Text style={styles.lanEndpoint}>{serverUrl}</Text>
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
    gap: 16,
    paddingBottom: 40,
  },
  periodRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface.card,
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  periodTabActive: {
    backgroundColor: theme.colors.surface.surface2,
  },
  periodText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    fontWeight: "500",
  },
  periodTextActive: {
    color: theme.colors.text.primary,
    fontWeight: "600",
  },
  scoreCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  scoreHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scoreTitleGroup: {
    flex: 1,
  },
  scoreBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreSubtitle: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  scoreTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text.primary,
    marginTop: 4,
  },
  scoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.surface.surface2,
    borderWidth: 3,
    borderColor: theme.colors.accent.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text.primary,
  },
  scoreMax: {
    fontSize: 9,
    color: theme.colors.text.secondary,
  },
  scoreNone: {
    fontSize: 20,
    color: theme.colors.text.secondary,
  },
  componentRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    marginTop: 16,
    paddingTop: 8,
  },
  componentItem: {
    alignItems: "center",
  },
  componentLabel: {
    fontSize: 10,
    color: theme.colors.text.secondary,
  },
  componentValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text.primary,
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: theme.colors.surface.card,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  metricCardPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.85,
    borderColor: theme.colors.accent.primary,
  },
  metricIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricLabel: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text.primary,
    marginTop: 6,
  },
  metricSubtext: {
    fontSize: 10,
    color: theme.colors.text.secondary,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  emptyText: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 12,
  },
  trendList: {
    gap: 8,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trendDate: {
    fontSize: 10,
    color: theme.colors.text.secondary,
    width: 68,
  },
  trendBarContainer: {
    flex: 1,
    height: 12,
    backgroundColor: theme.colors.surface.surface2,
    borderRadius: 6,
    overflow: "hidden",
  },
  trendBar: {
    height: "100%",
    backgroundColor: theme.colors.accent.emerald,
    borderRadius: 6,
  },
  trendCount: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text.primary,
    width: 20,
    textAlign: "right",
  },
  evaList: {
    gap: 8,
  },
  evaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  evaInfo: {
    flex: 1,
  },
  evaTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.text.primary,
  },
  evaSub: {
    fontSize: 10,
    color: theme.colors.text.secondary,
    marginTop: 2,
  },
  evaBadge: {
    backgroundColor: theme.colors.surface.surface2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  evaRatio: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.accent.emerald,
  },
  lanCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 4,
  },
  lanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lanTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lanTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  lanEndpoint: {
    fontSize: 10,
    color: theme.colors.text.secondary,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusPillSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  statusPillIdle: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statusTextSuccess: {
    color: theme.colors.accent.emerald,
  },
  statusTextIdle: {
    color: theme.colors.accent.amber,
  },
});
