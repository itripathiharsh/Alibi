import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { ArrowLeft, BellRing, Clock3, LogOut, ShieldCheck } from "lucide-react-native";
import { BrandHeader, SunriseArt } from "../components/brand-ui";
import { getUserProfile, logoutMobile, type MobileUserProfile } from "../lib/auth";
import { areTaskTimerRemindersEnabled, setTaskTimerRemindersEnabled } from "../lib/timer-reminders";
import theme from "../lib/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<MobileUserProfile | null>(null);

  useEffect(() => {
    void Promise.all([areTaskTimerRemindersEnabled(), getUserProfile()]).then(([enabled, user]) => {
      setRemindersEnabled(enabled);
      setProfile(user);
      setLoading(false);
    });
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
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1E7" },
  preferenceCopy: { flex: 1 },
  preferenceTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: "800" },
  preferenceDescription: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  accountCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF" },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#102E42", borderWidth: 2, borderColor: "#F47B25", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  accountCopy: { flex: 1 }, accountName: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "800" }, accountEmail: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 3 },
  privacyCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 15, borderRadius: 18, backgroundColor: "#F0FAF5", borderWidth: 1, borderColor: "#D7EFE1" },
  logoutButton: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: "#F2A5A5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: "#FFFFFF", marginTop: 8 },
  logoutText: { color: "#D92D35", fontSize: 14, fontWeight: "800" },
});
