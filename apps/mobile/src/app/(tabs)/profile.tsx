import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock,
  Link2,
  LockKeyhole,
  LogOut,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react-native";
import theme from "../../lib/theme";
import { ensureAuthenticated, getUserProfile, logoutMobile, useOfflineStatus, type MobileUserProfile } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";
import { BrandHeader, OfflineNoticeCard, SunriseArt } from "../../components/brand-ui";
import {
  getLocalAnalyticsSummary,
  getLocalIntegrations,
  getLocalUserPreferences,
  LocalIntegrationRecord,
  LocalUserPreferences,
  saveLocalUserPreferences,
} from "../../lib/offline-sync";
import { IntegrationsHubModal } from "../../components/integrations-hub-modal";
import { OnboardingModal } from "../../components/onboarding-modal";
import { resetLearningProfile, syncLearningPausedPreference } from "../../lib/personal-learning-engine";

type ProfileSummary = { tasks_completed: number; tasks_pending: number; tasks_overdue: number; total_time_min: number; efficiency: number | null };
type LearningProfile = { peak_window?: string | null; focus_pattern?: string | null; work_style?: string | null };

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<MobileUserProfile | null>(null);
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [learning, setLearning] = useState<LearningProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { isOffline } = useOfflineStatus();

  // Integrations & intelligence preferences
  const [integrationsVisible, setIntegrationsVisible] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [integrations, setIntegrations] = useState<LocalIntegrationRecord[]>([]);
  const [preferences, setPreferences] = useState<LocalUserPreferences>({
    work_start_time: "09:00",
    work_end_time: "18:00",
    planning_style: "priority",
    learning_paused: false,
    timezone: "Asia/Kolkata",
    primary_goal: null,
  });

  // FR-AUTH-001..005, FR-DASH-002/004 and FR-LEARN-005..009: show account and measured API data only.
  const loadProfile = useCallback(async () => {
    setLoading(true);
    let resolvedProfile: MobileUserProfile | null = null;
    try {
      const token = await ensureAuthenticated();
      const headers = { Authorization: `Bearer ${token}` };
      const baseUrl = getServerUrl();
      const [userRes, summaryRes, learningRes] = await Promise.all([
        fetch(`${baseUrl}/api/v1/auth/me`, { headers }),
        fetch(`${baseUrl}/api/v1/analytics/summary?period=monthly`, { headers }),
        fetch(`${baseUrl}/api/v1/learning/profile`, { headers }),
      ]);
      if (userRes.ok) {
        resolvedProfile = await userRes.json();
        setProfile(resolvedProfile);
      } else {
        resolvedProfile = await getUserProfile();
        setProfile(resolvedProfile);
      }
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (learningRes.ok) setLearning(await learningRes.json());
    } catch {
      resolvedProfile = await getUserProfile();
      setProfile(resolvedProfile);
    } finally {
      const userId = resolvedProfile?.id || "local_user";
      try {
        const [prefs, integs] = await Promise.all([
          getLocalUserPreferences(userId),
          getLocalIntegrations(userId),
        ]);
        if (prefs) setPreferences(prefs);
        if (integs) setIntegrations(integs);
      } catch {}
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const signOut = () => Alert.alert("Log out of ALIBI?", "Your account will be signed out on this device.", [
    { text: "Cancel", style: "cancel" },
    { text: "Log Out", style: "destructive", onPress: async () => { await logoutMobile(); router.replace("/login"); } },
  ]);

  const toggleLearningPaused = async () => {
    const userId = profile?.id || "local_user";
    const nextState = !preferences.learning_paused;
    const token = await ensureAuthenticated().catch(() => null);
    const baseUrl = getServerUrl();
    const updated = await syncLearningPausedPreference(baseUrl, token, userId, nextState);
    setPreferences(updated);
    Alert.alert(
      nextState ? "Learning Paused" : "Learning Resumed",
      nextState
        ? "ALIBI will stop adapting to your task durations and habits until you resume."
        : "ALIBI is now learning from your completed tasks and focus sessions."
    );
  };

  const handleResetLearningData = () => {
    Alert.alert(
      "Reset Learning Profile?",
      "This will clear all learned task duration ratios, routine patterns, and peak focus hour estimates on this device and on the server. Your actual tasks and history remain intact.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            const token = await ensureAuthenticated().catch(() => null);
            const baseUrl = getServerUrl();
            const result = await resetLearningProfile(baseUrl, token);
            if (result.success) setLearning(null);
            Alert.alert(result.success ? "Reset complete" : "Reset not done", result.message);
          },
        },
      ]
    );
  };

  const displayName = profile?.display_name?.trim() || "Your profile";
  const initial = displayName.charAt(0).toUpperCase();
  const trackedTime = summary ? `${Math.floor(summary.total_time_min / 60)}h ${summary.total_time_min % 60}m` : "—";
  const efficiency = summary?.efficiency == null ? "—" : `${Math.round(summary.efficiency * 100)}%`;

  return (
    <View style={styles.container}>
      <SunriseArt height={175} />
      <BrandHeader
        showOfflineBadge={isOffline}
        onOfflineBadgePress={() => router.push("/login")}
        right={
          <Pressable onPress={() => router.push("/settings")} style={styles.iconButton} accessibilityLabel="Open settings">
            <Settings size={20} color={theme.colors.text.primary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}><View><Text style={styles.title}>Profile</Text><Text style={styles.subtitle}>Your account, preferences and ALIBI settings.</Text></View></View>
        {isOffline && (
          <OfflineNoticeCard
            featureName="Profile"
            description="You are using ALIBI in offline mode on this device. Sign in to sync your profile, learning insights and history with the cloud."
            actionText="Sign in to sync"
            onAction={() => router.push("/login")}
          />
        )}
        <View style={styles.identityCard}>
          <View style={styles.avatar}><Text style={styles.initial}>{initial}</Text></View>
          <View style={styles.identityCopy}>
            <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.email} numberOfLines={1}>{profile?.email || "Account details load when you connect."}</Text>
            <View style={styles.memberBadge}>
              <LockKeyhole size={13} color="#C65B17" />
              <Text style={styles.memberText}>Private by default</Text>
            </View>
          </View>
        </View>

        <Text style={styles.metricPeriod}>Activity · this month</Text>
        <View style={styles.metrics}>
          {[
            { icon: CheckCircle2, value: loading ? "…" : summary?.tasks_completed.toString() ?? "—", label: "Completed", color: "#17B66A", bg: "#EAF8F0" },
            { icon: Timer, value: loading ? "…" : trackedTime, label: "Tracked time", color: "#3489DE", bg: "#EAF4FF" },
            { icon: SlidersHorizontal, value: loading ? "…" : efficiency, label: "Efficiency", color: "#F47B25", bg: "#FFF1E7" },
            { icon: CalendarDays, value: loading ? "…" : summary?.tasks_pending.toString() ?? "—", label: "Open tasks", color: "#8B5CF6", bg: "#F2EDFF" },
          ].map(({ icon: Icon, value, label, color, bg }) => (
            <View key={label} style={styles.metricCard}>
              <View style={[styles.metricIcon, { backgroundColor: bg }]}><Icon size={21} color={color} /></View>
              <Text style={styles.metricValue}>{value}</Text>
              <Text style={styles.metricLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <Pressable style={styles.learningCard} onPress={() => router.push("/ai")}>
          <View style={styles.learningIcon}><Brain size={27} color="#F07820" /></View>
          <View style={styles.learningContent}>
            <Text style={styles.learningTitle}>Your ALIBI Profile</Text>
            <Text style={styles.learningSubtitle}>Learning insights from your recorded work.</Text>
            <View style={styles.learningPills}>
              {learning?.peak_window ? <Text style={styles.learningPill}>Peak: {learning.peak_window}</Text> : <Text style={styles.learningPill}>Patterns appear as ALIBI learns</Text>}
            </View>
          </View>
          <ChevronRight size={20} color="#506176" />
        </Pressable>

        {/* Adaptive Intelligence Controls (Module B) */}
        <View style={styles.learningControlsCard}>
          <View style={styles.learningControlHeader}>
            <Brain size={18} color="#FF741F" />
            <Text style={styles.learningControlTitle}>Productivity Learning Controls</Text>
          </View>
          <Text style={styles.learningControlDescription}>
            ALIBI adapts to your actual task completion durations, peak focus hours, and routines strictly from your recorded work.
          </Text>
          <View style={styles.learningActionRow}>
            <Pressable
              style={[styles.learningToggleBtn, preferences.learning_paused && styles.learningToggleBtnActive]}
              onPress={toggleLearningPaused}
            >
              {preferences.learning_paused ? <PlayCircle size={16} color="#16A34A" /> : <PauseCircle size={16} color="#DC2626" />}
              <Text style={[styles.learningToggleText, preferences.learning_paused && { color: "#16A34A" }]}>
                {preferences.learning_paused ? "Resume Learning" : "Pause Learning"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.learningResetBtn}
              onPress={handleResetLearningData}
            >
              <RefreshCw size={14} color="#64748B" />
              <Text style={styles.learningResetText}>Reset Data</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.settingsCard}>
          <ProfileRow icon={Link2} title="Connected Integrations" subtitle="Not available yet" onPress={() => setIntegrationsVisible(true)} />
          <ProfileRow icon={Clock} title="Working Window & Habits" subtitle={`Work: ${preferences.work_start_time || "09:00"}–${preferences.work_end_time || "18:00"}`} onPress={() => setOnboardingVisible(true)} />
          <ProfileRow icon={Settings} title="App Settings" subtitle="Task reminders and account preferences" onPress={() => router.push("/settings")} />
          <ProfileRow icon={BarChart3} title="Insights & Reports" subtitle="Productivity trends and reports" onPress={() => router.push("/(tabs)/reports")} />
          <ProfileRow icon={BookOpen} title="Knowledge Vault" subtitle="Your saved notes and records" onPress={() => router.push("/(tabs)/vault")} />
          <ProfileRow icon={Brain} title="Ask ALIBI" subtitle="Answers grounded in your records" onPress={() => router.push("/ai")} last />
        </View>

        <View style={styles.aboutCard}>
          <CircleHelp size={24} color="#E97932" />
          <View style={styles.aboutCopy}>
            <Text style={styles.aboutTitle}>About ALIBI</Text>
            <Text style={styles.aboutSubtitle}>Version 0.1.0 · Personal productivity</Text>
          </View>
          <ChevronRight size={18} color="#E97932" />
        </View>

        <Pressable style={styles.logoutButton} onPress={signOut}>
          <LogOut size={19} color="#E33535" />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>

      {/* Modals */}
      <IntegrationsHubModal
        visible={integrationsVisible}
        userId={profile?.id || "local_user"}
        integrations={integrations}
        onRefreshIntegrations={async () => {
          const userId = profile?.id || "local_user";
          const fresh = await getLocalIntegrations(userId);
          setIntegrations(fresh);
        }}
        onClose={() => setIntegrationsVisible(false)}
      />
      <OnboardingModal
        visible={onboardingVisible}
        userId={profile?.id || "local_user"}
        initialPreferences={preferences}
        onClose={() => setOnboardingVisible(false)}
        onSave={(newPrefs) => setPreferences(newPrefs)}
      />
    </View>
  );
}

function ProfileRow({ icon: Icon, title, subtitle, onPress, last = false }: { icon: LucideIcon; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.row, !last && styles.rowBorder]}><Icon size={22} color="#53657A" /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View><ChevronRight size={20} color="#213A4E" /></Pressable>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.base }, content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, gap: 14 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, paddingBottom: 8 }, title: { fontSize: 31, color: theme.colors.text.primary, fontWeight: "800", letterSpacing: -.7 }, subtitle: { color: theme.colors.text.secondary, fontSize: 14, marginTop: 2 }, iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF" }, metricPeriod: { color: theme.colors.text.muted, fontSize: 11, fontWeight: "700", marginBottom: -9, marginLeft: 2 },
  identityCard: { flexDirection: "row", alignItems: "center", gap: 13, padding: 16, borderRadius: theme.radius.card, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle, minHeight: 112, shadowColor: theme.colors.brand.navy, shadowOpacity: .05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, avatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brand.navy, borderWidth: 3, borderColor: theme.colors.accent.primary }, initial: { color: "#FFFFFF", fontSize: 32, fontWeight: "700" }, identityCopy: { flex: 1, minWidth: 0 }, name: { color: theme.colors.text.primary, fontSize: 17, fontWeight: "800" }, email: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 4 }, memberBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, marginTop: 7, borderRadius: theme.radius.control, backgroundColor: "#FFF1E6" }, memberText: { color: "#B75216", fontSize: 10, fontWeight: "800" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metricCard: { width: "47%", minHeight: 118, flexGrow: 1, padding: 13, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF" }, metricIcon: { width: 36, height: 36, borderRadius: theme.radius.control, alignItems: "center", justifyContent: "center" }, metricValue: { marginTop: 6, fontSize: 23, color: theme.colors.text.primary, fontWeight: "800" }, metricLabel: { marginTop: 1, color: theme.colors.text.secondary, fontSize: 12, fontWeight: "600" },
  learningCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: theme.radius.card, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle }, learningIcon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0E5" }, learningContent: { flex: 1 }, learningTitle: { color: theme.colors.text.primary, fontSize: 17, fontWeight: "800" }, learningSubtitle: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 3 }, learningPills: { flexDirection: "row", marginTop: 10 }, learningPill: { backgroundColor: "#F5F3FA", color: theme.colors.text.primary, fontSize: 11, fontWeight: "600", paddingVertical: 7, paddingHorizontal: 10, borderRadius: theme.radius.control },
  learningControlsCard: { backgroundColor: "#FFFFFF", borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border.subtle, padding: 16, gap: 10 },
  learningControlHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  learningControlTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text.primary },
  learningControlDescription: { fontSize: 12, color: theme.colors.text.secondary, lineHeight: 18 },
  learningActionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  learningToggleBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.control, borderWidth: 1, borderColor: "#FEE2E2", backgroundColor: "#FEF2F2" },
  learningToggleBtnActive: { backgroundColor: "#F0FDF4", borderColor: "#DCFCE7" },
  learningToggleText: { fontSize: 12, fontWeight: "700", color: "#DC2626" },
  learningResetBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#F8FAFC" },
  learningResetText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  settingsCard: { borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF", paddingHorizontal: 14 }, row: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 13 }, rowBorder: { borderBottomWidth: 1, borderBottomColor: "#E9EDF1" }, rowCopy: { flex: 1 }, rowTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "700" }, rowSubtitle: { color: theme.colors.text.secondary, fontSize: 11, marginTop: 2 },
  aboutCard: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 15, borderRadius: theme.radius.cardSecondary, backgroundColor: "#FFF2E9" }, aboutCopy: { flex: 1 }, aboutTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "800" }, aboutSubtitle: { color: theme.colors.text.secondary, fontSize: 11, marginTop: 2 }, logoutButton: { minHeight: 48, borderRadius: theme.radius.control, borderWidth: 1, borderColor: "#F2A5A5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: "#FFFFFF" }, logoutText: { color: "#D92D35", fontSize: 15, fontWeight: "800" },
});
