import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { ArrowLeft, BellRing, CalendarDays, Clock3, LogOut, ShieldCheck, Sparkles } from "lucide-react-native";
import { BrandHeader, SunriseArt } from "../components/brand-ui";
import { ensureAuthenticated, getUserProfile, logoutMobile, saveUserProfile, type MobileUserProfile } from "../lib/auth";
import { getServerUrl } from "../lib/config";
import { areTaskTimerRemindersEnabled, setTaskTimerRemindersEnabled } from "../lib/timer-reminders";
import { areTaskDeadlineRemindersEnabled, DEFAULT_DEADLINE_REMINDER_LEAD_MIN, setTaskDeadlineRemindersEnabled, syncTaskDeadlineReminders } from "../lib/task-deadline-reminders";
import theme from "../lib/theme";

type WorkingDay = { enabled: boolean; start: string; end: string };
type WorkingHours = Record<string, WorkingDay>;

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: { enabled: true, start: "09:00", end: "17:00" },
  tuesday: { enabled: true, start: "09:00", end: "17:00" },
  wednesday: { enabled: true, start: "09:00", end: "17:00" },
  thursday: { enabled: true, start: "09:00", end: "17:00" },
  friday: { enabled: true, start: "09:00", end: "17:00" },
  saturday: { enabled: false, start: "09:00", end: "17:00" },
  sunday: { enabled: false, start: "09:00", end: "17:00" },
};

export default function SettingsScreen() {
  const router = useRouter();
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [deadlineRemindersEnabled, setDeadlineRemindersEnabled] = useState(false);
  const [reminderLeadMin, setReminderLeadMin] = useState(DEFAULT_DEADLINE_REMINDER_LEAD_MIN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [focusSaving, setFocusSaving] = useState(false);
  const [focusProtectionEnabled, setFocusProtectionEnabled] = useState(false);
  const [eveningReviewEnabled, setEveningReviewEnabled] = useState(false);
  const [showFocusTaskName, setShowFocusTaskName] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [profile, setProfile] = useState<MobileUserProfile | null>(null);
  const [workingHours, setWorkingHours] = useState<WorkingHours>(DEFAULT_WORKING_HOURS);

  useEffect(() => {
    void (async () => {
      const [enabled, deadlineEnabled, cachedUser] = await Promise.all([areTaskTimerRemindersEnabled(), areTaskDeadlineRemindersEnabled(), getUserProfile()]);
      setRemindersEnabled(enabled);
      setDeadlineRemindersEnabled(deadlineEnabled);
      setProfile(cachedUser);
      try {
        const token = await ensureAuthenticated();
        if (token) {
          const response = await fetch(`${getServerUrl()}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
          if (response.ok) {
            const user = await response.json() as MobileUserProfile;
            setProfile(user);
            setFocusProtectionEnabled(user.settings?.focus_protection_enabled === true);
            setEveningReviewEnabled(user.settings?.eod_sweep_enabled === true);
            setShowFocusTaskName(user.settings?.focus_show_task_name === true);
            const savedLead = user.settings?.reminder_lead_min;
            if (typeof savedLead === "number") setReminderLeadMin(savedLead);
            const savedHours = user.settings?.working_hours;
            if (savedHours && typeof savedHours === "object") {
              const incoming = savedHours as Partial<WorkingHours>;
              setWorkingHours(Object.fromEntries(WEEKDAYS.map((day) => [
                day,
                { ...DEFAULT_WORKING_HOURS[day], ...incoming[day] },
              ])) as WorkingHours);
            }
          }
        }
      } catch {
        // Keep the saved local profile and editable defaults available offline.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateReminders = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      if (enabled) {
        const current = await Notifications.getPermissionsAsync();
        const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert("Notifications are off", "Allow notifications in Android settings to receive private two-hour task check-ins.", [
            { text: "Not now", style: "cancel" },
            { text: "Open settings", onPress: () => { void Linking.openSettings(); } },
          ]);
          return;
        }
      }
      await setTaskTimerRemindersEnabled(enabled);
      setRemindersEnabled(enabled);
    } catch {
      Alert.alert("Could not update setting", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateDeadlineReminders = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      if (enabled) {
        const current = await Notifications.getPermissionsAsync();
        const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert("Notifications are off", "Allow notifications in Android settings to receive private deadline reminders.", [
            { text: "Not now", style: "cancel" },
            { text: "Open settings", onPress: () => { void Linking.openSettings(); } },
          ]);
          return;
        }
      }
      await setTaskDeadlineRemindersEnabled(enabled);
      setDeadlineRemindersEnabled(enabled);
      if (enabled) {
        const token = await ensureAuthenticated();
        if (token) {
          const response = await fetch(`${getServerUrl()}/api/v1/tasks?view=all&limit=200`, { headers: { Authorization: `Bearer ${token}` } });
          if (response.ok) void syncTaskDeadlineReminders(await response.json(), reminderLeadMin);
        }
      }
    } catch {
      Alert.alert("Could not update setting", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveWorkingHours = async () => {
    if (scheduleSaving) return;
    setScheduleSaving(true);
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to save your work schedule.");
      const response = await fetch(`${getServerUrl()}/api/v1/auth/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { working_hours: workingHours, reminder_lead_min: reminderLeadMin } }),
      });
      const result = await response.json().catch(() => ({})) as MobileUserProfile & { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "Your working hours could not be saved.");
      setProfile(result);
      await saveUserProfile(result);
      if (deadlineRemindersEnabled) {
        const remindersToken = await ensureAuthenticated();
        if (remindersToken) {
          const tasksResponse = await fetch(`${getServerUrl()}/api/v1/tasks?view=all&limit=200`, {
            headers: { Authorization: `Bearer ${remindersToken}` },
          });
          if (tasksResponse.ok) {
            const tasks = await tasksResponse.json();
            if (Array.isArray(tasks)) void syncTaskDeadlineReminders(tasks, reminderLeadMin);
          }
        }
      }
      Alert.alert("Schedule saved", "Day planning will use these hours. ALIBI will ask before adding work blocks.");
    } catch (error: unknown) {
      Alert.alert("Could not save schedule", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setScheduleSaving(false);
    }
  };

  const saveWorkflowPreferences = async (nextEvening: boolean, nextShowName: boolean) => {
    if (workflowSaving) return;
    setWorkflowSaving(true);
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to save preferences.");
      const response = await fetch(`${getServerUrl()}/api/v1/auth/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { eod_sweep_enabled: nextEvening, focus_show_task_name: nextShowName } }),
      });
      const result = await response.json().catch(() => ({})) as MobileUserProfile & { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "Preferences could not be saved.");
      setProfile(result);
      await saveUserProfile(result);
      setEveningReviewEnabled(nextEvening);
      setShowFocusTaskName(nextShowName);
    } catch (error) {
      Alert.alert("Could not save preference", error instanceof Error ? error.message : "Try again.");
    } finally {
      setWorkflowSaving(false);
    }
  };

  const updateFocusProtection = async (enabled: boolean) => {
    if (focusSaving) return;
    setFocusSaving(true);
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to protect a learned focus window.");
      const response = await fetch(`${getServerUrl()}/api/v1/scheduling/focus-protection`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json() as { message?: string; detail?: string; focus_start?: string; blocks_created?: number; conflicts_skipped?: number };
      if (!response.ok) throw new Error(result.detail ?? "Focus protection could not be changed.");
      setFocusProtectionEnabled(enabled);
      const current = await getUserProfile();
      if (current) {
        const updated = { ...current, settings: { ...(current.settings ?? {}), focus_protection_enabled: enabled } };
        setProfile(updated);
        await saveUserProfile(updated);
      }
      Alert.alert(
        enabled ? "Focus time protected" : "Focus protection removed",
        enabled
          ? `${result.message ?? "Learned focus blocks were added."}${result.focus_start ? `\n\n${result.focus_start} · ${result.blocks_created ?? 0} blocks added${result.conflicts_skipped ? `, ${result.conflicts_skipped} existing calendar conflicts skipped` : ""}.` : ""}`
          : result.message ?? "Your ALIBI focus blocks were removed.",
      );
    } catch (error) {
      Alert.alert("Focus protection unchanged", error instanceof Error ? error.message : "Try again.");
    } finally {
      setFocusSaving(false);
    }
  };

  const signOut = () => Alert.alert("Log out of ALIBI?", "Your account will be signed out on this device.", [
    { text: "Cancel", style: "cancel" },
    { text: "Log Out", style: "destructive", onPress: async () => { await logoutMobile(); router.replace("/login"); } },
  ]);

  return <View style={styles.container}>
    <SunriseArt height={175} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <BrandHeader right={<Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back"><ArrowLeft size={20} color={theme.colors.text.primary} /></Pressable>} />
      <View style={styles.heading}><Text style={styles.title}>Settings</Text><Text style={styles.subtitle}>Make ALIBI work the way you do.</Text></View>

      <View style={styles.sectionHeader}><BellRing size={18} color="#F47B25" /><Text style={styles.sectionTitle}>Notifications</Text></View>
      <View style={styles.preferenceCard}>
        <View style={styles.preferenceRow}>
          <View style={styles.iconBox}><Clock3 size={20} color="#F47B25" /></View>
          <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Two-hour task check-ins</Text><Text style={styles.preferenceDescription}>A private reminder helps you review a timer that is still running. Task names are never shown on the lock screen.</Text></View>
          {loading || saving ? <ActivityIndicator size="small" color="#F47B25" /> : <Switch value={remindersEnabled} onValueChange={updateReminders} trackColor={{ false: "#D3D9DF", true: "#F5B27E" }} thumbColor={remindersEnabled ? "#F47B25" : "#FFFFFF"} accessibilityLabel="Two-hour task check-ins" />}
        </View>
        <View style={[styles.preferenceRow, styles.preferenceRowBorder]}>
          <View style={styles.iconBox}><CalendarDays size={20} color={theme.colors.accent.amber} /></View>
          <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Deadline reminders</Text><Text style={styles.preferenceDescription}>A private on-device alert comes before a due time. It never shows your task name on the lock screen.</Text></View>
          {loading || saving ? <ActivityIndicator size="small" color={theme.colors.accent.amber} /> : <Switch value={deadlineRemindersEnabled} onValueChange={updateDeadlineReminders} trackColor={{ false: "#D3D9DF", true: "#F5B27E" }} thumbColor={deadlineRemindersEnabled ? theme.colors.accent.amber : theme.colors.surface.card} accessibilityLabel="Deadline reminders" />}
        </View>
      </View>

      <View style={styles.sectionHeader}><Sparkles size={18} color="#8759E8" /><Text style={styles.sectionTitle}>Personal productivity</Text></View>
      <View style={styles.preferenceCard}>
        <View style={styles.preferenceRow}>
          <View style={styles.iconBox}><CalendarDays size={20} color="#8759E8" /></View>
          <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Evening task review</Text><Text style={styles.preferenceDescription}>After your configured workday, review today’s completed and unfinished tasks. ALIBI will never reschedule or cancel them without your choice.</Text></View>
          {loading || workflowSaving ? <ActivityIndicator size="small" color="#8759E8" /> : <Switch value={eveningReviewEnabled} onValueChange={(value) => { void saveWorkflowPreferences(value, showFocusTaskName); }} trackColor={{ false: "#D3D9DF", true: "#D6C4FA" }} thumbColor={eveningReviewEnabled ? "#8759E8" : "#FFFFFF"} accessibilityLabel="Evening task review" />}
        </View>
        <View style={[styles.preferenceRow, styles.preferenceRowBorder]}>
          <View style={styles.iconBox}><ShieldCheck size={20} color={theme.colors.accent.blue} /></View>
          <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Show task name on focus notification</Text><Text style={styles.preferenceDescription}>Off by default so the lock screen only says “Focus session”.</Text></View>
          {loading || workflowSaving ? <ActivityIndicator size="small" color={theme.colors.accent.blue} /> : <Switch value={showFocusTaskName} onValueChange={(value) => { void saveWorkflowPreferences(eveningReviewEnabled, value); }} trackColor={{ false: "#D3D9DF", true: "#9AC8E8" }} thumbColor={showFocusTaskName ? theme.colors.accent.blue : "#FFFFFF"} accessibilityLabel="Show task name in focus notification" />}
        </View>
        <View style={[styles.preferenceRow, styles.preferenceRowBorder]}>
          <View style={styles.iconBox}><Clock3 size={20} color="#18A76A" /></View>
          <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Protect learned focus hours</Text><Text style={styles.preferenceDescription}>Uses your real timer history and work schedule. ALIBI adds blocks only to open calendar slots and skips existing events.</Text></View>
          {loading || focusSaving ? <ActivityIndicator size="small" color="#18A76A" /> : <Switch value={focusProtectionEnabled} onValueChange={(value) => {
            if (value) Alert.alert("Protect learned focus time?", "ALIBI will add fixed focus blocks to free slots for the next year. Existing events and tasks are left unchanged.", [
              { text: "Cancel", style: "cancel" },
              { text: "Protect time", onPress: () => { void updateFocusProtection(true); } },
            ]);
            else void updateFocusProtection(false);
          }} trackColor={{ false: "#D3D9DF", true: "#9AD9B8" }} thumbColor={focusProtectionEnabled ? "#18A76A" : "#FFFFFF"} accessibilityLabel="Protect learned focus hours" />}
        </View>
      </View>

      <View style={styles.sectionHeader}><Clock3 size={18} color={theme.colors.accent.blue} /><Text style={styles.sectionTitle}>Work schedule</Text></View>
      <View style={styles.scheduleCard}>
        <Text style={styles.scheduleIntro}>Set the hours that day plans can use. This helps ALIBI fit work around your real availability.</Text>
        <Text style={styles.leadLabel}>Remind me before a deadline</Text>
        <View style={styles.leadOptions}>{[5, 15, 30, 60].map((minutes) => <Pressable key={minutes} onPress={() => setReminderLeadMin(minutes)} style={[styles.leadOption, reminderLeadMin === minutes && styles.leadOptionSelected]} accessibilityRole="radio" accessibilityState={{ selected: reminderLeadMin === minutes }}><Text style={[styles.leadOptionText, reminderLeadMin === minutes && styles.leadOptionTextSelected]}>{minutes} min</Text></Pressable>)}</View>
        {WEEKDAYS.map((day) => {
          const value = workingHours[day] ?? DEFAULT_WORKING_HOURS[day];
          return <View key={day} style={styles.dayRow}>
            <View style={styles.dayHeading}><Text style={styles.dayName}>{day.charAt(0).toUpperCase() + day.slice(1)}</Text><Switch value={value.enabled} onValueChange={(enabled) => setWorkingHours((current) => ({ ...current, [day]: { ...value, enabled } }))} trackColor={{ false: theme.colors.border.subtle, true: "#F5B27E" }} thumbColor={value.enabled ? theme.colors.accent.amber : theme.colors.surface.card} accessibilityLabel={`${day} is a working day`} /></View>
            {value.enabled && <View style={styles.timeInputs}><TextInput style={styles.timeInput} value={value.start} onChangeText={(start) => setWorkingHours((current) => ({ ...current, [day]: { ...value, start } }))} placeholder="09:00" keyboardType="numbers-and-punctuation" maxLength={5} accessibilityLabel={`${day} workday start time`} /><Text style={styles.timeSeparator}>to</Text><TextInput style={styles.timeInput} value={value.end} onChangeText={(end) => setWorkingHours((current) => ({ ...current, [day]: { ...value, end } }))} placeholder="17:00" keyboardType="numbers-and-punctuation" maxLength={5} accessibilityLabel={`${day} workday end time`} /></View>}
          </View>;
        })}
        <Pressable style={[styles.saveScheduleButton, scheduleSaving && styles.disabledButton]} disabled={scheduleSaving} onPress={() => { void saveWorkingHours(); }}><Text style={styles.saveScheduleLabel}>{scheduleSaving ? "Saving preferences…" : "Save planning preferences"}</Text></Pressable>
      </View>

      <View style={styles.sectionHeader}><ShieldCheck size={18} color="#18A76A" /><Text style={styles.sectionTitle}>Account & privacy</Text></View>
      <View style={styles.accountCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(profile?.display_name?.trim() || profile?.email || "A").charAt(0).toUpperCase()}</Text></View>
        <View style={styles.accountCopy}><Text style={styles.accountName}>{profile?.display_name || "Your ALIBI account"}</Text><Text style={styles.accountEmail}>{profile?.email || "Account details appear when signed in."}</Text></View>
      </View>
      <View style={styles.privacyCard}><ShieldCheck size={20} color="#18A76A" /><View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Private by default</Text><Text style={styles.preferenceDescription}>Task check-ins stay on this device and do not include task details in notification previews.</Text></View></View>

      <Pressable style={styles.logoutButton} onPress={signOut}><LogOut size={18} color="#D92D35" /><Text style={styles.logoutText}>Log Out</Text></Pressable>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.base },
  content: { padding: 18, paddingBottom: 34, gap: 16 },
  backButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF" },
  heading: { paddingHorizontal: 2 },
  title: { fontSize: 31, color: theme.colors.text.primary, fontWeight: "800", letterSpacing: -.7 },
  subtitle: { color: theme.colors.text.secondary, fontSize: 14, marginTop: 2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  sectionTitle: { color: theme.colors.text.primary, fontSize: 16, fontWeight: "800" },
  preferenceCard: { borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF", padding: 15 },
  preferenceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  preferenceRowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border.subtle, paddingTop: 13, marginTop: 13 },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1E7" },
  preferenceCopy: { flex: 1 },
  preferenceTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: "800" },
  preferenceDescription: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  scheduleCard: { borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.surface.card, padding: 15, gap: 9 },
  scheduleIntro: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 3 },
  leadLabel: { color: theme.colors.text.primary, fontSize: 12, fontWeight: "700", marginTop: 3 },
  leadOptions: { flexDirection: "row", gap: 8, marginBottom: 6 },
  leadOption: { borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.background.base, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  leadOptionSelected: { borderColor: theme.colors.accent.amber, backgroundColor: "#FFF5ED" },
  leadOptionText: { color: theme.colors.text.secondary, fontSize: 11, fontWeight: "700" },
  leadOptionTextSelected: { color: theme.colors.accent.amber },
  dayRow: { paddingVertical: 5, borderTopWidth: 1, borderTopColor: theme.colors.border.subtle },
  dayHeading: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayName: { color: theme.colors.text.primary, fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  timeInputs: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  timeInput: { minWidth: 86, borderRadius: 11, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.background.base, paddingVertical: 9, paddingHorizontal: 12, color: theme.colors.text.primary, fontSize: 13, fontWeight: "700", textAlign: "center" },
  timeSeparator: { color: theme.colors.text.muted, fontSize: 11 },
  saveScheduleButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: theme.colors.text.primary, marginTop: 5 },
  saveScheduleLabel: { color: theme.colors.surface.card, fontSize: 13, fontWeight: "800" },
  disabledButton: { opacity: .55 },
  accountCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF" },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#102E42", borderWidth: 2, borderColor: "#F47B25", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  accountCopy: { flex: 1 }, accountName: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "800" }, accountEmail: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 3 },
  privacyCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 15, borderRadius: 18, backgroundColor: "#F0FAF5", borderWidth: 1, borderColor: "#D7EFE1" },
  logoutButton: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: "#F2A5A5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: "#FFFFFF", marginTop: 8 },
  logoutText: { color: "#D92D35", fontSize: 14, fontWeight: "800" },
});
