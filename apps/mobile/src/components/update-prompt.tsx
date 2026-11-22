import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Download } from "lucide-react-native";
import theme from "../lib/theme";
import { checkForUpdate, installUpdate, snoozeUpdate, type ReleaseInfo } from "../lib/app-update";

/** Shows "A new version of ALIBI is ready" once per check when a newer APK is published. */
export function UpdatePrompt() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void checkForUpdate().then((found) => { if (active && found) setRelease(found); });
    }, 4000); // let the first screen settle first
    return () => { active = false; clearTimeout(timer); };
  }, []);

  if (!release) return null;
  return <UpdateDialog release={release} onClose={() => setRelease(null)} />;
}

export function UpdateDialog({ release, onClose }: { release: ReleaseInfo; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const update = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await installUpdate(release, setProgress);
      if (outcome === "needs_permission") {
        setMessage("Allow ALIBI to install apps in the screen that just opened, then tap Update again.");
      } else {
        setMessage("Android is asking to install the update. Tap Update there.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The update could not be downloaded. Try again later.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const later = () => {
    void snoozeUpdate(release);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={later}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}><Download size={22} color={theme.colors.accent.amber} /></View>
          <Text style={styles.title}>A new version of ALIBI is ready</Text>
          <Text style={styles.version}>{release.installedVersionName || "Current"} → {release.versionName}</Text>
          {release.notes.length > 0 ? (
            <View style={styles.notes}>
              {release.notes.map((note) => <Text key={note} style={styles.note}>• {note}</Text>)}
            </View>
          ) : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {busy ? (
            <View style={styles.progressRow}>
              <ActivityIndicator color={theme.colors.accent.amber} />
              <Text style={styles.progressText}>{progress === null ? "Downloading…" : `Downloading… ${Math.round(progress * 100)}%`}</Text>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable onPress={later} style={styles.secondary} accessibilityRole="button"><Text style={styles.secondaryText}>Later</Text></Pressable>
              <Pressable onPress={() => { void update(); }} style={styles.primary} accessibilityRole="button"><Text style={styles.primaryText}>Update</Text></Pressable>
            </View>
          )}
          <Text style={styles.fine}>Android will ask you to confirm. Your tasks stay on this phone.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(16,24,38,0.45)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20, gap: 8 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#FFF2E8", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text.primary },
  version: { fontSize: 13, color: theme.colors.text.secondary, fontWeight: "600" },
  notes: { gap: 3, marginTop: 2 },
  note: { fontSize: 13, lineHeight: 19, color: theme.colors.text.primary },
  message: { fontSize: 13, lineHeight: 19, color: "#9A3412" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  progressText: { fontSize: 14, color: theme.colors.text.secondary },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  secondary: { flex: 1, minHeight: 46, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border.subtle, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 15, fontWeight: "700", color: theme.colors.text.secondary },
  primary: { flex: 1, minHeight: 46, borderRadius: theme.radius.control, backgroundColor: theme.colors.accent.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
  fine: { fontSize: 11, color: theme.colors.text.muted, marginTop: 4 },
});
