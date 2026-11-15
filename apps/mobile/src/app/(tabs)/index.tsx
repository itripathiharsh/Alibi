import React, { useState, useEffect } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Activity,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  ArrowRight,
  RefreshCw,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { getServerUrl, pingServer, type ServerMeta } from "../../lib/config";

export default function DashboardScreen() {
  const router = useRouter();
  const [serverUrl, setServerUrlState] = useState(getServerUrl());
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<{
    success: boolean;
    data?: ServerMeta;
    error?: string;
  } | null>(null);

  const checkConnection = async () => {
    setPingLoading(true);
    const result = await pingServer();
    setPingResult(result);
    setPingLoading(false);
  };

  useEffect(() => {
    setServerUrlState(getServerUrl());
    // Auto-ping server on mount
    checkConnection();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Productivity Score Banner */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreHeader}>
          <View>
            <Text style={styles.scoreSubtitle}>Daily Productivity Score</Text>
            <Text style={styles.scoreTitle}>Excellent Focus</Text>
          </View>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreValue}>84</Text>
            <Text style={styles.scoreMax}>/ 100</Text>
          </View>
        </View>

        <View style={styles.formulaRow}>
          <Text style={styles.formulaLabel}>Formula (ADR-010):</Text>
          <Text style={styles.formulaValue}>0.5 · Completion + 0.3 · On-Time + 0.2 · Estimate</Text>
        </View>
      </View>

      {/* Quick Metrics Grid */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={styles.metricIconRow}>
            <CheckCircle2 size={16} color={theme.colors.accent.emerald} />
            <Text style={styles.metricLabel}>Completed</Text>
          </View>
          <Text style={styles.metricValue}>3</Text>
          <Text style={styles.metricSubtext}>of 5 planned tasks</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricIconRow}>
            <Clock size={16} color={theme.colors.accent.amber} />
            <Text style={styles.metricLabel}>Focus Time</Text>
          </View>
          <Text style={styles.metricValue}>2h 25m</Text>
          <Text style={styles.metricSubtext}>actual logged time</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricIconRow}>
            <Flame size={16} color="#EC4899" />
            <Text style={styles.metricLabel}>Streak</Text>
          </View>
          <Text style={styles.metricValue}>5 Days</Text>
          <Text style={styles.metricSubtext}>consistent habit</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricIconRow}>
            <Layers size={16} color="#818CF8" />
            <Text style={styles.metricLabel}>Active</Text>
          </View>
          <Text style={styles.metricValue}>2</Text>
          <Text style={styles.metricSubtext}>in progress now</Text>
        </View>
      </View>

      {/* AC-M0-2: LAN Backend Connectivity Card */}
      <View style={styles.lanCard}>
        <View style={styles.lanHeader}>
          <View style={styles.lanTitleRow}>
            {pingResult?.success ? (
              <Wifi size={20} color={theme.colors.accent.emerald} />
            ) : (
              <WifiOff size={20} color={theme.colors.accent.amber} />
            )}
            <Text style={styles.lanTitle}>Backend LAN Health (AC-M0-2)</Text>
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
              {pingLoading ? "Pinging..." : pingResult?.success ? "Connected" : "Disconnected"}
            </Text>
          </View>
        </View>

        <Text style={styles.lanEndpoint}>Endpoint: {serverUrl}/api/v1/meta</Text>

        {pingResult?.success && pingResult.data && (
          <View style={styles.metaBox}>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>App Mode:</Text>
              <Text style={styles.metaVal}>{pingResult.data.mode}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Version:</Text>
              <Text style={styles.metaVal}>{pingResult.data.version}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Database:</Text>
              <Text style={styles.metaVal}>{pingResult.data.database}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Latency:</Text>
              <Text style={styles.metaVal}>{pingResult.data.responseTimeMs} ms</Text>
            </View>
          </View>
        )}

        {pingResult && !pingResult.success && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{pingResult.error}</Text>
            <Text style={styles.errorHint}>
              Hint: On an Android phone, change the server URL in Settings to your PC's LAN IP
              (e.g., http://192.168.1.X:8000) and ensure Windows Firewall port 8000 is open.
            </Text>
          </View>
        )}

        <View style={styles.lanActions}>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={checkConnection}
            disabled={pingLoading}
          >
            {pingLoading ? (
              <ActivityIndicator size="small" color="#090D16" />
            ) : (
              <>
                <RefreshCw size={14} color="#090D16" />
                <Text style={styles.actionBtnPrimaryText}>Ping /api/v1/meta</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.actionBtnOutline]}
            onPress={() => router.push("/settings" as const)}
          >
            <Text style={styles.actionBtnOutlineText}>Configure IP</Text>
            <ArrowRight size={14} color={theme.colors.text.secondary} />
          </Pressable>
        </View>
      </View>

      {/* Architecture & Milestone Note */}
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Activity size={16} color={theme.colors.accent.amber} />
          <Text style={styles.infoTitle}>Milestone M0 Environment</Text>
        </View>
        <Text style={styles.infoText}>
          ALIBI Mobile client shell pinned to Expo SDK 58 (ADR-021). Strict local-first
          architecture with offline SQLite sync landing in Milestone M10.
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
    gap: 16,
  },
  scoreCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  scoreHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scoreSubtitle: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scoreTitle: {
    color: theme.colors.text.primary,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
  },
  scoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 2,
    borderColor: theme.colors.accent.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: {
    color: theme.colors.accent.amber,
    fontSize: 22,
    fontWeight: "800",
  },
  scoreMax: {
    color: theme.colors.text.secondary,
    fontSize: 10,
    fontWeight: "600",
  },
  formulaRow: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
  formulaLabel: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    fontWeight: "600",
  },
  formulaValue: {
    color: theme.colors.text.primary,
    fontSize: 12,
    marginTop: 2,
    fontFamily: "monospace",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: theme.colors.surface.card,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  metricIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricLabel: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
  metricValue: {
    color: theme.colors.text.primary,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 8,
  },
  metricSubtext: {
    color: theme.colors.text.secondary,
    fontSize: 10,
    marginTop: 2,
  },
  lanCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  lanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lanTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lanTitle: {
    color: theme.colors.text.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  statusPillIdle: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusTextSuccess: {
    color: theme.colors.accent.emerald,
  },
  statusTextIdle: {
    color: theme.colors.accent.amber,
  },
  lanEndpoint: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 8,
  },
  metaBox: {
    marginTop: 12,
    backgroundColor: theme.colors.background.base,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaKey: {
    color: theme.colors.text.secondary,
    fontSize: 12,
  },
  metaVal: {
    color: theme.colors.accent.emerald,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  errorBox: {
    marginTop: 12,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "600",
  },
  errorHint: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  lanActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionBtnPrimary: {
    backgroundColor: theme.colors.accent.amber,
  },
  actionBtnPrimaryText: {
    color: "#090D16",
    fontSize: 12,
    fontWeight: "700",
  },
  actionBtnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  actionBtnOutlineText: {
    color: theme.colors.text.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  infoCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoTitle: {
    color: theme.colors.text.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  infoText: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
});

